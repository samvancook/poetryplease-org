// Swipe intro test (approved by Sam, Nov 23 2026: build it, review before merge).
// Signed-out visitors on plain Swipe visits are split once per device:
// 10% see the gumball dispenser intro, 10% the claw machine, 80% nothing.
// The intro sits over the feed while the first card loads underneath; it never
// holds up the feed, and the art only downloads for the two intro groups.
import { isPlainVisit, variantFor, forcedVariant, shouldPlay, pickArt, INTRO_VARIANTS } from './swipe-intro-rules.js';

const VARIANT_KEY = 'pp_intro_variant';
const SHOWN_KEY = 'pp_intro_last_shown';
const AUTH_WAIT_MS = 1200;
const SLIP = { lines: ['Swipe up for a poem.', 'Tap a reaction to tell', 'the machine how it landed.'], by: 'Poetry, Please' };

const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };

// Analytics loads after the page; hand events over once it exists.
function track(name, params) {
  const send = () => window.ppTrack?.(name, params);
  if (window.ppTrack || document.readyState !== 'loading') send();
  else document.addEventListener('DOMContentLoaded', send, { once: true });
}
function tagGroup(variant) {
  const send = () => window.ppUserProperty?.('intro_variant', variant);
  if (window.ppUserProperty || document.readyState !== 'loading') send();
  else document.addEventListener('DOMContentLoaded', send, { once: true });
}

// Swipe's startup rewrites the address bar to its own filters (scroll.js updateRoute),
// dropping ?intro= and campaign tags, often before this module runs. Read the URL the
// page was opened with instead.
function openedSearch() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav?.name) return new URL(nav.name).search;
  } catch (_) {}
  return location.search;
}

function authState() {
  return new Promise(resolve => {
    let settled = false, stop = () => {};
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); stop(); resolve(value); };
    const timer = setTimeout(() => finish(undefined), AUTH_WAIT_MS);
    try { stop = firebase.auth().onAuthStateChanged(user => finish(user)); }
    catch (_) { finish(undefined); }
  });
}

const STYLE = `
.pp-intro{position:fixed;inset:0;z-index:1000;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  padding:calc(16px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;touch-action:none;transition:opacity .3s ease}
.pp-intro[data-leaving]{opacity:0}
.pp-intro__brand{font-weight:700;font-size:11px;letter-spacing:.2em}
.pp-intro canvas{display:block;width:min(84vw,calc((100dvh - 230px) * .75),340px);aspect-ratio:360/480}
.pp-intro h2{margin:0;font:400 26px/1.1 Georgia,"Times New Roman",serif;text-align:center}
.pp-intro button{min-height:48px;min-width:200px;padding:0 22px;border-radius:14px;border:1px solid #555;background:#000;color:#fff;font:600 15px/1 system-ui,-apple-system,sans-serif;cursor:pointer}
.pp-intro button[data-ready]{background:#fff;color:#000;border-color:#fff}
.pp-intro button:focus-visible{outline:2px solid #fff;outline-offset:3px}`;

async function play(variant, forced) {
  const started = performance.now();
  const style = document.createElement('style');
  style.textContent = STYLE;
  const overlay = document.createElement('div');
  overlay.className = 'pp-intro';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to Poetry, Please');
  overlay.innerHTML = '<div class="pp-intro__brand">POETRY, PLEASE</div><canvas aria-hidden="true"></canvas>' +
    '<h2>A poetry dispenser.</h2><button type="button">Skip intro</button>';
  const canvas = overlay.querySelector('canvas'), button = overlay.querySelector('button');
  let stop = () => {}, closed = false;
  const close = how => {
    if (closed) return;
    closed = true;
    track('intro_done', { intro_variant: variant, how, ms: Math.round(performance.now() - started) });
    overlay.dataset.leaving = '';
    setTimeout(() => { stop(); overlay.remove(); style.remove(); document.getElementById('feed')?.focus({ preventScroll: true }); }, 300);
  };
  button.addEventListener('click', () => close(button.dataset.ready !== undefined ? 'start' : 'skip'));
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close('skip'); });
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  button.focus({ preventScroll: true });
  if (!forced) write(SHOWN_KEY, String(Date.now()));
  track('intro_shown', { intro_variant: variant });
  try {
    const { playIntro } = await import('./swipe-intro-art.js');
    if (closed) return;
    stop = playIntro(canvas, variant, {
      poem: SLIP,
      onSlip: () => { button.textContent = 'Start reading'; button.dataset.ready = ''; },
      onEnd: () => setTimeout(() => close('auto'), 1200),
    });
  } catch (_) {
    close('error');
  }
}

async function run() {
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  if (document.body?.dataset.feedMode !== 'swipe') return;
  const search = openedSearch();
  const forced = forcedVariant(search);
  if (!forced && (!isPlainVisit(search) || navigator.webdriver)) return;
  const user = forced ? null : await authState();
  if (!forced && user === undefined) return; // account check too slow; never show an intro late
  const signedIn = Boolean(user && !user.isAnonymous);
  if (!forced && signedIn) return; // the test covers signed-out visitors only (staff are always signed in)
  let variant = forced || read(VARIANT_KEY);
  if (!forced && !INTRO_VARIANTS.includes(variant)) {
    variant = variantFor(Math.random());
    write(VARIANT_KEY, variant);
    track('intro_assigned', { intro_variant: variant });
  }
  if (!forced) tagGroup(variant);
  const ok = shouldPlay({
    variant, forced: Boolean(forced), signedIn,
    lastShown: Number(read(SHOWN_KEY)) || 0, now: Date.now(),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    cardAlreadyShown: Boolean(document.querySelector('#feed > *')),
  });
  if (ok) play(pickArt(variant, Math.random()), Boolean(forced));
}

run().catch(() => {});
