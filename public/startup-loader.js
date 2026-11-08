// Startup owner: Poetry Please loader development.
// Callers report readiness and supply retry and timing callbacks.
// Keep authentication, feed selection, and deferred work in the caller.
(function () {
  'use strict';

  function create({ hasCurrentItem, markTiming, onScreenReady, retryFirstItem }) {
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

    function showInline() {
      if (hasCurrentItem()) return;
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
