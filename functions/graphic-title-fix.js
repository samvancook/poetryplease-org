// Fixes a misspelled title on a graphic and points it at a copy of its image
// saved under the corrected file name. The old image object stays in the
// bucket (the social calendars may still link to it); the job that copies it
// lives in firebase.yml. Old values are kept in titleFix.before so the change
// can be reversed.

export const TITLE_FIX_MAX_ITEMS = 20;
const BUCKET_PREFIX = "https://storage.googleapis.com/poetrypleasebucket/";

const text = (value) => String(value ?? "").trim();

export function bucketObjectName(url) {
  const value = text(url);
  if (!value.startsWith(BUCKET_PREFIX)) return "";
  try {
    return decodeURIComponent(value.slice(BUCKET_PREFIX.length));
  } catch {
    return "";
  }
}

export function validTitleFixItem(item) {
  if (!item || typeof item !== "object") return false;
  const id = text(item.id);
  if (!id || id.length > 300 || id.includes("/")) return false;
  for (const field of ["expectTitle", "title"]) {
    if (!text(item[field]) || text(item[field]).length > 500) return false;
  }
  if (!bucketObjectName(item.expectImageUrl) || !bucketObjectName(item.imageUrl)) return false;
  return true;
}

// deps: getGraphic(id) -> data|null, objectExists(name) -> bool,
// updateGraphic(id, patch), now() -> ms.
export async function fixGraphicTitle(item, deps, { dryRun = false } = {}) {
  const id = text(item.id);
  const title = text(item.title);
  const data = await deps.getGraphic(id);
  if (!data) return { id, status: "skipped", reason: "graphic_missing" };
  const currentTitle = String(data.title || data.poem || "");
  const currentUrl = String(data.imageUrl || "");
  if (currentTitle === title && currentUrl === item.imageUrl) return { id, status: "already_fixed" };
  if (currentTitle !== item.expectTitle) return { id, status: "skipped", reason: "title_changed", currentTitle };
  if (currentUrl !== item.expectImageUrl) return { id, status: "skipped", reason: "image_changed", currentUrl };
  const newImageExists = await deps.objectExists(bucketObjectName(item.imageUrl));
  // A dry run comes before the copy, so it only reports whether the copy is there yet.
  if (!newImageExists && !dryRun) return { id, status: "skipped", reason: "new_image_missing" };

  const patch = { title, imageUrl: item.imageUrl };
  const before = { title: data.title ?? null, imageUrl: data.imageUrl ?? null };
  if (data.poem != null) { patch.poem = title; before.poem = data.poem; }
  const oldName = bucketObjectName(item.expectImageUrl);
  if (data.sourceFileName === oldName) {
    patch.sourceFileName = bucketObjectName(item.imageUrl);
    before.sourceFileName = data.sourceFileName;
  }
  patch.titleFix = { at: new Date(deps.now()).toISOString(), before };
  const plan = { id, from: currentTitle, to: title };
  if (dryRun) return { ...plan, status: "would_fix", newImageExists };
  await deps.updateGraphic(id, patch);
  return { ...plan, status: "fixed" };
}
