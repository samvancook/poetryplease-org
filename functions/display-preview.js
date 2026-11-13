// Light "display preview" copies of single graphics.
//
// The viewers show a graphic's displayPreviewUrl in place of its full-size
// original when the preview is bound to the current original through
// displayPreviewSourceUrl (see parseDoc in index.js). This module decides
// which graphics get one, builds it, and stores it. Everything here is
// best-effort: a graphic without a preview simply keeps showing its original.
import sharp from "sharp";

export const DISPLAY_PREVIEW_TYPES = new Set(["QI", "INT", "FPI"]);
export const DISPLAY_PREVIEW_MAX_EDGE = 1600;
export const DISPLAY_PREVIEW_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
// A preview must be clearly lighter than its source to be worth a second file.
const MIN_SAVING_RATIO = 0.7;
const SOURCE_HOSTS = /^(firebasestorage\.googleapis\.com|storage\.googleapis\.com|[a-z0-9-]+\.firebasestorage\.app)$/;

// Must stay identical to how parseDoc picks a graphic's image, because the
// feed only uses a preview whose source URL equals that value.
export function graphicImageUrl(data = {}) {
  return String(data.imageUrl || data.thumbnailUrl || data.url || data.driveLink || data.videoUrl || "");
}

export function isPreviewableSourceUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && SOURCE_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

// True when this graphic should have a preview built for its current image.
export function needsDisplayPreview(data = {}) {
  const imageUrl = graphicImageUrl(data);
  if (!isPreviewableSourceUrl(imageUrl)) return false;
  if (!DISPLAY_PREVIEW_TYPES.has(String(data.imageType || "").toUpperCase())) return false;
  if (Array.isArray(data.assetSet) && data.assetSet.length) return false;
  if (data.displayPreviewUrl && data.displayPreviewSourceUrl === imageUrl) return false;
  // An earlier attempt found nothing to gain for this exact image.
  if (data.displayPreviewCheckedUrl === imageUrl) return false;
  return true;
}

// Returns { buffer, width, height, mimeType } or null when a preview would not
// help (animated image, or not meaningfully smaller than the source).
export async function buildDisplayPreview(source) {
  const metadata = await sharp(source, { limitInputPixels: 100_000_000 }).metadata();
  if ((metadata.pages || 1) > 1) return null;
  const { data, info } = await sharp(source, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: DISPLAY_PREVIEW_MAX_EDGE, height: DISPLAY_PREVIEW_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > source.length * MIN_SAVING_RATIO) return null;
  return { buffer: data, width: info.width, height: info.height, mimeType: "image/webp" };
}

async function downloadSource(imageUrl, fetchImpl) {
  const response = await fetchImpl(imageUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`display_preview_source_http_${response.status}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > DISPLAY_PREVIEW_MAX_SOURCE_BYTES) throw new Error("display_preview_source_too_large");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > DISPLAY_PREVIEW_MAX_SOURCE_BYTES) throw new Error("display_preview_source_too_large");
  return buffer;
}

// Builds and attaches a preview for one graphic document.
//
// docRef: Firestore reference to the graphic.
// expectedImageUrl: when given, do nothing unless the graphic still shows it.
// saveImage({ storagePath, mimeType, buffer, cacheControl }) -> { file, publicUrl }
// runTransaction(fn): Firestore transaction runner.
//
// Returns { status, ... } where status is "attached", "skipped" (with reason)
// or "no_gain". Throws only on download, image or storage errors.
export async function ensureDisplayPreview({
  docRef, expectedImageUrl = "", saveImage, runTransaction,
  fetchImpl = fetch, build = buildDisplayPreview, now = Date.now,
}) {
  const snap = await docRef.get();
  if (!snap.exists) return { status: "skipped", reason: "missing" };
  const data = snap.data() || {};
  const imageUrl = graphicImageUrl(data);
  if (expectedImageUrl && imageUrl !== expectedImageUrl) return { status: "skipped", reason: "image_changed" };
  if (!needsDisplayPreview(data)) return { status: "skipped", reason: "not_needed" };

  const source = await downloadSource(imageUrl, fetchImpl);
  const preview = await build(source);

  // Only write if the graphic still shows the image the preview was made from.
  const stillCurrent = (current) => current.exists && graphicImageUrl(current.data() || {}) === imageUrl;
  if (!preview) {
    await runTransaction(async (tx) => {
      const current = await tx.get(docRef);
      if (stillCurrent(current)) tx.update(docRef, { displayPreviewCheckedUrl: imageUrl });
    });
    return { status: "no_gain", sourceBytes: source.length };
  }

  const storagePath = `content-library/graphics/${docRef.id}/display-preview-${now()}.webp`;
  const { file, publicUrl } = await saveImage({
    storagePath, mimeType: preview.mimeType, buffer: preview.buffer,
    cacheControl: "public,max-age=31536000,immutable",
  });
  const attached = await runTransaction(async (tx) => {
    const current = await tx.get(docRef);
    if (!stillCurrent(current)) return false;
    tx.update(docRef, { displayPreviewUrl: publicUrl, displayPreviewSourceUrl: imageUrl });
    return true;
  });
  if (!attached) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    return { status: "skipped", reason: "image_changed" };
  }
  return {
    status: "attached", sourceBytes: source.length, previewBytes: preview.buffer.length,
    width: preview.width, height: preview.height, storagePath,
  };
}
