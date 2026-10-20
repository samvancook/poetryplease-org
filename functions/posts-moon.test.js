import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { moonPosition } from '../public/posts-moon.js';

test('the logo moves slower than the feed and retraces when scrolling back', () => {
  const start = moonPosition(0, 844, 480);
  assert.ok(Math.abs((start - moonPosition(100, 844, 480)) - 18) < .00001);
  assert.equal(moonPosition(0, 844, 480), start);
  assert.equal(moonPosition(-100, 844, 480), start);
});

test('each complete scroll cycle returns the logo to the same position', () => {
  const cycle = (844 + 480 + 96) / .18;
  for (const start of [0, 200, 1900]) {
    assert.ok(Math.abs(moonPosition(start, 844, 480) - moonPosition(start + cycle, 844, 480)) < .00001);
  }
});

test('the wrap occurs with the entire logo beyond the viewport at both ends', () => {
  const height = 844, diameter = 480;
  const wrap = (height + diameter + 96) * .48 / .18;
  const before = moonPosition(wrap - 1, height, diameter);
  const after = moonPosition(wrap + 1, height, diameter);
  assert.ok(before + diameter < 0, 'the old cycle is fully above the screen');
  assert.ok(after > height, 'the new cycle begins fully below the screen');
});

test('reduced motion stays still on scroll; normal motion coalesces scroll events', () => {
  const events = {}, frames = [];
  const motion = { matches: true, addEventListener: (_type, fn) => { events.preference = fn; } };
  const moon = { style: {}, getBoundingClientRect: () => ({ width: 480 }) };
  const context = vm.createContext({ document: { getElementById: () => moon },
    innerHeight: 844, scrollY: 0, matchMedia: () => motion,
    addEventListener: (type, fn) => { events[type] = fn; }, requestAnimationFrame: fn => frames.push(fn) });
  const source = readFileSync(new URL('../public/posts-moon.js', import.meta.url), 'utf8').replace('export function', 'function');
  vm.runInContext(source, context);
  const initial = moon.style.transform;
  context.scrollY = 1000; events.scroll();
  assert.equal(frames.length, 0);
  assert.equal(moon.style.transform, initial);
  motion.matches = false; events.preference();
  assert.notEqual(moon.style.transform, initial);
  events.scroll(); events.scroll(); events.scroll();
  assert.equal(frames.length, 1);
});
