// ================================
// Poetry, Please — APP.JS (Parity + Heuristics + Preload)
// ================================

// ===== Constants =====
const CONSTANTS = { API_BASE: '/api' };

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
    if (div) {
      div.innerHTML = "<button id='login-google'>Log in with Google</button> or continue anonymously";
      on($('#login-google'), 'click', signInWithGoogle);
    }
    if (loadBtn) loadBtn.disabled = false;
  }
}
function showLoginScreen() { show($('#registration-screen'), false); show($('#login-screen'), true); }
function showRegistrationForm() { show($('#login-screen'), false); show($('#registration-screen'), true); }
async function signInWithGoogle() {
  try { await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch (e) { console.error(e); alert('Google sign-in failed'); }
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
const fetchDataWrapped            = () => api('fetchData',        { body: { limit: 20 } });
const fetchDataAnonWrapped        = (anonId) => api('fetchDataAnon', { body: { anonId } });
const getNextAnonymousIdWrapped   = () => api('getNextAnonymousId', { method: 'POST' });
const submitVoteWrapped           = (imageId, voteType, userId) => api('vote', { body: { imageId, voteType, userId } });
const fetchReleaseCatalogsWrapped = () => api('releaseCatalogs', { method: 'GET' });
const fetchImageTypesWrapped      = () => api('imageTypes',      { method: 'GET' });
const getRatingsSummaryWrapped    = () => api('ratingsSummary',  { method: 'GET' });

/* ============================================================
   Frontend functionality (filters, metadata, votes, counters)
   ============================================================ */

// --- Minimal CSS injection (works even if styles.css missing) ---
(function injectUIPatchStyles(){
  const css = `
  .top-bar{ display:flex; align-items:center; gap:12px; flex-wrap:nowrap; padding:8px 12px; }
  .top-bar .spacer{flex:1;}
  #user-status{ white-space:nowrap; font-size:.9rem; opacity:.9; }

  #media-wrap{ max-width:min(1000px,95vw); margin:12px auto; text-align:center; }
  .button-row{ display:flex; justify-content:center; gap:10px; margin:10px 0 0; flex-wrap:wrap; }
  #btn-go-back:disabled{ opacity:.45; cursor:not-allowed; }
  .button-container{ display:flex; justify-content:center; }
  h1#page-title{ text-align:center; }

  #counters-bar{ position:sticky; bottom:0; display:flex; justify-content:center; gap:18px;
    padding:10px 12px; border-top:1px solid #e6e6e6; background:#fff; z-index:5; }
  #counters-bar span{ white-space:nowrap; }

  .media-box img, .media-box video { max-width:100%; height:auto; }
  .excerpt-text { max-width: min(1000px, 95vw); margin: 0 auto; text-align: left; white-space: pre-wrap; }

  .meta-row { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:6px 0; padding:0 6px; }
  .meta-row p { margin:0; }
  .vote-btn.voted { opacity:.85; }
  .toast { color:#0a7e22; margin-top:8px; min-height:1.4em; }
  .vote-counter { padding:5px 10px; border:1px solid #e6e6e6; border-radius:6px; background:#fafafa; }
  `;
  const tag = document.createElement('style'); tag.appendChild(document.createTextNode(css)); document.head.appendChild(tag);
})();

// --- Top bar slotting existing user-status ---
(function buildTopBar(){
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

let lastData = null;     // server payload (fetchData / fetchDataAnon)
let queue = [];          // filtered & shuffled list
let idx = -1;            // position in queue
let isTransitioning = false;

// Filters
let filterByAuthor = false;
let filterByBook   = false;
let selectedType   = '';
let selectedCatalog= '';

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
}

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

// ===== Data fetch wrappers =====
async function fetchLatestBatch(){
  const user = firebase.auth().currentUser;
  if (user) return fetchDataWrapped();
  const stored = localStorage.getItem('pp_anon') || (await getNextAnonymousIdWrapped());
  localStorage.setItem('pp_anon', stored);
  return fetchDataAnonWrapped(stored);
}

// ===== Filters: population =====
async function fetchAndPopulateTypes() {
  try {
    const types = await fetchImageTypesWrapped();
    const sel = $('#type-filter'); if (!sel) return;
    sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
    (types || []).forEach(t => { if (!t) return; const opt = document.createElement('option'); opt.value=t; opt.textContent=t; sel.appendChild(opt); });
  } catch(e) { console.warn('fetchAndPopulateTypes error', e); }
}
async function fetchAndPopulateCatalogs() {
  try {
    const cats = await fetchReleaseCatalogsWrapped();
    const sel = $('#catalog-filter'); if (!sel) return;
    sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
    (cats || []).forEach(c => { if (!c) return; const opt = document.createElement('option'); opt.value=c; opt.textContent=c; sel.appendChild(opt); });
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
    return true;
  });

  // Sticky author/book filters (relative to current item)
  if (filterByAuthor && currentItem?.author) list = list.filter(g => g.author === currentItem.author);
  if (filterByBook   && currentItem?.book)   list = list.filter(g => g.book   === currentItem.book);

  // Rule #1: prefer rating >= 1 unless that empties list
  const hi = list.filter(isHighRated);
  list = hi.length ? hi : list;

  return shuffle(list);
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

// ===== Init / rebuild =====
function initQueueFromData(data) {
  lastData = data;
  queue = buildFilteredList(data);
  if (!queue.length) { $('#gallery').innerHTML = '<p>No items match the current filters.</p>'; return; }
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

  const row = (text, checkboxId, checked, label, onToggle) => {
    const r = document.createElement('div'); r.className='meta-row';
    const p = document.createElement('p'); p.textContent = text || ''; r.appendChild(p);
    if (checkboxId) { const wrap=document.createElement('div'); const cb=document.createElement('input'); cb.type='checkbox'; cb.id=checkboxId; cb.checked=!!checked; cb.onchange=onToggle;
      const lb=document.createElement('label'); lb.htmlFor=checkboxId; lb.textContent=label; wrap.append(cb,lb); r.appendChild(wrap); }
    return r;
  };
  mediaWrap.prepend(row(`Title: ${item.title || ''}`));
  mediaWrap.prepend(row(`Author: ${item.author || ''}`, 'authorCheckbox', filterByAuthor, 'More from this author', () => { filterByAuthor = !filterByAuthor; rebuildQueueAfterFilter(); }));
  mediaWrap.prepend(row(`From their book: ${item.book || ''}`,   'bookCheckbox',   filterByBook,   'More from this book',   () => { filterByBook   = !filterByBook;   rebuildQueueAfterFilter(); }));
}
function renderCounter() {
  const all = Array.isArray(lastData?.allGraphics) ? lastData.allGraphics.map(mapGraphic) : [];
  let domainAll = all.filter(g => {
    if (selectedType && g.imageType !== selectedType) return false;
    if (selectedCatalog && g.releaseCatalog !== selectedCatalog) return false;
    if (filterByAuthor && currentItem?.author && g.author !== currentItem.author) return false;
    if (filterByBook   && currentItem?.book   && g.book   !== currentItem.book)   return false;
    return true;
  });
  const totalInDomain = domainAll.length;
  const remaining = (idx >= 0 && queue.length > 0) ? Math.max(queue.length - (idx + 1), 0) : 0;
  const votedInDomain = Math.max(totalInDomain - remaining - 1, 0);

  let counter = $('#domain-counter');
  if (!counter) {
    counter = document.createElement('div'); counter.id='domain-counter'; counter.className='vote-counter';
    const bar = $('#counters-bar'); const span = document.createElement('span'); span.appendChild(counter); bar.appendChild(span);
  }
  counter.textContent = `Voted on ${votedInDomain} of ${totalInDomain} — ${remaining} remaining.`;
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

  if (item?.imageType === 'EXC') {
    const textDiv = document.createElement('div'); textDiv.className='excerpt-text';
    const p = document.createElement('p'); p.textContent = item?.excerpt || ''; textDiv.appendChild(p); box.appendChild(textDiv);
  } else if (item?.mediaUrl && (item.imageType === 'VV' || isVideoUrl(item.mediaUrl))) {
    const a = document.createElement('a'); if (item?.bookUrl) { a.href=item.bookUrl; a.target='_blank'; }
    const v = document.createElement('video'); v.src=item.mediaUrl; v.controls=true; v.style.maxWidth='100%'; v.style.height='auto';
    a.appendChild(v); box.appendChild(a);
  } else if (item?.mediaUrl) {
    const a = document.createElement('a'); if (item?.bookUrl) { a.href=item.bookUrl; a.target='_blank'; }
    const img = document.createElement('img'); img.src=item.mediaUrl; img.alt=item?.id||''; img.style.maxWidth='100%'; img.style.height='auto';
    a.appendChild(img); box.appendChild(a);
  } else { const p=document.createElement('p'); p.textContent='No media available for this item.'; box.appendChild(p); }

  placeRowsAroundMedia(mediaWrap, box);
}
function renderCurrent(item){
  resetVoteButtons();
  currentItem = item;
  servedCounter = (servedCounter || 0) + 1;
  renderMetaRows(item);
  renderItemMedia(item);

  const back = $('#btn-go-back'); if (back) back.disabled = historyStack.length === 0;
  const toBook = $('#btn-to-book'); if (toBook) toBook.onclick = () => { if (currentItem?.bookUrl) window.open(currentItem.bookUrl, '_blank', 'noopener,noreferrer'); };
  const gal = $('#gallery'); if (gal) gal.innerHTML = item ? `<p>Showing 1 item.</p>` : `<p>No new items.</p>`;
  renderCounter();
}

// ===== Heuristic next index chooser =====
function chooseNextIndex() {
  // After a dislike, pick highest-rated unseen next
  if ((lastVoteType || '').toLowerCase() === 'dislike') {
    let bestIdx = -1, bestR = -Infinity, bestTotal = -1;
    for (let j = idx + 1; j < queue.length; j++) {
      const id = queue[j].id;
      const meta = ratingsMap[id] || { rating: 1, total: 0 };
      const r = (typeof meta.rating === 'number') ? meta.rating : 1;
      if (r > bestR || (r === bestR && (meta.total || 0) > bestTotal)) { bestR = r; bestTotal = (meta.total || 0); bestIdx = j; }
    }
    if (bestIdx !== -1) return bestIdx;
  }

  // Rule #3: if session is positive (>10 votes, <10 negatives), every 3rd served → low-rated
  const rule3Active = (sessionVotes > 10) && (sessionNegatives < 10);
  if (rule3Active && (servedCounter % 3 === 0)) {
    for (let j = idx + 1; j < queue.length; j++) if (isLowRated(queue[j])) return j;
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
async function submitVote(item, value){
  const user = firebase.auth().currentUser;
  const userId = user ? (user.uid || user.email) : (localStorage.getItem('pp_anon') || null);
  if (!item?.id) return;
  await submitVoteWrapped(item.id, value, userId);
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
  setVoteButtonsDisabled(true); flashMessage('Skipped');
  try { await submitVote(currentItem, 'meh'); updateCounters({ skip: 1 }); }
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
  fetchAndPopulateTypes().then(()=>{ const sel=$('#type-filter'); if (sel) sel.onchange = () => { selectedType = sel.value; rebuildQueueAfterFilter(); }; });
  fetchAndPopulateCatalogs().then(()=>{ const sel=$('#catalog-filter'); if (sel) sel.onchange = () => { selectedCatalog = sel.value; rebuildQueueAfterFilter(); }; });

  // Load ratings once (for heuristics)
  getRatingsSummaryWrapped().then(map => { ratingsMap = map || {}; }).catch(()=>{ ratingsMap = {}; });

  updateUserStatusUI();
});

// ===== Scaffold UI (vote row, under-controls, counters) =====
(function ensureScaffold() {
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

