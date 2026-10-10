// Shared GA4 (Firebase Analytics) loader for public Poetry Please pages.
// Include after the Firebase app is initialized. Internal tool pages
// (admin, team-progress, scoreboard, manuscript tools, etc.) intentionally
// do not include this so staff traffic stays out of GA.
//
// Firebase Analytics sends page_view automatically on init, so pages must not
// log page_view themselves.
(function () {
  if (window.ppTrack) return;

  const queue = [];
  let analytics = null;

  window.ppTrack = function (name, params) {
    if (analytics) send(name, params);
    else queue.push([name, params]);
  };

  function send(name, params) {
    try { analytics.logEvent(name, params || {}); }
    catch (err) { console.warn('Analytics event skipped', name, err); }
  }

  function viewType() {
    const ua = navigator.userAgent || '';
    return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || window.innerWidth < 900 ? 'mobile' : 'desktop';
  }

  // Reports sign_up / login once per sign-in, whichever way it happened
  // (popup, redirect, email/password), by reading the auth user's metadata.
  function watchAuth() {
    if (typeof firebase.auth !== 'function') return;
    firebase.auth().onAuthStateChanged((user) => {
      analytics.setUserProperties({ user_type: !user ? 'signed_out' : user.isAnonymous ? 'anonymous' : 'registered' });
      if (!user || user.isAnonymous) return;
      const created = Date.parse(user.metadata?.creationTime || '');
      const lastSignIn = Date.parse(user.metadata?.lastSignInTime || '');
      if (!lastSignIn || Date.now() - lastSignIn > 5 * 60 * 1000) return;
      const key = `pp_auth_tracked_${user.uid}_${lastSignIn}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      } catch (_) {}
      const method = (user.providerData?.[0]?.providerId || 'password').replace('.com', '');
      send(Math.abs(lastSignIn - created) < 5000 ? 'sign_up' : 'login', { method });
    });
  }

  function init() {
    try {
      if (!firebase.apps.length || !firebase.app().options.measurementId) return;
      analytics = firebase.analytics();
      analytics.setUserProperties({ view: viewType() });
      watchAuth();
      queue.splice(0).forEach(([name, params]) => send(name, params));
    } catch (err) {
      console.warn('Analytics init skipped', err);
    }
  }

  function load() {
    if (typeof firebase === 'undefined') return;
    if (typeof firebase.analytics === 'function') return init();
    const version = firebase.SDK_VERSION || '10.14.0';
    const compat = Number(version.split('.')[0]) >= 9 ? '-compat' : '';
    const script = document.createElement('script');
    script.src = `https://www.gstatic.com/firebasejs/${version}/firebase-analytics${compat}.js`;
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }

  const start = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2000 });
    else setTimeout(load, 800);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
