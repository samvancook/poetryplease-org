import { test } from "node:test";
import assert from "node:assert/strict";
import { fixGraphicTitle, validTitleFixItem, bucketObjectName } from "./graphic-title-fix.js";

const OLD = "https://storage.googleapis.com/poetrypleasebucket/DBAT%20-%20INT%20-%20hi%20-%20Promt%20From%20My%20Father%20-%20Schminkey.jpeg";
const NEW = "https://storage.googleapis.com/poetrypleasebucket/DBAT%20-%20INT%20-%20hi%20-%20Prompt%20From%20My%20Father%20-%20Schminkey.jpeg";
const item = { id: "DBAT-INT-1", expectTitle: "Promt From My Father", title: "Prompt From My Father", expectImageUrl: OLD, imageUrl: NEW };

function deps(data, { exists = true } = {}) {
  const updates = [];
  return {
    updates,
    getGraphic: async () => data,
    objectExists: async () => exists,
    updateGraphic: async (id, patch) => updates.push({ id, patch }),
    now: () => Date.parse("2026-11-24T00:00:00Z"),
  };
}

test("bucketObjectName decodes bucket URLs only", () => {
  assert.equal(bucketObjectName(OLD), "DBAT - INT - hi - Promt From My Father - Schminkey.jpeg");
  assert.equal(bucketObjectName("https://example.com/x.jpg"), "");
});

test("validTitleFixItem", () => {
  assert.equal(validTitleFixItem(item), true);
  assert.equal(validTitleFixItem({ ...item, imageUrl: "https://example.com/a.jpg" }), false);
  assert.equal(validTitleFixItem({ ...item, id: "a/b" }), false);
});

test("fixes title, poem, image URL and file name, keeping old values", async () => {
  const d = deps({ title: "Promt From My Father", poem: "Promt From My Father", imageUrl: OLD,
    sourceFileName: "DBAT - INT - hi - Promt From My Father - Schminkey.jpeg" });
  const result = await fixGraphicTitle(item, d);
  assert.equal(result.status, "fixed");
  const { patch } = d.updates[0];
  assert.equal(patch.title, "Prompt From My Father");
  assert.equal(patch.poem, "Prompt From My Father");
  assert.equal(patch.imageUrl, NEW);
  assert.equal(patch.sourceFileName, "DBAT - INT - hi - Prompt From My Father - Schminkey.jpeg");
  assert.equal(patch.titleFix.before.imageUrl, OLD);
  assert.equal(patch.titleFix.before.title, "Promt From My Father");
});

test("dry run writes nothing", async () => {
  const d = deps({ title: "Promt From My Father", imageUrl: OLD });
  const result = await fixGraphicTitle(item, d, { dryRun: true });
  assert.equal(result.status, "would_fix");
  assert.equal(result.newImageExists, true);
  assert.equal(d.updates.length, 0);
});

test("skips when the copy is missing or the record changed", async () => {
  assert.equal((await fixGraphicTitle(item, deps({ title: "Promt From My Father", imageUrl: OLD }, { exists: false }))).reason, "new_image_missing");
  assert.equal((await fixGraphicTitle(item, deps({ title: "Something else", imageUrl: OLD }))).reason, "title_changed");
  assert.equal((await fixGraphicTitle(item, deps({ title: "Promt From My Father", imageUrl: "https://x" }))).reason, "image_changed");
  assert.equal((await fixGraphicTitle(item, deps(null))).reason, "graphic_missing");
});

test("rerun reports already_fixed", async () => {
  const d = deps({ title: "Prompt From My Father", imageUrl: NEW });
  assert.equal((await fixGraphicTitle(item, d)).status, "already_fixed");
  assert.equal(d.updates.length, 0);
});
