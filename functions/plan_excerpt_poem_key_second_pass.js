// Offline plan from dated Firestore and Catalog snapshots. Never writes production.
// node plan_excerpt_poem_key_second_pass.js --remaining remaining.json --audit audit.json
//   --registry registry.json --poems poems.json --out plan.json --review review.json
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizePoemLabel } from "./excerpt-poem-keys.js";

const label = (v) => normalizePoemLabel(v).replace(/^"(.*)"$/, "$1").trim();
const bookLabel = (v) => normalizePoemLabel(v).replace(/&/g, "and").replace(/[^\p{L}\p{N}]/gu, "");
const text = (row) => label(row.served_text || row.cleaned_text || row.text || "");
const keyValid = (v) => /^BPP-\d{5}$/.test(v || "");

export function resolveExcerpt(data, registry, poems) {
  const books = Object.entries(registry).filter(([name, book]) => book.http === 200
    && bookLabel(book.book || name) === bookLabel(data.book));
  if (!books.length) return { reason: "book_not_in_registry" };
  if (new Set(books.map(([, book]) => book.canonical_book_id)).size !== 1) return { reason: "ambiguous_book" };
  const active = new Map();
  for (const [, book] of books) for (const row of book.rows || []) {
    if (row.status === "active" && keyValid(row.poem_key)) active.set(row.poem_key, row);
  }
  if (!active.size) return { reason: "book_has_no_registered_poems" };
  const named = [...active.values()].filter((row) => label(row.title) === label(data.poem || data.title));
  const canonicalBook = books[0][1].book;
  const variants = new Map();
  for (const [name] of books) for (const row of poems.books?.[name]?.rows || []) {
    if (active.has(row.poem_key)) {
      if (!variants.has(row.poem_key)) variants.set(row.poem_key, []);
      variants.get(row.poem_key).push(text(row));
    }
  }
  const excerpt = label(data.excerpt);
  const longEnough = excerpt.length >= 35 && excerpt.split(/\s+/).length >= 6;
  const fits = (key) => longEnough && (variants.get(key) || []).some((poem) => poem.includes(excerpt));
  if (named.length === 1) {
    // A title identifies a candidate, but cannot prove that this excerpt belongs to it.
    if (!fits(named[0].poem_key)) return { reason: "title_match_without_verified_passage" };
    return { key: named[0].poem_key, method: "catalog_registry_book_title", canonicalBook,
      title: named[0].title, passageVerified: true };
  }
  const candidates = named.length ? named : [...active.values()];
  const matching = candidates.filter((row) => fits(row.poem_key));
  if (matching.length === 1) return { key: matching[0].poem_key, method: "catalog_exact_excerpt_span", canonicalBook,
    title: matching[0].title, passageVerified: true };
  return { reason: named.length > 1 ? "ambiguous_poem_title" : "no_exact_poem_match" };
}

export function planSecondPass(rows, registry, poems) {
  const plan = [], review = [], counts = {};
  for (const row of rows) {
    const result = resolveExcerpt(row.data, registry, poems);
    if (row.data.poemKey && result.key === row.data.poemKey) {
      counts.confirmed = (counts.confirmed || 0) + 1; continue;
    }
    if (row.data.poemKey && result.key) {
      if (row.data.poemKeySource === "catalog_seed_2026-10-15" && result.passageVerified) result.method = "catalog_verified_seed_correction";
      else { result.reason = "existing_key_disagreement_needs_review"; delete result.key; }
    }
    const reason = result.key ? result.method : result.reason;
    counts[reason] = (counts[reason] || 0) + 1;
    if (result.key) plan.push({ id: row.id, updateTime: row.updateTime,
      fields: { poemKey: result.key, poemKeySource: result.method, poemKeyConfidence: 1 },
      proof: { ...result, previousKey: row.data.poemKey || "", book: row.data.book, poem: row.data.poem || row.data.title } });
    else review.push({ id: row.id, book: row.data.book, poem: row.data.poem || row.data.title,
      existingKey: row.data.poemKey || "", reason, excerpt: row.data.excerpt });
  }
  return { plan, review, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
  const read = (name) => JSON.parse(readFileSync(arg(name), "utf8"));
  const result = planSecondPass([...read("--remaining"), ...read("--audit")], read("--registry"), read("--poems"));
  writeFileSync(arg("--out"), JSON.stringify(result.plan, null, 2), { flag: "wx", mode: 0o600 });
  writeFileSync(arg("--review"), JSON.stringify(result.review, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ planned: result.plan.length, review: result.review.length, counts: result.counts }, null, 2));
}
