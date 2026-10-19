import { ScrollFeedPager, originalViewerUrl, safeMediaUrl } from './scroll-feed-core.js';

const $ = (id) => document.getElementById(id);
const auth = firebase.auth();
const initial = new URLSearchParams(location.search);
const allowedTypes = ['PROMO', 'QI', 'INT', 'EXC', 'VIDEO'];
const votes = [['moved me', '❤️', 'Love it'], ['meh', '😐', 'Neutral'], ['like', '👍', 'Like it'], ['dislike', '👎', 'Don’t use']];
let account = null;
let ownAuthor = '';
let activeIdentity = null;
let sessionGeneration = 0;
let sessionReady = false;
let automaticPages = true;
let filters = { type: initial.get('type') || 'PROMO', author: initial.get('author') || '', book: initial.get('book') || '', catalog: initial.get('catalog') || '' };
const anonymousId = (() => {
  try {
    const saved = localStorage.getItem('pp_anon');
    if (saved) return saved;
    const id = 'local-' + crypto.randomUUID();
    localStorage.setItem('pp_anon', id);
    return id;
  } catch { return 'local-' + crypto.randomUUID(); }
})();

async function api(path, body, signal) {
  const request = async (refresh = false) => {
    const token = await auth.currentUser?.getIdToken(refresh);
    return fetch('/api/' + path, { method: body ? 'POST' : 'GET', signal,
      credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  };
  let response = await request();
  if (response.status === 401 && auth.currentUser) response = await request(true);
  if (!response.ok) throw new Error(response.status === 403 ? 'Your account cannot access this action.' : 'Could not connect. Please retry.');
  return response.status === 204 ? null : response.json();
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function isStaff() { return account?.roles?.some((role) => role === 'team' || role === 'admin'); }
function canReviewFullPoems() { return isStaff() && initial.get('authorPreview') !== '1'; }
function isAuthorOnly() { return account?.roles?.includes('author') && !isStaff(); }
function routeFilters() {
  return { ...filters, ...(initial.get('authorPreview') === '1' && isStaff() ? { authorPreview: '1', locked: '1' } : {}) };
}
function updateRoute() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(routeFilters())) if (value) params.set(key, value);
  history.replaceState(null, '', location.pathname + '?' + params.toString());
  $('original-view').href = '/m?' + params.toString();
  $('filter-summary').textContent = [filters.type === 'PROMO' ? 'Graphics and excerpts' : filters.type, filters.author, filters.book].filter(Boolean).join(' · ') + ' · Filters';
}
function updateFooter(state) {
  $('feed').setAttribute('aria-busy', String(state.loading));
  $('load-more').hidden = state.loading || !state.hasMore;
  $('load-more').disabled = state.loading;
  $('load-more').textContent = state.error ? 'Retry loading' : 'Load more';
  $('feed-status').textContent = state.loading ? 'Loading more…' : state.error ? state.error.message :
    state.hasMore ? 'More below' : state.seen.size ? 'You’ve reached the end of this queue. Change the filters to explore more.' : 'No unreviewed items match these filters.';
}
const pager = new ScrollFeedPager({
  fetchPage: (context, signal) => api('fetchFiltered', { ...context, anonId: anonymousId, scroll: true, limit: 12 }, signal),
  append: (items) => items.forEach(renderCard),
  changed: updateFooter,
  clear: () => $('feed').replaceChildren(),
});
function restartFeed() {
  automaticPages = true;
  updateRoute();
  return pager.reset({ ...filters, scrollSeed: crypto.randomUUID() });
}

function renderCaption(item) {
  const caption = node('div', 'card-caption');
  if (item.type === 'EXC') caption.append(node('span', 'source-label', 'Excerpt from'));
  if (item.type === 'FP') caption.append(node('span', 'source-label', 'Full poem'));
  if (item.title) caption.append(node('span', '', item.title));
  if (item.author) caption.append(node('span', '', item.author));
  if (item.book) caption.append(node('span', 'book-name', item.book));
  return caption;
}
function appendVideo(stage, item) {
  const url = new URL(item.mediaUrl);
  let embed = '';
  if (url.hostname === 'youtu.be') embed = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(url.pathname.slice(1));
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname) && url.searchParams.get('v')) {
    embed = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(url.searchParams.get('v'));
  }
  if (url.hostname === 'drive.google.com') {
    const id = url.pathname.match(/\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
    if (id) embed = 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview';
  }
  if (embed) {
    const frame = node('iframe');
    frame.src = embed;
    frame.title = item.title || 'Video';
    frame.allowFullscreen = true;
    frame.allow = 'fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    stage.replaceChildren(frame);
  } else {
    const video = node('video');
    video.src = item.mediaUrl;
    video.controls = true;
    video.preload = 'none';
    video.playsInline = true;
    stage.replaceChildren(video);
    videoObserver?.observe(video);
  }
}
const videoObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) if (!entry.isIntersecting) entry.target.pause();
}, { threshold: 0.05 }) : null;

