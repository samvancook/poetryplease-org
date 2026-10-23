import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { paginateScrollFeed } from './scroll-feed.js';
import { paginateMobileFeed } from './swipe-feed.js';
import { ScrollFeedPager, safeMediaUrl, normalizeScrollItem, originalViewerUrl } from '../public/scroll-feed-core.js';

const content = (count) => Array.from({ length: count }, (_, i) => ({ imageId: 'item-' + i, imageType: 'EXC', title: 'Poem ' + i, book: 'Roads', excerpt: 'line one\nline two' }));
const row = (id) => ['Author', 'Title', 'Book', id, '', '', '', 'EXC', 'one\ntwo'];

test('keyset pages visit every item once even when earlier voted items disappear', () => {
  const all = content(87);
  const seen = new Set();
  let cursor = '';
  let remaining = all;
  for (let i = 0; i < 20; i++) {
    const page = paginateScrollFeed(remaining, { seed: 'session', after: cursor, limit: 12 });
    for (const item of page.items) { assert.ok(!seen.has(item.imageId)); seen.add(item.imageId); }
    if (!page.hasMore) break;
    cursor = page.nextCursor;
    remaining = all.filter((item) => !seen.has(item.imageId));
  }
  assert.equal(seen.size, 87);
});

test('a removed cursor anchor still advances, duplicate IDs and page size are bounded', () => {
  const all = content(40);
  const first = paginateScrollFeed(all, { seed: 'same', limit: 5 });
  const gone = all.filter((item) => !first.items.includes(item));
  const next = paginateScrollFeed(gone, { seed: 'same', after: first.nextCursor, limit: 5 });
  assert.equal(next.items.length, 5);
  assert.ok(next.items.every((item) => !first.items.includes(item)));
  const duplicates = paginateScrollFeed([...all, { ...all[0], imageId: ' ITEM-0 ' }], { limit: 999999 });
  assert.equal(duplicates.items.length, 24);
  assert.equal(paginateScrollFeed([], {}).hasMore, false);
  assert.equal(paginateScrollFeed(all, { limit: 'not-a-number' }).items.length, 12);
});

test('session order is stable but changes between sessions', () => {
  const all = content(20);
  const a = paginateScrollFeed(all, { seed: 'a' });
  assert.deepEqual(a, paginateScrollFeed(all.slice().reverse(), { seed: 'a' }));
  assert.notDeepEqual(a.items, paginateScrollFeed(all, { seed: 'b' }).items);
});

test('front-end pager coalesces repeated triggers and appends no duplicate cards', async () => {
  let resolve;
  let calls = 0;
  const appended = [];
  const pager = new ScrollFeedPager({ fetchPage: () => { calls++; return new Promise((done) => { resolve = done; }); }, append: (items) => appended.push(...items), changed() {}, clear() {} });
  const first = pager.reset({ type: 'EXC' });
  await pager.loadMore(); await pager.loadMore();
  assert.equal(calls, 1);
  resolve({ newGraphics: [row('A'), row('a'), row('B')], hasMore: true, nextCursor: 'page2' });
  await first;
  assert.deepEqual(appended.map((item) => item.id), ['A', 'B']);
  const second = pager.loadMore();
  resolve({ newGraphics: [row('A'), row('C')], hasMore: false, nextCursor: null });
  await second;
  assert.deepEqual(appended.map((item) => item.id), ['A', 'B', 'C']);
  await pager.loadMore();
  assert.equal(calls, 2);
});

test('changing a filter cancels and ignores a stale response', async () => {
  const pending = [];
  const shown = [];
  const pager = new ScrollFeedPager({ fetchPage: (context, signal) => new Promise((resolve) => pending.push({ context, signal, resolve })), append: (items) => shown.push(...items), changed() {}, clear() { shown.length = 0; } });
  const old = pager.reset({ book: 'Old' });
  const fresh = pager.reset({ book: 'New' });
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ newGraphics: [row('new')], hasMore: false });
  await fresh;
  pending[0].resolve({ newGraphics: [row('old')], hasMore: false });
  await old;
  assert.deepEqual(shown.map((item) => item.id), ['new']);
  assert.equal(pager.hasMore, false);
});

