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
