import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  buildDisplayPreview, ensureDisplayPreview, graphicImageUrl, needsDisplayPreview, isPreviewableSourceUrl, summarizeDisplayPreviews,
  DISPLAY_PREVIEW_MAX_EDGE,
} from "./display-preview.js";

const SOURCE = "https://firebasestorage.googleapis.com/v0/b/poetry-please.firebasestorage.app/o/content-library%2Fgraphics%2Fa%2F1.png?alt=media";

// A large, noisy PNG stands in for a multi-megabyte original.
async function bigPng(width = 2400, height = 3000) {
  const raw = randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

test("only single QI, INT and FPI graphics hosted in our storage need a preview", () => {
  const base = { imageUrl: SOURCE, imageType: "QI" };
  assert.equal(needsDisplayPreview(base), true);
  assert.equal(needsDisplayPreview({ ...base, imageType: "int" }), true);
  assert.equal(needsDisplayPreview({ ...base, imageType: "VV" }), false);
  assert.equal(needsDisplayPreview({ ...base, assetSet: [{ assetUrl: SOURCE }] }), false);
  assert.equal(needsDisplayPreview({ ...base, imageUrl: "https://drive.google.com/file/d/x/view" }), false);
  assert.equal(needsDisplayPreview({ ...base, imageUrl: "http://storage.googleapis.com/b/a.png" }), false);
  assert.equal(needsDisplayPreview({ ...base, displayPreviewUrl: "https://x/p.webp", displayPreviewSourceUrl: SOURCE }), false);
  // A preview bound to an older image no longer counts.
  assert.equal(needsDisplayPreview({ ...base, displayPreviewUrl: "https://x/p.webp", displayPreviewSourceUrl: "https://old" }), true);
  assert.equal(needsDisplayPreview({ ...base, displayPreviewCheckedUrl: SOURCE }), false);
  assert.equal(isPreviewableSourceUrl("https://evil.example/storage.googleapis.com/a.png"), false);
});

test("the image a preview is bound to matches the feed's choice of image field", () => {
  assert.equal(graphicImageUrl({ thumbnailUrl: "t", url: "u" }), "t");
  assert.equal(graphicImageUrl({ imageUrl: "i", driveLink: "d" }), "i");
  assert.equal(graphicImageUrl({}), "");
});

test("a large original becomes a much smaller WebP no wider or taller than the limit", async () => {
  const source = await bigPng();
  const preview = await buildDisplayPreview(source);
  assert.ok(preview);
  assert.equal(preview.mimeType, "image/webp");
  assert.equal(Math.max(preview.width, preview.height), DISPLAY_PREVIEW_MAX_EDGE);
  assert.equal(preview.width, 1280);
  assert.ok(preview.buffer.length < source.length * 0.7);
  assert.equal((await sharp(preview.buffer).metadata()).format, "webp");
});

test("an image that is already light gets no preview, and a broken file is an error", async () => {
  const small = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } }).webp({ quality: 50 }).toBuffer();
  assert.equal(await buildDisplayPreview(small), null);
  await assert.rejects(buildDisplayPreview(Buffer.from("not an image")));
});

function fakeDoc(initial) {
  const state = { data: initial, updates: [] };
  const snap = () => ({ exists: state.data !== null, data: () => state.data });
  const docRef = { id: "doc-1", get: async () => snap() };
  const runTransaction = async (fn) => fn({
    get: async () => snap(),
    update(_ref, patch) { state.updates.push(patch); state.data = { ...state.data, ...patch }; },
  });
  return { state, docRef, runTransaction };
}
const fetchOf = (buffer, calls = []) => async (url) => {
  calls.push(url);
  return { ok: true, status: 200, headers: { get: () => String(buffer.length) }, arrayBuffer: async () => buffer };
};
function fakeStorage() {
  const saved = []; const deleted = [];
  return { saved, deleted, saveImage: async (args) => {
    saved.push(args);
    return { publicUrl: "https://firebasestorage.googleapis.com/preview/" + saved.length, file: { delete: async () => { deleted.push(args.storagePath); } } };
  } };
}

test("a graphic gets its preview stored and bound to the image it was made from", async () => {
  const { state, docRef, runTransaction } = fakeDoc({ imageUrl: SOURCE, imageType: "QI", title: "kept" });
  const storage = fakeStorage(); const calls = [];
  const result = await ensureDisplayPreview({
    docRef, runTransaction, saveImage: storage.saveImage, fetchImpl: fetchOf(Buffer.alloc(1000), calls),
    build: async () => ({ buffer: Buffer.alloc(100), width: 10, height: 10, mimeType: "image/webp" }), now: () => 42,
  });
  assert.equal(result.status, "attached");
  assert.deepEqual(calls, [SOURCE]);
  assert.equal(storage.saved[0].storagePath, "content-library/graphics/doc-1/display-preview-42.webp");
  assert.deepEqual(state.updates, [{ displayPreviewUrl: "https://firebasestorage.googleapis.com/preview/1", displayPreviewSourceUrl: SOURCE,
    displayPreviewBytes: 100, displayPreviewSourceBytes: 1000, displayPreviewBuiltAt: new Date(42).toISOString() }]);
  assert.equal(state.data.title, "kept");
  // A second run has nothing to do and downloads nothing.
  const again = await ensureDisplayPreview({ docRef, runTransaction, saveImage: storage.saveImage, fetchImpl: fetchOf(Buffer.alloc(1), calls) });
  assert.deepEqual(again, { status: "skipped", reason: "not_needed" });
  assert.equal(calls.length, 1);
});

