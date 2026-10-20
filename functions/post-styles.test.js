import test from 'node:test';
import assert from 'node:assert/strict';

function stylesheet(href) {
  const events = {};
  return {
    href,
    addEventListener: (name, handler) => { events[name] = handler; },
    finish: (name = 'load') => events[name]?.(),
  };
}

test('a cached shell upgrades both layout styles before rendering can continue', async () => {
  const { syncPostStyles } = await import('../public/post-cards.js');
  const links = [stylesheet('/posts.css?v=20261019a'), stylesheet('/posts-continuous.css?v=20261019a')];
  let ready = false;
  const pending = syncPostStyles({ baseURI: 'https://poetryplease.org/posts-continuous', querySelectorAll: () => links }).then(() => { ready = true; });
  assert.ok(links.every(link => link.href.endsWith('?v=20261020a')));
  await Promise.resolve();
  assert.equal(ready, false);
  links[0].finish();
  await Promise.resolve();
  assert.equal(ready, false);
  links[1].finish();
  await pending;
  assert.equal(ready, true);
});

test('current layouts, moon decoration, and unrelated or external styles remain untouched', async () => {
  const { syncPostStyles } = await import('../public/post-cards.js');
  const urls = ['/posts.css?v=20261020a', '/posts-moon.css?v=20261019a', '/scroll.css?v=20261019c', 'https://example.com/posts.css?v=old'];
  const links = urls.map(stylesheet);
  await syncPostStyles({ baseURI: 'https://poetryplease.org/posts-moon', querySelectorAll: () => links });
  assert.deepEqual(links.map(link => link.href), urls);
});
