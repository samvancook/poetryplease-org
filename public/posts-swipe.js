import { renderPostCard } from './post-cards.js';
import { attachGraphicZoom } from './graphic-zoom.js';

let observer;
let current;
let dock;
const visible = new Map();
const zooms = new WeakMap();
const graphicStarts = new WeakMap();

function loadNearbyGraphics(card) {
  for (const nearby of [card, card?.nextElementSibling]) {
    if (nearby && !nearby.hidden) graphicStarts.get(nearby)?.();
  }
}

function parkResponse() {
  if (current) zooms.get(current)?.reset();
  const response = dock?.firstElementChild;
  if (response) {
    response.hidden = true;
    if (current?.isConnected) current.append(response);
    else response.remove();
  }
  current?.classList.remove('swipe-current');
  current = null;
  if (dock) dock.hidden = true;
}
function activate(card) {
  if (card === current || !card.isConnected) return;
  parkResponse();
  current = card;
  loadNearbyGraphics(card);
  current.classList.add('swipe-current');
  const response = card.querySelector('.swipe-review');
  response.hidden = false;
  dock.append(response);
  dock.hidden = false;
}

export function resetSwipeReview() {
  observer?.disconnect();
  visible.clear();
  parkResponse();
}

export function observeSwipeCards(cards) {
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) visible.set(entry.target, entry.intersectionRatio);
    const next = [...visible].filter(([card]) => card.isConnected && !card.hidden)
      .sort((a, b) => b[1] - a[1])[0];
    if (next?.[1] >= .55) activate(next[0]);
    else parkResponse();
  }, { threshold: [0, .55, 1] });
  for (const card of cards) if (card.isConnected && !card.hidden) observer.observe(card);
}

export function renderSwipeCard(item, options) {
  if (!dock) {
    dock = document.createElement('div');
    dock.className = 'swipe-review-dock';
    dock.hidden = true;
    document.body.append(dock);
    document.addEventListener('keydown', event => {
      const direction = ['PageDown', 'ArrowDown'].includes(event.key) ? 1 :
        ['PageUp', 'ArrowUp'].includes(event.key) ? -1 : 0;
      if (!direction || !current || document.querySelector('dialog[open]') ||
          event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      event.preventDefault();
      if (event.repeat) return;
      const cards = [...current.parentElement.children];
      const next = cards[cards.indexOf(current) + direction] ||
        (direction > 0 ? document.getElementById('feed-footer') : null);
      next?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  const card = renderPostCard(item, {
    ...options,
    deferGraphicLoad: (card, start) => graphicStarts.set(card, start),
    createVotes: (item, card) => {
      const response = document.createElement('section');
      response.className = 'swipe-review';
      response.hidden = true;
      response.setAttribute('aria-label', 'Review ' + (item.title || 'this post'));
      response.append(...options.createVotes(item, card));
      card.append(response);
      return [];
    },
  });
  const zoom = attachGraphicZoom(card);
  if (zoom) zooms.set(card, zoom);
  // Observe after the shared feed appends this card. The majority-visible post
  // owns the fixed controls; scrolling never submits a response.
  queueMicrotask(() => {
    if (!card.isConnected) return;
    // Newly appended batches can supply the active card's next graphic.
    if (current) loadNearbyGraphics(current);
    observeSwipeCards([card]);
  });
  return card;
}
