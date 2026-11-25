// Saves where the poem text sits in a photo (INT interior photos, FPI full-poem
// photos), so Swipe can start the photo zoomed to the text. The boxes come from
// reading each photo's text (OCR); the plan lives in docs/handoffs. A record is
// only changed when its image is still the one that was read. focus: null
// removes a saved box.

export const PHOTO_FOCUS_MAX_ITEMS = 100;
export const PHOTO_FOCUS_TYPES = new Set(["INT", "FPI"]);

const text = (value) => String(value ?? "").trim();

export function validPhotoFocus(focus) {
  if (!Array.isArray(focus) || focus.length !== 4 || !focus.every(Number.isFinite)) return false;
  const [left, top, right, bottom] = focus;
  return left >= 0 && top >= 0 && right <= 1 && bottom <= 1 && right > left && bottom > top;
}

export function validPhotoFocusItem(item) {
  if (!item || typeof item !== "object") return false;
  const id = text(item.id);
  if (!id || id.length > 300 || id.includes("/")) return false;
  if (!text(item.expectImageUrl) || text(item.expectImageUrl).length > 2000) return false;
  return item.focus === null || validPhotoFocus(item.focus);
}

// deps: getGraphic(id) -> data|null, updateGraphic(id, patch), deleteValue, now() -> ms.
export async function setPhotoFocus(item, deps, { dryRun = false, source = "" } = {}) {
  const id = text(item.id);
  const data = await deps.getGraphic(id);
  if (!data) return { id, status: "skipped", reason: "graphic_missing" };
  if (!PHOTO_FOCUS_TYPES.has(text(data.imageType).toUpperCase())) return { id, status: "skipped", reason: "not_a_photo" };
  const imageUrl = text(data.imageUrl || data.thumbnailUrl || data.url || data.driveLink);
  if (imageUrl !== text(item.expectImageUrl)) return { id, status: "skipped", reason: "image_changed" };
  const focus = item.focus === null ? null : item.focus.map((value) => Math.round(value * 10000) / 10000);
  if (JSON.stringify(data.photoFocus ?? null) === JSON.stringify(focus)) return { id, status: "unchanged" };
  const patch = focus
    ? { photoFocus: focus, photoFocusSource: text(source) || "ocr", photoFocusAt: deps.now() }
    : { photoFocus: deps.deleteValue, photoFocusSource: deps.deleteValue, photoFocusAt: deps.deleteValue };
  if (!dryRun) await deps.updateGraphic(id, patch);
  return { id, status: dryRun ? "would_update" : "updated", focus, before: data.photoFocus ?? null };
}
