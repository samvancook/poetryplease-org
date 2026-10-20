import { normalizeScrollItem } from './scroll-feed-core.js';

export const readingUrl = id => '/m?' + new URLSearchParams({item:id});
export function appendPoemLinks(container, data) {
  const poem = normalizeScrollItem(data.fullPoem);
  const videos = (data.videos || []).map(normalizeScrollItem).filter(Boolean);
  const add = (item, text) => {
    const link = document.createElement('a');
    link.className = 'post-book-link';
    link.href = readingUrl(item.id);
    link.textContent = text;
    container.append(link);
  };
  if (poem) add(poem, 'Read the full poem');
  videos.forEach((video, i) => add(video, videos.length === 1 ? 'Watch the video' : `Watch video ${i + 1}`));
}
export function createPoemLinks(id) {
  const element = document.createElement('nav');
  element.className = 'post-actions';
  element.setAttribute('aria-label', 'Related poem versions');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  let pending = false, loaded = false;
  const load = async () => {
    if (pending || loaded) return;
    pending = true;
    status.textContent = 'Finding full poem and video…';
    element.replaceChildren(status);
    try {
      const response = await fetch('/api/poemContent?' + new URLSearchParams({id}));
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      element.replaceChildren();
      appendPoemLinks(element, data);
      loaded = true;
    } catch {
      status.textContent = 'Related versions could not load. ';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Retry';
      retry.addEventListener('click', load);
      element.replaceChildren(status, retry);
    } finally { pending = false; }
  };
  return {element, load};
}
