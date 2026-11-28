import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preferTypewriter, typewriterIdSet } from './typewriter-feed.js';

const item = id => ({ imageId: id });
const page = ids => ({ items: ids.map(item), hasMore: true, nextCursor: 'mobile:x', feedMode: 'mobile-community' });

test('two unserved typewriter images lead the page, then the regular page fills it', () => {
  const pool = ['A', 'B', 'T1', 'T2', 'T3'].map(item);
  const out = preferTypewriter(page(['A', 'B', 'T1']), pool, { typewriterIds: new Set(['t1', 't2', 't3']), limit: 3, seed: 's' });
  assert.equal(out.items.length, 3);
  assert.ok(out.items.slice(0, 2).every(i => i.imageId.startsWith('T')));
  assert.equal(new Set(out.items.map(i => i.imageId)).size, 3);
  assert.equal(out.feedMode, 'mobile-community');
  assert.equal(out.nextCursor, 'mobile:' + out.items.at(-1).imageId.toLowerCase());
});

test('served typewriter images are not repeated, and the regular page returns once they run out', () => {
  const pool = ['A', 'B', 'C', 'T1'].map(item);
  const ids = new Set(['t1']);
  assert.deepEqual(preferTypewriter(page(['A', 'B', 'C']), pool, { typewriterIds: ids, servedIds: ['T1'], limit: 3 }).items.map(i => i.imageId), ['A', 'B', 'C']);
  const one = preferTypewriter(page(['A', 'B', 'C']), pool, { typewriterIds: ids, limit: 3 });
  assert.deepEqual(one.items.map(i => i.imageId), ['T1', 'A', 'B']);
  assert.equal(one.hasMore, true);
});

test('the shipped typewriter list is a non-empty set of quote image ids', () => {
  const ids = typewriterIdSet(JSON.parse(readFileSync(new URL('./typewriter-qi-ids.json', import.meta.url), 'utf8')));
  assert.ok(ids.size > 400);
  assert.ok([...ids].every(id => id === id.toLowerCase()));
});