test('failed pages retain cards and retry the same cursor; non-advancing cursors stop', async () => {
  const seen = [];
  const cursors = [];
  let n = 0;
  const pager = new ScrollFeedPager({ fetchPage: async (context) => {
    cursors.push(context.cursor);
    n++;
    if (n === 1) return { newGraphics: [row('a')], hasMore: true, nextCursor: 'two' };
    if (n === 2) throw new Error('offline');
    return { newGraphics: [row('b')], hasMore: true, nextCursor: 'two' };
  }, append: (items) => seen.push(...items), changed() {}, clear() {} });
  await pager.reset({}); await pager.loadMore();
  assert.match(pager.error.message, /offline/);
  assert.equal(seen.length, 1);
  await pager.loadMore();
  assert.match(pager.error.message, /retry/);
  assert.deepEqual(cursors, [null, 'two', 'two']);
  assert.equal(seen.length, 1);
});

test('scrolling fetches pages only; it never sends a vote', async () => {
  const calls = [];
  const pager = new ScrollFeedPager({ fetchPage: async (body) => { calls.push(body); return { newGraphics: [row('one')], hasMore: false }; }, append() {}, changed() {}, clear() {} });
  await pager.reset({ type: 'EXC', scrollSeed: 'one' });
  await pager.loadMore();
  assert.deepEqual(calls, [{ type: 'EXC', scrollSeed: 'one', cursor: null }]);
  assert.ok(!('voteType' in calls[0]));
});

test('metadata and text remain plain strings and media URLs require HTTPS', () => {
  assert.equal(safeMediaUrl('javascript:alert(1)'), '');
  assert.equal(safeMediaUrl('http://example.com/a.png'), '');
  const item = normalizeScrollItem(['A', '<script>bad</script>', 'Book', 'id', 'https://example.com/a.png', '', '', 'EXC', 'first\n\nlast']);
  assert.equal(item.text, 'first\n\nlast');
  assert.equal(item.title, '<script>bad</script>');
  const url = new URL(originalViewerUrl(item, { author: 'A', book: 'Book', authorPreview: '1' }), 'https://poetryplease.org');
  assert.equal(url.searchParams.get('item'), 'id');
  assert.equal(url.searchParams.get('book'), 'Book');
  assert.equal(url.searchParams.get('authorPreview'), '1');
});

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
function routeHarness(customContent, ratings = {}, votedIds = ['item-0']) {
  let handler;
  const all = customContent || [...content(30), { imageId: 'flagged', imageType: 'EXC', book: 'Roads' }, { imageId: 'broken', broken: true, imageType: 'EXC', book: 'Roads' }, { imageId: 'private', imageType: 'FP', book: 'Roads' }];
  const context = vm.createContext({ app: { post: (_p, fn) => { handler = fn; } }, getBoth: (p) => p,
    verifyIdTokenFromHeader: async (req) => req.decoded, normalizeText: (v) => String(v || '').trim(), normalizeKey: (v) => String(v || '').trim().toLowerCase(),
    getAllContentCached: async () => all, getFlaggedContentIds: async () => new Set(['flagged']), getRatingsSummaryCached: async () => ratings,
    getUniqueVotedImageIdsByUser: async () => new Set(votedIds), canSeeFullPoemsInReview: async (decoded) => decoded?.staff === true,
    excludeBrokenContent: (items) => items.filter((i) => !i.broken), excludeFlaggedContent: (items, ids) => items.filter((i) => !ids.has(i.imageId)),
    reviewVisibleContent: (items, full) => items.filter((i) => full || i.imageType !== 'FP'),
    parseOptionalCount: (value) => value == null ? null : Number(value), parseBoolean: (value) => value === true,
    sampleItems: (items, limit) => items.slice(0, limit), mapToCounterArr: (i) => i.imageId, mapToArr: (i) => row(i.imageId), paginateScrollFeed, paginateMobileFeed,
  });
  vm.runInContext(source.slice(source.indexOf('function prioritizeVisualContent('), source.indexOf('function buildFeedPayload(')) + '\n' +
    source.slice(source.indexOf('function matchesFilterValue('), source.indexOf('function firstNonEmpty(')) + '\n' +
    source.slice(source.indexOf('app.post(getBoth("/fetchFiltered")'), source.indexOf('app.get(getBoth("/embedBookLead")')), context);
  return async (body, decoded) => {
    let status = 200; let data;
    await handler({ body, decoded }, { status(code) { status = code; return this; }, json(value) { data = JSON.parse(JSON.stringify(value)); } });
    return { status, data };
  };
}

