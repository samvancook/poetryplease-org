// Renames a quote image record to the poem its image actually shows.
// An old import attached many images to a neighbouring poem's record; the
// right poem was found by reading each image's text and looking the quote up
// in the Primary Excerpt Database. Every change keeps the old values in
// ocrRetitle.before so it can be reversed.

export const RETITLE_MAX_ITEMS = 50;
export const RETITLE_BOOK_FIELDS = ["book", "bookShortener", "bookLink", "releaseCatalog", "releaseYear"];
const POEM_KEY_FIELDS = ["poemKey", "poemKeySource", "poemKeyConfidence"];

const text = (value) => String(value ?? "").trim();

export function validRetitleItem(item) {
  if (!item || typeof item !== "object") return false;
  const id = text(item.id);
  if (!id || id.length > 300 || id.includes("/")) return false;
  if (typeof item.expectTitle !== "string" || item.expectTitle.length > 500) return false;
  const title = text(item.title);
  if (!title || title.length > 500) return false;
  if (item.book != null && (!text(item.book) || !text(item.bookFieldsFrom))) return false;
  return true;
}

// deps: getGraphic(id) -> data|null, updateGraphic(id, patch), deleteValue (sentinel
// that removes a field), now() -> ms.
export async function retitleGraphic(item, deps, { dryRun = false } = {}) {
  const id = text(item.id);
  const data = await deps.getGraphic(id);
  if (!data) return { id, status: "skipped", reason: "graphic_missing" };
  const currentTitle = String(data.title || data.poem || "");
  if (currentTitle !== item.expectTitle) return { id, status: "skipped", reason: "title_changed", currentTitle };
  if (data.ocrRetitle) return { id, status: "skipped", reason: "already_retitled" };

  const title = text(item.title);
  const patch = { title };
  const before = { title: data.title ?? null };
  if (data.poem != null) { patch.poem = title; before.poem = data.poem; }

  let bookFrom = null;
  if (item.book != null) {
    const ref = await deps.getGraphic(text(item.bookFieldsFrom));
    if (!ref || text(ref.book) !== text(item.book)) return { id, status: "skipped", reason: "book_reference_mismatch" };
    if (text(ref.author).toLowerCase() !== text(data.author).toLowerCase()) {
      return { id, status: "skipped", reason: "book_reference_other_author" };
    }
    bookFrom = text(item.bookFieldsFrom);
    for (const field of RETITLE_BOOK_FIELDS) {
      if (ref[field] === undefined && data[field] === undefined) continue;
      before[field] = data[field] ?? null;
      patch[field] = ref[field] === undefined ? deps.deleteValue : ref[field];
    }
  }
  // A poem key names the poem the record used to claim; it no longer applies.
  for (const field of POEM_KEY_FIELDS) {
    if (data[field] === undefined) continue;
    before[field] = data[field];
    patch[field] = deps.deleteValue;
  }
  patch.ocrRetitle = {
    at: new Date(deps.now()).toISOString(),
    excerptRow: Number(item.excerptRow) || null,
    bookFrom,
    before,
  };
  const plan = { id, from: currentTitle, to: title, book: item.book != null ? text(item.book) : undefined };
  if (dryRun) return { ...plan, status: "would_retitle" };
  await deps.updateGraphic(id, patch);
  return { ...plan, status: "retitled" };
}
