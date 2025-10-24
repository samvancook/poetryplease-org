// ================================
// Poetry, Please — APP.JS (RESTORED UX PARITY)
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
   Frontend functionality (filters, metadata, votes, counters)
   ============================================================ */

// --- Minimal CSS injection (pairs well even if styles.css is missing) ---
(function injectUIPatchStyles(){
  const css = `
  .top-bar{ display:flex; align-items:center; gap:12px; flex-wrap:nowrap; padding:8px 12px; }
  .top-bar .spacer{flex:1;}
  #user-status{ white-space:nowrap; font-size:.9rem; opacity:.9; }

  #media-wrap{ max-width:min(1000px,95vw); margin:12px auto; text-align:center; }
  .button-row{ display:flex; justify-content:center; gap:10px; margin:10px 0 0; flex-wrap:wrap; }
  #btn-go-back:disabled{ opacity:.45; cursor:not-allowed; }

  #counters-bar{ position:sticky; bottom:0; display:flex; justify-content:center; gap:18px;
    padding:10px 12px; border-top:1px solid #e6e6e6; background:#fff; z-index:5; }
  #counters-bar span{ white-space:nowrap; }

  .media-box img, .media-box video { max-width:100%; height:auto; }
  .excerpt-text { max-width: min(1000px, 95vw); margin: 0 auto; text-align: left; white-space: pre-wrap; }

  .meta-row { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:6px 0; padding:0 6px; }
  .meta-row p { margin:0; }
  .vote-btn.voted { opacity:.85; }
  .toast { color:#0a7e22; margin-top:8px; min-height:1.4em; }
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

  // keep space for future filter chips if needed
  const filters = document.createElement('div'); filters.id = 'filters';

  const spacer = document.createElement('div'); spacer.className = 'spacer';

  let userStatus = document.querySelector('#user-status');
  if (!userStatus) { userStatus = document.createElement('div'); userStatus.id = 'user-status'; }

  topBar.append(filters, spacer, userStatus);
  document.body.insertBefore(topBar, document.body.firstChild);
})();

// ===== State =====
const historyStack = [];
let currentItem = null;

let lastData = null;     // latest server payload (fetchData / fetchDataAnon)
let queue = [];          // filtered list based on dropdowns + checkboxes
let idx = -1;            // position in queue

let filterByAuthor = false;
let filterByBook = false;
let selectedType = '';
let selectedCatalog = '';

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
// [0]=author, [1]=title, [2]=book, [3]=imageId, [4]=imageUrl/videoUrl/driveLink/url, [5]=bookLink, [6]=releaseCatalog, [7]=imageType, [8]=excerpt
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

function chooseFirstFromData(data){
  const arr = Array.isArray(data?.newGraphics) ? data.newGraphics
            : Array.isArray(data?.graphics)    ? data.graphics
            : Array.isArray(data)              ? data
            : [];
  return arr.map(mapGraphic);
}

function isVideoUrl(url='') {
  const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  return ['mov','mp4','webm','ogg'].includes(ext);
}

// ===== Data fetch wrappers =====
async function fetchLatestBatch(){
  const user = firebase.auth().currentUser;
  if (user) {
    return fetchDataWrapped();
  } else {
    const stored = localStorage.getItem('pp_anon') || (await getNextAnonymousIdWrapped());
    localStorage.setItem('pp_anon', stored);
    return fetchDataAnonWrapped(stored);
  }
}

// ===== Filter population =====
async function fetchAndPopulateTypes() {
  try {
    const types = await fetchImageTypesWrapped(); // array of strings
    const sel = $('#type-filter');
    if (!sel) return;
    // clear existing options except first
    sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
    (types || []).forEach(t => {
      if (!t) return;
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    });
  } catch(e) {
    console.warn('fetchAndPopulateTypes error', e);
  }
}

async function fetchAndPopulateCatalogs() {
  try {
    const cats = await fetchReleaseCatalogsWrapped();
    const sel = $('#catalog-filter');
    if (!sel) return;
    sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
    (cats || []).forEach(c => {
      if (!c) return;
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  } catch(e) {
    console.warn('fetchAndPopulateCatalogs error', e);
  }
}

// ===== Queue build / rebuild =====
function buildFilteredList(data) {
  const base = Array.isArray(data?.newGraphics) ? data.newGraphics : [];
  let list = base.map(mapGraphic);

  // Dropdown filters
  list = list.filter(g => {
    if (selectedType && g.imageType !== selectedType) return false;
    if (selectedCatalog && g.releaseCatalog !== selectedCatalog) return false;
    return true;
  });

  // Author/book sticky filters (relative to currentItem)
  if (filterByAuthor && currentItem?.author) {
    list = list.filter(g => g.author === currentItem.author);
  }
  if (filterByBook && currentItem?.book) {
    list = list.filter(g => g.book === currentItem.book);
  }

  return list;
}

function initQueueFromData(data) {
  lastData = data;
  queue = buildFilteredList(data);
  idx = queue.length ? 0 : -1;
  if (idx === -1) {
    const gal = $('#gallery');
    if (gal) gal.innerHTML = '<p>No items match the current filters.</p>';
    return;
  }
  renderCurrent(queue[idx]);
}

function rebuildQueueAfterFilter() {
  if (!lastData) return;
  const keepId = currentItem?.id || null;
  queue = buildFilteredList(lastData);
  if (!queue.length) {
    idx = -1; currentItem = null;
    const gal = $('#gallery');
    if (gal) gal.innerHTML = '<p>No items match the current filters.</p>';
    renderMetaRows(null); // clear meta
    renderCounter();
    return;
  }
  const pos = keepId ? queue.findIndex(g => g.id === keepId) : -1;
  idx = pos >= 0 ? pos : 0;
  renderCurrent(queue[idx]);
}

// ===== Rendering =====
function ensureMediaWrap() {
  let mediaWrap = $('#media-wrap');
  if (!mediaWrap) {
    mediaWrap = document.createElement('div');
    mediaWrap.id = 'media-wrap';
    const gal = $('#gallery');
    (gal?.parentElement || document.body).insertBefore(mediaWrap, gal || null);
  }
  return mediaWrap;
}

function renderMetaRows(item) {
  const mediaWrap = ensureMediaWrap();

  // remove old meta rows
  mediaWrap.querySelectorAll('.meta-row').forEach(n => n.remove());

  const makeRow = (text, checkboxId, checked, label, onToggle) => {
    const row = document.createElement('div');
    row.className = 'meta-row';
    const p = document.createElement('p'); p.textContent = text || '';
    row.appendChild(p);
    if (checkboxId) {
      const boxWrap = document.createElement('div');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = checkboxId;
      cb.checked = !!checked;
      cb.onchange = onToggle;
      const lb = document.createElement('label');
      lb.htmlFor = checkboxId;
      lb.textContent = label;
      boxWrap.append(cb, lb);
      row.appendChild(boxWrap);
    }
    return row;
  };

  if (!item) return;

  // Title
  mediaWrap.prepend(makeRow(`Title: ${item.title || ''}`));

  // Author with checkbox
  mediaWrap.prepend(makeRow(
    `Author: ${item.author || ''}`,
    'authorCheckbox',
    filterByAuthor,
    'More from this author',
    () => { filterByAuthor = !filterByAuthor; rebuildQueueAfterFilter(); }
  ));

  // Book with checkbox
  mediaWrap.prepend(makeRow(
    `From their book: ${item.book || ''}`,
    'bookCheckbox',
    filterByBook,
    'More from this book',
    () => { filterByBook = !filterByBook; rebuildQueueAfterFilter(); }
  ));
}

function renderCounter() {
  // Compute counts for the current "domain" (same filters applied to allGraphics)
  const totalInDomain = queue.length;
  const remaining = (idx >= 0 && totalInDomain > 0) ? Math.max(totalInDomain - (idx + 1), 0) : 0;
  const votedInDomain = Math.max(totalInDomain - remaining - 1, 0);

  let counter = $('#domain-counter');
  if (!counter) {
    counter = document.createElement('div');
    counter.id = 'domain-counter';
    counter.className = 'vote-counter';
    // put inside counters bar to keep it visible
    const bar = $('#counters-bar') || (function(){
      const b = document.createElement('div'); b.id='counters-bar';
      b.innerHTML = `
        <span>Likes: <strong id="count-like">0</strong></span>
        <span>Dislikes: <strong id="count-dislike">0</strong></span>
        <span>Skips: <strong id="count-skip">0</strong></span>
      `;
      document.body.appendChild(b);
      return b;
    })();
    const span = document.createElement('span');
    span.appendChild(counter);
    bar.appendChild(span);
  }
  counter.textContent = `Voted on ${votedInDomain} of ${totalInDomain} — ${remaining} remaining.`;
}

function renderItemMedia(item) {
  const mediaWrap = ensureMediaWrap();

  // Clear previous media box
  const oldBox = mediaWrap.querySelector('.media-box');
  if (oldBox) oldBox.remove();

  const box = document.createElement('div');
  box.className = 'media-box';
  mediaWrap.appendChild(box);

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
}

function renderCurrent(item){
  currentItem = item;
  renderMetaRows(item);
  renderItemMedia(item);

  const back = $('#btn-go-back');
  if (back) back.disabled = historyStack.length === 0;

  const toBook = $('#btn-to-book');
  if (toBook) toBook.onclick = () => { if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer'); };

  const gal = $('#gallery');
  if (gal) gal.innerHTML = item ? `<p>Showing 1 item.</p>` : `<p>No new items.</p>`;

  renderCounter();
}

// ===== Voting / Navigation =====
function setVoteButtonsDisabled(disabled) {
  ['btn-like','btn-dislike','btn-moved','btn-meh'].forEach(id=>{
    const b = $('#'+id);
    if (b) b.disabled = disabled;
  });
}

function flashMessage(text) {
  let el = $('#message');
  if (!el) return;
  el.classList.add('toast');
  el.textContent = text || '';
  setTimeout(()=>{ if (el.textContent === text) el.textContent = ''; }, 1500);
}

async function onVoteAny(value /* 'like' | 'dislike' | 'meh' | 'moved me' */){
  if (!currentItem) return;
  historyStack.push(currentItem);

  // optimistic UI
  setVoteButtonsDisabled(true);
  const clickedId = (value === 'like') ? 'btn-like' :
                    (value === 'dislike') ? 'btn-dislike' :
                    (value === 'moved me') ? 'btn-moved' :
                    'btn-meh';
  const clicked = $('#'+clickedId);
  if (clicked) { clicked.classList.add('voted'); clicked.textContent = `Voted ${value}`; }
  flashMessage(`Your ${value} vote has been recorded.`);

  try {
    await submitVote(currentItem, value);
    if (value === 'like')     updateCounters({ like: 1 });
    if (value === 'dislike')  updateCounters({ dislike: 1 });
  } catch(e) {
    console.warn('vote error', e);
  } finally {
    // advance in local queue
    const nextIndex = (idx + 1 < queue.length) ? idx + 1 : -1;
    if (nextIndex !== -1) {
      idx = nextIndex;
      renderCurrent(queue[idx]);
    } else {
      // re-fetch to refill after exhausting the page
      const data = await fetchLatestBatch().catch(()=>null);
      if (data) initQueueFromData(data);
    }
    setVoteButtonsDisabled(false);
  }
}

// "Poetry, Please" → record a skip as 'meh' and advance
async function onSkip(){
  if (!currentItem) {
    const data = await fetchLatestBatch().catch(()=>null);
    if (data) initQueueFromData(data);
    return;
  }
  historyStack.push(currentItem);

  // optimistic
  setVoteButtonsDisabled(true);
  flashMessage('Skipped');

  try {
    await submitVote(currentItem, 'meh');
    updateCounters({ skip: 1 });
  } catch(e) {
    console.warn('skip vote error', e);
  } finally {
    const nextIndex = (idx + 1 < queue.length) ? idx + 1 : -1;
    if (nextIndex !== -1) {
      idx = nextIndex;
      renderCurrent(queue[idx]);
    } else {
      const data = await fetchLatestBatch().catch(()=>null);
      if (data) initQueueFromData(data);
    }
    setVoteButtonsDisabled(false);
  }
}

function onGoBack(){
  if (!historyStack.length) return;
  const prev = historyStack.pop();
  // Try to position idx to this item if it exists in current queue
  const pos = prev?.id ? queue.findIndex(g => g.id === prev.id) : -1;
  if (pos >= 0) idx = pos;
  renderCurrent(prev);
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

  // "Poetry, Please" acts as skip / first-load fetch
  on($('#load-button'), 'click', onSkip);

  // Populate filters and wire change handlers
  fetchAndPopulateTypes().then(()=>{
    const sel = $('#type-filter');
    if (sel) sel.onchange = () => { selectedType = sel.value; rebuildQueueAfterFilter(); };
  });
  fetchAndPopulateCatalogs().then(()=>{
    const sel = $('#catalog-filter');
    if (sel) sel.onchange = () => { selectedCatalog = sel.value; rebuildQueueAfterFilter(); };
  });

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
      b.id = id; b.textContent = txt; b.className = 'vote-btn';
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
    back.addEventListener('click', onGoBack);

    const toBook = document.createElement('button');
    toBook.id='btn-to-book';
    toBook.textContent='Take me to the book';
    toBook.addEventListener('click', () => {
      if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer');
    });

    row.append(back, toBook);
    mediaWrap.appendChild(row);
  }

  // COUNTERS BAR
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