test('scroll mode retains feed visibility, flags, broken-media and existing-vote exclusions', async () => {
  const call = routeHarness();
  assert.equal((await call({ scroll: true })).status, 400);
  const result = (await call({ scroll: true, anonId: 'test', book: 'Roads', limit: 12, scrollSeed: 'test' })).data;
  assert.deepEqual(result.allGraphics, []);
  assert.equal(result.newGraphics.length, 12);
  assert.equal(result.domainRemainingImagesCount, 29);
  assert.equal(result.hasMore, true);
  const ids = result.newGraphics.map((r) => r[3]);
  assert.ok(!ids.some((id) => ['flagged', 'broken', 'private', 'item-0'].includes(id)));
  const full = (await call({ scroll: true, type: 'FP', anonId: 'test' }, { email: 'staff@example.com', staff: true })).data;
  assert.equal(full.newGraphics[0][3], 'private');
  const hidden = (await call({ scroll: true, type: 'FP', anonId: 'test' })).data;
  assert.equal(hidden.newGraphics.length, 0);
});

test('legacy filtered-feed callers retain the same response shape and metadata', async () => {
  const data = (await routeHarness()({ anonId: 'test', book: 'Roads', limit: 10 })).data;
  assert.equal(data.allGraphics.length, 30);
  assert.equal(data.newGraphics.length, 10);
  assert.equal(data.hasMore, undefined);
  assert.equal(data.nextCursor, undefined);
});

test('Swipe leads with top QI and continues without serving the same IDs', async () => {
  const all = content(36).map((item, i) => ({ ...item, imageType: i < 18 ? 'QI' : i < 27 ? 'INT' : 'EXC', book: 'Book ' + i }));
  const ratings = Object.fromEntries(all.map((item, i) => [item.imageId, { total: 4, movedMe: 4, score: 100 - i }]));
  const call = routeHarness(all, ratings);
  const request = { scroll: true, feedPolicy: 'mobile', welcome: false, anonId: 'reader', type: 'PROMO', scrollSeed: 'session', limit: 3 };
  const first = (await call(request)).data;
  assert.equal(first.feedMode, 'mobile-welcome');
  // Equal vote quality uses a stable identity tie-break, not accumulated score.
  assert.deepEqual(first.newGraphics.map(row => row[3]), ['item-1', 'item-10', 'item-11']);
  const servedIds = first.newGraphics.map(row => row[3]);
  const second = (await call({ ...request, cursor: first.nextCursor, servedIds })).data;
  assert.ok(second.newGraphics.every(row => !servedIds.includes(row[3])));
  assert.ok(!second.newGraphics.some(row => row[3] === 'item-0'), 'existing votes stay excluded');
});

test('saved review history controls signed-in newcomer eligibility; anonymous readers retain the showcase', async () => {
  const request = { scroll: true, feedPolicy: 'mobile', anonId: 'reader', type: 'PROMO', limit: 3 };
  const signedIn = { email: 'new@example.com' };
  const few = routeHarness(undefined, {}, ['item-0']);
  assert.equal((await few(request, signedIn)).data.feedMode, 'mobile-welcome');
  const experienced = routeHarness(undefined, {}, Array.from({ length: 8 }, (_, i) => 'past-' + i));
  assert.equal((await experienced(request, signedIn)).data.feedMode, 'mobile-community');
  assert.equal((await experienced(request)).data.feedMode, 'mobile-welcome');
});

test('Swipe ranking keeps existing exclusions and author graphics-first review scope', async () => {
  const all = [...content(5), { imageId: 'own-graphic', imageType: 'QI', book: 'Roads', author: 'Poet' },
    { imageId: 'flagged', imageType: 'QI' }, { imageId: 'broken', imageType: 'QI', broken: true }, { imageId: 'private', imageType: 'FP' }];
  const call = routeHarness(all, { 'own-graphic': { authorExcluded: true } });
  const normal = (await call({ scroll: true, feedPolicy: 'mobile', anonId: 'reader', type: 'PROMO' })).data;
  assert.ok(normal.newGraphics.every(row => !['flagged', 'broken', 'private', 'item-0', 'own-graphic'].includes(row[3])));
  const own = (await call({ scroll: true, feedPolicy: 'mobile', anonId: 'author', author: 'Poet', type: 'PROMO' })).data;
  assert.equal(own.feedMode, 'author-review');
  assert.deepEqual(own.newGraphics.map(row => row[3]), ['own-graphic']);
});

