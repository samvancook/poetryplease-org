import { ScrollFeedPager, originalViewerUrl, safeMediaUrl } from './scroll-feed-core.js';
import { renderPostCard, closePostDetails } from './post-cards.js';
import { renderSwipeCard, resetSwipeReview, observeSwipeCards } from './posts-swipe.js';
import { linkedItemPage } from './mobile-entry.js';
import { createReadingReturn } from './swipe-reading.js';

const $ = (id) => document.getElementById(id);
const auth = firebase.auth();
const initial = new URLSearchParams(location.search);
$('original-view').href = '/m-classic';
const postVariant = document.body.dataset.feedVariant === 'posts';
const swipeVariant = document.body.dataset.feedMode === 'swipe';
const linkedItemId = swipeVariant ? String(initial.get('item') || '').trim() : '';
const outlineReviewIcon = document.body.dataset.reviewIcons === 'outline'
  ? (await import('./review-icons.js')).createReviewIcon : null;
const votes = [['moved me', '❤️', 'Love'], ['meh', '😐', 'Meh'], ['like', '👍', 'Like'], ['dislike', '👎', 'Dislike']];
let account = null;
let ownAuthor = '';
let activeIdentity = null;
let sessionGeneration = 0;
let automaticPages = true;
let sessionVotes = 0;
let welcomeCalibrated = (() => { try { return localStorage.getItem('pp_welcome_calibrated') === '1'; } catch { return false; } })();
// The scroll view has one mixed feed. URL lane/book filters are intentionally ignored.
let filters = { type: 'PROMO', author: '' };
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
function isAuthorOnly() { return account?.roles?.includes('author') && !isStaff(); }
function routeFilters() {
  return { author: filters.author, ...(initial.get('authorPreview') === '1' && isStaff() ? { authorPreview: '1', locked: '1' } : {}) };
}
function updateRoute() {
  const params = new URLSearchParams();
  if (linkedItemId) params.set('item', linkedItemId);
  for (const [key, value] of Object.entries(routeFilters())) if (value) params.set(key, value);
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
  $('original-view').href = '/m-classic' + (params.size ? '?' + params.toString() : '');
}
let imageZoom = 1;
let imageReturnFocus = null;
let previousOverflow = '';
function setImageZoom(value) {
  imageZoom = Math.max(1, Math.min(4, value));
  $('enlarged-image').style.width = (imageZoom * 100) + '%';
  $('image-zoom-out').disabled = imageZoom === 1;
  $('image-zoom-in').disabled = imageZoom === 4;
  $('image-zoom-status').textContent = Math.round(imageZoom * 100) + '% · Use + to enlarge. Swipe to move around the image.';
}
function openImage(item, trigger) {
  imageReturnFocus = trigger;
  $('image-viewer-title').textContent = item.title || 'Image';
  $('enlarged-image').src = item.mediaUrl;
  $('enlarged-image').alt = [item.title, item.author].filter(Boolean).join(' · ');
  setImageZoom(1);
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  $('image-viewer').showModal();
  $('image-viewport').scrollTop = 0;
  $('image-viewport').scrollLeft = 0;
  $('image-close').focus();
}
$('image-close').addEventListener('click', () => $('image-viewer').close());
$('image-zoom-in').addEventListener('click', () => setImageZoom(imageZoom + .5));
$('image-zoom-out').addEventListener('click', () => setImageZoom(imageZoom - .5));
$('image-viewer').addEventListener('close', () => {
  // A feed reset can close both nested dialogs before this close event runs.
  document.body.style.overflow = postVariant
    ? (document.querySelector('.post-dialog[open]') ? 'hidden' : '')
    : previousOverflow;
  $('enlarged-image').removeAttribute('src');
  imageReturnFocus?.focus({ preventScroll: true });
});
function updateFooter(state) {
  $('feed').setAttribute('aria-busy', String(state.loading));
  $('load-more').hidden = state.loading || !state.hasMore;
  $('load-more').disabled = state.loading;
  $('load-more').textContent = state.error ? 'Retry loading' : 'Load more';
  $('feed-status').textContent = state.loading ? 'Loading more…' : state.error ? state.error.message :
    state.hasMore ? 'More below' : linkedItemId && state.seen.size ? 'You’re viewing a linked item.' : state.seen.size ? 'You’ve reached the end of this queue.' : 'No unreviewed items are available right now.';
}
const pager = new ScrollFeedPager({
  fetchPage: (context, signal) => context.linkedItemId
    ? linkedItemPage(context.linkedItemId, id => api('contentById?' + new URLSearchParams({id}), null, signal))
    : api('fetchFiltered', { ...context, anonId: anonymousId, scroll: true, limit: 12,
    ...(swipeVariant ? { feedPolicy: 'mobile', servedIds: [...pager.seen], sessionVotes, welcome: !auth.currentUser?.email && !welcomeCalibrated } : {}),
  }, signal),
  append: (items) => items.forEach(renderCard),
  changed: updateFooter,
  clear: () => { discardReading(); if (swipeVariant) resetSwipeReview(); if (postVariant) closePostDetails(); $('feed').replaceChildren(); },
});
function restartFeed() {
  automaticPages = true;
  updateRoute();
  return pager.reset({ ...filters, ...(linkedItemId ? {linkedItemId} : {}), scrollSeed: crypto.randomUUID() });
}

