// ===== Constants (preserve this pattern) =====
const CONSTANTS = {
  API_BASE: '/api' // Cloud Functions rewrite target
};

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
      headers: {
        'Content-Type': 'application/json',
        ...(tkn ? { Authorization: `Bearer ${tkn}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include'
    });

  let res = await doFetch(token);

  // refresh token if expired
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

// ===== UI Helpers =====
const $  = (sel) => document.querySelector(sel);
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
function show(el, yes) { if (el) el.style.display = yes ? 'block' : 'none'; }

// ===== Auth UI =====
function updateUserStatusUI() {
  const user = firebase.auth().currentUser;
  const div = $('#user-status');
  const loadBtn = $('#load-button');

  if (user) {
    if (div) div.textContent = 'Logged in as ' + (user.email || user.uid);
    if (loadBtn) loadBtn.disabled = false;
  } else {
    if (div)
      div.innerHTML =
        "<button id='login-google'>Log in with Google</button> or continue anonymously";
    if (loadBtn) loadBtn.disabled = false;
    const lg = $('#login-google');
    on(lg, 'click', signInWithGoogle);
  }
}

function showLoginScreen() {
  show($('#registration-screen'), false);
  show($('#login-screen'), true);
}
function showRegistrationForm() {
  show($('#login-screen'), false);
  show($('#registration-screen'), true);
}

async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    console.error(e);
    alert('Google sign-in failed');
  }
}
async function handleEmailLogin(e) {
  e?.preventDefault();
  try {
    const email = $('#email')?.value;
    const pw = $('#password')?.value;
    await firebase.auth().signInWithEmailAndPassword(email, pw);
  } catch (e2) {
    alert('Login error: ' + e2.message);
  }
}
async function handleRegistration(e) {
  e?.preventDefault();
  try {
    const email = $('#reg-email')?.value;
    const pw = $('#reg-password')?.value;
    await firebase.auth().createUserWithEmailAndPassword(email, pw);
  } catch (e2) {
    alert('Registration error: ' + e2.message);
  }
}

// ===== API Mappings (to your Cloud Functions) =====
async function fetchDataWrapped() {
  return api('fetchData', { body: { limit: 20 } });
}
async function fetchDataAnonWrapped(anonId) {
  return api('fetchDataAnon', { body: { anonId } });
}
async function getNextAnonymousIdWrapped() {
  return api('getNextAnonymousId', { method: 'POST' });
}
async function submitVoteWrapped(imageId, voteType, userId) {
  return api('vote', { body: { imageId, voteType, userId } });
}
async function fetchReleaseCatalogsWrapped() {
  return api('releaseCatalogs', { method: 'GET' });
}
async function fetchImageTypesWrapped() {
  return api('imageTypes', { method: 'GET' });
}
async function getRatingsSummaryWrapped() {
  return api('ratingsSummary', { method: 'GET' });
}

/* ============================================================
   Frontend functionality (history, counters, top bar, etc.)
   ============================================================ */

// --- CSS injection (keep “Logged in as…” inline; add scaffold) ---
(function injectUIPatchStyles(){
  const css = `
  .top-bar{ display:flex; align-items:center; gap:12px; flex-wrap:nowrap; padding:8px 12px; }
  .top-bar .spacer{flex:1;}
  #user-status{ white-space:nowrap; font-size:.9rem; opacity:.9; }

  #media-wrap{ max-width:min(1000px,95vw); margin:12px auto; text-align:center; }
  .button-row{ display:flex; justify-content:center; gap:10px; margin:10px 0 0; }
  #btn-go-back:disabled{ opacity:.5; cursor:not-allowed; }

  #counters-bar{ position:sticky; bottom:0; display:flex; justify-content:center; gap:18px;
    padding:10px 12px; border-top:1px solid #e6e6e6; background:#fff; z-index:5; }
  #counters-bar span{ white-space:nowrap; }
  #poem-image{ max-width:100%; height:auto; max-height:80vh; object-fit:contain; }
  `;
  const tag = document.createElement('style');
  tag.appendChild(document.createTextNode(css));
  document.head.appendChild(tag);
})();

// --- Build single-row top bar that includes your existing #user-status ---
(function buildTopBar(){
  if (document.querySelector('.top-bar')) return;
  const topBar = document.createElement('div');
  topBar.className = 'top-bar';

  const filters = document.querySelector('#filters') || document.createElement('div');
  if (!filters.id) filters.id = 'filters';

  const spacer = document.createElement('div'); spacer.className = 'spacer';

  let userStatus = document.querySelector('#user-status');
  if (!userStatus) { userStatus = document.createElement('div'); userStatus.id = 'user-status'; }

  topBar.append(filters, spacer, userStatus);
  document.body.insertBefore(topBar, document.body.firstChild);
})();

// --- Media wrapper + vote buttons + bottom controls ---
const historyStack = [];
let currentItem = null;

(function buildMediaAndControls(){
  let mediaWrap = $('#media-wrap');
  if (!mediaWrap) {
    mediaWrap = document.createElement('div');
    mediaWrap.id = 'media-wrap';
    const gal = $('#gallery');
    (gal?.parentElement || document.body).insertBefore(mediaWrap, gal || null);
  }

  // Media element (image/video placeholder)
  let img = $('#poem-image');
  if (!img) { img = document.createElement('img'); img.id = 'poem-image'; mediaWrap.appendChild(img); }

  // ===== VOTE ROW (add if missing) =====
  if (!$('#vote-row')) {
    const voteRow = document.createElement('div');
    voteRow.id = 'vote-row';
    voteRow.className = 'button-row';

    const btnLike    = document.createElement('button'); btnLike.id    = 'btn-like';    btnLike.textContent    = 'Like';
    const btnDislike = document.createElement('button'); btnDislike.id = 'btn-dislike'; btnDislike.textContent = 'Dislike';
    const btnMoved   = document.createElement('button'); btnMoved.id   = 'btn-moved';   btnMoved.textContent   = 'Moved Me';
    const btnMeh     = document.createElement('button'); btnMeh.id     = 'btn-meh';     btnMeh.textContent     = 'Meh';

    voteRow.append(btnLike, btnDislike, btnMoved, btnMeh);
    mediaWrap.appendChild(voteRow);

    // Wire handlers
    btnLike.addEventListener('click',    () => onVoteAny('like'));
    btnDislike.addEventListener('click', () => onVoteAny('dislike'));
    btnMoved.addEventListener('click',   () => onVoteAny('moved me'));
    btnMeh.addEventListener('click',     () => onVoteAny('meh'));
  }

  // ===== UNDER-IMAGE CONTROL ROW (Go Back / To Book) =====
  if (!$('.button-row#under-controls')) {
    const row = document.createElement('div');
    row.className = 'button-row';
    row.id = 'under-controls';

    const btnBack = document.createElement('button'); btnBack.id = 'btn-go-back'; btnBack.textContent = 'Go Back'; btnBack.disabled = true;
    const btnBook = document.createElement('button'); btnBook.id = 'btn-to-book'; btnBook.textContent = 'Take me to the book';

    btnBack.addEventListener('click', () => {
      if (!historyStack.length) return;
      const prev = historyStack.pop();
      showItem(prev);
    });
    btnBook.addEventListener('click', () => {
      if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer');
    });

    row.append(btnBack, btnBook);
    mediaWrap.appendChild(row);
  }

  // ===== Sticky counters bar =====
  if (!$('#counters-bar')) {
    const bar = document.createElement('div'); bar.id = 'counters-bar';
    bar.innerHTML = `
      <span>Likes: <strong id="count-like">0</strong></span>
      <span>Dislikes: <strong id="count-dislike">0</strong></span>
      <span>Skips: <strong id="count-skip">0</strong></span>
    `;
    document.body.appendChild(bar);
  }
})();

function updateCounters({ like=0, dislike=0, skip=0 }){
  const likeEl = $('#count-like'), dislikeEl = $('#count-dislike'), skipEl = $('#count-skip');
  if (like && likeEl) likeEl.textContent = (+likeEl.textContent + like);
  if (dislike && dislikeEl) dislikeEl.textContent = (+dislikeEl.textContent + dislike);
  if (skip && skipEl) skipEl.textContent = (+skipEl.textContent + skip);
}

// ---- Array-aware mapping (matches your newGraphics row format) ----
function mapGraphic(g) {
  if (Array.isArray(g)) {
    return {
      id: g[3] || null,
      imageUrl: g[4] || null,   // <- image/video URL
      bookUrl: g[5] || null,    // <- book URL
      raw: g
    };
  }
  return {
    id: g?.id ?? g?.imageId ?? g?.contentId ?? g?.uid ?? null,
    imageUrl: g?.imageUrl ?? g?.image ?? g?.url ?? null,
    bookUrl: g?.bookUrl ?? g?.link ?? null,
    raw: g
  };
}



function chooseNextFromData(data){
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.newGraphics)) arr = data.newGraphics;
  else if (Array.isArray(data?.graphics)) arr = data.graphics;
  if (!arr.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return mapGraphic(arr[idx]);
}

// Get next item using your existing API wrappers
async function fetchNextItemFromYourBackend(){
  const user = firebase.auth().currentUser;
  let data;
  if (user) {
    data = await fetchDataWrapped();
  } else {
    const stored = localStorage.getItem('pp_anon') || (await getNextAnonymousIdWrapped());
    localStorage.setItem('pp_anon', stored);
    data = await fetchDataAnonWrapped(stored);
  }
  return chooseNextFromData(data);
}

// Submit vote using your wrapper
async function submitVote(item, value /* 'like'|'dislike'|'meh'|'moved me' */){
  const user = firebase.auth().currentUser;
  const userId = user ? (user.uid || user.email) : (localStorage.getItem('pp_anon') || null);
  if (!item?.id) return;
  await submitVoteWrapped(item.id, value, userId);
}

// Render item (image + enable back)
function showItem(item){
  currentItem = item;

  const img = $('#poem-image');
  if (img) {
    if (item?.imageUrl) img.src = item.imageUrl;
    img.style.display = item?.imageUrl ? 'block' : 'none';
  }

  const back = $('#btn-go-back');
  if (back) back.disabled = historyStack.length === 0;

  const gal = $('#gallery');
  if (gal) gal.innerHTML = item ? `<p>Showing 1 item.</p>` : `<p>No new items.</p>`;
}

async function onVoteAny(value /* 'like' | 'dislike' | 'meh' | 'moved me' */){
  if (!currentItem) return;

  // Add to history so "Go Back" works
  historyStack.push(currentItem);

  // Submit the vote to your backend
  await submitVote(currentItem, value);

  // Update counters
  if (value === 'like')     updateCounters({ like: 1 });
  if (value === 'dislike')  updateCounters({ dislike: 1 });
  // (we skip incrementing "meh" or "moved me" here intentionally)

  // Load next item
  const next = await fetchNextItemFromYourBackend();
  showItem(next);
}


// "Poetry, Please" → record a skip as 'meh' and remain go-back-able
async function onSkip(){
  if (!currentItem) {
    const first = await fetchNextItemFromYourBackend();
    showItem(first);
    return;
  }
  historyStack.push(currentItem);
  await submitVote(currentItem, 'meh');  // ← skip recorded as 'meh'
  updateCounters({ skip: 1 });

  const next = await fetchNextItemFromYourBackend();
  showItem(next);
}

// ===== Auth listener =====
firebase.auth().onAuthStateChanged(async (user) => {
  show($('#login-screen'), !user);
  show($('#poetry-screen'), !!user);
  updateUserStatusUI();
});

// ===== DOM Ready =====
window.addEventListener('DOMContentLoaded', () => {
  on($('#login-google'), 'click', signInWithGoogle);
  on($('#email-login-form'), 'submit', handleEmailLogin);
  on($('#registration-form'), 'submit', handleRegistration);
  on($('#show-registration'), 'click', showRegistrationForm);
  on($('#show-login'), 'click', showLoginScreen);

  // "Poetry, Please" now acts as SKIP ('meh') + supports Go Back
  on($('#load-button'), 'click', onSkip);

  // If you add like/dislike buttons later, these IDs will just work:
  on($('#btn-like'), 'click', () => onVote('like'));
  on($('#btn-dislike'), 'click', () => onVote('dislike'));

  updateUserStatusUI();
});



/* ===== FORCE VOTE ROW + WIRING (idempotent) ===== */

// Create the vote row if missing, wire handlers, and make sure it stays put.
function ensureVoteRow() {
  let mediaWrap = document.getElementById('media-wrap');
  if (!mediaWrap) {
    mediaWrap = document.createElement('div');
    mediaWrap.id = 'media-wrap';
    const gal = document.getElementById('gallery');
    (gal?.parentElement || document.body).insertBefore(mediaWrap, gal || null);
  }

  // Ensure media element placeholder exists (image/video goes here)
  let img = document.getElementById('poem-image');
  if (!img) {
    img = document.createElement('img');
    img.id = 'poem-image';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    mediaWrap.prepend(img);
  }

  // ----- VOTE ROW -----
  let voteRow = document.getElementById('vote-row');
  if (!voteRow) {
    voteRow = document.createElement('div');
    voteRow.id = 'vote-row';
    voteRow.className = 'button-row';

    const btnLike    = document.createElement('button'); btnLike.id    = 'btn-like';    btnLike.textContent    = 'Like';
    const btnDislike = document.createElement('button'); btnDislike.id = 'btn-dislike'; btnDislike.textContent = 'Dislike';
    const btnMoved   = document.createElement('button'); btnMoved.id   = 'btn-moved';   btnMoved.textContent   = 'Moved Me';
    const btnMeh     = document.createElement('button'); btnMeh.id     = 'btn-meh';     btnMeh.textContent     = 'Meh';

    voteRow.append(btnLike, btnDislike, btnMoved, btnMeh);
    // place vote row just under the media
    if (img.nextSibling) mediaWrap.insertBefore(voteRow, img.nextSibling);
    else mediaWrap.appendChild(voteRow);

    // wire once
    btnLike.addEventListener('click',    () => onVoteAny('like'));
    btnDislike.addEventListener('click', () => onVoteAny('dislike'));
    btnMoved.addEventListener('click',   () => onVoteAny('moved me'));
    btnMeh.addEventListener('click',     () => onVoteAny('meh'));
  }

  // ----- UNDER-IMAGE CONTROLS (Go Back / Take me to the book) -----
  let under = document.getElementById('under-controls');
  if (!under) {
    under = document.createElement('div');
    under.id = 'under-controls';
    under.className = 'button-row';

    const btnBack = document.createElement('button'); btnBack.id = 'btn-go-back'; btnBack.textContent = 'Go Back'; btnBack.disabled = true;
    const btnBook = document.createElement('button'); btnBook.id = 'btn-to-book'; btnBook.textContent = 'Take me to the book';

    btnBack.addEventListener('click', () => {
      if (!window.historyStack || !historyStack.length) return;
      const prev = historyStack.pop();
      showItem(prev);
    });
    btnBook.addEventListener('click', () => {
      if (window.currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer');
    });

    mediaWrap.appendChild(under);
    under.append(btnBack, btnBook);
  }

  // ----- BOTTOM COUNTERS -----
  if (!document.getElementById('counters-bar')) {
    const bar = document.createElement('div');
    bar.id = 'counters-bar';
    bar.style.cssText = 'position:sticky;bottom:0;display:flex;justify-content:center;gap:18px;padding:10px 12px;border-top:1px solid #e6e6e6;background:#fff;z-index:5;';
    bar.innerHTML = `
      <span>Likes: <strong id="count-like">0</strong></span>
      <span>Dislikes: <strong id="count-dislike">0</strong></span>
      <span>Skips: <strong id="count-skip">0</strong></span>
    `;
    document.body.appendChild(bar);
  }
}

// Make sure vote row exists on load and after each render
ensureVoteRow();

// Patch showItem to re-ensure the vote row (without changing its behavior)
const __origShowItem = typeof showItem === 'function' ? showItem : null;
window.showItem = function(item) {
  if (__origShowItem) __origShowItem(item);
  // re-enable / disable Go Back by history length
  const back = document.getElementById('btn-go-back');
  if (back && window.historyStack) back.disabled = historyStack.length === 0;
  ensureVoteRow();
};

// If you still have onVote (old), ignore; we use onVoteAny.
// Ensure onVoteAny exists (in case it wasn't added earlier).
if (typeof onVoteAny !== 'function') {
  window.onVoteAny = async function(value /* 'like' | 'dislike' | 'meh' | 'moved me' */){
    if (!window.currentItem) return;
    historyStack.push(currentItem);
    await submitVote(currentItem, value);
    if (value === 'like')     updateCounters({ like: 1 });
    if (value === 'dislike')  updateCounters({ dislike: 1 });
    const next = await fetchNextItemFromYourBackend();
    showItem(next);
  };
}
