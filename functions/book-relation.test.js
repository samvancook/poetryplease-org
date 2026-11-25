import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScrollItem, bookLine } from '../public/scroll-feed-core.js';

const row = (relation) => ['Poet', 'Poem', 'A Book', 'ID-1', 'https://x.test/a.png', '', 'Button', 'EXC', 'text',
  '', '', 0, 0, 0, 0, '', '', null, null, '', relation];

test('feed rows carry bookRelation in slot 20', () => {
  assert.equal(normalizeScrollItem(row('related')).bookRelation, 'related');
  assert.equal(normalizeScrollItem(row('')).bookRelation, '');
  assert.equal(normalizeScrollItem(row('related').slice(0, 19)).bookRelation, '');
});

test('book line wording follows bookRelation', () => {
  assert.deepEqual(bookLine({ book: 'A Book' }), { prefix: '', book: 'A Book', related: false });
  assert.deepEqual(bookLine({ book: 'A Book', bookRelation: 'related' }), { prefix: 'More from this poet', book: 'A Book', related: true });
  assert.equal(bookLine({ book: 'A Book', bookRelation: 'none' }), null);
  assert.equal(bookLine({ book: '' }), null);
});
test('photo cards carry their text focus; other cards never do', async () => {
  const { normalizeScrollItem } = await import('../public/scroll-feed-core.js');
  const row = (type, focus) => { const r = ['A', 'T', 'B', 'id-1', 'https://example.com/a.jpg', '', '', type, '']; r[21] = focus; return r; };
  assert.deepEqual(normalizeScrollItem(row('INT', [0.1, 0.2, 0.8, 0.9])).focus, [0.1, 0.2, 0.8, 0.9]);
  assert.equal(normalizeScrollItem(row('QI', [0.1, 0.2, 0.8, 0.9])).focus, null);
  assert.equal(normalizeScrollItem(row('INT', [0.8, 0.2, 0.1, 0.9])).focus, null);
  assert.equal(normalizeScrollItem(row('INT')).focus, null);
});
