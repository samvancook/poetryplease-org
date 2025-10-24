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

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? 'block' : 'none';
}

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
   NEW: Frontend functionality (history, counters, top bar, etc.)
   ============================================================ */

// --- CSS injection (keeps everything on one line and adds bars) ---
(function injectUIPatchStyles(){
  const css = `
  .top-bar{
    display:flex; align-items:center; gap:12px; flex-wrap:nowrap;
    padding:8px 12px;
  }
  .top-bar .spacer{flex:1;}
  #user-status{ white-space:nowrap; font-size:.9rem; opacity:.9; }

  #media-wrap{ max-width:min(1000px,95vw); margin:12px auto; text-align:center; }
  .button-row{ display:flex; justify-content:center; gap:10px; margin:10px 0 0; }
  #btn-go-back:disabled{ opacity:.5; cursor:not-allowed; }

  #counters-bar{
    position:sticky; bottom:0;
    display:flex; justify-content:center; gap:18px;
    padding:10px 12px; border-top:1px solid #e6e6e6; background:#fff; z-index:5;
  }
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

  // If you have a filters container, you can put it here:
  const filters = document.querySelector('#filters') || document.createElement('div');
  if (!filters.id) filters.id = 'filters';

  const spacer = document.createElement('div');
  spacer.className = 'spacer';

  // Use your existing #user-status element if it exists; else make one
  let userStatus = document.querySelector('#user-status');
  if (!userStatus) {
    userStatus = document.createElement('div');
    userStatus.id = 'user-status';
  }

  topBar.appendChild(filters);
  topBar.appendChild(spacer);
  topBar.appendChild(userStatus);

  document.body.insertBefore(topBar, document.body.firstChild);
})();

// --- Media wrapper + buttons + bottom counters ---
const historyStack = [];
let currentItem = null;

(function buildMediaAndControls(){
  let mediaWrap = document.querySelector('#media-wrap');
  if (!mediaWrap) {
    mediaWrap = document.createElement('div');
    mediaWrap.id = 'media-wrap';
    // Prefer to place above #gallery so your gallery can still be used
    const gal = $('#gallery');
    if (gal && gal.parentElement) {
      gal.parentElement.insertBefore(mediaWrap, gal);
    } else {
      document.body.appendChild(mediaWrap);
    }
  }

  // Image element (used if present)
  let img = document.querySelector('#poem-image');
  if (!img) {
    img = document.createElement('img');
    img.id = 'poem-image';
    mediaWrap.appendChild(img);
  }

  // Button row under the image
  if (!document.querySelector('.button-row')) {
    const row = document.createElement('div');
    row.className = 'button-row';

    const btnBack = document.createElement('button');
    btnBack.id = 'btn-go-back';
    btnBack.textContent = 'Go Back';
    btnBack.disabled = true;

    const btnBook = document.createElement('button');
    btnBook.id = 'btn-to-book';
    btnBook.textContent = 'Take me to the book';

    btnBack.addEventListener('click', () => {
      if (!historyStack.length) return;
      const prev = historyStack.pop();
      showItem(prev);
    });

    btnBook.addEventListener('click', () => {
      if (currentItem?.bookUrl) {
        window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer');
      }
    });

    row.appendChild(btnBack);
    row.appendChild(btnBook);
    mediaWrap.appendChild(row);
  }

  // Sticky counters bar at bottom
  if (!document.querySelector('#counters-bar')) {
    const bar = document.createElement('div');
    bar.id = 'counters-bar';
    bar.innerHTML = `
      <span>Likes: <strong id="count-like">0</strong></span>
      <span>Dislikes: <strong id="count-dislike">0</strong></span>
      <span>Skips: <strong id="count-skip">0</strong></span>
    `;
    document.body.appendChild(bar);
  }
})();

function updateCounters({ like=0, dislike=0, skip=0 }){
  const likeEl = $('#count-like');
  const dislikeEl = $('#count-dislike');
  const skipEl = $('#count-skip');
  if (like && likeEl) likeEl.textContent = (+likeEl.textContent + like);
  if (dislike && dislikeEl) dislikeEl.textContent = (+dislikeEl.textContent + dislike);
  if (skip && skipEl) skipEl.textContent = (+skipEl.textContent + skip);
}

// Normalize one graphic from backend into {id, imageUrl, bookUrl, ...}
function mapGraphic(g){
  return {
    id: g?.id ?? g?.imageId ?? g?.contentId ?? g?.uid ?? null,
    imageUrl: g?.imageUrl ?? g?.image ?? g?.url ?? null,
    bookUrl: g?.bookUrl ?? g?.link ?? null,
    raw: g
  };
}

// Pick next item from API result
function chooseNextFromData(data){
  const arr = data?.newGraphics || data?.graphics || [];
  if (!arr.length) return null;
  const idx = Math.floor(Math.random()*arr.length);
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
async function submitVote(item, value /* 'Y' | 'N' | 'M' */){
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

  // also update the gallery text minimally so your old UI still shows something
  const gal = $('#gallery');
  if (gal) {
    gal.innerHTML = item
      ? `<p>Showing 1 item.</p>`
      : `<p>No new items.</p>`;
  }
}

// Voting wrappers
async function onVote(value /* 'Y' or 'N' */){
  if (!currentItem) return;
  historyStack.push(currentItem);
  await submitVote(currentItem, value);
  if (value === 'Y') updateCounters({ like: 1 });
  else if (value === 'N') updateCounters({ dislike: 1 });

  const next = await fetchNextItemFromYourBackend();
  showItem(next);
}

async function onSkip(){
  if (!currentItem) {
    // First load acts like skip to show something immediately
    const first = await fetchNextItemFromYourBackend();
    showItem(first);
    return;
  }
  historyStack.push(currentItem);
  await submitVote(currentItem, 'M');  // count as skip/zero
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

  // IMPORTANT: "Poetry, Please" now triggers a SKIP (0 / 'M') and supports Go Back
  on($('#load-button'), 'click', onSkip);

  // Optional: if you add Like/Dislike buttons with these IDs, they’ll work automatically
  on($('#btn-like'), 'click', () => onVote('Y'));
  on($('#btn-dislike'), 'click', () => onVote('N'));

  updateUserStatusUI();
});