test('only Swipe requests mobile ranking and sends all already-shown IDs on the next page', async () => {
  const client = readFileSync(new URL('../public/scroll.js', import.meta.url), 'utf8');
  const block = client.slice(client.indexOf('const pager = new ScrollFeedPager('), client.indexOf('function restartFeed()'));
  for (const swipeVariant of [false, true]) {
    const requests = [];
    const context = vm.createContext({ ScrollFeedPager, swipeVariant, anonymousId: 'reader', auth: { currentUser: null }, sessionVotes: 0, welcomeCalibrated: false,
      renderCard() {}, updateFooter() {}, discardReading() {}, closePostDetails() {}, resetSwipeReview() {}, postVariant: true, $: () => ({ replaceChildren() {} }),
      api: async (path, body) => { requests.push({ path, body }); return { newGraphics: requests.length === 1 ? [row('A'), row('B')] : [row('C')], hasMore: requests.length === 1, nextCursor: requests.length === 1 ? 'next' : null }; },
    });
    vm.runInContext(block + '\nglobalThis.testPager = pager;', context);
    await context.testPager.reset({ type: 'PROMO', scrollSeed: 'seed' });
    await context.testPager.loadMore();
    assert.equal(requests[0].body.feedPolicy, swipeVariant ? 'mobile' : undefined);
    if (swipeVariant) {
      assert.deepEqual(Array.from(requests[0].body.servedIds), []);
      assert.deepEqual(Array.from(requests[1].body.servedIds), ['a', 'b']);
      assert.equal(requests[1].body.welcome, true);
    }
  }
});


test('event reading returns every eligible graphic from only the selected contest, including prior votes', async () => {
  const event = "Button Poetry's Fall 2026 Short Form Contest";
  const eight = content(8).map((item) => ({ ...item, imageType: 'QI', book: '', releaseCatalog: 'Contest', sourceEvent: event }));
  const call = routeHarness([...eight,
    { ...eight[0], imageId: 'spring', sourceEvent: 'Spring contest' },
    { ...eight[0], imageId: 'flagged' }, { ...eight[0], imageId: 'broken', broken: true },
    { ...eight[0], imageId: 'private', imageType: 'FP' }]);
  const request = { eventReading: true, anonId: 'reader', catalog: 'Contest', type: 'QI', event };
  const result = (await call(request)).data;
  assert.equal(result.feedMode, 'event-reading');
  assert.equal(result.collectionSize, 8);
  assert.deepEqual(result.newGraphics.map((r) => r[3]), eight.map((item) => item.imageId));
  assert.ok(result.newGraphics.some((r) => r[3] === 'item-0'), 'prior votes must not remove an item from a reading collection');
  assert.equal((await call({ ...request, event: 'Spring contest' })).data.collectionSize, 1);
  assert.ok(eight.every((item) => item.book === ''), 'reading must not invent book metadata');
});

test('event reading opt-in does not change ordinary or incompatible review requests', async () => {
  const all = content(3).map((item) => ({ ...item, imageType: 'QI', releaseCatalog: 'Contest', sourceEvent: 'Fall contest' }));
  const call = routeHarness(all);
  for (const request of [
    { catalog: 'Contest', type: 'QI', event: 'Fall contest' },
    { eventReading: true, catalog: 'Contest', type: 'QI' },
    { eventReading: true, catalog: 'Contest', type: 'QI', event: 'Fall contest', book: 'Roads' },
  ]) {
    const data = (await call({ ...request, anonId: 'reviewer' })).data;
    assert.equal(data.feedMode, undefined);
    assert.ok(!data.newGraphics.some((r) => r[3] === 'item-0'));
  }
});

test('reading navigation visits all eight once, ends without a refill, and records no skip votes', async () => {
  const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const q = Array.from({ length: 8 }, (_, i) => ({ id: 'graphic-' + i }));
  const shown = [q[0].id];
  const context = vm.createContext({ eventReadingMode: true, queue: q, idx: 0, currentItem: q[0],
    IS_EMBED_UI: false, isTransitioning: false, historyStack: [], PRELOAD_AHEAD: 2,
    safePreload() {}, renderWhenReady(i) { shown.push(q[i].id); context.currentItem = q[i]; },
    renderEmptyFilterState() { context.currentItem = null; context.ended = true; },
    submitVote() { throw new Error('reading must not record a skip vote'); },
    refillCurrentViewWithRetry() { throw new Error('reading must not refill the completed set'); },
  });
  vm.runInContext(appSource.slice(appSource.indexOf('async function advanceEventReading()'), appSource.indexOf('function setVoteButtonsDisabled(')) +
    appSource.slice(appSource.indexOf('async function onSkip(){'), appSource.indexOf('function onGoBack(){')), context);
  for (let i = 0; i < 8; i++) await context.onSkip();
  assert.deepEqual(shown, q.map((item) => item.id));
  assert.equal(context.ended, true);
  assert.equal(context.historyStack.length, 8);
  assert.equal(context.queue.length, 8, 'retain items for Back navigation');
});
