import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { postPermalink, sharePost, videoEmbedUrl, bindGraphicLoad } from '../public/post-cards.js';
import { readingUrl } from '../public/poem-links.js';
import { classicMobileTarget } from '../public/mobile-entry.js';

const item = { id: 'graphic & one', title: 'A poem', author: 'A poet' };
test('Swipe starts graphics for the visible card and its next neighbor, not the whole queue', () => {
  const source = readFileSync(new URL('../public/posts-swipe.js', import.meta.url), 'utf8');
  const cards = [{}, {}, {}];
  cards[0].nextElementSibling = cards[1]; cards[1].nextElementSibling = cards[2];
  const started = [];
  const graphicStarts = new WeakMap(cards.map((card, i) => [card, () => started.push(i)]));
  const load = vm.runInNewContext(source.slice(source.indexOf('function loadNearbyGraphics('), source.indexOf('\nfunction parkResponse(')) + '; loadNearbyGraphics', { graphicStarts });
  load(cards[0]);
  assert.deepEqual(started, [0, 1]);
  started.length = 0;
  load(cards[1]);
  assert.deepEqual(started, [1, 2]);
  cards[1].hidden = true;
  started.length = 0;
  load(cards[1]);
  assert.deepEqual(started, [2]);
});
function graphicFixture() {
  const image = new EventTarget();
  const states = [], requests = [];
  let pending;
  image.removeAttribute = () => {};
  Object.defineProperty(image, 'src', { set: value => requests.push(value) });
  const loader = bindGraphicLoad(image, 'https://storage.googleapis.com/bucket/graphic.jpg', state => states.push(state), {
    schedule: callback => { pending = callback; return 1; },
    cancel: () => { pending = undefined; }
  });
  return { image, states, requests, loader, tick: () => { const callback = pending; pending = undefined; callback?.(); } };
}
test('a transient graphic failure retries the same asset and recovers without replacing the image', () => {
  const f = graphicFixture();
  f.image.dispatchEvent(new Event('error'));
  f.tick();
  f.image.dispatchEvent(new Event('load'));
  assert.deepEqual(f.states, ['loading', 'loading', 'loading', 'ready']);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0], f.requests[1]);
});
test('persistent graphic failures stop automatic retries and allow an explicit retry to recover', () => {
  const f = graphicFixture();
  f.image.dispatchEvent(new Event('error')); f.tick();
  f.image.dispatchEvent(new Event('error')); f.tick();
  assert.equal(f.states.at(-1), 'error');
  assert.equal(f.requests.length, 2);
  f.loader.retry();
  f.image.dispatchEvent(new Event('load'));
  assert.equal(f.requests.length, 3);
  assert.equal(f.states.at(-1), 'ready');
});
test('a graphic removed during an account/feed change is not fetched again', () => {
  const f = graphicFixture();
  f.image.dispatchEvent(new Event('error'));
  f.image.isConnected = false;
  f.tick();
  assert.equal(f.requests.length, 1);
});
test('poem and video buttons open existing canonical items in the current Swipe viewer', () => {
  for (const id of ['ETSA-FP-FOR-KORAH', 'YT-sIYLcc2Bva8', 'item & one']) {
    const url = new URL(readingUrl(id), 'https://poetryplease.org');
    assert.equal(url.pathname, '/m');
    assert.deepEqual([...url.searchParams], [['item', id]]);
    assert.equal(classicMobileTarget('/m', url.search), '');
  }
});
test('sharing uses the canonical item identity without private feed or account parameters', () => {
  const url = new URL(postPermalink({ ...item, authorPreview: '1', book: 'Private scope' }));
  assert.equal(url.origin, 'https://poetryplease.org');
  assert.equal(url.pathname, '/app');
  assert.deepEqual([...url.searchParams], [['item', 'graphic & one']]);
});
test('native share receives the individual link; cancel does not overwrite the clipboard', async () => {
  const shares = [];
  let copies = 0;
  assert.equal(await sharePost(item, { share: async data => shares.push(data), copy: async () => copies++ }), 'shared');
  assert.equal(shares[0].url, postPermalink(item));
  const canceled = Object.assign(new Error('Canceled'), { name: 'AbortError' });
  assert.equal(await sharePost(item, { share: async () => { throw canceled; }, copy: async () => copies++ }), 'canceled');
  assert.equal(copies, 0);
});
test('unavailable or denied native share falls back to copy, then a selectable link', async () => {
  let copied;
  assert.equal(await sharePost(item, { copy: async url => { copied = url; } }), 'copied');
  assert.equal(copied, postPermalink(item));
  assert.equal(await sharePost(item, { share: async () => { throw new Error('Denied'); }, copy: async () => {} }), 'copied');
  assert.equal(await sharePost(item, { copy: async () => { throw new Error('Denied'); } }), 'manual');
});
test('video embeds support vertical Shorts, normal YouTube, and Drive without unsafe URLs', () => {
  assert.equal(videoEmbedUrl('https://www.youtube.com/shorts/abc123'), 'https://www.youtube-nocookie.com/embed/abc123');
  assert.equal(videoEmbedUrl('https://youtu.be/abc123?t=10'), 'https://www.youtube-nocookie.com/embed/abc123');
  assert.equal(videoEmbedUrl('https://www.youtube.com/watch?v=abc123'), 'https://www.youtube-nocookie.com/embed/abc123');
  assert.equal(videoEmbedUrl('https://drive.google.com/file/d/abc123/view'), 'https://drive.google.com/file/d/abc123/preview');
  assert.equal(videoEmbedUrl('javascript:alert(1)'), '');
  assert.equal(videoEmbedUrl('https://evil.example/watch?v=abc123'), '');
});
