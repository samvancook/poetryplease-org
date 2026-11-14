import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { restoreGraphicOriginal, parseBucketObjectUrl, isErrorStub, RESTORE_BACKUP_PREFIX } from "./restore-graphic-original.js";

const STUB = Buffer.from(JSON.stringify({ error: { code: 404, message: "File not found: abc." } }, null, 2));
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#c33" } }).png().toBuffer();
const URL_OF = (name) => `https://storage.googleapis.com/poetrypleasebucket/${encodeURIComponent(name)}`;

function fakeDeps({ graphic, objects = {}, drive = {} }) {
  const store = new Map(Object.entries(objects));
  const log = { writes: [], copies: [], updates: [] };
  return {
    log, store,
    deps: {
      getGraphic: async () => graphic,
      readObject: async (bucket, name) => store.get(name) ?? null,
      writeObject: async (bucket, name, buffer, mimeType) => { store.set(name, buffer); log.writes.push({ name, mimeType }); },
      copyObject: async (bucket, from, to) => { store.set(to, store.get(from)); log.copies.push({ from, to }); },
      fetchDrive: async (id) => { if (!drive[id]) throw new Error("drive_service_fetch_404"); return drive[id]; },
      updateGraphic: async (id, patch) => log.updates.push({ id, patch }),
      now: () => Date.parse("2026-11-14T12:00:00Z"),
    },
  };
}

test("parseBucketObjectUrl decodes the object name and rejects other hosts", () => {
  assert.deepEqual(parseBucketObjectUrl(URL_OF("A - B // C.jpg")), { bucket: "poetrypleasebucket", name: "A - B // C.jpg" });
  assert.deepEqual(parseBucketObjectUrl("https://storage.googleapis.com/poetrypleasebucket/Birthwrite%20//%20Mantswe.jpg"),
    { bucket: "poetrypleasebucket", name: "Birthwrite // Mantswe.jpg" });
  assert.equal(parseBucketObjectUrl("https://firebasestorage.googleapis.com/v0/b/x/o/y"), null);
  assert.equal(parseBucketObjectUrl("not a url"), null);
});

test("isErrorStub only matches small JSON error bodies", async () => {
  assert.equal(isErrorStub(STUB), true);
  assert.equal(isErrorStub(Buffer.alloc(0)), true);
  assert.equal(isErrorStub(await png()), false);
  assert.equal(isErrorStub(Buffer.from('{"ok":true}')), false);
});

test("a Drive error stub is backed up and replaced by the Drive copy, and the preview is requested", async () => {
  const image = await png();
  const name = "Guante - ALSA - Quote Image - Let those fireworks.png";
  const { deps, log, store } = fakeDeps({
    graphic: { imageUrl: URL_OF(name), driveLink: "old" }, objects: { [name]: STUB }, drive: { D1: image },
  });
  const result = await restoreGraphicOriginal({ id: "ALSA-QI-BREAK", driveFileId: "D1", oldDriveLink: "old", newDriveLink: "new" }, deps);
  assert.equal(result.status, "restored");
  assert.equal(result.replaced, "error_stub");
  assert.deepEqual(log.copies, [{ from: name, to: RESTORE_BACKUP_PREFIX + name }]);
  assert.deepEqual(log.writes, [{ name, mimeType: "image/png" }]);
  assert.equal(store.get(name), image);
  assert.deepEqual(log.updates, [{ id: "ALSA-QI-BREAK", patch: { displayPreviewRequestedAt: "2026-11-14T12:00:00.000Z", driveLink: "new" } }]);
});

test("a real image is never overwritten", async () => {
  const image = await png();
  const { deps, log } = fakeDeps({ graphic: { imageUrl: URL_OF("x.png") }, objects: { "x.png": image }, drive: { D1: image } });
  const result = await restoreGraphicOriginal({ id: "g", driveFileId: "D1" }, deps);
  assert.equal(result.status, "already_ok");
  assert.equal(log.writes.length + log.copies.length + log.updates.length, 0);
});

test("a missing object is filled from a same-image object under another name, without a backup", async () => {
  const image = await png();
  const { deps, log } = fakeDeps({ graphic: { imageUrl: URL_OF("Grief.jpg"), driveLink: "keep" }, objects: { "Grief .jpg": image } });
  const result = await restoreGraphicOriginal({ id: "g", copyFromObject: "Grief .jpg" }, deps);
  assert.equal(result.status, "restored");
  assert.equal(result.replaced, "missing");
  assert.deepEqual(log.copies, []);
  assert.deepEqual(log.updates[0].patch, { displayPreviewRequestedAt: "2026-11-14T12:00:00.000Z" });
});

test("dry run writes nothing; bad sources and changed driveLinks are left alone", async () => {
  const image = await png();
  let run = fakeDeps({ graphic: { imageUrl: URL_OF("a.png") }, drive: { D1: image } });
  assert.equal((await restoreGraphicOriginal({ id: "g", driveFileId: "D1" }, run.deps, { dryRun: true })).status, "would_restore");
  assert.equal(run.log.writes.length + run.log.updates.length, 0);

  run = fakeDeps({ graphic: { imageUrl: URL_OF("a.png") }, drive: { D1: Buffer.from("<html>folder</html>") } });
  await assert.rejects(restoreGraphicOriginal({ id: "g", driveFileId: "D1" }, run.deps));
  assert.equal(run.log.writes.length, 0);

  run = fakeDeps({ graphic: { imageUrl: URL_OF("a.png"), driveLink: "someone-changed-it" }, drive: { D1: image } });
  const result = await restoreGraphicOriginal({ id: "g", driveFileId: "D1", oldDriveLink: "old", newDriveLink: "new" }, run.deps);
  assert.equal(result.driveLinkUpdated, false);

  run = fakeDeps({ graphic: { imageUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/y" }, drive: { D1: image } });
  assert.equal((await restoreGraphicOriginal({ id: "g", driveFileId: "D1" }, run.deps)).reason, "image_not_in_bucket");
});
