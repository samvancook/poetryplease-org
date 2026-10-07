import { createHash } from "node:crypto";

// Port of Weaver's excerpt_library.normalize_lookup_text / fingerprint_excerpt.
// The hash ignores whitespace and punctuation, so it is identical before and after line breaks are added.
export function normalizeLookupText(value) {
  let raw = String(value || "");
  raw = raw.replace(/\*([^*\n]+)\*/g, "$1").replace(/\*/g, "");
  let normalized = raw.toLowerCase();
  normalized = normalized.replace(/—/g, " ").replace(/–/g, " ");
  normalized = normalized.replace(/&/g, " and ");
  normalized = normalized.replace(/’/g, "'").replace(/‘/g, "'");
  normalized = normalized.replace(/["“”`]/g, "");
  normalized = normalized.replace(/(?<![a-z0-9])'|'(?![a-z0-9])/g, "");
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/[^a-z0-9\s']/g, " ");
  return normalized.replace(/\s+/g, " ").trim();
}

export function excerptHash(value) {
  return createHash("sha256").update(normalizeLookupText(value), "utf8").digest("hex");
}

export function lineCount(value) {
  return String(value || "").split("\n").length;
}

// Decide what to do with one EXC document given an overlay index keyed by excerpt hash.
export function planLinebreakUpdate(data, overlayByHash, { tiers = ["auto"] } = {}) {
  const current = String(data.excerpt || "");
  if (!current.trim()) return { action: "skip", reason: "no_excerpt" };
  if (data.linebreakSource && data.excerptOriginal) return { action: "skip", reason: "already_applied" };

  const currentHash = excerptHash(current);
  const storedHash = String(data.excerptHash || "").trim().toLowerCase();
  const entry = overlayByHash.get(currentHash) || (storedHash && overlayByHash.get(storedHash));
  if (!entry) return { action: "skip", reason: "not_in_overlay" };
  if (!tiers.includes(entry.tier)) return { action: "skip", reason: `tier_${entry.tier}` };
  // Guard: only replace text that still says what the overlay was built from.
  if (excerptHash(entry.text_original) !== currentHash) return { action: "skip", reason: "text_changed_since_overlay" };
  if (lineCount(entry.text_linebroken) <= lineCount(current)) return { action: "skip", reason: "no_gain" };

  return {
    action: "update",
    hash: currentHash,
    fields: {
      excerptOriginal: current,
      excerpt: entry.text_linebroken,
      linebreakSource: entry.status.startsWith("exact") ? "book_exact" : "book_projected",
      linebreakConfidence: entry.ratio,
      linebreakCatalogPoemId: entry.catalog_poem_id,
    },
  };
}

export function planLinebreakUndo(data) {
  if (!data.linebreakSource || !String(data.excerptOriginal || "").trim()) return { action: "skip", reason: "not_applied" };
  return { action: "undo", fields: { excerpt: data.excerptOriginal } };
}
