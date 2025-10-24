// ================================
// Poetry, Please — FULL APP.JS
// ================================

// ===== Constants =====
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
   Frontend functionality (top bar, media, votes, counters)
   ============================================================ */

// --- Minimal CSS injection for layout scaffolding (safe even with styles.css) ---
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
  .media-box img, .media-box video { max-width:100%; height:auto; }
  .excerpt-text { max-width: min(1000px, 95vw); margin: 0 auto; text-align: left; }
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

// ===== State =====
const historyStack = [];
let currentItem = null;

// ===== Counters =====
function updateCounters({ like=0, dislike=0, skip=0 }){
  const likeEl = $('#count-like');
  const dislikeEl = $('#count-dislike');
  const skipEl = $('#count-skip');
  if (like && likeEl) likeEl.textContent = (+likeEl.textContent + like);
  if (dislike && dislikeEl) dislikeEl.textContent = (+dislikeEl.textContent + dislike);
  if (skip && skipEl) skipEl.textContent = (+skipEl.textContent + skip);
}

// ===== Mapping (matches your GAS: mapToArr) =====
// [0]=author, [1]=title, [2]=book, [3]=imageId, [4]=imageUrl/videoUrl, [5]=bookLink, [6]=releaseCatalog, [7]=imageType, [8]=excerpt
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
  // Fallback for object-shaped rows (if they ever appear)
  return {
    id: g?.id ?? g?.imageId ?? g?.contentId ?? g?.uid ?? null,
    mediaUrl: g?.imageUrl ?? g?.videoUrl ?? g?.driveLink ?? g?.url ?? null,
    bookUrl: g?.bookUrl ?? g?.link ?? null,
    releaseCatalog: g?.releaseCatalog ?? '',
    imageType: g?.imageType ?? '',
    excerpt: g?.excerpt ?? '',
    author: g?.author ?? '',
    title: g?.title ?? g?.poem ?? '',
    book: g?.book ?? '',
    raw: g
  };
}

function chooseNextFromData(data){
  const arr = Array.isArray(data?.newGraphics) ? data.newGraphics
            : Array.isArray(data?.graphics)    ? data.graphics
            : Array.isArray(data)              ? data
            : [];
  if (!arr.length) return null;
  const i = Math.floor(Math.random() * arr.length);
  return mapGraphic(arr[i]);
}

function isVideoUrl(url='') {
  const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  return ['mov','mp4','webm','ogg'].includes(ext);
}

// ===== Data fetch wrappers =====
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

// ===== Vote write wrapper =====
async function submitVote(item, value /* 'like'|'dislike'|'meh'|'moved me' */){
  const user = firebase.auth().currentUser;
  const userId = user ? (user.uid || user.email) : (localStorage.getItem('pp_anon') || null);
  if (!item?.id) return;
  await submitVoteWrapped(item.id, value, userId);
}

// ===== Rendering =====
function showItem(item){
  currentItem = item;

  let mediaWrap = $('#media-wrap');
  if (!mediaWrap) {
    mediaWrap = document.createElement('div');
    mediaWrap.id = 'media-wrap';
    const gal = $('#gallery');
    (gal?.parentElement || document.body).insertBefore(mediaWrap, gal || null);
  }

  // Clear previous media (but keep buttons/counters if present)
  const oldBox = mediaWrap.querySelector('.media-box');
  if (oldBox) oldBox.remove();

  const box = document.createElement('div');
  box.className = 'media-box';
  mediaWrap.prepend(box);

  if (item?.imageType === 'EXC') {
    const textDiv = document.createElement('div');
    textDiv.className = 'excerpt-text';
    const p = document.createElement('p');
    p.textContent = item?.excerpt || '';
    textDiv.appendChild(p);
    box.appendChild(textDiv);
  } else if (item?.mediaUrl && (item.imageType === 'VV' || isVideoUrl(item.mediaUrl))) {
    const a = document.createElement('a');
    if (item?.bookUrl) { a.href = item.bookUrl; a.target = '_blank'; }
    const v = document.createElement('video');
    v.src = item.mediaUrl;
    v.controls = true;
    v.style.maxWidth = '100%';
    v.style.height = 'auto';
    a.appendChild(v);
    box.appendChild(a);
  } else if (item?.mediaUrl) {
    const a = document.createElement('a');
    if (item?.bookUrl) { a.href = item.bookUrl; a.target = '_blank'; }
    const img = document.createElement('img');
    img.src = item.mediaUrl;
    img.alt = item?.id || '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    a.appendChild(img);
    box.appendChild(a);
  } else {
    const p = document.createElement('p');
    p.textContent = 'No media available for this item.';
    box.appendChild(p);
  }

  // enable/disable Go Back
  const back = $('#btn-go-back');
  if (back) back.disabled = historyStack.length === 0;

  // wire "Take me to the book"
  const toBook = $('#btn-to-book');
  if (toBook) toBook.onclick = () => { if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer'); };

  const gal = $('#gallery');
  if (gal) gal.innerHTML = item ? `<p>Showing 1 item.</p>` : `<p>No new items.</p>`;
}

// ===== Voting / Navigation =====
async function onVoteAny(value /* 'like' | 'dislike' | 'meh' | 'moved me' */){
  if (!currentItem) return;
  historyStack.push(currentItem);
  await submitVote(currentItem, value);
  if (value === 'like')     updateCounters({ like: 1 });
  if (value === 'dislike')  updateCounters({ dislike: 1 });
  const next = await fetchNextItemFromYourBackend();
  showItem(next);
}

// "Poetry, Please" → record a skip as 'meh' (counts in skip counter) and keep Go Back
async function onSkip(){
  if (!currentItem) {
    const first = await fetchNextItemFromYourBackend();
    showItem(first);
    return;
  }
  historyStack.push(currentItem);
  await submitVote(currentItem, 'meh');   // treat skip as 'meh'
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

  // "Poetry, Please" acts as skip
  on($('#load-button'), 'click', onSkip);

  updateUserStatusUI();
});