function renderCard(item) {
  const card = node('article', 'scroll-card');
  card.dataset.itemId = item.id;
  card.setAttribute('aria-label', [item.type, item.title, item.author].filter(Boolean).join(' · '));
  const media = node('div', 'card-media');
  if (['EXC', 'FP'].includes(item.type)) {
    const text = node('div', 'card-text');
    const poem = node('p', 'poem-lines');
    for (const line of item.text.replace(/\r\n?/g, '\n').split('\n')) poem.append(node('span', 'poem-line', line || '\u00a0'));
    text.append(poem);
    media.append(text);
  } else if (item.mediaUrl && (['VV', 'YT', 'VIDEO', 'HV'].includes(item.type) || /\.(mp4|webm|mov)(?:\?|$)/i.test(item.mediaUrl))) {
    const stage = node('div', 'video-stage');
    const play = node('button', '', 'Load video');
    play.type = 'button';
    play.addEventListener('click', () => appendVideo(stage, item), { once: true });
    stage.append(play);
    media.append(stage);
  } else if (item.mediaUrl) {
    const stage = node('div', 'image-stage');
    const image = node('img');
    image.src = item.mediaUrl;
    image.alt = [item.type === 'INT' ? 'Interior photo' : 'Graphic', item.title, item.author].filter(Boolean).join(' · ');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => stage.replaceChildren(node('p', '', 'Image unavailable. Open this item in the original viewer below.')), { once: true });
    stage.append(image);
    media.append(stage);
  } else media.append(node('p', 'card-text', 'No preview is available. Open this item in the original viewer below.'));
  media.append(renderCaption(item));
  card.append(media);

  const controls = node('div', 'votes');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Your response to ' + (item.title || 'this item'));
  const status = node('p', 'card-status');
  status.setAttribute('role', 'status');
  for (const [value, emoji, label] of votes) {
    const button = node('button', 'vote-button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', 'false');
    button.append(node('span', 'emoji', emoji), node('span', '', label));
    button.firstChild.setAttribute('aria-hidden', 'true');
    button.addEventListener('click', async () => {
      const identity = activeIdentity;
      for (const control of controls.children) control.disabled = true;
      status.textContent = 'Saving your response…';
      try {
        if (!auth.currentUser) await auth.signInAnonymously();
        // An account change requires a fresh feed; never attribute this card's
        // in-flight vote to a newly signed-in person.
        if (identity !== activeIdentity) throw new Error('Your account changed. Please review the refreshed feed.');
        await api('vote', { imageId: item.id, voteType: value, userId: auth.currentUser?.email || anonymousId });
        if (identity !== activeIdentity || !card.isConnected) return;
        button.setAttribute('aria-pressed', 'true');
        status.textContent = 'Saved: ' + label + '.';
      } catch (error) {
        if (identity !== activeIdentity || !card.isConnected) return;
        status.textContent = error.message || 'Response not saved. Please retry.';
        for (const control of controls.children) control.disabled = false;
      }
    });
    controls.append(button);
  }
  card.append(controls, status);
  const details = node('details', 'card-details');
  details.append(node('summary', '', 'About this item'));
  details.append(node('p', '', [item.type, item.catalog, item.book].filter(Boolean).join(' · ')));
  const original = node('a', '', 'Open in single-item view');
  original.href = originalViewerUrl(item, routeFilters());
  details.append(original);
  if (item.bookUrl) { const book = node('a', '', 'Book details'); book.href = safeMediaUrl(item.bookUrl); book.target = '_blank'; book.rel = 'noopener'; details.append(node('br'), book); }
  card.append(details);
  $('feed').append(card);
}

