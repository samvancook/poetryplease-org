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
    getScoreboardPayloadFromSnapshot: async ({contentReads}) => {
      assert.equal(await contentReads.excerpts, excerptItems);
      assert.equal((await contentReads.graphics)[0].imageId, 'graphic');
      assert.equal((await contentReads.fullPoems)[0].imageId, 'full');
      assert.ok((await contentReads.flaggedIds).has('flagged'));
      return {payload: {aggregated: [
        {imageId: 'ranked', totalVotes: 2, score: 4},
        {imageId: 'voted-sibling', totalVotes: 1, score: -1},
      ]}};
    },
    getAllFrom: async collection => ({
      excerpts: excerptItems,
      fullPoems: [text('full', 'Full', { imageType: 'FP' })],
      graphics: [text('graphic', 'Illustrated', { imageType: 'QI' })],
    })[collection],
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
  return async query => {
    let payload;
    await route({query}, {json: data => { payload = JSON.parse(JSON.stringify(data)); }});
    return payload;
  };
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
