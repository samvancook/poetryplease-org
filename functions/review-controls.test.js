import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createReviewIcon } from '../public/review-icons.js';

test('review wording stays Love, Meh, Like, Dislike while stored vote values stay unchanged', () => {
  const source = readFileSync(new URL('../public/scroll.js', import.meta.url), 'utf8');
  const declaration = source.match(/^const votes = .*;$/m)?.[0];
  assert.ok(declaration);
  const options = vm.runInNewContext(declaration + '\nvotes');
  assert.deepEqual(Array.from(options, option => option[2]), ['Love', 'Meh', 'Like', 'Dislike']);
  assert.deepEqual(Array.from(options, option => option[0]), ['moved me', 'meh', 'like', 'dislike']);
});

test('primary Swipe uses the outlined icon treatment', () => {
  const shell = readFileSync(new URL('../public/posts-swipe.html', import.meta.url), 'utf8');
  assert.match(shell, /data-review-icons="outline"/);
  assert.match(shell, /class="[^"]*posts-swipe-outline[^"]*"/);
  assert.match(shell, /href="\/posts-swipe-outline\.css\?v=/);
});

test('each review icon retains a black fill and its colored edge', () => {
  const previous = globalThis.document;
  globalThis.document = { createElementNS: () => ({ attributes: {}, children: [],
    setAttribute(name, value) { this.attributes[name] = value; },
    append(child) { this.children.push(child); } }) };
  try {
    for (const [value, color] of [['moved me', '#ff5365'], ['meh', '#f5ce48'], ['like', '#f5c45b'], ['dislike', '#f5c45b']]) {
      const icon = createReviewIcon(value);
      assert.equal(icon.attributes.fill, '#000');
      assert.equal(icon.attributes.stroke, color);
      assert.equal(icon.attributes['aria-hidden'], 'true');
      assert.ok(icon.children.length);
    }
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
