import { safeMediaUrl } from './scroll-feed-core.js';
import { createPoemLinks } from './poem-links.js';

// The renderer can be newer than a cached HTML shell. Keep its layout CSS in
// step with the .post-art markup, including on already-cached continuous pages.
export async function syncPostStyles(doc) {
  const versions = new Map([['/posts.css', '20261020b'], ['/posts-continuous.css', '20261020a'], ['/posts-swipe.css', '20261020c']]);
  const pending = [];
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const url = new URL(link.href, doc.baseURI);
    const version = versions.get(url.pathname);
    if (!version || url.origin !== new URL(doc.baseURI).origin) continue;
    if (url.searchParams.get('v') === version) continue;
    url.searchParams.set('v', version);
    pending.push(new Promise(resolve => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      link.href = url.href;
    }));
  }
  await Promise.all(pending);
}
if (typeof document !== 'undefined' && document.body?.dataset.feedVariant === 'posts') {
  await syncPostStyles(document);
}

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
export function postPermalink(item) {
  return 'https://poetryplease.org/app?' + new URLSearchParams({ item: item.id });
}
export async function sharePost(item, { share, copy } = {}) {
  const url = postPermalink(item);
  if (share) {
    try {
      await share({ title: [item.title, item.author].filter(Boolean).join(' · ') || 'Poetry, Please', url });
      return 'shared';
    } catch (error) { if (error.name === 'AbortError') return 'canceled'; }
  }
  if (copy) {
    try { await copy(url); return 'copied'; } catch { /* Show a selectable link. */ }
  }
  return 'manual';
}
export function videoEmbedUrl(mediaUrl) {
  const safe = safeMediaUrl(mediaUrl);
  if (!safe) return '';
  const url = new URL(safe);
  let id = '';
  if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1];
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    id = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
  }
  if (id) return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id);
  if (url.hostname === 'drive.google.com') {
    id = url.pathname.match(/\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
    if (id) return 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview';
  }
  return '';
}
function isVideo(item) {
  return !!item.mediaUrl && (['VV', 'YT', 'VIDEO', 'HV'].includes(item.type) || /\.(mp4|webm|mov)(?:\?|$)/i.test(item.mediaUrl));
}
function poem(item) {
  const text = make('div', 'post-poem');
  const p = make('p', 'poem-lines');
  for (const line of item.text.replace(/\r\n?/g, '\n').split('\n')) p.append(make('span', 'poem-line', line || '\u00a0'));
  text.append(p);
  return text;
}
export function bindGraphicLoad(img, source, onState, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let retried = false;
  let pending;
  const clear = () => { if (pending !== undefined) cancel(pending); pending = undefined; };
  const retry = () => {
    clear();
    onState('loading');
    img.removeAttribute('src');
    img.src = source;
  };
  img.addEventListener('load', () => { clear(); onState('ready'); });
  img.addEventListener('error', () => {
    clear();
    if (!retried) {
      retried = true;
      onState('loading');
      pending = schedule(() => { pending = undefined; if (img.isConnected !== false) retry(); }, 400);
    } else onState('error');
  });
  onState('loading');
  img.src = source;
  return { retry };
}
function image(item, deferLoad = false) {
  const img = make('img');
  img.alt = [item.title || 'Graphic', item.author].filter(Boolean).join(' · ');
  img.loading = 'lazy';
  img.decoding = 'async';
  if (!deferLoad) bindGraphicLoad(img, item.mediaUrl, state => {
    img.alt = state === 'error' ? 'Graphic could not load' : [item.title || 'Graphic', item.author].filter(Boolean).join(' · ');
  });
  return img;
}
let dialog;
let releaseDetails;
export function closePostDetails() {
  const zoom = document.getElementById('image-viewer');
  if (zoom?.open) zoom.close();
  if (dialog?.open) {
    // Clear immediately on account changes, before another person’s feed loads.
    releaseDetails?.();
    dialog.close();
  }
}
function getDialog() {
  if (dialog) return dialog;
  dialog = make('dialog', 'post-dialog');
  dialog.setAttribute('aria-labelledby', 'post-dialog-title');
  document.body.append(dialog);
  dialog.addEventListener('close', () => releaseDetails?.());
  return dialog;
}

