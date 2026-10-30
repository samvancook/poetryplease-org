import test from 'node:test';
import assert from 'node:assert/strict';
import { bookReviewAttributes, matchesBookReviewGroup, bookReviewGroups } from './book-review-groups.js';
import { classicMobileTarget } from '../public/mobile-entry.js';

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
