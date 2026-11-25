import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomAround, boundGraphicZoom } from '../public/graphic-zoom.js';

test('pinching keeps the point under the fingers and follows their midpoint', () => {
  assert.deepEqual(zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 40, y: -30 }), { scale: 2, x: -40, y: 30 });
  assert.deepEqual(zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 40, y: -30 }, { x: 50, y: -20 }), { scale: 2, x: -30, y: 40 });
});
test('panning uses the contained graphic bounds, including black letterboxing', () => {
  const size = { width: 400, height: 600, imageWidth: 1000, imageHeight: 1000 };
  assert.deepEqual(boundGraphicZoom({ scale: 1, x: 100, y: -100 }, size), { scale: 1, x: 0, y: -0 });
  assert.deepEqual(boundGraphicZoom({ scale: 2, x: 900, y: -900 }, size), { scale: 2, x: 200, y: -100 });
});
test('zoom is limited to 1–4× and resetting always centers the graphic', () => {
  const size = { width: 400, height: 600, imageWidth: 1000, imageHeight: 1500 };
  assert.deepEqual(boundGraphicZoom({ scale: .2, x: -500, y: 500 }, size), { scale: 1, x: -0, y: 0 });
  assert.equal(boundGraphicZoom({ scale: 12, x: 0, y: 0 }, size).scale, 4);
});
test('a photo starts on its poem text, filling the frame without going past 3x', async () => {
  const { focusStart } = await import('../public/graphic-zoom.js');
  const size = { width: 412, height: 611, imageWidth: 1024, imageHeight: 1024 };
  // Rewrites (Kevin Kantor): the page sits right of center on a wood table.
  const start = focusStart([0.397, 0.105, 0.8062, 0.9438], size);
  assert.ok(start.scale > 1.7 && start.scale < 1.8, 'fills the frame height with the text');
  assert.ok(start.x < 0, 'moves the photo left so the text is centered');
  assert.equal(focusStart([0.45, 0.45, 0.55, 0.55], size).scale, 3);
  // No focus, a broken one, or one that would barely help: the whole photo.
  for (const focus of [null, [0, 0, 1, 1], [0.5, 0.2, 0.4, 0.8], [0, 0, 2, 1], 'x']) {
    assert.deepEqual(focusStart(focus, size), { scale: 1, x: 0, y: 0 });
  }
});
