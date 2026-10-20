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
