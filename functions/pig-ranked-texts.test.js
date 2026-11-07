import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const text = (id, title, fields = {}) => ({
  imageId: id, imageType: 'EXC', author: 'Winner', title, book: 'Winning book',
  excerpt: 'Text for ' + title, ...fields,
});

function rankedTextsRoute() {
  let generation = 1;
  let reads = 0;
  let snapshotReads = 0;
  const excerptItems = [
    text('fresh', 'Fresh'),
    text('ranked', 'Ranked'),
    text('voted-sibling', 'Shared'),
    text('unvoted-sibling', 'Shared'),
    text('graphic-exists', 'Illustrated'),
    text('flagged', 'Flagged'),
    text('retired', 'Retired', { catalogRetired: true }),
    text('synthetic', 'Synthetic', { syntheticTest: true }),
    text('outside', 'Outside', { author: 'Other' }),
  ];
  let route;
  const context = vm.createContext({
    app: { get: (_, handler) => { route = handler; } }, getBoth: path => path,
    requirePigReadAccess: async () => ({}),
    getRankedTextScores: async contentReads => {
      assert.deepEqual(await contentReads.excerpts, excerptItems);
      assert.deepEqual((await contentReads.graphics).map(item => item.imageId), ['graphic']);
      assert.equal((await contentReads.fullPoems)[0].imageId, 'full');
      assert.ok((await contentReads.flaggedIds).has('flagged'));
      return {payload: {aggregated: [
        {imageId: 'ranked', totalVotes: 2, score: 4},
        {imageId: 'voted-sibling', totalVotes: 1, score: -1},
      ]}};
    },
    readContentCacheMetadata: async () => ({ generation }),
    getAllFrom: async collection => {
      reads++;
      return ({
        excerpts: [...excerptItems],
        fullPoems: [text('full', 'Full', { imageType: 'FP' })],
      })[collection];
    },
    getAllContentCached: async () => {
      snapshotReads++;
      return [
        ...excerptItems,
        text('full', 'Full', { imageType: 'FP' }),
        text('graphic', 'Illustrated', { imageType: 'QI' }),
        text('video', 'Video', { imageType: 'VV' }),
      ];
    },
    COLLECTIONS: {excerpts: 'excerpts', fullPoems: 'fullPoems', graphics: 'graphics'},
    getFlaggedContentIds: async () => new Set(['flagged']),
    normalizeText: value => String(value ?? '').trim(),
    normalizeKey: value => String(value ?? '').trim().toLowerCase(),
    normalizeCatalogLookupKey: value => String(value ?? '').trim().toLowerCase(),
    bookReviewAttributes: row => ({chapbookContestWinner: row.author === 'Winner'}),
    uniq: values => [...new Set(values)],
    countPoemCharacters: () => 0, countPoemLines: () => 0, createHash,
  });
  vm.runInContext(
    source.slice(source.indexOf('function normalizeTextBody('), source.indexOf('async function getScoreboardBootstrapPayload(')) +
    source.slice(source.indexOf('app.get(getBoth("/pig/ranked-texts")'), source.indexOf('app.post(getBoth("/admin/scoreboard/refresh")')),
    context
  );
  const request = async query => {
    let payload;
    await route({query}, {set() {}, json: data => { payload = JSON.parse(JSON.stringify(data)); }});
    return payload;
  };
  request.reads = () => reads;
  request.snapshotReads = () => snapshotReads;
  request.retireRanked = () => {
    const index = excerptItems.findIndex(item => item.imageId === 'ranked');
    excerptItems.splice(index, 1);
    generation++;
  };
  return request;
}

test('ranked lane keeps defaults and accepts explicit zero thresholds', async () => {
  const request = rankedTextsRoute();
  const defaults = await request({chapbookWinners: '1', withoutGraphics: '1'});
  assert.deepEqual(defaults.rows.map(row => row.sourceRecordId), ['ranked']);
  const expanded = await request({chapbookWinners: '1', minScore: '0', minVotes: '0'});
  assert.equal(expanded.filters.minScore, 0);
  assert.equal(expanded.filters.minVotes, 0);
  assert.ok(expanded.rows.some(row => row.sourceRecordId === 'fresh'));
  const invalid = await request({minScore: 'Infinity', minVotes: ' '});
  assert.equal(invalid.filters.minScore, 1);
  assert.equal(invalid.filters.minVotes, 1);
});

test('unrated winner lane returns only eligible excerpts with no votes across siblings', async () => {
  const payload = await rankedTextsRoute()({
    chapbookWinners: '1', withoutGraphics: '1', unrated: '1', types: 'FP,EXC',
  });
  assert.deepEqual(payload.filters.types, ['EXC']);
  assert.equal(payload.filters.unratedOnly, true);
  assert.deepEqual(payload.rows.map(row => [row.sourceRecordId, row.totalVotes, row.score]), [['fresh', 0, 0]]);
});


test('ranked searches share snapshot graphics and refresh when the content generation changes', async () => {
  const request = rankedTextsRoute();
  const query = { chapbookWinners: '1', withoutGraphics: '1' };
  const [first, concurrent] = await Promise.all([request(query), request(query)]);
  assert.deepEqual(first.rows, concurrent.rows);
  assert.equal(request.reads(), 2);
  assert.equal(request.snapshotReads(), 1);
  assert.deepEqual((await request(query)).rows, first.rows);
  assert.equal(request.reads(), 2);
  assert.equal(request.snapshotReads(), 1);

  request.retireRanked();
  assert.deepEqual((await request(query)).rows, []);
  assert.equal(request.reads(), 4);
  assert.equal(request.snapshotReads(), 2);
});

test('P.I.G. reads matching scores and falls back for a stale or replaced copy', async () => {
  const builtAt = { isEqual: other => other === builtAt };
  const meta = { builtAt, version: 4, rankedTextScores: { id: 'current', builtAt } };
  const scoreboard = { payload: { aggregated: [{ imageId: 'ranked', score: 18 }] } };
  const scores = { id: 'current', aggregated: scoreboard.payload.aggregated };
  let downloads = 0;
  let fallbacks = 0;
  const context = vm.createContext({
    db: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => meta }) }) }) },
    storage: { bucket: () => ({ file: () => ({
      download: async () => {
        downloads++;
        return [Buffer.from(JSON.stringify(scores))];
      },
    }) }) },
    COLLECTIONS: { systemState: 'systemState' },
    SCOREBOARD_SNAPSHOT_DOC_ID: 'scoreboard',
    SCOREBOARD_SNAPSHOT_TTL_MS: 30_000,
    SCOREBOARD_SNAPSHOT_VERSION: 4,
    RANKED_TEXT_SCORES_PATH: 'scores',
    timestampToMs: () => Date.now(),
    getScoreboardPayloadFromSnapshot: async () => { fallbacks++; return scoreboard; },
  });
  vm.runInContext(source.slice(source.indexOf('async function getRankedTextScores('),
    source.indexOf('async function writeScoreboardSnapshot(')), context);

  const result = await context.getRankedTextScores({});
  assert.equal(result.source, 'snapshot');
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), scoreboard.payload);
  assert.equal(downloads, 1);
  assert.equal(fallbacks, 0);

  scores.id = 'another-write';
  assert.equal(await context.getRankedTextScores({}), scoreboard);
  meta.rankedTextScores.builtAt = {};
  assert.equal(await context.getRankedTextScores({}), scoreboard);
  assert.equal(downloads, 2);
  assert.equal(fallbacks, 2);
});
