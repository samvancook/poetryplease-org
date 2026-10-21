import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingReturn } from '../public/swipe-reading.js';
import { appendPoemLinks } from '../public/poem-links.js';

test('nested poem/video visits return the exact original feed snapshot once', () => {
  const card = { id: 'original', selectedVote: 'meh', scrollTop: 45 };
  const origin = { cards: [card], y: 1688, seed: 'same-ranked-session', cursor: 'page3' };
  let captures = 0;
  const shown = [], restored = [];
  const flow = createReadingReturn({ capture: () => { captures++; return origin; },
    show: (item, first) => shown.push([item.id, first]), restore: saved => restored.push(saved) });
  flow.open({ id: 'canonical-fp' });
  flow.open({ id: 'canonical-video' });
  assert.equal(captures, 1);
  assert.deepEqual(shown, [['canonical-fp', true], ['canonical-video', false]]);
  flow.close(); flow.close();
  assert.deepEqual(restored, [origin]);
  assert.equal(restored[0].cards[0], card);
  assert.equal(flow.active, false);
});

test('account/feed changes discard the saved origin without restoring it', () => {
  let restored = 0, captured = 0;
  const flow = createReadingReturn({ capture: () => ++captured, show() {}, restore: () => restored++ });
  flow.open({ id: 'old-account-fp' });
  flow.discard(); flow.close();
  assert.equal(restored, 0);
  flow.open({ id: 'new-account-fp' }); flow.close();
  assert.equal(captured, 2);
  assert.equal(restored, 1);
});

test('plain related-link clicks use Swipe return flow; modified clicks retain canonical links', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new EventTarget() };
  try {
    const links = [], opened = [];
    appendPoemLinks({ append: link => links.push(link) }, {
      fullPoem: ['Poet', 'Poem', '', 'canonical-fp', '', '', '', 'FP', 'one\ntwo'],
      videos: [['Poet', 'Poem', '', 'canonical-video', 'https://youtu.be/abc', '', '', 'YT', '']],
    }, item => opened.push(item.id));
    assert.equal(links.length, 2);
    assert.equal(links[0].href, '/m?item=canonical-fp');
    assert.equal(links[1].href, '/m?item=canonical-video');
    for (const properties of [{button: 0, ctrlKey: true}, {button: 1}, {button: 0}]) {
      const event = new Event('click', { cancelable: true });
      Object.assign(event, properties);
      links[0].dispatchEvent(event);
      assert.equal(event.defaultPrevented, properties.button === 0 && !properties.ctrlKey);
    }
    assert.deepEqual(opened, ['canonical-fp']);
  } finally { globalThis.document = previous; }
});
