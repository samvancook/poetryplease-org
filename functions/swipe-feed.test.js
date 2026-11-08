import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mobilePreference, paginateMobileFeed } from './swipe-feed.js';
import { buildSocialTrialProfiles, compareSocialServing } from './serving-trials.js';

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

test('social trial preserves PP priority, excludes author-blocked items and keeps the same candidate set', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const items = ['proven', 'tie-a', 'tie-b', 'blocked'].map(imageId => ({ imageId, imageType: 'QI', poemKey: imageId }));
  const profiles = { generatedAt: new Date(now).toISOString(), youtube: {}, poems: Object.fromEntries(
    items.map((item, index) => [item.poemKey, { score: index / 4, capturedAt: new Date(now).toISOString() }])) };
  const ratingsSummary = {
    proven: { total: 10, movedMe: 10 },
    blocked: { total: 10, movedMe: 10, authorExcluded: true },
  };
  const result = compareSocialServing(items, { profiles, ratingsSummary, type: 'QI', now });
  assert.equal(result.baseline[0].id, 'proven');
  assert.equal(result.trial[0].id, 'proven');
  assert.equal(result.trial[1].id, 'tie-b');
  assert.equal(result.trial[2].id, 'tie-a');
  assert.deepEqual(result.trial.map(item => item.id).sort(), result.baseline.map(item => item.id).sort());
  assert.ok(!result.trial.some(item => item.id === 'blocked'));
  profiles.poems['tie-b'].capturedAt = '2025-01-01T00:00:00Z';
  assert.ok(!compareSocialServing(items, { profiles, ratingsSummary, type: 'QI', now }).trial.some(item => item.id === 'tie-b'));
});

test('social profiles require a usable cohort, preserve zero and omit missing metrics', () => {
  const captured = '2026-11-08T00:00:00Z';
  const now = Date.parse(captured);
  const videos = Array.from({ length: 5 }, (_, index) => ({
    youtubeId: String(index), metrics: [
      { metric_name: 'views', metric_value: 100, captured_at_iso: captured,
        published_at_iso: '2025-01-01T00:00:00Z', api_endpoint: 'youtube videos.list', metric_period: 'lifetime' },
      { metric_name: 'likes', metric_value: index },
    ],
  }));
  const profiles = buildSocialTrialProfiles({ videoEvidence: videos }, now);
  assert.equal(Object.keys(profiles.youtube).length, 5);
  assert.equal(profiles.youtube['0'].values.likes, 0);
  assert.ok(!Object.hasOwn(profiles.youtube['0'].values, 'comments'));
  assert.equal(profiles.youtube['4'].score, 1);
  videos[0].metrics[1].metric_value = null;
  assert.equal(Object.keys(buildSocialTrialProfiles({ videoEvidence: videos }, now).youtube).length, 0);
});

test('staff serving trials require role access and honor reviewed and flagged exclusions', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const start = source.indexOf('let servingTrialProfiles = null;');
  const end = source.indexOf('app.post(getBoth("/admin/scoreboard/refresh")', start);
  const routeSource = source.slice(start, end).replace('await import("./serving-trials.js")', '{ compareSocialServing: compareTrial }');
  let route, authorized = false, reads = 0, payload;
  const items = ['keep', 'voted', 'flagged'].map(imageId => ({ imageId, imageType: 'QI', poemKey: imageId }));
  const capturedAt = new Date().toISOString();
  const profiles = { youtube: {}, poems: Object.fromEntries(items.map(item => [item.poemKey, { score: .5, capturedAt }])) };
  const context = vm.createContext({
    app: { get: (path, handler) => { route = handler; } }, getBoth: path => path,
    requireRole: async (req, res, roles) => {
      assert.deepEqual(Array.from(roles), ['team', 'admin']);
      if (!authorized) { res.status(403); return null; }
      return { decoded: { email: 'staff@example.test' } };
    },
    normalizeText: value => String(value || '').trim(), normalizeKey: value => String(value || '').toLowerCase(),
    getAllContentCached: async () => { reads++; return items; },
    getFlaggedContentIds: async () => new Set(['flagged']),
    getUniqueVotedImageIdsByUser: async () => new Set(['voted']),
    getRatingsSummaryCached: async () => ({}),
    excludeBrokenContent: items => items,
    excludeFlaggedContent: (items, flags) => items.filter(item => !flags.has(item.imageId)),
    compareTrial: compareSocialServing, readFileSync: () => JSON.stringify(profiles),
    URL, console,
  });
  // Replace import.meta only in this isolated route harness.
  vm.runInContext(routeSource.replace('import.meta.url', '"https://fixture.test/index.js"'), context);
  const res = { status(code) { this.code = code; return this; }, json(data) { payload = data; }, set() {} };
  await route({ query: { type: 'QI' } }, res);
  assert.equal(res.code, 403);
  assert.equal(reads, 0);
  authorized = true;
  await route({ query: { type: 'QI' } }, res);
  assert.deepEqual(payload.trial.map(row => row.id), ['keep']);
  await route({ query: { type: 'QI', includeReviewed: '1' } }, res);
  assert.deepEqual(payload.trial.map(row => row.id).sort(), ['keep', 'voted']);
});