test("if the image is replaced while the preview is built, nothing is attached and the file is removed", async () => {
  const { state, docRef, runTransaction } = fakeDoc({ imageUrl: SOURCE, imageType: "QI" });
  const storage = fakeStorage();
  const result = await ensureDisplayPreview({
    docRef, runTransaction, saveImage: storage.saveImage, fetchImpl: fetchOf(Buffer.alloc(1000)),
    build: async () => { state.data = { ...state.data, imageUrl: SOURCE + "&v=2" }; return { buffer: Buffer.alloc(100), width: 1, height: 1, mimeType: "image/webp" }; },
  });
  assert.deepEqual(result, { status: "skipped", reason: "image_changed" });
  assert.deepEqual(state.updates, []);
  assert.equal(storage.deleted.length, 1);
});

test("no gain is remembered so the same image is not retried; other cases are skipped untouched", async () => {
  const { state, docRef, runTransaction } = fakeDoc({ imageUrl: SOURCE, imageType: "QI" });
  const storage = fakeStorage();
  const result = await ensureDisplayPreview({ docRef, runTransaction, saveImage: storage.saveImage, fetchImpl: fetchOf(Buffer.alloc(1000)), build: async () => null });
  assert.equal(result.status, "no_gain");
  assert.deepEqual(state.updates, [{ displayPreviewCheckedUrl: SOURCE }]);
  assert.equal(storage.saved.length, 0);

  const missing = fakeDoc(null);
  assert.deepEqual(await ensureDisplayPreview({ docRef: missing.docRef, runTransaction: missing.runTransaction, saveImage: storage.saveImage }), { status: "skipped", reason: "missing" });
  const moved = fakeDoc({ imageUrl: SOURCE, imageType: "QI" });
  assert.deepEqual(await ensureDisplayPreview({ docRef: moved.docRef, expectedImageUrl: "https://other", runTransaction: moved.runTransaction, saveImage: storage.saveImage }), { status: "skipped", reason: "image_changed" });
});

test("a failed download or oversized source throws and changes nothing", async () => {
  const { state, docRef, runTransaction } = fakeDoc({ imageUrl: SOURCE, imageType: "QI" });
  const storage = fakeStorage();
  await assert.rejects(ensureDisplayPreview({ docRef, runTransaction, saveImage: storage.saveImage,
    fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }) }), /display_preview_source_http_404/);
  await assert.rejects(ensureDisplayPreview({ docRef, runTransaction, saveImage: storage.saveImage,
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => String(50 * 1024 * 1024) }, arrayBuffer: async () => Buffer.alloc(1) }) }), /too_large/);
  assert.deepEqual(state.updates, []);
  assert.equal(storage.saved.length, 0);
});

test("the backfill summary separates done, pending, stalled and ineligible graphics", () => {
  const g = (id, data) => ({ id, data: { imageType: "QI", imageUrl: SOURCE + id, ...data } });
  const summary = summarizeDisplayPreviews([
    g("b-pending", {}),
    g("a-pending", {}),
    g("done-old", { displayPreviewUrl: "https://p/1", displayPreviewSourceUrl: SOURCE + "done-old", displayPreviewBytes: 100, displayPreviewSourceBytes: 1000, displayPreviewBuiltAt: "2026-11-01T00:00:00.000Z" }),
    g("done-new", { displayPreviewUrl: "https://p/2", displayPreviewSourceUrl: SOURCE + "done-new", displayPreviewBytes: 200, displayPreviewSourceBytes: 3000, displayPreviewBuiltAt: "2026-11-13T00:00:00.000Z" }),
    g("stale-preview", { displayPreviewUrl: "https://p/3", displayPreviewSourceUrl: "https://old" }),
    g("waiting", { displayPreviewRequestedAt: "2026-11-13T01:00:00.000Z" }),
    g("failed", { displayPreviewRequestedAt: "x", displayPreviewLastError: { message: "boom", imageUrl: SOURCE + "failed" } }),
    g("old-error", { displayPreviewLastError: { message: "boom", imageUrl: "https://other" } }),
    g("no-gain", { displayPreviewCheckedUrl: SOURCE + "no-gain" }),
    g("drive", { imageUrl: "https://drive.google.com/file/d/x" }),
    g("set", { assetSet: [{}] }),
    g("video", { imageType: "VV" }),
  ]);
  assert.deepEqual(summary.counts, { total: 12, single: 10, withPreview: 2, needsPreview: 6, requestedWaiting: 1, noGain: 1, failed: 1, notHostedHere: 1 });
  assert.deepEqual(summary.pending, ["a-pending", "b-pending", "old-error", "stale-preview"]);
  assert.deepEqual(summary.stalled, ["failed", "waiting"]);
  assert.deepEqual(summary.recent.map((row) => row.id), ["done-new", "done-old"]);
  assert.equal(summary.measuredPreviewBytes, 300);
  assert.equal(summary.measuredSourceBytes, 4000);
  assert.deepEqual(summary.failures, [{ id: "failed", error: "boom" }]);
});
