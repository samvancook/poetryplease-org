import test from "node:test";
import assert from "node:assert/strict";
import { setPhotoFocus, validPhotoFocusItem } from "./graphic-photo-focus.js";

const url = "https://storage.googleapis.com/poetrypleasebucket/a.jpg";
const deps = (docs) => {
  const writes = [];
  return { writes, getGraphic: async (id) => docs[id] || null, updateGraphic: async (id, patch) => { writes.push({ id, patch }); },
    deleteValue: "<delete>", now: () => 1 };
};

test("only well-formed focus items are accepted", () => {
  assert.ok(validPhotoFocusItem({ id: "A", expectImageUrl: url, focus: [0.1, 0.1, 0.9, 0.9] }));
  assert.ok(validPhotoFocusItem({ id: "A", expectImageUrl: url, focus: null }));
  for (const bad of [{ id: "A/B", expectImageUrl: url, focus: null }, { id: "A", focus: null },
    { id: "A", expectImageUrl: url, focus: [0.9, 0.1, 0.1, 0.9] }, { id: "A", expectImageUrl: url, focus: [0, 0, 1.2, 1] }]) {
    assert.equal(validPhotoFocusItem(bad), false);
  }
});

test("a photo gets its focus only while its image is the one that was read", async () => {
  const d = deps({ A: { imageType: "INT", imageUrl: url }, B: { imageType: "INT", imageUrl: url + "?new" }, C: { imageType: "QI", imageUrl: url } });
  assert.equal((await setPhotoFocus({ id: "A", expectImageUrl: url, focus: [0.1, 0.2, 0.8, 0.9] }, d, { dryRun: true })).status, "would_update");
  assert.equal(d.writes.length, 0);
  assert.equal((await setPhotoFocus({ id: "A", expectImageUrl: url, focus: [0.1, 0.2, 0.8, 0.9] }, d, { source: "ocr-2026-11-25" })).status, "updated");
  assert.deepEqual(d.writes[0], { id: "A", patch: { photoFocus: [0.1, 0.2, 0.8, 0.9], photoFocusSource: "ocr-2026-11-25", photoFocusAt: 1 } });
  assert.equal((await setPhotoFocus({ id: "B", expectImageUrl: url, focus: [0.1, 0.2, 0.8, 0.9] }, d)).reason, "image_changed");
  assert.equal((await setPhotoFocus({ id: "C", expectImageUrl: url, focus: [0.1, 0.2, 0.8, 0.9] }, d)).reason, "not_a_photo");
  assert.equal((await setPhotoFocus({ id: "Z", expectImageUrl: url, focus: null }, d)).reason, "graphic_missing");
});

test("focus null takes a saved box off", async () => {
  const d = deps({ A: { imageType: "FPI", imageUrl: url, photoFocus: [0.1, 0.2, 0.8, 0.9] } });
  const result = await setPhotoFocus({ id: "A", expectImageUrl: url, focus: null }, d);
  assert.equal(result.status, "updated");
  assert.deepEqual(d.writes[0].patch, { photoFocus: "<delete>", photoFocusSource: "<delete>", photoFocusAt: "<delete>" });
});