$('filters').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!sessionReady) return;
  filters = { ...filters, type: $('filter-type').value, author: ownAuthor || $('filter-author').value.trim(), book: $('filter-book').value.trim() };
  $('filters-panel').open = false;
  restartFeed();
});
$('load-more').addEventListener('click', () => { automaticPages = true; pager.loadMore(); });
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && automaticPages && !pager.error) pager.loadMore();
  }, { rootMargin: '650px 0px' }).observe($('feed-footer'));
}
$('account-toggle').addEventListener('click', () => {
  $('account-menu').hidden = !$('account-menu').hidden;
  $('account-toggle').setAttribute('aria-expanded', String(!$('account-menu').hidden));
});
$('sign-in').addEventListener('click', async () => {
  try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch (error) { if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); else $('account-status').textContent = 'Sign-in did not complete. Please try again.'; }
});
$('sign-out').addEventListener('click', () => auth.signOut().catch(() => { $('account-status').textContent = 'Sign-out did not complete. Please retry.'; }));
auth.getRedirectResult().catch(() => {});
auth.onAuthStateChanged(async (user) => {
  const identity = user?.email || anonymousId;
  if (identity === activeIdentity) return;
  activeIdentity = identity;
  sessionReady = false;
  const generation = ++sessionGeneration;
  pager.reset(null);
  $('feed-status').textContent = 'Loading your queue…';
  $('load-more').hidden = true;
  $('account-status').textContent = user?.email || 'Browsing without an account';
  $('sign-in').hidden = !!user?.email;
  $('sign-out').hidden = !user?.email;
  account = null;
  ownAuthor = '';
  try {
    account = user?.email ? await api('me') : null;
    if (generation !== sessionGeneration) return;
    if (isAuthorOnly()) {
      const data = await api('my/authorProfileEditorData');
      if (generation !== sessionGeneration) return;
      ownAuthor = String(data?.profile?.displayName || data?.workingProfile?.displayName || '').trim();
      if (!ownAuthor) throw new Error('Your author profile could not be resolved. Please use the single-item view for now.');
      filters.author = ownAuthor;
      if (!initial.has('type')) filters.type = 'QI';
      if (!['PROMO', 'QI', 'INT', 'EXC'].includes(filters.type)) filters.type = 'PROMO';
    }
    $('filter-author').disabled = !!ownAuthor;
    $('filter-author').value = filters.author;
    $('filter-book').value = filters.book;
    const fpOption = $('filter-type').querySelector('[value="FP"]');
    if (canReviewFullPoems() && !fpOption) { const option = node('option', '', 'FP · Full poems'); option.value = 'FP'; $('filter-type').append(option); }
    if (!canReviewFullPoems() && fpOption) fpOption.remove();
    if (!allowedTypes.includes(filters.type) && !(canReviewFullPoems() && filters.type === 'FP')) filters.type = 'PROMO';
    $('filter-type').value = filters.type;
    sessionReady = true;
    await restartFeed();
  } catch (error) {
    if (generation === sessionGeneration) $('feed-status').textContent = error.message || 'Your account could not be loaded. Please reload or open the single-item view.';
  }
});
