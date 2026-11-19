// Startup owner: Poetry Please loader development.
// Callers report readiness and supply retry and timing callbacks.
// Keep authentication, feed selection, and deferred work in the caller.
(function () {
  'use strict';

  const DESKTOP_TEXT_DELAY_MS = 1200;

  function create({ hasCurrentItem, markTiming, onScreenReady, retryFirstItem }) {
    const state = {
      domReady: document.readyState !== 'loading',
      authResolved: false,
      screenReady: false,
      loaderHidden: false,
      loaderShownAt: Date.now(),
      // No forced minimum: the splash hides as soon as the screen is ready.
      minLoaderMs: 0,
      maxLoaderMs: 5000,
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
      markTiming('loaderHidden');
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

    // Where the first card will appear. Classic mobile already draws the card
    // frame, so the outline fills it; Desktop has no frame yet, so the outline
    // is drawn just below the controls.
    function placeOutline(overlayEl) {
      const card = overlayEl.querySelector('.pp-card-outline');
      if (!card) return;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const slot = document.getElementById('media-wrap');
      const rect = slot ? slot.getBoundingClientRect() : null;
      const usable = rect && rect.width > 0 && rect.top < viewportHeight - 200;
      const framed = Boolean(usable && rect.height >= 240);
      let top;
      let left;
      let width;
      let height;
      if (framed) {
        top = rect.top;
        left = rect.left;
        width = rect.width;
        height = Math.min(rect.height, viewportHeight - rect.top);
      } else {
        width = Math.max(200, Math.min(720, viewportWidth - 32));
        left = (viewportWidth - width) / 2;
        top = usable ? rect.bottom + 12 : viewportHeight * 0.2;
        height = Math.max(160, Math.min(viewportHeight * 0.56, viewportHeight - top - 32));
      }
      card.style.top = Math.round(top) + 'px';
      card.style.left = Math.round(left) + 'px';
      card.style.width = Math.round(width) + 'px';
      card.style.height = Math.round(height) + 'px';
      card.style.border = '0';
      card.style.background = 'transparent';
      card.querySelectorAll('.pp-card-outline__bar').forEach((bar) => {
        bar.style.display = framed ? '' : 'none';
        bar.style.background = 'rgba(255,255,255,0.20)';
      });
      // Desktop shows its cards as plain text on the page, with no frame, so a
      // drawn box looked out of place and flashed on ordinary loads. Desktop
      // instead gets a plain "Loading…" line in the page's own type, and only
      // when the first card is slow.
      card.style.justifyContent = framed ? 'center' : 'flex-start';
      card.style.paddingTop = framed ? '24px' : '40px';
      const text = card.querySelector('.pp-card-outline__text');
      if (text) text.style.display = framed ? 'none' : '';
      if (!framed && !overlayEl.dataset.desktopDelayed) {
        overlayEl.dataset.desktopDelayed = '1';
        overlayEl.style.visibility = 'hidden';
        window.setTimeout(() => { overlayEl.style.visibility = ''; }, DESKTOP_TEXT_DELAY_MS);
      }
    }

    function showInline() {
      if (hasCurrentItem()) return;
      let overlayEl = getInlineOverlay();
      if (!overlayEl) {
        overlayEl = document.createElement('div');
        overlayEl.className = 'pp-inline-loading-overlay';
        overlayEl.style.cssText = 'position:fixed;inset:0;z-index:15000;pointer-events:none;opacity:1;transition:opacity 320ms ease;';
        overlayEl.innerHTML = `
          <div class="pp-card-outline" aria-hidden="true" style="position:fixed;box-sizing:border-box;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;">
            <div class="pp-card-outline__bar" style="width:72%;max-width:420px;height:14px;border-radius:7px;"></div>
            <div class="pp-card-outline__bar" style="width:58%;max-width:340px;height:14px;border-radius:7px;"></div>
            <div class="pp-card-outline__bar" style="width:66%;max-width:380px;height:14px;border-radius:7px;"></div>
            <div class="pp-card-outline__bar" style="width:34%;max-width:200px;height:10px;border-radius:5px;margin-top:10px;"></div>
            <div class="pp-card-outline__text" style="display:none;font:inherit;font-size:17px;color:rgba(30,26,21,0.55);">Loading…</div>
          </div>
          <span role="status" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;">Loading</span>
        `;
        document.body.appendChild(overlayEl);
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const card = overlayEl.querySelector('.pp-card-outline');
        if (card && !reduceMotion && typeof card.animate === 'function') {
          card.animate([{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }], { duration: 1400, iterations: Infinity, easing: 'ease-in-out' });
        }
      } else {
        overlayEl.style.opacity = '1';
      }
      placeOutline(overlayEl);
    }

    function clearInline() {
      const overlayEl = getInlineOverlay();
      if (!overlayEl) return;
      overlayEl.style.opacity = '0';
      window.setTimeout(() => {
        if (document.body.contains(overlayEl)) overlayEl.remove();
      }, 340);
    }

    return {
      markDomReady() {
        state.domReady = true;
        state.loaderShownAt = Date.now();
        markTiming('domReady');
        if (!state.hardCapTimerId) {
          state.hardCapTimerId = window.setTimeout(() => {
            if (state.loaderHidden) return;
            hidePrimary();
            // Auth restoration can hang on stale browser state. Never leave the UI
            // trapped behind only the primary splash; keep the inline loader until
            // an item actually renders so we do not expose a blank shell.
            state.authResolved = true;
            state.screenReady = true;
            maybeHidePrimary();
            if (!hasCurrentItem()) showInline();
            retryFirstItem();
          }, state.maxLoaderMs);
        }
      },
      markAuthResolved() {
        state.authResolved = true;
        markTiming('authResolved');
      },
      markScreenReady() {
        state.screenReady = true;
        markTiming('screenReady');
        onScreenReady();
        maybeHidePrimary();
      },
      maybeHidePrimary,
      showInline,
      clearInline,
    };
  }

  window.PoetryPleaseStartupLoader = Object.freeze({ create });
})();
