// ================================
// Poetry, Please — APP.JS (Desktop + Mobile split ready)
// ================================

// ===== Constants =====
const CONSTANTS = { API_BASE: '/api' };

// --- Mobile mode detection (robust + testable) ---
// Order of precedence:
// 1) window.__PP_FORCE_MOBILE / window.__PP_FORCE_DESKTOP
// 2) URL query (?mobile=1 / ?desktop=1)
// 3) localStorage flags ('pp_force_mobile' / 'pp_force_desktop' = "1")
// 4) <body data-ui="mobile">
// 5) /mobile.html in the URL
// 6) Heuristic: user agent OR narrow viewport (<= 768px)
// Guarded to avoid redeclarations.
(function(){
  if (typeof window.IS_MOBILE_UI !== 'undefined') return;// already set elsewhere

  const url = new URL(location.href);
  const q = (k) => url.searchParams.get(k);
  const ls = (k) => (localStorage.getItem(k) || '').trim();

  const forced =
    (window.__PP_FORCE_MOBILE === true) ? true :
    (window.__PP_FORCE_DESKTOP === true) ? false :
    (q('mobile') === '1') ? true :
    (q('desktop') === '1') ? false :
    (ls('pp_force_mobile') === '1') ? true :
    (ls('pp_force_desktop') === '1') ? false :
    null;

  const byAttr   = (document.body?.dataset?.ui === 'mobile');
  const byURL    = /\/mobile\.html(?:$|\?|#)/.test(location.pathname + location.search + location.hash);

  // Heuristic: UA or narrow viewport
  const byHeuristic =
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    Math.min(window.innerWidth, window.screen?.width || 0) <= 768;

  // Choose final (NO heuristics here to avoid mismatch with detect.html)
var computed =
  (forced !== null) ? forced :
  (byAttr || byURL) ? true :
  false; // default to desktop unless page/URL/force says mobile


  // Expose as global without redeclare errors
  window.IS_MOBILE_UI = computed;


  // Optional: quick debug so you can see *why* it chose mobile
  console.debug('[PP] IS_MOBILE_UI =', computed, {
    forced, byAttr, byURL, byHeuristic,
    vw: window.innerWidth, sw: window.screen?.width, ua: navigator.userAgent
  });
})();
const IS_MOBILE_UI = window.IS_MOBILE_UI;

const LoaderController = (() => {
  const state = {
    domReady: document.readyState !== 'loading',
    authResolved: false,
    screenReady: false,
    loaderHidden: false,
    loaderShownAt: Date.now(),
    minLoaderMs: 700,
    maxLoaderMs: 5000,
    inlineDotsIntervalId: 0,
    hardCapTimerId: 0,
  };

  function getPrimaryLoader() {
    return document.getElementById('pp-loader');
  }

  function getInlineOverlay() {
    return document.querySelector('.pp-inline-loading-overlay');
  }

  function hidePrimary() {
    if (state.loaderHidden) return;
    const loader = getPrimaryLoader();
    if (!loader) {
      state.loaderHidden = true;
      return;
    }
    state.loaderHidden = true;
    loader.classList.add('is-hidden');
    window.setTimeout(() => {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 520);
  }

  function maybeHidePrimary() {
    if (!state.domReady || !state.authResolved || !state.screenReady) return;
    const elapsed = Date.now() - state.loaderShownAt;
    if (elapsed >= state.minLoaderMs) {
      hidePrimary();
      return;
    }
    window.setTimeout(hidePrimary, state.minLoaderMs - elapsed);
  }

  function showInline() {
    if (typeof currentItem !== 'undefined' && currentItem) return;
    let overlayEl = getInlineOverlay();
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.className = 'pp-inline-loading-overlay';
      overlayEl.style.cssText = 'position:fixed;inset:0;z-index:15000;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:1;transition:opacity 320ms ease;background:#faf7f0;';
      overlayEl.innerHTML = `
        <div class="pp-inline-loading" style="display:flex;align-items:center;justify-content:center;padding:24px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;">
            <img src="/pp-loader-logo.png?v=20260323b" alt="" aria-hidden="true" style="width:min(46vw,220px);max-width:220px;filter:drop-shadow(0 18px 32px rgba(30,26,21,0.14));opacity:0.92;" />
            <div style="font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.18em;text-transform:uppercase;color:rgba(30,26,21,0.68);">
              Loading<span class="pp-inline-loading-dots" aria-hidden="true" style="display:inline-block;width:3ch;text-align:left;"></span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlayEl);
    } else {
      overlayEl.style.opacity = '1';
    }

    const dotsEl = overlayEl.querySelector('.pp-inline-loading-dots');
    if (!dotsEl) return;
    if (state.inlineDotsIntervalId) {
      window.clearInterval(state.inlineDotsIntervalId);
      state.inlineDotsIntervalId = 0;
    }
    let frame = 0;
    const frames = ['', '.', '..', '...'];
    state.inlineDotsIntervalId = window.setInterval(() => {
      frame = (frame + 1) % frames.length;
      if (!dotsEl.isConnected) {
        window.clearInterval(state.inlineDotsIntervalId);
        state.inlineDotsIntervalId = 0;
        return;
      }
      dotsEl.textContent = frames[frame];
    }, 320);
  }

  function clearInline() {
    const overlayEl = getInlineOverlay();
    if (!overlayEl) return;
    if (state.inlineDotsIntervalId) {
      window.clearInterval(state.inlineDotsIntervalId);
      state.inlineDotsIntervalId = 0;
    }
    overlayEl.style.opacity = '0';
    window.setTimeout(() => {
      if (document.body.contains(overlayEl)) overlayEl.remove();
    }, 340);
  }

  return {
    markDomReady() {
      state.domReady = true;
      state.loaderShownAt = Date.now();
      if (!state.hardCapTimerId) {
        state.hardCapTimerId = window.setTimeout(() => {
          if (state.loaderHidden) return;
          hidePrimary();
          if (typeof currentItem === 'undefined' || !currentItem) showInline();
        }, state.maxLoaderMs);
      }
    },
    markAuthResolved() {
      state.authResolved = true;
    },
    markScreenReady() {
      state.screenReady = true;
      queueDeferredBootWork();
      maybeHidePrimary();
    },
    maybeHidePrimary,
    showInline,
    clearInline,
  };
})();

let deferredBootQueued = false;

function queueDeferredBootWork() {
  if (deferredBootQueued) return;
  deferredBootQueued = true;
  const run = () => {
    const selType = document.getElementById('type-filter');
    const selCat  = document.getElementById('catalog-filter');
    if (!IS_MOBILE_UI) {
      fetchAndPopulateTypes().then(() => {
        const sel = document.getElementById('type-filter');
        if (sel) sel.onchange = () => setTypeFilter(sel.value);
      });
      fetchAndPopulateCatalogs().then(() => {
        const sel = document.getElementById('catalog-filter');
        if (sel) sel.onchange = () => setCatalogFilter(sel.value);
      });
    } else {
      if (selType) fetchAndPopulateTypes().then(() => { selType.onchange = () => setTypeFilter(selType.value); });
      if (selCat)  fetchAndPopulateCatalogs().then(() => { selCat.onchange  = () => setCatalogFilter(selCat.value); });
    }
    getRatingsSummaryWrapped().then(map => { ratingsMap = map || {}; }).catch(()=>{ ratingsMap = {}; });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 250);
  }
}

function setPinnedViewPreference(view) {
  if (view !== 'mobile' && view !== 'desktop') return;
  localStorage.setItem('pp_view', view);
}

function navigateToPreferredView(view) {
  const nextView = view === 'mobile' ? 'mobile' : 'desktop';
  setPinnedViewPreference(nextView);

  const params = new URLSearchParams(location.search);
  ['view', 'mobile', 'desktop'].forEach((key) => params.delete(key));
  const targetPath = nextView === 'mobile' ? '/m' : '/app';
  const targetQuery = params.toString();
  const targetUrl = `${targetPath}${targetQuery ? `?${targetQuery}` : ''}${location.hash || ''}`;
  location.assign(targetUrl);
}

function syncAdminViewToggle(isAdmin) {
  const mobileTools = document.getElementById('mobile-admin-tools');
  if (!isAdmin) {
    if (mobileTools) mobileTools.innerHTML = '';
    return;
  }

  if (mobileTools) {
    mobileTools.innerHTML = `
      <label class="admin-preview-toggle" title="Switch between the desktop and mobile app views">
        <input id="mobile-admin-view-toggle" type="checkbox" ${IS_MOBILE_UI ? 'checked' : ''} />
        <span>Mobile preview</span>
      </label>
    `;
    document.getElementById('mobile-admin-view-toggle')?.addEventListener('change', (event) => {
      navigateToPreferredView(event.target.checked ? 'mobile' : 'desktop');
    });
  }
}

// ===== Small API client with Firebase ID token =====
async function getIdTokenOrNull() {
  const user = firebase.auth().currentUser;
  return user ? await user.getIdToken(false) : null;
}
async function api(path, { method = 'POST', body } = {}) {
  const url = `${CONSTANTS.API_BASE}/${path.replace(/^\//, '')}`;
  let token = await getIdTokenOrNull();
  const doFetch = async (tkn) =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include'
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    const user = firebase.auth().currentUser;
    if (user) {
      token = await user.getIdToken(true);
      res = await doFetch(token);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${url} failed: ${res.status} ${text}`);
  }
  const isJSON = res.headers.get('content-type')?.includes('application/json');
  return isJSON ? res.json() : res.text();
}

let authorInviteStatus = { checked: false, inFlight: false, redeemed: false };
let currentAccount = null;

function readAuthorInviteToken() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('authorInvite') || '').trim();
}

function clearAuthorInviteToken() {
  const params = new URLSearchParams(window.location.search);
  params.delete('authorInvite');
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

async function redeemAuthorInviteIfPresent() {
  const token = readAuthorInviteToken();
  if (!token || authorInviteStatus.inFlight || authorInviteStatus.redeemed) return;
  const user = firebase.auth().currentUser;
  if (!user) return;

  authorInviteStatus.inFlight = true;
  try {
    const result = await api('authorInvites/redeem', { body: { token } });
    authorInviteStatus.redeemed = true;
    clearAuthorInviteToken();
    flashMessage('Author invite redeemed.');
    console.info('Author invite redeemed', result);
  } catch (err) {
    console.warn('Author invite redemption failed', err);
  } finally {
    authorInviteStatus.inFlight = false;
    authorInviteStatus.checked = true;
  }
}

// ===== UI Helpers =====
window.$  = window.$  || ((sel) => document.querySelector(sel));
window.on = window.on || ((el, evt, fn) => el && el.addEventListener(evt, fn));
function show(el, yes) { if (el) el.style.display = yes ? 'block' : 'none'; }

// ===== Auth UI =====
function getVisibleUser() {
  const user = firebase.auth().currentUser;
  if (!user || user.isAnonymous) return null;
  return user;
}

function currentUserIsAdmin() {
  const user = getVisibleUser();
  const normalizedEmail = (user?.email || '').trim().toLowerCase();
  return !!currentAccount?.roles?.includes('admin') || normalizedEmail === 'sam@buttonpoetry.com';
}

function currentUserIsTeamOrAdmin() {
  return currentUserIsAdmin() || !!currentAccount?.roles?.includes('team');
}

function getCurrentBuildLabel() {
  const currentScript = Array.from(document.scripts).find((script) => /\/app\.js(\?|$)/.test(script.src || ''));
  if (!currentScript?.src) return 'local';
  try {
    const url = new URL(currentScript.src, window.location.origin);
    return url.searchParams.get('v') || 'local';
  } catch (_) {
    return 'local';
  }
}

function ensureFeedSignalsModal() {
  let modal = document.getElementById('pp-feed-signals-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'pp-feed-signals-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(30,26,21,0.38);display:none;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="width:min(640px,100%);max-height:min(84vh,760px);overflow:auto;background:rgba(255,253,248,0.98);border:1px solid #dad0c1;border-radius:22px;padding:20px;box-shadow:0 24px 60px rgba(24,19,12,0.22);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c6558;">Admin Feed Signals</div>
          <h2 style="margin:4px 0 0;font-size:28px;line-height:1;">Current Item</h2>
        </div>
        <button id="pp-feed-signals-close" type="button" style="border:1px solid #dad0c1;background:#fff;border-radius:999px;padding:8px 14px;cursor:pointer;">Close</button>
      </div>
      <div id="pp-feed-signals-body" style="display:grid;gap:14px;"></div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.style.display = 'none';
  });
  document.body.appendChild(modal);
  document.getElementById('pp-feed-signals-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  return modal;
}

function formatRate(v) {
  return `${Math.round((Number(v || 0) * 1000)) / 10}%`;
}

function renderFeedSignalsModal() {
  if (!currentUserIsAdmin()) return;
  const item = currentItem;
  ensureFeedSignalsModal();
  const body = document.getElementById('pp-feed-signals-body');
  if (!body) return;
  if (!item) {
    body.innerHTML = '<div style="color:#6c6558;">No current item is loaded yet.</div>';
    return;
  }
  const signals = item.__feedSignals || getFeedSignals(item);
  const bucketTone = signals.bucket === 'boosted' ? '#d7e7e9' : signals.bucket === 'muted' ? '#f2dfd8' : '#ece7db';
  const bucketInk = signals.bucket === 'boosted' ? '#2f5d62' : signals.bucket === 'muted' ? '#8b3d37' : '#6c6558';
  body.innerHTML = `
    <div style="display:grid;gap:10px;">
      <div style="padding:14px 16px;border:1px solid #e8dece;border-radius:18px;background:#fff;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6c6558;">Item</div>
        <div style="margin-top:6px;font-weight:700;font-size:20px;">${item.title || 'Untitled'}</div>
        <div style="margin-top:4px;color:#6c6558;">${item.author || 'Unknown author'} • ${item.book || 'No book'}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
        <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Feed score</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${signals.feedScore.toFixed(3)}</div></div>
        <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:${bucketTone};color:${bucketInk};"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;opacity:0.8;">Bucket</div><div style="margin-top:6px;font-size:24px;font-weight:700;text-transform:capitalize;">${signals.bucket}</div></div>
        <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Confidence</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${signals.confidence.toFixed(2)}</div></div>
        <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Votes</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${signals.totalVotes}</div></div>
      </div>
      <div style="padding:14px 16px;border:1px solid #e8dece;border-radius:18px;background:#fff;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6c6558;">Signals</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-top:10px;">
          <div style="color:#6c6558;">Raw score</div><div>${signals.rawScore}</div>
          <div style="color:#6c6558;">Score per vote</div><div>${signals.scorePerVote.toFixed(3)}</div>
          <div style="color:#6c6558;">Moved Me rate</div><div>${formatRate(signals.movedMeRate)}</div>
          <div style="color:#6c6558;">Meh rate</div><div>${formatRate(signals.mehRate)}</div>
          <div style="color:#6c6558;">Dislike rate</div><div>${formatRate(signals.dislikeRate)}</div>
          <div style="color:#6c6558;">Likes / Dislikes / Meh / Moved Me</div><div>${signals.likes} / ${signals.dislikes} / ${signals.meh} / ${signals.movedMe}</div>
        </div>
      </div>
      <div style="padding:14px 16px;border:1px solid #e8dece;border-radius:18px;background:#fff;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6c6558;">Interleaving</div>
        <div style="margin-top:10px;display:grid;grid-template-columns:auto 1fr;gap:8px 16px;">
          <div style="color:#6c6558;">Placement</div><div>${signals.position ?? 0}</div>
          <div style="color:#6c6558;">Cycle</div><div>${signals.interleaveCycle ?? '—'}</div>
          <div style="color:#6c6558;">Slot</div><div>${signals.interleaveSlot || '—'}</div>
          <div style="color:#6c6558;">Note</div><div>${signals.interleaveNote || 'No special placement note.'}</div>
        </div>
      </div>
    </div>
  `;
}

function openFeedSignalsModal() {
  if (!currentUserIsAdmin()) return;
  renderFeedSignalsModal();
  const modal = ensureFeedSignalsModal();
  modal.style.display = 'flex';
}

function ensureCountsModal() {
  let modal = document.getElementById('pp-counts-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'pp-counts-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(30,26,21,0.38);display:none;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="width:min(560px,100%);max-height:min(84vh,720px);overflow:auto;background:rgba(255,253,248,0.98);border:1px solid #dad0c1;border-radius:22px;padding:20px;box-shadow:0 24px 60px rgba(24,19,12,0.22);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6c6558;">Internal Counts</div>
          <h2 style="margin:4px 0 0;font-size:28px;line-height:1;">Voting Snapshot</h2>
        </div>
        <button id="pp-counts-close" type="button" style="border:1px solid #dad0c1;background:#fff;border-radius:999px;padding:8px 14px;cursor:pointer;">Close</button>
      </div>
      <div id="pp-counts-body" style="display:grid;gap:14px;"></div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.style.display = 'none';
  });
  document.body.appendChild(modal);
  document.getElementById('pp-counts-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  return modal;
}

function renderCountsModal() {
  if (!currentUserIsTeamOrAdmin()) return;
  ensureCountsModal();
  const body = document.getElementById('pp-counts-body');
  if (!body) return;
  const counts = {
    likes: document.getElementById('count-like')?.textContent || '0',
    dislikes: document.getElementById('count-dislike')?.textContent || '0',
    moved: document.getElementById('count-moved')?.textContent || '0',
    meh: document.getElementById('count-meh')?.textContent || '0',
    skips: document.getElementById('count-skip')?.textContent || '0',
  };
  const domainText = document.getElementById('domain-counter')?.textContent || 'No domain counter yet.';
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">
      <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Likes</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${counts.likes}</div></div>
      <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Dislikes</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${counts.dislikes}</div></div>
      <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Moved Me</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${counts.moved}</div></div>
      <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Meh</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${counts.meh}</div></div>
      <div style="padding:12px 14px;border:1px solid #e8dece;border-radius:16px;background:#fff;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6c6558;">Skips</div><div style="margin-top:6px;font-size:24px;font-weight:700;">${counts.skips}</div></div>
    </div>
    <div style="padding:14px 16px;border:1px solid #e8dece;border-radius:18px;background:#fff;">
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6c6558;">Domain</div>
      <div style="margin-top:8px;">${domainText}</div>
    </div>
  `;
}

function openCountsModal() {
  if (!currentUserIsTeamOrAdmin()) return;
  renderCountsModal();
  const modal = ensureCountsModal();
  modal.style.display = 'flex';
}

async function scrubRecentMehVotes(hours = 24) {
  if (!currentUserIsTeamOrAdmin()) return;
  const confirmed = window.confirm(`Delete your meh votes from the last ${hours} hours?`);
  if (!confirmed) return;
  try {
    const result = await api('me/scrubRecentMeh', { method: 'POST', body: { hours } });
    const deleted = Number(result?.deleted || 0);
    flashMessage(
      deleted
        ? `Removed ${deleted} recent meh vote${deleted === 1 ? '' : 's'}.`
        : 'No recent meh votes needed cleanup.'
    );
    const mehEl = document.getElementById('count-meh');
    if (mehEl && deleted) {
      mehEl.textContent = String(Math.max(0, Number(mehEl.textContent || 0) - deleted));
      refreshCountsModalIfOpen();
    }
  } catch (err) {
    console.warn('recent meh scrub error', err);
    flashMessage(err?.message || 'Could not scrub recent meh votes right now.');
  }
}

function refreshCountsModalIfOpen() {
  if (document.getElementById('pp-counts-modal')?.style.display === 'flex') {
    renderCountsModal();
  }
}

function updateUserStatusUI() {
  const user = getVisibleUser();
  const div = $('#user-status');
  const loadBtn = $('#load-button');
  if (user) {
    const isAdmin = currentUserIsAdmin();
    if (div) {
      const label = user.email || user.uid;
      const isTeam = !!currentAccount?.roles?.includes('team');
      const canEditAuthorProfile = !!currentAccount?.roles?.some((role) => role === 'author' || role === 'admin') || isAdmin;
      const canAccessScoreboard = isAdmin || isTeam;
      const roleBadge = isAdmin
        ? ' <a id="admin-badge" href="/admin.html" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#d7e7e9;color:#2f5d62;font-size:12px;font-weight:600;text-decoration:none;">Admin</a>'
        : '';
      const teamBadge = isTeam
        ? ' <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#efe3ff;color:#5f3b88;font-size:12px;font-weight:600;">Team</span>'
        : '';
      const profileBadge = canEditAuthorProfile
        ? ' <a id="author-profile-badge" href="/author/edit" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#f0e3d2;color:#7a4d20;font-size:12px;font-weight:600;text-decoration:none;">Edit profile</a>'
        : '';
      const scoreboardBadge = canAccessScoreboard
        ? ' <a id="scoreboard-badge" href="/scoreboard" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#e6efe1;color:#3f5f36;font-size:12px;font-weight:600;text-decoration:none;">Scoreboard</a>'
        : '';
      const feedSignalsBadge = isAdmin
        ? ' <button id="feed-signals-badge" type="button" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid #dad0c1;background:#f5efe4;color:#6a5134;font-size:12px;font-weight:600;cursor:pointer;">Feed signals</button>'
        : '';
      const countsBadge = canAccessScoreboard
        ? ' <button id="counts-badge" type="button" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid #dad0c1;background:#f2eee5;color:#6c6558;font-size:12px;font-weight:600;cursor:pointer;">Counts</button>'
        : '';
      const scrubMehBadge = canAccessScoreboard
        ? ' <button id="scrub-meh-badge" type="button" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid #dad0c1;background:#f8f2e8;color:#7a5c38;font-size:12px;font-weight:600;cursor:pointer;">Scrub recent meh</button>'
        : '';
      const buildBadge = isAdmin
        ? ` <span id="build-badge" style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#ece7db;color:#6c6558;font-size:12px;font-weight:600;">Build ${getCurrentBuildLabel()}</span>`
        : '';
      const viewToggle = isAdmin
        ? ` <label style="display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:4px 10px;border-radius:999px;background:#ffffffcc;border:1px solid #dad0c1;font-size:12px;font-weight:600;color:#2f5d62;">
              <input id="admin-view-toggle" type="checkbox" ${IS_MOBILE_UI ? 'checked' : ''} style="margin:0;accent-color:#2f5d62;" />
              <span>Mobile preview</span>
            </label>`
        : '';
      div.innerHTML = `Logged in as ${label}${roleBadge}${teamBadge}${profileBadge}${scoreboardBadge}${feedSignalsBadge}${countsBadge}${scrubMehBadge}${buildBadge} <button id="logout-button" type="button">Log out</button>${viewToggle}`;
      on($('#logout-button'), 'click', async () => {
        try {
          await firebase.auth().signOut();
        } catch (err) {
          console.warn('Logout failed', err);
        }
      });
      on($('#feed-signals-badge'), 'click', openFeedSignalsModal);
      on($('#counts-badge'), 'click', openCountsModal);
      on($('#scrub-meh-badge'), 'click', () => scrubRecentMehVotes(24));
      on($('#admin-view-toggle'), 'change', (event) => {
        navigateToPreferredView(event.target.checked ? 'mobile' : 'desktop');
      });
    }
    if (loadBtn) loadBtn.disabled = false;
    syncAdminViewToggle(isAdmin);
  } else {
    if (div) {
      div.innerHTML = "<button id='login-google'>Log in with Google</button> or continue anonymously";
      on($('#login-google'), 'click', signInWithGoogle);
    }
    if (loadBtn) loadBtn.disabled = false;
    syncAdminViewToggle(false);
  }
}

async function refreshCurrentAccount() {
  const user = getVisibleUser();
  if (!user) {
    currentAccount = null;
    return null;
  }
  try {
    currentAccount = await api('me', { method: 'GET' });
  } catch (err) {
    console.warn('Failed to load account state', err);
    currentAccount = null;
  }
  return currentAccount;
}

async function mergeAnonymousVotesIntoAccount() {
  const user = getVisibleUser();
  if (!user?.email) return;
  const anonId = localStorage.getItem('pp_anon');
  if (!anonId) return;
  const markerKey = `pp_anon_merged_${user.email.toLowerCase()}`;
  if (localStorage.getItem(markerKey) === anonId) return;
  try {
    await api('mergeAnonVotes', { body: { anonId } });
    localStorage.setItem(markerKey, anonId);
    localStorage.removeItem('pp_anon');
  } catch (err) {
    console.warn('Failed to merge anonymous votes into account', err);
  }
}
function showLoginScreen() { show($('#registration-screen'), false); show($('#login-screen'), true); }
function showRegistrationForm() { show($('#login-screen'), false); show($('#registration-screen'), true); }
async function signInWithGoogle() {
  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();

  // Prefer redirect on mobile; try popup on desktop and fallback to redirect
  const isMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  try {
    if (isMobileUA) {
      await auth.signInWithRedirect(provider);
      return; // redirect flow takes over
    }
    await auth.signInWithPopup(provider);
  } catch (err) {
    // COOP/popup blockers → seamless fallback
    if (
      err?.code === 'auth/popup-blocked' ||
      err?.code === 'auth/cancelled-popup-request' ||
      /opener|blocked|closed|COOP/i.test(err?.message || '')
    ) {
      await auth.signInWithRedirect(provider);
    } else {
      console.error('Google sign-in failed:', err);
      alert('Google sign-in failed. Please try again.');
    }
  }
}

async function handleEmailLogin(e) {
  e?.preventDefault();
  try { await firebase.auth().signInWithEmailAndPassword($('#email')?.value, $('#password')?.value); }
  catch (e2) { alert('Login error: ' + e2.message); }
}
async function handleRegistration(e) {
  e?.preventDefault();
  try { await firebase.auth().createUserWithEmailAndPassword($('#reg-email')?.value, $('#reg-password')?.value); }
  catch (e2) { alert('Registration error: ' + e2.message); }
}

// ===== API Mappings (to your Cloud Functions) =====
const STARTUP_BATCH_SIZE = 40;
const FULL_HYDRATION_BATCH_SIZE = 5000;
const fetchDataWrapped            = () => api('fetchData',        { body: { limit: STARTUP_BATCH_SIZE, includeDomainMeta: false } });
const fetchDataAnonWrapped        = (anonId) => api('fetchDataAnon', { body: { anonId, limit: STARTUP_BATCH_SIZE, includeDomainMeta: false } });
const fetchFullDataWrapped        = () => api('fetchData',        { body: { limit: FULL_HYDRATION_BATCH_SIZE, includeDomainMeta: true } });
const fetchFullDataAnonWrapped    = (anonId) => api('fetchDataAnon', { body: { anonId, limit: FULL_HYDRATION_BATCH_SIZE, includeDomainMeta: true } });
const submitVoteWrapped           = (imageId, voteType, userId) => api('vote', { body: { imageId, voteType, userId } });
const fetchReleaseCatalogsWrapped = () => api('releaseCatalogs', { method: 'GET' });
const fetchImageTypesWrapped      = () => api('imageTypes',      { method: 'GET' });
const getRatingsSummaryWrapped    = () => api('ratingsSummary',  { method: 'GET' });
const submitContentFlagWrapped    = (imageId, note) => api('contentFlags', { method: 'POST', body: { imageId, note } });

// ===== Anonymous ID helper (local only, no API) =====
async function getOrCreateAnonId() {
  let anon = localStorage.getItem('pp_anon');
  if (anon) return anon;

  anon = 'local-' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('pp_anon', anon);
  return anon;
}


/* ============================================================
   Frontend functionality (filters, metadata, votes, counters)
   ============================================================ */

// --- Minimal CSS injection (works even if styles.css missing) ---
(function injectUIPatchStyles(){
  const css = `
  .top-bar{ display:flex; align-items:center; gap:12px; flex-wrap:nowrap; padding:8px 12px; }
  .top-bar .spacer{flex:1;}
  #user-status{ white-space:nowrap; font-size:.9rem; opacity:.9; }

  #media-wrap{ max-width:min(1000px,95vw); margin:6px auto 12px; text-align:center; }
  .button-row{ display:flex; justify-content:center; gap:10px; margin:10px 0 0; flex-wrap:wrap; }
  #btn-go-back:disabled{ opacity:.45; cursor:not-allowed; }
  .button-container{ display:flex; justify-content:center; }
  h1#page-title{ display:none !important; }
  #load-button{
    font-family:"Cormorant Garamond", Garamond, "Times New Roman", serif;
    font-size:clamp(26px, 3.2vw, 42px);
    line-height:1;
    padding:16px 34px 18px;
    border-radius:4px;
    border:1px solid #b8aea0;
    background:#f5ebdb;
    color:#2f2417;
    box-shadow:0 1px 0 rgba(255,255,255,0.6) inset;
    transition:background-color 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
  }
  #load-button:hover:not(:disabled){
    background:#eadbc4;
    border-color:#9c8d7a;
    box-shadow:0 2px 8px rgba(73,54,24,0.08);
  }
  #load-button:active:not(:disabled){
    background:#dfceb5;
    transform:translateY(1px);
    box-shadow:0 1px 3px rgba(73,54,24,0.08) inset;
  }
  #load-button:focus-visible{
    outline:2px solid #8a7352;
    outline-offset:2px;
  }

  #counters-bar{ display:none !important; position:sticky; bottom:0; justify-content:center; gap:18px;
    padding:10px 12px; border-top:1px solid #e6e6e6; background:#faf7f0; z-index:5; }
  #counters-bar span{ white-space:nowrap; }

  /* Viewport-fit scaffolding */
  html, body { height: 100%; background:#faf7f0; color:#111; }
  body { min-height: 100dvh; }
  .media-box {
    height: var(--media-max-h, 70dvh);
    max-height: var(--media-max-h, 70dvh);
    display: flex; align-items: center; justify-content: center;
    width: 100%;
    overflow: hidden;
    box-sizing: border-box;
    padding: 6px 0;
  }
  .media-box > a{
    display:flex;
    align-items:center;
    justify-content:center;
    width:100%;
    height:100%;
  }
  .media-box img, .media-box video {
    max-width: 100%;
    max-height: 100%;
    height: auto;
    object-fit: contain;
  }

  /* Mobile: transform only the IMAGE pixels, not the UI/layout */
  .media-box img {
    transform: translate(var(--pp-media-x, 0px), var(--pp-media-y, 0px)) scale(var(--pp-media-zoom, 1));
    transform-origin: center center;
    transition: transform 120ms ease;
    touch-action: pan-y;
  }

  .button-row { padding-bottom: env(safe-area-inset-bottom, 0); }

  .excerpt-text { max-width: min(1000px, 95vw); margin: 0 auto; text-align: left; white-space: pre-wrap; }
  .full-poem-title { margin: 0 0 1.4rem; font-size: clamp(1.1rem, 2vw, 1.35rem); font-weight: 700; line-height: 1.2; }
  .full-poem-body { margin: 0; }
  .meta-row { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:6px 0; padding:0 6px; }
  .meta-row p { margin:0; }
  .vote-btn.voted { opacity:.85; }
  .toast { color:#0a7e22; margin-top:8px; min-height:1.4em; }
  .vote-counter { padding:5px 10px; border:1px solid #e6e6e6; border-radius:6px; background:#fafafa; }
  `;
  const tag = document.createElement('style'); tag.appendChild(document.createTextNode(css)); document.head.appendChild(tag);
})();

// --- Top bar slotting existing user-status (skip on mobile UI) ---
(function buildTopBar(){
  if (IS_MOBILE_UI) return; // do not inject desktop top bar on mobile.html
  if (document.querySelector('.top-bar')) return;
  const topBar = document.createElement('div'); topBar.className = 'top-bar';
  const filters = document.createElement('div'); filters.id = 'filters';
  const spacer = document.createElement('div'); spacer.className = 'spacer';
  let userStatus = document.querySelector('#user-status'); if (!userStatus){ userStatus = document.createElement('div'); userStatus.id='user-status'; }
  topBar.append(filters, spacer, userStatus); document.body.insertBefore(topBar, document.body.firstChild);
})();

// ===== State =====
const historyStack = [];
let currentItem = null;
window.currentItem = null; // <-- expose for mobile.html

let lastData = null;     // server payload (fetchData / fetchDataAnon)
let fullFeedHydrationStarted = false;
let fullFeedHydrationDone = false;
let queue = [];          // filtered & shuffled list
let idx = -1;            // position in queue
let isTransitioning = false;

// ===== Mobile pinch-to-zoom and pan (image only) =====
const __ppGestureState = new WeakMap();

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function getGestureState_(imgEl) {
  if (!imgEl) return { scale: 1, x: 0, y: 0 };
  if (!__ppGestureState.has(imgEl)) {
    __ppGestureState.set(imgEl, { scale: 1, x: 0, y: 0, mode: '', startX: 0, startY: 0, baseX: 0, baseY: 0, pinchStartDist: 0, pinchStartScale: 1 });
  }
  return __ppGestureState.get(imgEl);
}

function clampGestureState_(imgEl, state) {
  const baseW = imgEl?.offsetWidth || 0;
  const baseH = imgEl?.offsetHeight || 0;
  const overflowX = Math.max(0, ((baseW * state.scale) - baseW) / 2);
  const overflowY = Math.max(0, ((baseH * state.scale) - baseH) / 2);
  state.x = clamp(state.x, -overflowX, overflowX);
  state.y = clamp(state.y, -overflowY, overflowY);
  if (state.scale <= 1.001) {
    state.scale = 1;
    state.x = 0;
    state.y = 0;
  }
  return state;
}

function applyMediaTransform_(imgEl) {
  const state = clampGestureState_(imgEl, getGestureState_(imgEl));
  const box = imgEl?.closest?.('.media-box');
  if (box) {
    box.style.setProperty('--pp-media-zoom', String(state.scale));
    box.style.setProperty('--pp-media-x', `${state.x}px`);
    box.style.setProperty('--pp-media-y', `${state.y}px`);
  }
}

function attachPinchZoomToImage_(imgEl) {
  if (!IS_MOBILE_UI) return;
  if (!imgEl || imgEl.__ppPinchBound) return;
  imgEl.__ppPinchBound = true;

  const dist = (t1, t2) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  };

  const state = getGestureState_(imgEl);
  applyMediaTransform_(imgEl);

  imgEl.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 2) {
      state.mode = 'pinch';
      state.pinchStartDist = dist(e.touches[0], e.touches[1]);
      state.pinchStartScale = state.scale;
      imgEl.style.transition = 'none';
      e.preventDefault();
    } else if (e.touches && e.touches.length === 1 && state.scale > 1) {
      state.mode = 'pan';
      state.startX = e.touches[0].clientX;
      state.startY = e.touches[0].clientY;
      state.baseX = state.x;
      state.baseY = state.y;
      imgEl.style.transition = 'none';
      e.preventDefault();
    }
  }, { passive: false });

  imgEl.addEventListener('touchmove', (e) => {
    if (!e.touches) return;
    if (state.mode === 'pinch' && e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1]);
      const ratio = d / (state.pinchStartDist || d);
      state.scale = clamp(state.pinchStartScale * ratio, 1, 3);
      applyMediaTransform_(imgEl);
      e.preventDefault();
      return;
    }
    if (state.mode === 'pan' && e.touches.length === 1 && state.scale > 1) {
      state.x = state.baseX + (e.touches[0].clientX - state.startX);
      state.y = state.baseY + (e.touches[0].clientY - state.startY);
      applyMediaTransform_(imgEl);
      e.preventDefault();
    }
  }, { passive: false });

  imgEl.addEventListener('touchend', (e) => {
    if (e.touches?.length === 1 && state.scale > 1) {
      state.mode = 'pan';
      state.startX = e.touches[0].clientX;
      state.startY = e.touches[0].clientY;
      state.baseX = state.x;
      state.baseY = state.y;
    } else if (!e.touches || e.touches.length === 0) {
      state.mode = '';
      imgEl.style.transition = 'transform 120ms ease';
      applyMediaTransform_(imgEl);
    }
  }, { passive: true });

  imgEl.addEventListener('touchcancel', () => {
    state.mode = '';
    imgEl.style.transition = 'transform 120ms ease';
    applyMediaTransform_(imgEl);
  }, { passive: true });

  imgEl.addEventListener('dblclick', () => {
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    imgEl.style.transition = 'transform 120ms ease';
    applyMediaTransform_(imgEl);
  });
}


// Filters
let filterByAuthor = false;
let filterByBook   = false;
let selectedType   = '';
let selectedCatalog= '';
let selectedAuthor = '';
let selectedBook = '';
let selectedItemId = '';

// Ratings + heuristics state
let ratingsMap = {};                // { imageId: {score,total,rating} }
let lastVoteType = null;            // 'like'|'dislike'|'meh'|'moved me'
let sessionVotes = 0;
let sessionNegatives = 0;
let servedCounter = 0;              // increments per render

// Preload
const preloadCache  = new Map();    // src -> Promise
const PRELOAD_AHEAD = 2;

// ===== Counters =====
function updateCounters({ like=0, dislike=0, moved=0, meh=0, skip=0 }){
  const inc = (id, n) => { const el = $('#'+id); if (n && el) el.textContent = (+el.textContent + n); };
  inc('count-like', like);
  inc('count-dislike', dislike);
  inc('count-moved', moved);
  inc('count-meh', meh);
  inc('count-skip', skip);
  refreshCountsModalIfOpen();
}

function userCanFlagContent() {
  const roles = Array.isArray(currentAccount?.roles) ? currentAccount.roles : [];
  return roles.some((role) => role === 'author' || role === 'team' || role === 'admin');
}

function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

function valuesMatch(a, b) {
  return normalizeFilterValue(a) === normalizeFilterValue(b);
}

function readRouteState() {
  const params = new URLSearchParams(window.location.search);
  return {
    item: params.get('item') || '',
    type: params.get('type') || '',
    catalog: params.get('catalog') || '',
    author: params.get('author') || '',
    book: params.get('book') || ''
  };
}

function writeRouteState() {
  const params = new URLSearchParams(window.location.search);
  const nextState = {
    item: selectedItemId,
    type: selectedType,
    catalog: selectedCatalog,
    author: filterByAuthor ? selectedAuthor : '',
    book: filterByBook ? selectedBook : ''
  };

  Object.entries(nextState).forEach(([key, value]) => {
    const trimmed = String(value || '').trim();
    if (trimmed) params.set(key, trimmed);
    else params.delete(key);
  });

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

function syncFilterControls() {
  const typeSel = document.getElementById('type-filter');
  const catalogSel = document.getElementById('catalog-filter');
  if (typeSel) typeSel.value = selectedType;
  if (catalogSel) catalogSel.value = selectedCatalog;
}

function initializeRouteState() {
  const route = readRouteState();
  selectedItemId = route.item.trim();
  selectedType = route.type.trim();
  selectedCatalog = route.catalog.trim();
  selectedAuthor = route.author.trim();
  selectedBook = route.book.trim();
  filterByAuthor = !!selectedAuthor;
  filterByBook = !!selectedBook;
}

function setTypeFilter(value) {
  selectedType = String(value || '').trim();
  syncFilterControls();
  writeRouteState();
  rebuildQueueAfterFilter();
}

function setCatalogFilter(value) {
  selectedCatalog = String(value || '').trim();
  syncFilterControls();
  writeRouteState();
  rebuildQueueAfterFilter();
}

function setAuthorFilter(active, author = currentItem?.author || selectedAuthor) {
  const nextAuthor = String(author || '').trim();
  filterByAuthor = !!active && !!nextAuthor;
  selectedAuthor = filterByAuthor ? nextAuthor : '';
  writeRouteState();
  rebuildQueueAfterFilter();
}

function setBookFilter(active, book = currentItem?.book || selectedBook) {
  const nextBook = String(book || '').trim();
  filterByBook = !!active && !!nextBook;
  selectedBook = filterByBook ? nextBook : '';
  writeRouteState();
  rebuildQueueAfterFilter();
}

initializeRouteState();

// ---- Shim for mobile.html to call desktop logic & expose state ----
(function exposePP(){
  const state = { likes:0, dislikes:0, skips:0 };

  // Keep a reference to original updateCounters and augment it
  const __updateCounters = updateCounters;
  updateCounters = function(patch){
    __updateCounters(patch || {});
    state.likes    += (patch?.like||0);
    state.dislikes += (patch?.dislike||0);
    state.skips    += (patch?.skip||0);
    dispatchEvent(new CustomEvent('pp:state'));
  };

  window.PP = {
    vote: (kind) => onVoteAny(kind),
    skip: () => onSkip(),
    goBack: () => onGoBack(),
    openBook: () => { if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer'); },
    getState: () => ({
      user: firebase.auth().currentUser || null,
      item: currentItem,
      likes: state.likes, dislikes: state.dislikes, skips: state.skips,
      filters: {
        type: selectedType,
        catalog: selectedCatalog,
        authorOnly: filterByAuthor,
        bookOnly: filterByBook,
        author: selectedAuthor,
        book: selectedBook,
        item: selectedItemId
      }
    }),
    setFilterAuthor: (active) => setAuthorFilter(active, currentItem?.author || selectedAuthor),
    setFilterBook: (active) => setBookFilter(active, currentItem?.book || selectedBook),
    canFlagCurrentContent: () => userCanFlagContent(),
    flagCurrentContent: () => flagCurrentContent(),
    getCurrentItem: () => currentItem,
    getCounters: () => ({ likes: state.likes, dislikes: state.dislikes, skips: state.skips })
  };
})();

// ---- Info sheet wiring (non-breaking) ----
(function () {
  const $ = (id) => document.getElementById(id);

  const sheet    = $('pp-info');
  const bookEl   = $('info-book');
  const titleEl  = $('info-title');
  const authorEl = $('info-author');
  const cntEl    = $('info-counters');
  const cbAuthor = $('info-filter-author');
  const cbBook   = $('info-filter-book');
  const flagBtn  = $('info-flag-content');

  function getCurrentItem() {
  if (window.PP?.getCurrentItem) return window.PP.getCurrentItem();
  const s = window.PP?.getState?.();
  if (s && s.item) return s.item;
  return window.PP?.state?.currentItem || window.currentItem || null;
}


  function getCounters() {
  if (window.PP?.getCounters) return window.PP.getCounters();
  const s = window.PP?.getState?.();
  if (s && ('likes' in s || 'dislikes' in s || 'skips' in s)) {
    return { likes: s.likes || 0, dislikes: s.dislikes || 0, skips: s.skips || 0 };
  }
  return window.PP?.state?.counters || null;
}


  function getFilters() {
    // Expecting booleans like { authorOnly, bookOnly } from your state
    return window.PP?.state?.filters || {};
  }

  function setAuthorOnly(v) {
    if (window.PP?.setFilterAuthor) return window.PP.setFilterAuthor(v);
    if (window.PP?.setFilters) return window.PP.setFilters({ authorOnly: !!v });
    // no-op fallback
  }

  function setBookOnly(v) {
    if (window.PP?.setFilterBook) return window.PP.setFilterBook(v);
    if (window.PP?.setFilters) return window.PP.setFilters({ bookOnly: !!v });
    // no-op fallback
  }

  function populate() {
    const sheet    = document.getElementById('pp-info');
    const bookEl   = document.getElementById('info-book');
    const titleEl  = document.getElementById('info-title');
    const authorEl = document.getElementById('info-author');
    const cntEl    = document.getElementById('info-counters');
    const cbAuthor = document.getElementById('info-filter-author');
    const cbBook   = document.getElementById('info-filter-book');
    const flagBtn  = document.getElementById('info-flag-content');

    // ✅ Desktop: no info sheet → do nothing
    if (!sheet) return;

    const item = getCurrentItem();
    if (!item) return;

    if (bookEl)   bookEl.textContent   = item.book  || item.bookTitle  || '—';
    if (titleEl)  titleEl.textContent  = item.title || item.poemTitle  || '—';
    if (authorEl) authorEl.textContent = item.author || item.writer    || '—';

    const f = getFilters();
    if (cbAuthor) cbAuthor.checked = !!(f.authorOnly || f.sameAuthor || f.author);
    if (cbBook)   cbBook.checked   = !!(f.bookOnly   || f.sameBook   || f.book);

    const c = getCounters();
    if (cntEl) {
      if (c && typeof c.likes !== 'undefined') {
        cntEl.textContent = `Likes: ${c.likes} · Dislikes: ${c.dislikes} · Skips: ${c.skips}`;
      } else {
        const badge = document.querySelector('.badge');
        cntEl.textContent = badge ? badge.textContent : '—';
      }
    }

    if (flagBtn) {
      const canFlag = !!item && userCanFlagContent();
      flagBtn.hidden = !canFlag;
      flagBtn.disabled = !canFlag;
    }
  }


  // Public toggle
  window.PP = window.PP || {};
  window.PP.toggleInfo = function (open) {
    if (!sheet) return;
    const next = (typeof open === 'boolean') ? open : sheet.getAttribute('data-open') !== 'true';
    if (next) populate();
    sheet.setAttribute('data-open', next ? 'true' : 'false');
    sheet.setAttribute('aria-hidden', next ? 'false' : 'true');
  };

  // Sync checkbox changes
  if (cbAuthor) cbAuthor.addEventListener('change', (e) => setAuthorOnly(!!e.target.checked));
  if (cbBook)   cbBook.addEventListener('change',   (e) => setBookOnly(!!e.target.checked));
  if (flagBtn)  flagBtn.addEventListener('click',   () => flagCurrentContent());
  

  // Keep content fresh when item changes (if you already dispatch something like this)
  window.addEventListener('pp:item-changed', populate);
  document.addEventListener('DOMContentLoaded', populate);
  window.addEventListener('pp:state', populate);

})();


// ===== Mapping (matches your GAS) =====
function mapGraphic(g){
  if (Array.isArray(g)) {
    return {
      id: g[3] || null,
      mediaUrl: g[4] || null,
      bookUrl: g[5] || null,
      releaseCatalog: g[6] || '',
      imageType: g[7] || '',
      excerpt: g[8] || '',
      author: g[0] || '',
      title: g[1] || '',
      book: g[2] || '',
      raw: g
    };
  }
  return {
    id: g?.id ?? g?.imageId ?? g?.contentId ?? g?.uid ?? null,
    mediaUrl: g?.imageUrl ?? g?.videoUrl ?? g?.driveLink ?? g?.url ?? null,
    bookUrl: g?.bookUrl ?? g?.bookLink ?? g?.link ?? '',
    releaseCatalog: g?.releaseCatalog ?? '',
    imageType: g?.imageType ?? '',
    excerpt: g?.excerpt ?? '',
    author: g?.author ?? '',
    title: g?.title ?? g?.poem ?? '',
    book: g?.book ?? '',
    raw: g
  };
}

const CONTENT_TYPE_LABELS = {
  GP: 'Graphics',
  EXC: 'Excerpts',
  FP: 'Full Poems',
  VV: 'Video',
};

function formatContentTypeLabel(value) {
  const code = String(value || '').trim();
  return CONTENT_TYPE_LABELS[code] || code || 'Unknown';
}

// ===== Utilities =====
function isVideoUrl(url='') {
  const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  return ['mov','mp4','webm','ogg'].includes(ext);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function ratingOf(g) {
  const r = ratingsMap[g?.id]?.rating;
  return (typeof r === 'number') ? r : 1; // default 1 (neutral-positive)
}
function isLowRated(g)  { return ratingOf(g) < 1; }
function isHighRated(g) { return ratingOf(g) >= 1; }
function ratingMetaOf(g) {
  return ratingsMap[g?.id] || { score: 0, total: 0, rating: 1, likes: 0, dislikes: 0, meh: 0, movedMe: 0 };
}
function getFeedSignals(g) {
  const meta = ratingMetaOf(g);
  const likes = Number(meta.likes || 0);
  const dislikes = Number(meta.dislikes || 0);
  const meh = Number(meta.meh || 0);
  const movedMe = Number(meta.movedMe || 0);
  const totalVotes = Number(meta.total || (likes + dislikes + meh + movedMe) || 0);
  const rawScore = likes + (movedMe * 2) - dislikes;
  const scorePerVote = totalVotes ? rawScore / totalVotes : 0;
  const movedMeRate = totalVotes ? movedMe / totalVotes : 0;
  const mehRate = totalVotes ? meh / totalVotes : 0;
  const dislikeRate = totalVotes ? dislikes / totalVotes : 0;
  const confidence = Math.min(1, totalVotes / 10);
  const feedScore = (
    (scorePerVote * 0.9) +
    (movedMeRate * 1.2) -
    (mehRate * 0.3) -
    (dislikeRate * 0.85)
  ) * (0.35 + (0.65 * confidence));

  let bucket = 'standard';
  if (totalVotes >= 2 && (feedScore >= 0.65 || movedMeRate >= 0.22)) bucket = 'boosted';
  else if (totalVotes >= 3 && (feedScore <= 0.15 || mehRate >= 0.45 || dislikeRate >= 0.28)) bucket = 'muted';

  return {
    likes,
    dislikes,
    meh,
    movedMe,
    totalVotes,
    rawScore,
    scorePerVote,
    movedMeRate,
    mehRate,
    dislikeRate,
    confidence,
    feedScore,
    bucket,
  };
}
function isMutedCandidate(g) { return getFeedSignals(g).bucket === 'muted'; }
function isBoostedCandidate(g) { return getFeedSignals(g).bucket === 'boosted'; }
function communityAffinityOf(g) { return getFeedSignals(g).feedScore; }
function orderByCommunityPreference(list, options = {}) {
  const includeMuted = options.includeMuted !== false;
  const boosted = [];
  const standard = [];
  const muted = [];

  list.forEach((item) => {
    item.__feedSignals = getFeedSignals(item);
    if (item.__feedSignals.bucket === 'muted') muted.push(item);
    else if (item.__feedSignals.bucket === 'boosted') boosted.push(item);
    else standard.push(item);
  });

  const sortWithin = (items) => items
    .map((item) => ({ item, score: communityAffinityOf(item) + ((Math.random() - 0.5) * 0.22) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  const boostedQ = sortWithin(boosted);
  const standardQ = sortWithin(standard);
  const mutedQ = includeMuted ? sortWithin(muted) : [];
  const ordered = [];
  let cycle = 0;
  let position = 0;
  const pushWithPlacement = (item, slotType) => {
    if (!item) return;
    item.__feedSignals = item.__feedSignals || getFeedSignals(item);
    item.__feedSignals.interleaveSlot = slotType;
    item.__feedSignals.interleaveCycle = cycle + 1;
    item.__feedSignals.position = position + 1;
    item.__feedSignals.interleaveNote =
      slotType === 'boosted-primary' ? 'Primary boost slot.' :
      slotType === 'boosted-secondary' ? 'Secondary boost slot in alternating cycles.' :
      slotType === 'standard-primary' ? 'Core discovery slot.' :
      slotType === 'standard-secondary' ? 'Secondary standard slot.' :
      slotType === 'muted-exploration' ? 'Exploration slot for muted content.' :
      'Default placement.';
    ordered.push(item);
    position += 1;
  };

  while (boostedQ.length || standardQ.length || mutedQ.length) {
    if (boostedQ.length) pushWithPlacement(boostedQ.shift(), 'boosted-primary');
    if (standardQ.length) pushWithPlacement(standardQ.shift(), 'standard-primary');
    if (boostedQ.length && cycle % 2 === 0) pushWithPlacement(boostedQ.shift(), 'boosted-secondary');
    if (standardQ.length) pushWithPlacement(standardQ.shift(), 'standard-secondary');
    if (mutedQ.length && cycle % 4 === 3) pushWithPlacement(mutedQ.shift(), 'muted-exploration');
    cycle += 1;
  }

  return ordered;
}

// ===== Data fetch wrappers =====
async function fetchLatestBatch() {
  const user = firebase.auth().currentUser;
  if (user) return fetchDataWrapped();

  const anonId = await getOrCreateAnonId();
  return fetchDataAnonWrapped(anonId);
}

async function fetchFullFeedData() {
  const user = firebase.auth().currentUser;
  if (user) return fetchFullDataWrapped();

  const anonId = await getOrCreateAnonId();
  return fetchFullDataAnonWrapped(anonId);
}

async function hydrateFullFeedInBackground() {
  if (fullFeedHydrationStarted || fullFeedHydrationDone) return;
  fullFeedHydrationStarted = true;

  const run = async () => {
    try {
      const data = await fetchFullFeedData();
      if (!data || !Array.isArray(data.newGraphics)) return;
      const currentId = currentItem?.id || null;
      lastData = data;
      if (!currentId) {
        initQueueFromData(data);
      } else {
        rebuildQueueAfterFilter();
      }
      fullFeedHydrationDone = true;
    } catch (err) {
      console.warn('Full feed hydration failed', err);
      fullFeedHydrationStarted = false;
    }
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => { run(); }, { timeout: 2500 });
  } else {
    setTimeout(run, 300);
  }
}

// ===== Filters: population =====
async function fetchAndPopulateTypes() {
  try {
    const types = await fetchImageTypesWrapped();
    const sel = $('#type-filter'); if (!sel) return;
    sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
    (types || []).forEach(t => {
      if (!t) return;
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = formatContentTypeLabel(t);
      sel.appendChild(opt);
    });
    syncFilterControls();
  } catch(e) { console.warn('fetchAndPopulateTypes error', e); }
}
async function fetchAndPopulateCatalogs() {
  try {
    const cats = await fetchReleaseCatalogsWrapped();
    const sel = $('#catalog-filter'); if (!sel) return;
    sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
    (cats || []).forEach(c => { if (!c) return; const opt = document.createElement('option'); opt.value=c; opt.textContent=c; sel.appendChild(opt); });
    syncFilterControls();
  } catch(e) { console.warn('fetchAndPopulateCatalogs error', e); }
}

// ===== Queue build (filters + ratings Rule #1) =====
function baseArray(data) {
  return Array.isArray(data?.newGraphics) ? data.newGraphics.slice() : [];
}
function buildFilteredList(data) {
  let list = baseArray(data).map(mapGraphic);

  // Dropdown filters
  list = list.filter(g => {
    if (selectedType && g.imageType !== selectedType) return false;
    if (selectedCatalog && g.releaseCatalog !== selectedCatalog) return false;
    if (filterByAuthor && selectedAuthor && !valuesMatch(g.author, selectedAuthor)) return false;
    if (filterByBook && selectedBook && !valuesMatch(g.book, selectedBook)) return false;
    return true;
  });

  // Guide the feed toward community-loved work while keeping room for exploration.
  const suppressMutedInitially = sessionVotes < 5;
  return orderByCommunityPreference(list, { includeMuted: !suppressMutedInitially });
}

// ===== Preload =====
function preloadAsset(src, type) {
  if (!src) return Promise.resolve();
  if (preloadCache.has(src)) return preloadCache.get(src);
  let p;
  if (type === 'VV' || isVideoUrl(src)) {
    p = new Promise((resolve) => {
      const v = document.createElement('video'); v.preload='auto'; v.src=src; v.muted=true; v.load();
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); resolve(); };
      const cleanup = () => { v.removeEventListener('canplaythrough', done); v.removeEventListener('error', fail); };
      v.addEventListener('canplaythrough', done, { once:true }); v.addEventListener('error', fail, { once:true });
    });
  } else {
    p = new Promise((resolve) => { const img = new Image(); img.onload=() => resolve(); img.onerror=() => resolve(); img.src=src; });
  }
  preloadCache.set(src, p); return p;
}
function safePreload(i) { if (i < 0 || i >= queue.length) return; const it = queue[i]; return preloadAsset(it.mediaUrl, it.imageType); }
function renderWhenReady(i) { const it = queue[i]; if (!it) return; const p = preloadCache.get(it.mediaUrl) || Promise.resolve(); p.finally(() => renderCurrent(it)); }

// ===== Viewport fit (dynamic media height) =====
function setViewportVars() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
function adjustViewportFit() {
  const vh = window.innerHeight;
  const ids = ['user-status','type-filter-container','catalog-filter-container','page-title'];
  const mediaWrap = document.getElementById('media-wrap');
  const nodes = [
    ...ids.map(id => document.getElementById(id)).filter(Boolean),
    document.querySelector('.button-container'),
    document.getElementById('error'),
    document.getElementById('message')
  ].filter(Boolean);

  let occupied = 0;
  nodes.forEach(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const margins = parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    occupied += (r.height + margins);
  });

  if (mediaWrap) {
    Array.from(mediaWrap.children).forEach((child) => {
      if (child.classList?.contains('media-box')) return;
      const r = child.getBoundingClientRect();
      const cs = getComputedStyle(child);
      const margins = parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      occupied += (r.height + margins);
    });
  }

  const buffer = 40;
  const maxH = Math.max(160, vh - occupied - buffer);
  document.documentElement.style.setProperty('--media-max-h', `${Math.floor(maxH)}px`);
}

// ===== Init / rebuild =====
function initQueueFromData(data) {
  lastData = data;
  queue = buildFilteredList(data);
  if (!queue.length) { $('#gallery').innerHTML = '<p>No items match the current filters.</p>'; return; }
  if (selectedItemId) {
    const targetIdx = queue.findIndex(g => valuesMatch(g.id, selectedItemId));
    if (targetIdx > 0) {
      const [target] = queue.splice(targetIdx, 1);
      queue.unshift(target);
    }
  }
  idx = 0;
  historyStack.length = 0;
  for (let k=0; k<=PRELOAD_AHEAD; k++) safePreload(idx + k);
  renderWhenReady(idx);
}
function rebuildQueueAfterFilter() {
  if (!lastData) return;
  const keepId = currentItem?.id || null;
  queue = buildFilteredList(lastData);
  if (!queue.length) { idx = -1; currentItem=null; $('#gallery').innerHTML = '<p>No items match the current filters.</p>'; renderMetaRows(null); renderCounter(); return; }
  const pos = keepId ? queue.findIndex(g => g.id === keepId) : -1;
  idx = pos >= 0 ? pos : 0;
  for (let k=0; k<=PRELOAD_AHEAD; k++) safePreload(idx + k);
  renderWhenReady(idx);
}

async function refreshAfterFlaggedContent(flaggedItemId) {
  const data = await fetchLatestBatch().catch(() => null);
  if (data) {
    initQueueFromData(data);
    return;
  }

  const normalizedId = normalizeFilterValue(flaggedItemId);
  queue = queue.filter((entry) => normalizeFilterValue(entry?.id) !== normalizedId);
  if (lastData) {
    const strip = (items) => (Array.isArray(items) ? items.filter((entry) => {
      const rawId = entry?.imageId ?? entry?.id ?? entry?.contentId ?? entry?.uid ?? '';
      return normalizeFilterValue(rawId) !== normalizedId;
    }) : items);
    lastData = {
      ...lastData,
      newGraphics: strip(lastData.newGraphics),
      allGraphics: strip(lastData.allGraphics),
    };
  }

  if (!queue.length) {
    idx = -1;
    currentItem = null;
    window.currentItem = null;
    $('#gallery').innerHTML = '<p>No items match the current filters.</p>';
    renderMetaRows(null);
    renderCounter();
    return;
  }

  if (idx >= queue.length) idx = queue.length - 1;
  renderWhenReady(idx);
}

async function flagCurrentContent() {
  if (!currentItem?.id) return;
  if (!userCanFlagContent()) {
    alert('Only author, team, and admin accounts can flag content.');
    return;
  }

  const note = window.prompt('What is wrong with this content? Please add a short note for review.');
  if (note === null) return;
  const trimmed = String(note || '').trim();
  if (!trimmed) {
    alert('Please include a short note so the team knows what needs attention.');
    return;
  }

  try {
    await submitContentFlagWrapped(currentItem.id, trimmed);
    flashMessage('Flagged for review. We removed it from the regular feed for now.');
    if (window.PP?.toggleInfo) window.PP.toggleInfo(false);
    await refreshAfterFlaggedContent(currentItem.id);
  } catch (err) {
    console.error('Flag content failed', err);
    alert(err?.message || 'Could not flag this content right now.');
  }
}

// ===== Rendering =====
function ensureMediaWrap() {
  let mediaWrap = $('#media-wrap');
  if (!mediaWrap) { mediaWrap = document.createElement('div'); mediaWrap.id='media-wrap'; const gal=$('#gallery'); (gal?.parentElement||document.body).insertBefore(mediaWrap, gal||null); }
  return mediaWrap;
}
function placeRowsAroundMedia(mediaWrap, box){
  const voteRow = $('#vote-row'); if (voteRow) mediaWrap.insertBefore(voteRow, box);
  const under   = $('#under-controls'); if (under) mediaWrap.appendChild(under);
}
function renderMetaRows(item) {
  const mediaWrap = ensureMediaWrap();
  mediaWrap.querySelectorAll('.meta-row').forEach(n=>n.remove());
  if (!item) return;

    // --- MOBILE: do not render inline meta; update bottom sheet instead ---
  if (window.__PP_FORCE_MOBILE || (document.body && document.body.dataset.ui === 'mobile')) {
    if (window.PP && typeof window.PP.updateInfo === 'function') {
      window.PP.updateInfo(item);
    }
    const badge = document.getElementById('mobile-counts');
    if (badge) badge.style.display = 'none';
    return; // prevent the three mediaWrap.prepend(...) lines from running
  }


  const row = (text, checkboxId, checked, label, onToggle) => {
    const r = document.createElement('div'); r.className='meta-row';
    const p = document.createElement('p'); p.textContent = text || ''; r.appendChild(p);
    if (checkboxId) { const wrap=document.createElement('div'); const cb=document.createElement('input'); cb.type='checkbox'; cb.id=checkboxId; cb.checked=!!checked; cb.onchange=onToggle;
      const lb=document.createElement('label'); lb.htmlFor=checkboxId; lb.textContent=label; wrap.append(cb,lb); r.appendChild(wrap); }
    return r;
  };
  const actionRow = (buttonLabel, onClick) => {
    const r = document.createElement('div');
    r.className = 'meta-row';
    const wrap = document.createElement('div');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = buttonLabel;
    button.style.padding = '8px 12px';
    button.style.borderRadius = '12px';
    button.style.border = '1px solid #e9d2d2';
    button.style.background = '#fff6f5';
    button.style.color = '#8b3d37';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';
    button.onclick = onClick;
    wrap.appendChild(button);
    r.appendChild(wrap);
    return r;
  };

  // On mobile we still show the metadata, but the checkboxes still work
  mediaWrap.prepend(row(`Title: ${item.title || ''}`));
  mediaWrap.prepend(row(
    `Author: ${item.author || ''}`,
    'authorCheckbox',
    filterByAuthor && valuesMatch(selectedAuthor, item.author),
    'More from this author',
    () => setAuthorFilter(!(filterByAuthor && valuesMatch(selectedAuthor, item.author)), item.author)
  ));
  mediaWrap.prepend(row(
    `From their book: ${item.book || ''}`,
    'bookCheckbox',
    filterByBook && valuesMatch(selectedBook, item.book),
    'More from this book',
    () => setBookFilter(!(filterByBook && valuesMatch(selectedBook, item.book)), item.book)
  ));
  if (userCanFlagContent()) {
    mediaWrap.prepend(actionRow('Flag issue with this content', () => flagCurrentContent()));
  }
}
function renderCounter() {
  const all = Array.isArray(lastData?.allGraphics) ? lastData.allGraphics.map(mapGraphic) : [];
  let domainAll = all.filter(g => {
    if (selectedType && g.imageType !== selectedType) return false;
    if (selectedCatalog && g.releaseCatalog !== selectedCatalog) return false;
    if (filterByAuthor && selectedAuthor && !valuesMatch(g.author, selectedAuthor)) return false;
    if (filterByBook   && selectedBook && !valuesMatch(g.book, selectedBook)) return false;
    return true;
  });
  const totalInDomain = domainAll.length;
  const totalImages = Number(lastData?.totalImages || all.length || 0);
  const votedOverall = Number(lastData?.votedImagesCount || 0);
  const remainingOverall = Number(lastData?.remainingImagesCount || 0);
  const domainRemaining = queue.length;
  let votedInDomain = Math.max(totalInDomain - domainRemaining, 0);

  if (!selectedType && !selectedCatalog && !filterByAuthor && !filterByBook && totalInDomain === totalImages) {
    votedInDomain = votedOverall;
  }

  let counter = $('#domain-counter');
  if (!counter) {
    counter = document.createElement('div'); counter.id='domain-counter'; counter.className='vote-counter';
    const bar = $('#counters-bar'); if (bar) { const span = document.createElement('span'); span.appendChild(counter); bar.appendChild(span); }
  }
  if (counter) {
    const remainingText = (!selectedType && !selectedCatalog && !filterByAuthor && !filterByBook && totalInDomain === totalImages)
      ? remainingOverall
      : domainRemaining;
    counter.textContent = `Voted on ${votedInDomain} of ${totalInDomain} — ${remainingText} remaining.`;
  }
  refreshCountsModalIfOpen();
}
function resetVoteButtons(){
  [['btn-like','Like'],['btn-dislike','Dislike'],['btn-moved','Moved Me'],['btn-meh','Meh']].forEach(([id,txt])=>{
    const b=$('#'+id); if (b){ b.disabled=false; b.classList.remove('voted'); b.textContent=txt; }
  });
}
function renderItemMedia(item) {
  const mediaWrap = ensureMediaWrap();
  const oldBox = mediaWrap.querySelector('.media-box'); if (oldBox) oldBox.remove();
  const box = document.createElement('div'); box.className='media-box'; mediaWrap.appendChild(box);

  let img = null, v = null;

  if (item?.imageType === 'EXC' || item?.imageType === 'FP') {
    const textDiv = document.createElement('div'); textDiv.className='excerpt-text';
    if (item?.imageType === 'FP' && item?.title) {
      const title = document.createElement('div');
      title.className = 'full-poem-title';
      title.textContent = item.title;
      textDiv.appendChild(title);
    }
    const p = document.createElement('p');
    p.className = item?.imageType === 'FP' ? 'full-poem-body' : '';
    p.textContent = item?.excerpt || '';
    textDiv.appendChild(p);
    box.appendChild(textDiv);
  } else if (item?.mediaUrl && (item.imageType === 'VV' || isVideoUrl(item.mediaUrl))) {
    const a = document.createElement('a'); if (item?.bookUrl) { a.href=item.bookUrl; a.target='_blank'; }
    v = document.createElement('video'); v.src=item.mediaUrl; v.controls=true; v.style.maxWidth='100%'; v.style.height='auto';
    a.appendChild(v); box.appendChild(a);
 } else if (item?.mediaUrl) {
  const a = document.createElement('a');
  if (item?.bookUrl) { a.href = item.bookUrl; a.target = '_blank'; }

  img = document.createElement('img');
  img.src = item.mediaUrl;
  img.alt = item?.id || '';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';

  a.appendChild(img);
  box.appendChild(a);

  attachPinchZoomToImage_(img);
}
 else { const p=document.createElement('p'); p.textContent='No media available for this item.'; box.appendChild(p); }

  placeRowsAroundMedia(mediaWrap, box);

  // Trigger viewport fit now and when media is ready
  requestAnimationFrame(() => { setViewportVars(); adjustViewportFit(); });
  if (img) img.addEventListener('load', () => requestAnimationFrame(adjustViewportFit), { once: true });
  if (v) {
    const recalc = () => requestAnimationFrame(adjustViewportFit);
    v.addEventListener('loadedmetadata', recalc, { once: true });
    v.addEventListener('canplay',        recalc, { once: true });
  }
}
function renderCurrent(item) {
  resetVoteButtons();
  currentItem = item;
  window.currentItem = currentItem; // <-- make it available to mobile.html

  servedCounter = (servedCounter || 0) + 1;
  renderMetaRows(item);
  renderItemMedia(item);

  const back = $('#btn-go-back');
  if (back) back.disabled = historyStack.length === 0;

  const toBook = $('#btn-to-book');
  if (toBook)
    toBook.onclick = () => {
      if (currentItem?.bookUrl)
        window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer');
    };

  const gal = $('#gallery');
  if (gal)
    gal.innerHTML = item
      ? ``
      : `<p>No new items.</p>`;

  renderCounter();

  setViewportVars();
  adjustViewportFit();

  // ✅ Notify mobile shell *with* the item payload
  window.dispatchEvent(new CustomEvent('pp:state', { detail: { item: currentItem } }));
  if (currentUserIsAdmin() && document.getElementById('pp-feed-signals-modal')?.style.display === 'flex') {
    renderFeedSignalsModal();
  }
  LoaderController.clearInline();
  LoaderController.markScreenReady();
}

// ===== Heuristic next index chooser =====
function chooseNextIndex() {
  // After a dislike, pick highest-rated unseen next
  if ((lastVoteType || '').toLowerCase() === 'dislike') {
    let bestIdx = -1, bestScore = -Infinity;
    for (let j = idx + 1; j < queue.length; j++) {
      const score = communityAffinityOf(queue[j]);
      if (score > bestScore) { bestScore = score; bestIdx = j; }
    }
    if (bestIdx !== -1) return bestIdx;
  }

  // Keep muted / meh-heavy content in circulation, but only occasionally.
  const explorationWindow = (sessionVotes > 6) && (servedCounter % 6 === 0);
  if (explorationWindow) {
    for (let j = idx + 1; j < queue.length; j++) if (isMutedCandidate(queue[j])) return j;
  }

  // Default: next in sequence
  return (idx + 1 < queue.length) ? idx + 1 : -1;
}

// ===== Voting / Navigation =====
function setVoteButtonsDisabled(disabled) {
  ['btn-like','btn-dislike','btn-moved','btn-meh'].forEach(id=>{ const b=$('#'+id); if (b) b.disabled=disabled; });
}
function flashMessage(text) {
  const el = $('#message'); if (!el) return; el.classList.add('toast'); el.textContent = text || ''; setTimeout(()=>{ if (el.textContent === text) el.textContent=''; }, 1500);
}

// === IMPORTANT: submitVote for email or anonId, with anon auth token ===
async function submitVote(item, value){
  if (!item?.id) return;

  let user = firebase.auth().currentUser;
  // If not signed in, sign in anonymously so the API gets a valid ID token
  if (!user) {
    try {
      await firebase.auth().signInAnonymously();
      user = firebase.auth().currentUser;
    } catch (e) {
      console.warn('Anonymous sign-in failed:', e);
    }
  }

  // Pick the identifier we store in Firestore (email if available, else anonId counter)
  let userId;
  if (user && user.email) {
    userId = user.email;              // <- stored key for authed users
    } else {
    userId = await getOrCreateAnonId();   // <- stored key for anon users
  }
  
  // Write the vote (ID token is handled by api() automatically via currentUser)
  return submitVoteWrapped(item.id, value, userId);
}


async function onVoteAny(value /* 'like'|'dislike'|'meh'|'moved me' */){
  if (!currentItem || isTransitioning) return;
  isTransitioning = true;
  historyStack.push(currentItem);

  // optimistic UI
  setVoteButtonsDisabled(true);
  const clickedId = (value === 'like') ? 'btn-like' : (value === 'dislike') ? 'btn-dislike' : (value === 'moved me') ? 'btn-moved' : 'btn-meh';
  const clicked = $('#'+clickedId); if (clicked){ clicked.classList.add('voted'); clicked.textContent = `Voted ${value}`; }
  flashMessage(`Your ${value} vote has been recorded.`);

  try {
    await submitVote(currentItem, value);
    if (value === 'like')     updateCounters({ like: 1 });
    if (value === 'dislike')  updateCounters({ dislike: 1 });
    if (value === 'moved me') updateCounters({ moved: 1 });
    if (value === 'meh')      updateCounters({ meh: 1 });
  } catch(e) { console.warn('vote error', e); }
  finally {
    lastVoteType = (value || '').toLowerCase();
    sessionVotes = (sessionVotes || 0) + 1;
    if (lastVoteType === 'meh' || lastVoteType === 'dislike') sessionNegatives = (sessionNegatives || 0) + 1;

    const nextIndex = chooseNextIndex();
    if (nextIndex !== -1) {
      idx = nextIndex;
      safePreload(idx + PRELOAD_AHEAD);
      renderWhenReady(idx);
    } else {
      const data = await fetchLatestBatch().catch(()=>null);
      if (data) initQueueFromData(data);
    }
    setVoteButtonsDisabled(false);
    isTransitioning = false;
  }
}
async function onSkip(){
  if (isTransitioning) return;
  if (!currentItem) {
    const data = await fetchLatestBatch().catch(()=>null);
    if (data) initQueueFromData(data);
    return;
  }
  isTransitioning = true;
  historyStack.push(currentItem);
  const teamSkip = currentUserIsTeamOrAdmin();
  setVoteButtonsDisabled(true);
  flashMessage(teamSkip ? 'Skipped without recording a vote.' : 'Skipped');
  try {
    if (!teamSkip) await submitVote(currentItem, 'meh');
    updateCounters({ skip: 1 });
  }
  catch(e) { console.warn('skip vote error', e); }
  finally {
    const nextIndex = chooseNextIndex();
    if (nextIndex !== -1) { idx = nextIndex; safePreload(idx + PRELOAD_AHEAD); renderWhenReady(idx); }
    else { const data = await fetchLatestBatch().catch(()=>null); if (data) initQueueFromData(data); }
    setVoteButtonsDisabled(false); isTransitioning = false;
  }
}
function onGoBack(){
  if (!historyStack.length || isTransitioning) return;
  const prev = historyStack.pop();
  const pos = prev?.id ? queue.findIndex(g => g.id === prev.id) : -1;
  if (pos >= 0) idx = pos;
  renderCurrent(prev);
}

// ===== AUTOLOAD FIRST ITEM =====
let __pp_initialLoad = false;

// Simple promise timeout helper
function withTimeout_(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

async function ppAutoloadFirstItem() {
  if (__pp_initialLoad || currentItem) return;

  console.debug('[PP] autoload: starting');

  // Lock while we try; we’ll unlock in finally if we didn’t actually render an item
  __pp_initialLoad = true;

  try {
    // 2 retries (3 total attempts), each with a timeout
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.debug(`[PP] autoload attempt ${attempt}/3`);

      const data = await withTimeout_(
        fetchLatestBatch(),
        12000,
        '[PP] fetchLatestBatch'
      ).catch((e) => {
        console.warn('[PP] autoload fetch error:', e);
        return null;
      });

      if (data && Array.isArray(data.newGraphics) && data.newGraphics.length) {
        console.debug('[PP] autoload: got data, initializing queue');
        initQueueFromData(data);
        hydrateFullFeedInBackground();

        // If something prevented render, allow future attempts
        if (!currentItem) {
          console.warn('[PP] autoload: initQueueFromData ran but no currentItem; unlocking');
          __pp_initialLoad = false;
        }
        return; // ✅ success (or unlocked above if render didn’t happen)
      }

      console.warn('[PP] autoload: no usable data this attempt');
      // short backoff before retry
      await new Promise(r => setTimeout(r, 600));
    }

    console.warn('[PP] autoload: no usable data after retries');
  } catch (e) {
    console.warn('[PP] autoload: fatal error', e);
  } finally {
    // ✅ If we *still* don’t have an item, allow future attempts (e.g., user logs in later)
    if (!currentItem) __pp_initialLoad = false;
    if (!currentItem) LoaderController.markScreenReady();
  }
}






// ===== Auth listener =====
firebase.auth().onAuthStateChanged(async (user) => {
  const visibleUser = user && !user.isAnonymous ? user : null;
  const loginEl  = document.getElementById('login-screen');
  const registrationEl = document.getElementById('registration-screen');
  const poetryEl = document.getElementById('poetry-screen');
  if (loginEl && poetryEl) {
    // Keep the app available even when signed out; auth is optional.
    show(loginEl, false);
    if (registrationEl) show(registrationEl, false);
    show(poetryEl, true);
  }

  LoaderController.markAuthResolved();
  if (!currentItem) LoaderController.showInline();
  LoaderController.markScreenReady();

  ppAutoloadFirstItem();   // <-- added

  if (visibleUser) {
    await mergeAnonymousVotesIntoAccount();
  }

  refreshCurrentAccount()
    .then(() => {
      updateUserStatusUI();
      if (currentItem) renderMetaRows(currentItem);
      dispatchEvent(new CustomEvent('pp:state'));
    })
    .catch((err) => {
      console.warn('refreshCurrentAccount failed during auth bootstrap', err);
      updateUserStatusUI();
      dispatchEvent(new CustomEvent('pp:state'));
    });

  if (visibleUser) {
    redeemAuthorInviteIfPresent().catch((err) => {
      console.warn('author invite redemption deferred failure', err);
    });
  }
});


// ===== DOM Ready =====
window.addEventListener('DOMContentLoaded', () => {
  LoaderController.markDomReady();

  // Default to the app shell immediately; auth should never gate reading.
  show(document.getElementById('login-screen'), false);
  show(document.getElementById('registration-screen'), false);
  show(document.getElementById('poetry-screen'), true);

  // Wire login UI if present (works for both desktop & mobile)
  on(document.getElementById('login-google'), 'click', signInWithGoogle);
  on(document.getElementById('email-login-form'), 'submit', handleEmailLogin);
  on(document.getElementById('registration-form'), 'submit', handleRegistration);
  on(document.getElementById('show-registration'), 'click', showRegistrationForm);
  on(document.getElementById('show-login'), 'click', showLoginScreen);
  on(document.getElementById('btn-mobile-moved'),  'click', () => onVoteAny('moved me'));
  on(document.getElementById('btn-mobile-meh'),    'click', () => onVoteAny('meh'));
  on(document.getElementById('btn-mobile-like'),   'click', () => onVoteAny('like'));
  on(document.getElementById('btn-mobile-dislike'), 'click', () => onVoteAny('dislike'));


  // Desktop-only extras
  if (!IS_MOBILE_UI) {
    on(document.getElementById('load-button'), 'click', onSkip);
  }

  updateUserStatusUI();
  LoaderController.maybeHidePrimary();
  if (!currentItem) LoaderController.showInline();
  ppAutoloadFirstItem();

  // Viewport listeners
  setViewportVars();
  adjustViewportFit();
  window.addEventListener('resize', () => { setViewportVars(); adjustViewportFit(); });
  window.addEventListener('orientationchange', () => { setViewportVars(); setTimeout(adjustViewportFit, 100); });
});

// ===== Scaffold UI (vote row, under-controls, counters) =====
// Skip injecting the desktop scaffold on mobile UI
(function ensureScaffold() {
  if (IS_MOBILE_UI) return;

  let mediaWrap = $('#media-wrap');
  if (!mediaWrap) { mediaWrap=document.createElement('div'); mediaWrap.id='media-wrap'; const gal=$('#gallery'); (gal?.parentElement||document.body).insertBefore(mediaWrap, gal||null); }

  // VOTE ROW (above media)
  if (!$('#vote-row')) {
    const row = document.createElement('div'); row.id='vote-row'; row.className='button-row';
    const mk = (id, txt, val) => { const b=document.createElement('button'); b.id=id; b.textContent=txt; b.className='vote-btn'; b.addEventListener('click', () => onVoteAny(val)); return b; };
    row.append(mk('btn-like','Like','like'), mk('btn-dislike','Dislike','dislike'), mk('btn-moved','Moved Me','moved me'), mk('btn-meh','Meh','meh'));
    mediaWrap.appendChild(row);
  }

  // UNDER-IMAGE CONTROLS (below media)
  if (!$('#under-controls')) {
    const row = document.createElement('div'); row.id='under-controls'; row.className='button-row';
    const back = document.createElement('button'); back.id='btn-go-back'; back.textContent='Go Back'; back.disabled=true; back.addEventListener('click', onGoBack);
    const toBook = document.createElement('button'); toBook.id='btn-to-book'; toBook.textContent='Take me to the book'; toBook.addEventListener('click', () => { if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer'); });
    row.append(back, toBook); mediaWrap.appendChild(row);
  }

  // COUNTERS BAR
  if (!$('#counters-bar')) {
    const bar = document.createElement('div'); bar.id='counters-bar';
    bar.innerHTML = `
      <span>Likes: <strong id="count-like">0</strong></span>
      <span>Dislikes: <strong id="count-dislike">0</strong></span>
      <span>Moved Me: <strong id="count-moved">0</strong></span>
      <span>Meh: <strong id="count-meh">0</strong></span>
      <span>Skips: <strong id="count-skip">0</strong></span>
    `;
    document.body.appendChild(bar);
  }
})();

// ===== Mobile shim (window.PP) + state events =====
(function(){
  const getNum = id => +(document.getElementById(id)?.textContent || 0);
  function readCounts(){ return {
    likes:getNum('count-like'), dislikes:getNum('count-dislike'),
    moved:getNum('count-moved'), meh:getNum('count-meh'), skips:getNum('count-skip')
  };}

  function emitState(){
  try {
    const detail = {
      user: firebase.auth().currentUser || null,
      item: currentItem || null,                 // <-- add this
      currentId: currentItem?.id ?? null,
      ...readCounts()
    };
    window.dispatchEvent(new CustomEvent('pp:state', { detail }));
  } catch(_) {}
}


  // API for mobile.html
  window.PP = Object.assign({}, window.PP, {
    vote: (v)=>onVoteAny(v),
    skip: ()=>onSkip(),
    goBack: ()=>onGoBack(),
    openBook: ()=>{ if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank','noopener,noreferrer'); },
    getState: ()=>({
  user: firebase.auth().currentUser || null,
  item: currentItem || null,                    // <-- add this
  currentId: currentItem?.id ?? null,
  ...readCounts()
})

  });

  // Keep mobile UI synced
  const _updateCounters = updateCounters; updateCounters = (d)=>{ _updateCounters(d); emitState(); };
  const _renderCurrent  = renderCurrent;  renderCurrent  = (i)=>{ _renderCurrent(i);  emitState(); };

  firebase.auth().onAuthStateChanged(()=>emitState());

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', ()=>setTimeout(emitState,0), { once:true });
  } else setTimeout(emitState,0);

  // Failsafe: if mobile shell loads and nothing rendered, auto-start once
  if (IS_MOBILE_UI) setTimeout(() => {
  if (!currentItem && !__pp_initialLoad) {
    try { ppAutoloadFirstItem(); } catch (_) {}
  }
}, 1200);

})();
