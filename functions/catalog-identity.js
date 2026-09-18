function catalogKey(value) {
  return String(value || "").trim().toLowerCase();
}

const BOOK_SEASON_CATALOG = /^(spring|summer|fall|winter)\s+\d{4}$/;

// Book release catalogs are seasonal ("Fall 2024") or appear in the book
// catalog lookup. Anything else (a workshop, event, or collection catalog) is
// an identity the content keeps even after it is attributed to a book.
export function isBookReleaseCatalog(value, bookReleaseCatalogKeys = new Set()) {
  const key = catalogKey(value);
  if (!key) return false;
  return BOOK_SEASON_CATALOG.test(key) || bookReleaseCatalogKeys.has(key);
}

// Returns the event catalog to keep alongside a book's canonical catalog, or
// "" when there is nothing to keep. A value already preserved on the record
// wins, so canonicalizing an already-canonical snapshot record is stable.
export function preservedEventReleaseCatalog(item = {}, canonicalReleaseCatalog = "", bookReleaseCatalogKeys = new Set()) {
  const existing = String(item.eventReleaseCatalog || "").trim();
  if (existing) return existing;
  const original = String(item.releaseCatalog || "").trim();
  if (!original) return "";
  if (catalogKey(original) === catalogKey(canonicalReleaseCatalog)) return "";
  if (isBookReleaseCatalog(original, bookReleaseCatalogKeys)) return "";
  return original;
}

export function contentReleaseCatalogs(item = {}) {
  return [item.releaseCatalog, item.eventReleaseCatalog]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}
