// Puts a graphic's original image back where its imageUrl already points.
//
// About 650 quote images show nothing because the object their imageUrl names
// in the poetrypleasebucket bucket is either missing or a 342-byte Drive
// "File not found" error saved in place of the image (an April copy ran after
// January's Drive cleanup had deleted the file it was copying). The surviving
// Drive copy, or a same-image object saved under a slightly different name,
// is written to exactly that object name, so no URL in Firestore changes.
//
// Safety rules:
// - Never overwrites a real image. Only a missing object or a small JSON
//   error stub is replaced, and the stub is first copied to RESTORE_BACKUP_PREFIX.
// - The new bytes must decode as a single image (sharp), else nothing is written.
// - The only Firestore writes are driveLink (when the plan gives one and the
//   graphic still has the old one) and displayPreviewRequestedAt, which asks
//   the preview builder to try again.
import sharp from "sharp";

export const RESTORE_BUCKET = "poetrypleasebucket";
export const RESTORE_BACKUP_PREFIX = "_restore-backup/2026-11-14/";
export const RESTORE_MAX_ITEMS = 6;
const STUB_MAX_BYTES = 4096;

// "https://storage.googleapis.com/<bucket>/<object>" -> { bucket, name }.
export function parseBucketObjectUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "storage.googleapis.com") return null;
  const raw = url.pathname.replace(/^\//, "");
  const slash = raw.indexOf("/");
  if (slash < 1) return null;
  const bucket = raw.slice(0, slash);
  let name;
  try { name = decodeURIComponent(raw.slice(slash + 1)); } catch { return null; }
  if (!name) return null;
  return { bucket, name };
}

// True for the small JSON error bodies saved where an image should be.
export function isErrorStub(buffer) {
  if (!buffer || buffer.length === 0) return true;
  if (buffer.length > STUB_MAX_BYTES) return false;
  const text = buffer.toString("utf8").trim();
  if (!text.startsWith("{")) return false;
  try { return typeof JSON.parse(text)?.error === "object"; } catch { return false; }
}

const MIME_BY_FORMAT = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// Returns the image's mime type, or throws when the bytes are not one image.
export async function verifyImage(buffer) {
  const meta = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata();
  const mimeType = MIME_BY_FORMAT[meta.format];
  if (!mimeType || !meta.width || !meta.height) throw new Error("restore_source_not_an_image");
  return mimeType;
}

// item: { id, driveFileId?, copyFromObject?, oldDriveLink?, newDriveLink? }
// deps: {
//   getGraphic(id) -> data | null,
//   readObject(bucket, name) -> Buffer | null (null when missing),
//   writeObject(bucket, name, buffer, mimeType),
//   copyObject(bucket, from, to),
//   fetchDrive(fileId) -> Buffer,
//   updateGraphic(id, patch),
//   now() -> ms
// }
// Returns { id, status, ... }. status: restored | already_ok | skipped | would_restore
export async function restoreGraphicOriginal(item, deps, { dryRun = false } = {}) {
  const id = String(item?.id || "");
  const data = await deps.getGraphic(id);
  if (!data) return { id, status: "skipped", reason: "graphic_missing" };
  const target = parseBucketObjectUrl(data.imageUrl);
  if (!target || target.bucket !== RESTORE_BUCKET) return { id, status: "skipped", reason: "image_not_in_bucket" };
  if (!item.driveFileId && !item.copyFromObject) return { id, status: "skipped", reason: "no_source" };

  const current = await deps.readObject(target.bucket, target.name);
  if (current && !isErrorStub(current)) return { id, status: "already_ok", object: target.name };

  let source;
  if (item.copyFromObject) {
    if (item.copyFromObject === target.name) return { id, status: "skipped", reason: "copy_onto_itself" };
    source = await deps.readObject(target.bucket, item.copyFromObject);
    if (!source || isErrorStub(source)) return { id, status: "skipped", reason: "copy_source_missing" };
  } else {
    source = await deps.fetchDrive(item.driveFileId);
  }
  const mimeType = await verifyImage(source);
  const plan = { id, object: target.name, replaced: current ? "error_stub" : "missing", bytes: source.length, mimeType,
    from: item.copyFromObject ? `bucket:${item.copyFromObject}` : `drive:${item.driveFileId}` };
  if (dryRun) return { ...plan, status: "would_restore" };

  if (current) await deps.copyObject(target.bucket, target.name, RESTORE_BACKUP_PREFIX + target.name);
  await deps.writeObject(target.bucket, target.name, source, mimeType);
  const patch = { displayPreviewRequestedAt: new Date(deps.now()).toISOString() };
  if (item.newDriveLink && item.oldDriveLink && data.driveLink === item.oldDriveLink) patch.driveLink = item.newDriveLink;
  await deps.updateGraphic(id, patch);
  return { ...plan, status: "restored", driveLinkUpdated: !!patch.driveLink };
}
