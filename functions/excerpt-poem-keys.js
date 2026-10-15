import { excerptHash } from "./excerpt-linebreaks.js";

export const POEM_KEY_SOURCE = "catalog_seed_2026-10-15";
export const POEM_KEY_FIELDS = ["poemKey", "poemKeySource", "poemKeyConfidence", "poemKeyAttachedAt"];
const validKey = (value) => /^BPP-\d{5}$/.test(String(value || ""));
export const normalizePoemLabel = (value) => String(value || "").normalize("NFKC")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase().replace(/\s+/g, " ");
const titleLabel = (value) => normalizePoemLabel(value).replace(/^"(.*)"$/, "$1").trim();

export function parsePoemKeySeed(csv) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(cell.replace(/\r$/, "")); cell = "";
      if (char === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("unterminated_seed_csv_quote");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift() || [];
  for (const field of ["excerpt_hash", "catalog_book", "poem_key", "match"]) {
    if (!headers.includes(field)) throw new Error(`missing_seed_column_${field}`);
  }
  const byHash = new Map();
  for (const values of rows) {
    if (values.length !== headers.length) throw new Error("invalid_seed_csv_row");
    const record = Object.fromEntries(headers.map((key, i) => [key, values[i]]));
    const hash = record.excerpt_hash.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash) || byHash.has(hash)) throw new Error("invalid_or_duplicate_seed_hash");
    byHash.set(hash, record);
  }
  return byHash;
}

export function planExcerptPoemKey(data, seed, { requireTitle = false } = {}) {
  if (data.poemKey) return { reason: "already_keyed" };
  if (!String(data.book || "").trim()) {
    if (data.poemKeySource === "no_book_source") return { reason: "already_no_book_source" };
    return { fields: { poemKey: "", poemKeySource: "no_book_source" } };
  }
  const row = seed.get(excerptHash(data.excerpt || ""));
  if (!row) return { reason: "hash_not_in_seed" };
  if (row.match !== "unique") return { reason: row.match || "unmatched" };
  if (!validKey(row.poem_key)) return { reason: "invalid_seed_key" };
  if (normalizePoemLabel(data.book) !== normalizePoemLabel(row.catalog_book)) return { reason: "book_mismatch" };
  if (requireTitle && (!titleLabel(data.poem || data.title) || titleLabel(data.poem || data.title) !== titleLabel(row.poem_title))) {
    return { reason: "poem_title_mismatch" };
  }
  return { fields: { poemKey: row.poem_key, poemKeySource: POEM_KEY_SOURCE, poemKeyConfidence: 1 } };
}

export async function lookupExcerptPoemKey(data, existing, fetchPoems) {
  const book = String(data.book || "").trim();
  const title = data.poem || data.title || "";
  if (existing?.poemKey && normalizePoemLabel(existing.book) === normalizePoemLabel(book)
    && titleLabel(existing.poem || existing.title) === titleLabel(title)) return {};
  if (!book) return { poemKey: "", poemKeySource: "no_book_source", poemKeyConfidence: null };
  try {
    const rows = await fetchPoems(book);
    const matches = rows.filter((row) => normalizePoemLabel(row.book_title) === normalizePoemLabel(book)
      && titleLabel(row.title) === titleLabel(title));
    const keys = [...new Set(matches.map((row) => row.poem_key).filter(validKey))];
    if (keys.length === 1 && matches.every((row) => row.poem_key === keys[0])) {
      return { poemKey: keys[0], poemKeySource: "catalog_book_title", poemKeyConfidence: 1 };
    }
    return { poemKey: "", poemKeySource: matches.length ? "ambiguous_catalog_match" : "catalog_match_not_found", poemKeyConfidence: null };
  } catch {
    return { poemKey: "", poemKeySource: "catalog_lookup_unavailable", poemKeyConfidence: null };
  }
}
