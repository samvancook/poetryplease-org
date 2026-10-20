import test from 'node:test';
import assert from 'node:assert/strict';
import { classicMobileTarget, cachedMobileTarget } from '../public/mobile-entry.js';
import { originalViewerUrl } from '../public/scroll-feed-core.js';

test('normal mobile visits and campaign tracking use Swipe', () => {
  assert.equal(classicMobileTarget('/m'), '');
  assert.equal(classicMobileTarget('/m', '?utm_source=email&fbclid=example'), '');
  assert.equal(classicMobileTarget('/m', '?view=mobile'), '');
  assert.equal(classicMobileTarget('/m', '?mobile=1'), '');
});
test('cached defaults move to Swipe while specific classic links continue without interruption', () => {
  assert.equal(cachedMobileTarget('/m', '?view=mobile'), '/posts-swipe?view=mobile');
  assert.equal(cachedMobileTarget('/m', '?book=Roads&type=EXC'), '');
  assert.equal(cachedMobileTarget('/m', '?authorInvite=example-token'), '');
  assert.equal(cachedMobileTarget('/m-classic'), '');
});
test('single-item links target the classic variant with item and author scope intact', () => {
  const url = new URL(originalViewerUrl({ id: 'graphic & one' }, { author: 'Matt Mason', authorPreview: '1', locked: '1' }), 'https://poetryplease.org');
  assert.equal(url.pathname, '/m-classic');
  assert.equal(url.searchParams.get('item'), 'graphic & one');
  assert.equal(url.searchParams.get('author'), 'Matt Mason');
  assert.equal(url.searchParams.get('authorPreview'), '1');
});
test('legacy item, book, lane, tour and invitation queries retain their exact values', () => {
  for (const query of ['?book=Roads&type=EXC', '?item=graphic%20one', '?authorInvite=example-token', '?tour=1', '?author=Matt%20Mason&type=PROMO&locked=1', '?event=Fall&catalog=Contest&type=QI']) {
    assert.equal(classicMobileTarget('/m', query), '/m-classic' + query);
  }
});
test('supported staff author-preview scope stays in Swipe; incomplete previews retain the classic route', () => {
  assert.equal(classicMobileTarget('/m', '?author=Matt%20Mason&authorPreview=1&locked=1'), '');
  assert.equal(classicMobileTarget('/m', '?authorPreview=1'), '/m-classic?authorPreview=1');
});
test('variant and desktop routes never bounce through the mobile entry router', () => {
  for (const path of ['/m-classic', '/mobile.html', '/app', '/posts-swipe']) {
    assert.equal(classicMobileTarget(path, '?book=Roads&type=EXC'), '');
  }
});