let readingCard, readingFooter, readingClose, readingOrigin;
const reading = createReadingReturn({
  capture: () => {
    const origin = { y: window.scrollY, url: location.href, state: history.state,
      automaticPages, footerHidden: $('feed-footer').hidden, accountHidden: $('account-toggle').hidden };
    readingOrigin = origin;
    automaticPages = false;
    return origin;
  },
  show: (item, first) => {
    closePostDetails();
    resetSwipeReview();
    readingCard?.remove();
    for (const card of $('feed').children) card.hidden = true;
    $('feed-footer').hidden = true;
    $('account-toggle').hidden = true;
    readingCard = makePostCard(item);
    $('feed').append(readingCard);
    if (first) {
      readingClose = node('button', 'post-close', '×');
      readingClose.type = 'button';
      readingClose.setAttribute('aria-label', 'Return to where you were');
      readingClose.addEventListener('click', () => history.back());
      $('account-toggle').after(readingClose);
      readingFooter = node('section', 'feed-footer');
      const resume = node('button', '', 'Continue browsing');
      resume.type = 'button';
      resume.addEventListener('click', () => history.back());
      readingFooter.append(resume);
      $('feed').after(readingFooter);
    }
    const params = new URLSearchParams(location.search);
    params.set('item', item.id);
    history[first ? 'pushState' : 'replaceState']({ ppReading: true }, '', location.pathname + '?' + params);
    window.scrollTo({ top: 0, behavior: 'instant' });
    readingClose.focus({ preventScroll: true });
  },
  restore: origin => {
    closePostDetails();
    resetSwipeReview();
    readingCard?.remove();
    readingFooter?.remove();
    readingClose?.remove();
    readingCard = readingFooter = readingClose = readingOrigin = null;
    for (const card of $('feed').children) card.hidden = false;
    $('feed-footer').hidden = origin.footerHidden;
    $('account-toggle').hidden = origin.accountHidden;
    automaticPages = origin.automaticPages;
    window.scrollTo({ top: origin.y, behavior: 'instant' });
    observeSwipeCards($('feed').children);
    const source = [...$('feed').children].find(card => card.getBoundingClientRect().top >= -1);
    source?.querySelector('.post-open')?.focus({ preventScroll: true });
  },
});
function discardReading() {
  if (!reading.active) return;
  history.replaceState(readingOrigin.state, '', readingOrigin.url);
  $('account-toggle').hidden = readingOrigin.accountHidden;
  $('feed-footer').hidden = readingOrigin.footerHidden;
  reading.discard();
  readingFooter?.remove();
  readingClose?.remove();
  readingCard = readingFooter = readingClose = readingOrigin = null;
}
window.addEventListener('popstate', event => {
  if (reading.active) reading.close();
  // Forward navigation to a discarded reading visit remains a canonical deep
  // link; never revive a retained queue after an account change.
  else if (event.state?.ppReading) location.reload();
});

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

function makePostCard(item) {
  return (swipeVariant ? renderSwipeCard : renderPostCard)(item, {
    createVotes: createVoteControls,
    openImage,
    viewerUrl: originalViewerUrl(item, routeFilters()),
    openRelated: swipeVariant ? item => reading.open(item) : undefined,
  });
}
function renderCard(item) {
  if (postVariant) {
    const card = makePostCard(item);
    // A page already in flight may finish while a related version is open.
    card.hidden = reading.active;
    $('feed').append(card);
    return;
  }
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
    const stage = node('button', 'image-stage' + (item.type === 'INT' ? ' interior-stage' : ''));
    stage.type = 'button';
    stage.setAttribute('aria-label', 'Enlarge ' + (item.title || 'image'));
    stage.addEventListener('click', () => openImage(item, stage));
    const image = node('img');
    image.src = item.mediaUrl;
    image.alt = [item.type === 'INT' ? 'Interior photo' : 'Graphic', item.title, item.author].filter(Boolean).join(' · ');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => { stage.disabled = true; stage.replaceChildren(node('p', '', 'Image unavailable. Open this item in the original viewer below.')); }, { once: true });
    stage.append(image);
    media.append(stage);
  } else media.append(node('p', 'card-text', 'No preview is available. Open this item in the original viewer below.'));
  media.append(renderCaption(item));
  card.append(media);

  card.append(...createVoteControls(item, card));
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

function createVoteControls(item, card) {
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
    const icon = node('span', 'emoji', outlineReviewIcon ? undefined : emoji);
    if (outlineReviewIcon) icon.append(outlineReviewIcon(value));
    button.append(icon, node('span', '', label));
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
        if (swipeVariant) {
          sessionVotes++;
          if (!auth.currentUser?.email && sessionVotes >= 8) {
            welcomeCalibrated = true;
            try { localStorage.setItem('pp_welcome_calibrated', '1'); } catch { /* Continue for this session. */ }
          }
        }
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
  return [controls, status];
}

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
  sessionVotes = 0;
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
    }
    // Author ownership and explicit staff preview are access scopes, not browsing filters.
    filters = { type: 'PROMO', author: ownAuthor };
    if (isStaff() && initial.get('authorPreview') === '1') {
      const previewAuthor = String(initial.get('author') || '').trim();
      if (!previewAuthor) throw new Error('An author is required for author preview. Please use the single-item view.');
      filters.author = previewAuthor;
    }
    await restartFeed();
  } catch (error) {
    if (generation === sessionGeneration) $('feed-status').textContent = error.message || 'Your account could not be loaded. Please reload or open the single-item view.';
  }
});