export function renderPostCard(item, { createVotes, openImage, viewerUrl }) {
  const card = make('article', 'post-card');
  card.dataset.itemId = item.id;
  const trigger = make('button', 'post-open');
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Open ' + ([item.title, item.author].filter(Boolean).join(' by ') || 'this post'));
  trigger.setAttribute('aria-haspopup', 'dialog');
  const frame = make('div', 'post-frame');
  const art = make('div', 'post-art');
  if (['EXC', 'FP'].includes(item.type)) {
    frame.classList.add('post-text-preview');
    if (item.type === 'FP') frame.classList.add('post-full-poem');
    art.append(poem(item));
  } else if (isVideo(item)) {
    if (!videoEmbedUrl(item.mediaUrl)) {
      const preview = make('video', 'post-video-preview');
      preview.src = item.mediaUrl; preview.preload = 'metadata'; preview.muted = true; preview.playsInline = true;
      preview.tabIndex = -1; preview.setAttribute('aria-hidden', 'true');
      art.append(preview);
    }
    const hint = make('span', 'post-video-hint');
    const play = make('span', 'post-play', '▶');
    play.setAttribute('aria-hidden', 'true');
    hint.append(play);
    art.append(hint);
  } else if (item.mediaUrl) art.append(image(item, true));
  else art.append(make('span', 'post-unavailable', 'Preview unavailable'));
  frame.append(art);
  const credit = make('div', 'post-attribution');
  if (item.type === 'EXC') credit.append(make('span', 'post-credit-kind', 'Excerpt from'));
  if (item.type === 'FP') credit.append(make('span', 'post-credit-kind', 'Full poem'));
  if (item.title) credit.append(make('span', 'post-credit-title', item.title));
  if (item.author) credit.append(make('span', 'post-credit-author', item.author));
  if (credit.childElementCount) frame.append(credit);
  trigger.append(frame, make('span', 'post-open-hint', isVideo(item) ? 'Tap to watch' : 'Tap to open'));
  card.append(trigger);
  const graphic = art.querySelector('img');
  if (graphic) {
    const message = make('span', 'post-unavailable', 'Loading graphic…');
    message.setAttribute('role', 'status');
    art.append(message);
    const retry = make('button', 'post-media-retry', 'Retry graphic');
    retry.type = 'button';
    retry.hidden = true;
    card.append(retry);
    const loader = bindGraphicLoad(graphic, item.mediaUrl, state => {
      card.dataset.graphicState = state;
      // Keep lazy images in layout while loading so the browser fetches them.
      graphic.hidden = state === 'error';
      message.hidden = state === 'ready';
      message.textContent = state === 'error' ? 'Graphic could not load' : 'Loading graphic…';
      retry.hidden = state !== 'error';
    });
    retry.addEventListener('click', () => loader.retry());
  }

  const info = make('section', 'post-info');
  info.hidden = true;
  const meta = make('div', 'post-meta');
  if (item.type === 'EXC') meta.append(make('span', 'post-kind', 'Excerpt from'));
  if (item.type === 'FP') meta.append(make('span', 'post-kind', 'Full poem'));
  if (item.title) meta.append(make('h2', '', item.title));
  if (item.author) meta.append(make('p', 'post-author', item.author));
  if (item.book) meta.append(make('p', 'post-book', item.book));
  info.append(meta, ...createVotes(item, card));
  const actions = make('div', 'post-actions');
  const bookUrl = safeMediaUrl(item.bookUrl);
  if (bookUrl) {
    const book = make('a', 'post-book-link', 'View book ↗');
    book.href = bookUrl; book.target = '_blank'; book.rel = 'noopener';
    actions.append(book);
  }
  const share = make('button', 'post-share', 'Share ↗');
  share.type = 'button';
  const shareStatus = make('p', 'post-share-status');
  shareStatus.setAttribute('role', 'status');
  const link = make('input', 'post-share-link');
  link.readOnly = true; link.hidden = true; link.value = postPermalink(item);
  link.setAttribute('aria-label', 'Link to this post');
  share.addEventListener('click', async () => {
    share.disabled = true;
    try {
      const result = await sharePost(item, {
        share: navigator.share?.bind(navigator), copy: navigator.clipboard?.writeText?.bind(navigator.clipboard),
      });
      shareStatus.textContent = { shared: 'Shared.', copied: 'Link copied.', canceled: '', manual: 'Copy this link to share.' }[result];
      link.hidden = result !== 'manual';
      if (result === 'manual') { link.focus(); link.select(); }
    } finally { share.disabled = false; }
  });
  actions.append(share);
  const related = createPoemLinks(item.id);
  info.append(actions, related.element, shareStatus, link);
  card.append(info);

  trigger.addEventListener('click', () => {
    related.load();
    const modal = getDialog();
    const infoSheet = document.body.dataset.feedMode === 'swipe';
    modal.classList.toggle('post-info-sheet', infoSheet);
    const toolbar = make('div', 'post-dialog-toolbar');
    const title = make('span', '', infoSheet ? 'Info' : 'Poetry, Please');
    title.id = 'post-dialog-title';
    const close = make('button', 'post-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Close post');
    close.addEventListener('click', () => modal.close());
    toolbar.append(title, close);
    const body = make('div', 'post-dialog-body');
    const content = make('div', 'post-expanded');
    if (['EXC', 'FP'].includes(item.type)) {
      // Swipe keeps the original poem in its frame. Info adds metadata and
      // links without rebuilding the text at a different width/alignment.
      if (!infoSheet) content.append(poem(item));
    }
    else if (isVideo(item)) {
      const embed = videoEmbedUrl(item.mediaUrl);
      if (embed) {
        const frame = make('iframe');
        frame.src = embed; frame.title = item.title || 'Video'; frame.allowFullscreen = true;
        frame.allow = 'fullscreen'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
        if (item.type === 'VV') frame.classList.add('post-vertical-video');
        content.append(frame);
      } else {
        const video = make('video');
        video.src = item.mediaUrl; video.controls = true; video.playsInline = true; video.preload = 'metadata';
        video.addEventListener('error', () => {
          const fallback = make('a', 'post-unavailable', 'Video unavailable. Open in single-item view.');
          fallback.href = viewerUrl; video.replaceWith(fallback);
        }, { once: true });
        content.append(video);
      }
    } else if (item.mediaUrl && !infoSheet) {
      const enlarge = make('button', 'post-enlarge');
      enlarge.type = 'button'; enlarge.setAttribute('aria-label', 'Enlarge image');
      enlarge.append(image(item));
      enlarge.addEventListener('click', () => openImage(item, enlarge));
      content.append(enlarge);
    } else if (!infoSheet) {
      const original = make('a', '', 'Open in single-item view');
      original.href = viewerUrl; content.append(original);
    }
    info.hidden = false;
    if (content.childElementCount) body.append(content);
    body.append(info);
    modal.replaceChildren(toolbar, body);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    releaseDetails = () => {
      releaseDetails = null;
      content.querySelectorAll('video').forEach(v => v.pause());
      info.hidden = true; card.append(info);
      modal.replaceChildren();
      document.body.style.overflow = overflow;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    };
    modal.showModal();
    modal.scrollTop = 0;
    close.focus();
  });
  return card;
}
