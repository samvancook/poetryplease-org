import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mobilePreference, paginateMobileFeed } from './swipe-feed.js';

test('Swipe scoring and bucket interleaving match the existing mobile protocol', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const items = Array.from({ length: 28 }, (_, i) => ({ id: 'id-' + String(i).padStart(2, '0'), imageId: 'id-' + String(i).padStart(2, '0'), imageType: i % 2 ? 'EXC' : 'QI' }));
  const ratings = Object.fromEntries(items.map((item, i) => [item.id, i % 4 === 0 ? { total: 8, movedMe: 5, likes: 3 } : i % 4 === 1 ? { total: 1, movedMe: 1 } : i % 4 === 2 ? { total: 10, meh: 8, dislikes: 2 } : {}]));
  const math = Object.create(Math); math.random = () => .5;
  const context = vm.createContext({ Math: math, ratingMetaOf: item => ratings[item.id] || {} });
  vm.runInContext(source.slice(source.indexOf('function computeExternalSignalScore('), source.indexOf('function refreshItemFeedSignals(')) +
    source.slice(source.indexOf('function communityAffinityOf('), source.indexOf('// ===== Data fetch wrappers =====')), context);
  for (const includeMuted of [true, false]) for (const preferVisual of [true, false]) {
    const expected = context.orderByCommunityPreference(items.map(item => ({ ...item })), { includeMuted, preferVisual });
    const actual = mobilePreference(items, ratings, { includeMuted, preferVisual, random: () => .5 });
    assert.deepEqual(actual.map(item => item.imageId), Array.from(expected, item => item.id));
    for (const item of actual) assert.equal(item.__feedSignals.feedScore, context.getFeedSignals(item).feedScore);
  }
});

test('community-loved work leads instead of a hash-shuffled random candidate', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ imageId: 'unrated-' + i, imageType: 'QI' }));
  items.push({ imageId: 'loved', imageType: 'QI' }, { imageId: 'blocked', imageType: 'QI' });
  const ratingsSummary = { loved: { total: 10, movedMe: 10 }, blocked: { total: 20, movedMe: 20, authorExcluded: true } };
  const first = paginateMobileFeed(items, { ratingsSummary, seed: 'test' });
  assert.equal(first.items[0].imageId, 'loved');
  assert.ok(first.items.every(item => item.imageId !== 'blocked'));
});

test('ranked pages do not skip or repeat when earlier votes disappear and ratings change', () => {
  const all = Array.from({ length: 67 }, (_, i) => ({ imageId: 'id-' + i, imageType: i % 2 ? 'EXC' : 'QI' }));
  const servedIds = [];
  const ratingsSummary = {};
  let remaining = all;
  for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
    const page = paginateMobileFeed(remaining, { servedIds, ratingsSummary, seed: 'same', limit: 12, includeMuted: true });
    for (const item of page.items) { assert.ok(!servedIds.includes(item.imageId)); servedIds.push(item.imageId); }
    if (!page.hasMore) break;
    remaining = all.filter(item => !servedIds.includes(item.imageId));
    for (const item of remaining) ratingsSummary[item.imageId] = { total: 5, movedMe: pageNumber % 2 ? 5 : 0, dislikes: pageNumber % 2 ? 0 : 5 };
  }
  assert.equal(servedIds.length, all.length);
});

test('newcomers see proven top QI without discovery slots, minimum pool size or seed jitter', () => {
  const items = [
    { imageId: 'best-video', imageType: 'YT' },
    { imageId: 'qi-second', imageType: 'QI' },
    { imageId: 'unrated', imageType: 'QI' },
    { imageId: 'qi-first', imageType: 'QI' },
    { imageId: 'blocked', imageType: 'QI' },
  ];
  const ratingsSummary = {
    'best-video': { score: 100, total: 50, movedMe: 50 },
    'qi-first': { score: 20, total: 10, movedMe: 10 },
    'qi-second': { score: 15, total: 10, movedMe: 5 },
    blocked: { score: 200, total: 100, authorExcluded: true },
  };
  for (const seed of ['one', 'two']) {
    const first = paginateMobileFeed(items, { ratingsSummary, newcomer: true, limit: 3, seed });
    assert.equal(first.feedMode, 'mobile-welcome');
    assert.deepEqual(first.items.map(item => item.imageId), ['qi-first', 'qi-second', 'best-video']);
    assert.equal(first.hasMore, true);
    const next = paginateMobileFeed(items, { ratingsSummary, newcomer: true, limit: 3,
      servedIds: first.items.map(item => item.imageId) });
    assert.deepEqual(next.items.map(item => item.imageId), ['unrated']);
    assert.equal(next.hasMore, false);
  }
});

test('newcomer showcase does not replace an author ownership review queue', () => {
  const page = paginateMobileFeed([
    { imageId: 'author-int', imageType: 'INT' },
    { imageId: 'author-excerpt', imageType: 'EXC' },
  ], { newcomer: true, authorReview: true, limit: 3 });
  assert.equal(page.feedMode, 'author-review');
  assert.equal(page.items[0].imageId, 'author-int');
});

test('newcomer top rated means positive response quality, not accumulated exposure', () => {
  const items = ['popular-meh', 'proven-love', 'one-vote'].map(imageId => ({ imageId, imageType: 'QI' }));
  const page = paginateMobileFeed(items, { newcomer: true, ratingsSummary: {
    'popular-meh': { score: 157, total: 314, likes: 60, dislikes: 12, meh: 192, movedMe: 50 },
    'proven-love': { score: 20, total: 10, movedMe: 10 },
    'one-vote': { score: 2, total: 1, movedMe: 1 },
  } });
  assert.deepEqual(page.items.map(item => item.imageId), ['proven-love', 'popular-meh', 'one-vote']);
});
