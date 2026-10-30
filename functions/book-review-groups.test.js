import test from 'node:test';
import assert from 'node:assert/strict';
import { bookReviewAttributes, matchesBookReviewGroup, bookReviewGroups } from './book-review-groups.js';
import { classicMobileTarget, chapbookLaneFilters } from '../public/mobile-entry.js';

const winner = { book: 'BLACK BOX FLIGHT RECORDER', author: 'Aishatu Ado' };
test('book attributes use contest year rather than publication year and verify author', () => {
  assert.deepEqual(bookReviewAttributes(winner), { chapbookContestWinner: true, chapbookContestYear: 2025, chapbookContestResult: 'winner' });
  assert.equal(bookReviewAttributes({ ...winner, author: 'Another poet' }), null);
  assert.equal(matchesBookReviewGroup({ book: 'Bound', author: 'Claire Schwartz' }, { bookGroup: 'chapbook-winners', contestYear: 2016 }), true);
  assert.equal(matchesBookReviewGroup(winner, { bookGroup: 'chapbook-winners', contestYear: 2027 }), false);
  assert.equal(matchesBookReviewGroup(winner, { bookGroup: 'unknown' }), false);
});
test('published runners-up retain their actual award metadata without entering the winner lane', () => {
  const runner = { book: 'Coin Laundry at Midnight', author: 'Carson Wolfe' };
  assert.equal(bookReviewAttributes(runner).chapbookContestResult, 'runner-up');
  assert.equal(matchesBookReviewGroup(runner, { bookGroup: 'chapbook-winners' }), false);
  assert.equal(matchesBookReviewGroup(runner, {}), true);
  assert.equal(matchesBookReviewGroup(runner, { contestYear: 2024 }), false);
  assert.deepEqual(bookReviewGroups()[0].years, Array.from({length: 14}, (_, i) => 2025 - i));
});
test('book attributes apply across formats and legacy punctuation but not another authors work', () => {
  for (const imageType of ['FP', 'QI', 'INT', 'EXC', 'FPI']) {
    assert.equal(matchesBookReviewGroup({ ...winner, imageType }, { bookGroup: 'chapbook-winners' }), true);
  }
  assert.equal(matchesBookReviewGroup({ book: 'me aunt jemima and the nailgun.', author: 'Aziza Barnes' }, { bookGroup: 'chapbook-winners' }), true);
  assert.equal(matchesBookReviewGroup({ book: 'Sadness Workshop', author: 'Kai Carlson-Wee' }, { bookGroup: 'chapbook-winners' }), false);
});
test('assigned winner review links stay in primary Swipe while existing book workflows retain routing', () => {
  assert.equal(classicMobileTarget('/m', '?bookGroup=chapbook-winners&type=FP&contestYear=2024&book=Glandscapes'), '');
  assert.equal(classicMobileTarget('/m', '?book=Roads'), '/m-classic?book=Roads');
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const apiSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
function apiDefinition(name) {
  const start = apiSource.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  return apiSource.slice(start, apiSource.indexOf('\n}\n', start) + 2);
}
function embedHarness(items, ratings = {}) {
  let handler;
  const context = vm.createContext({
    app: { get: (_path, fn) => { handler = fn; } }, getBoth: p => p,
    normalizeText: v => String(v || '').trim(), normalizeKey: v => String(v || '').trim().toLowerCase(),
    matchesBookReviewGroup, contentReleaseCatalogs: item => [item.releaseCatalog],
    parseOptionalCount: () => null, parseBoolean: () => false,
    getAllContentCached: async () => items, getFlaggedContentIds: async () => new Set(['flagged']),
    getRatingsSummaryCached: async () => ratings,
    excludeFlaggedContent: (all, flags) => all.filter(item => !flags.has(item.imageId)),
    excludeBrokenContent: all => all.filter(item => !item.broken),
  });
  const helpers = ['prioritizeVisualContent', 'matchesFilterValue', 'normalizeCatalogFilterValue', 'matchesCatalogFilterValue', 'matchesRequestedType', 'filterContentByFeedFilters'].map(apiDefinition).join('\n');
  const start = apiSource.indexOf('app.get(getBoth("/embedBookLead")');
  vm.runInContext(helpers + '\n' + apiSource.slice(start, apiSource.indexOf('// Reading a related poem', start)), context);
  return async query => {
    let status = 200, data;
    await handler({ query }, { status(code) { status = code; return this; }, set() {}, json(value) { data = JSON.parse(JSON.stringify(value)); } });
    return { status, data };
  };
}
test('actual public winner embed intersects group/year/book/type, ranks eligible assets and excludes staff-only FP', async () => {
  const qi = { imageType: 'QI', author: 'Mickie Kennedy', book: 'Glandscapes', imageUrl: 'https://example.test/image.png' };
  const items = [
    {...qi, imageId:'low'}, {...qi, imageId:'high'}, {...qi, imageId:'flagged'},
    {...qi, imageId:'broken', broken:true}, {...qi, imageId:'excluded'}, {...qi, imageId:'review', reviewOnly:true},
    {...qi, imageId:'runner', author:'Carson Wolfe', book:'Coin Laundry at Midnight'},
    {...qi, imageId:'wrong-author', author:'Another author'},
    {...qi, imageId:'other-year', author:'Claire Schwartz', book:'Bound'},
    {...qi, imageId:'fp', imageType:'FP', fullText:'private review text'},
  ];
  const call = embedHarness(items, { high:{score:99}, low:{score:1}, excluded:{authorExcluded:true,score:1000} });
  const result = await call({bookGroup:'chapbook-winners',contestYear:'2024',book:'Glandscapes'});
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.pool.map(item => item.id), ['high','low']);
  assert.equal(result.data.type, 'QI'); assert.equal(result.data.contestYear, '2024');
  assert.equal((await call({bookGroup:'chapbook-winners',type:'FP'})).data.pool.length, 0);
  assert.equal((await call({bookGroup:'unknown'})).status, 400);
  assert.equal((await call({contestYear:'2024',type:'QI'})).status, 400);
  assert.equal((await call({book:'Bound',type:'QI'})).data.lead.id, 'other-year');
});
test('embed click-through keeps winner/year selection without narrowing the whole lane to one book', () => {
  const shell = readFileSync(new URL('../public/embed.html', import.meta.url), 'utf8');
  const start = shell.indexOf('const deepLink =');
  const code = shell.slice(start, shell.indexOf('\n      };', start) + 9) + '\ndeepLink';
  const deepLink = vm.runInNewContext(code, { URL, location:{origin:'https://poetryplease.org'}, bookGroup:'chapbook-winners',contestYear:'2024',book:'',catalog:'',type:'QI',contestEvent:'',text:v=>String(v||'') });
  const url = new URL(deepLink({id:'winner-item',book:'Glandscapes'}),'https://poetryplease.org');
  assert.equal(url.searchParams.get('bookGroup'),'chapbook-winners');
  assert.equal(url.searchParams.get('contestYear'),'2024');
  assert.equal(url.searchParams.get('item'),'winner-item');
  assert.equal(url.searchParams.has('book'),false);
});

test('public winner click-through stays scoped in Swipe and does not replace author ownership', () => {
  const query = '?bookGroup=chapbook-winners&type=QI&contestYear=2024&item=winner-item';
  assert.equal(classicMobileTarget('/m', query), '');
  assert.deepEqual(chapbookLaneFilters(query), {type:'QI',bookGroup:'chapbook-winners',contestYear:'2024',book:'',author:''});
  assert.equal(chapbookLaneFilters(query, {authorOnly:true}), null);
  assert.equal(chapbookLaneFilters('?bookGroup=chapbook-winners').type, 'QI');
  assert.equal(chapbookLaneFilters('?bookGroup=chapbook-winners', {staff:true}).type, 'FP');
});