// ===== Scaffold UI (vote row, under-controls, counters) =====
(function ensureScaffold() {
  let mediaWrap = $('#media-wrap');
  if (!mediaWrap) {
    mediaWrap = document.createElement('div');
    mediaWrap.id = 'media-wrap';
    const gal = $('#gallery');
    (gal?.parentElement || document.body).insertBefore(mediaWrap, gal || null);
  }

  // VOTE ROW
  if (!$('#vote-row')) {
    const row = document.createElement('div');
    row.id = 'vote-row';
    row.className = 'button-row';

    const mk = (id, txt, val) => {
      const b = document.createElement('button');
      b.id = id; b.textContent = txt;
      b.addEventListener('click', () => onVoteAny(val));
      return b;
    };
    row.append(
      mk('btn-like','Like','like'),
      mk('btn-dislike','Dislike','dislike'),
      mk('btn-moved','Moved Me','moved me'),
      mk('btn-meh','Meh','meh')
    );
    mediaWrap.appendChild(row);
  }

  // UNDER-IMAGE CONTROLS
  if (!$('#under-controls')) {
    const row = document.createElement('div');
    row.id = 'under-controls';
    row.className = 'button-row';

    const back = document.createElement('button');
    back.id='btn-go-back';
    back.textContent='Go Back';
    back.disabled = true;

    const toBook = document.createElement('button');
    toBook.id='btn-to-book';
    toBook.textContent='Take me to the book';

    back.addEventListener('click', () => {
      if (!historyStack.length) return;
      const prev = historyStack.pop();
      showItem(prev);
    });
    toBook.addEventListener('click', () => {
      if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer');
    });

    row.append(back, toBook);
    mediaWrap.appendChild(row);
  }

  // COUNTERS
  if (!$('#counters-bar')) {
    const bar = document.createElement('div');
    bar.id='counters-bar';
    bar.innerHTML=`
      <span>Likes: <strong id="count-like">0</strong></span>
      <span>Dislikes: <strong id="count-dislike">0</strong></span>
      <span>Skips: <strong id="count-skip">0</strong></span>
    `;
    document.body.appendChild(bar);
  }
})();

/* ============================================================
   Diagnostic overlay (raw payload + what we render)
   Remove this block once everything looks correct.
   ============================================================ 
(function diagPatch(){
  console.log('[PP] diag patch loaded');

  function banner(msg) {
    let el = document.getElementById('pp-diag');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pp-diag';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:60vw;background:#111;color:#fff;padding:6px 8px;font:12px/1.4 monospace;z-index:99999;opacity:.9;border-radius:6px;white-space:pre-wrap;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    console.log('[PP]', msg);
  }

  // Log raw server payload (first row) whenever we fetch next
  const _fetchNext = window.fetchNextItemFromYourBackend;
  window.fetchNextItemFromYourBackend = async function() {
    const data = await _fetchNext();
    try {
      const user = firebase.auth().currentUser;
      let raw;
      if (user) raw = await fetchDataWrapped();
      else {
        const stored = localStorage.getItem('pp_anon') || (await getNextAnonymousIdWrapped());
        localStorage.setItem('pp_anon', stored);
        raw = await fetchDataAnonWrapped(stored);
      }
      const first = Array.isArray(raw?.newGraphics) ? raw.newGraphics[0]
                 : Array.isArray(raw?.graphics)    ? raw.graphics[0]
                 : Array.isArray(raw)              ? raw[0]
                 : null;

      console.log('[PP] raw first row:', first);
      banner('Fetched. first row:\n' + JSON.stringify(first, null, 2));
    } catch(e){ console.warn('[PP diag] fetch fail', e); }
    return data;
  };

  // Also summarize what we render
  const _showItem = window.showItem;
  window.showItem = function(item){
    if (typeof _showItem === 'function') _showItem(item);
    banner('showItem:\n' + JSON.stringify({
      id: item?.id,
      mediaUrl: item?.mediaUrl,
      imageType: item?.imageType,
      bookUrl: item?.bookUrl
    }, null, 2));
  };
})();
*/
