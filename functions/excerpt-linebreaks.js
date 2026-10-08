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

const QUOTE_CHARS = /["\u201c\u201d]/g;

// The excerpt as plain running text: quote marks dropped, " / " separators and line breaks read as spaces.
function flatWords(value) {
  return String(value || "")
    .replace(QUOTE_CHARS, "")
    .replace(/\s+\/\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Why a line-broken text should not replace the current one, or "" when it is a pure layout change.
export function linebreakRejection(current, linebroken) {
  if (flatWords(linebroken) !== flatWords(current)) return "words_changed";
  if (/\s\/\s/.test(linebroken)) return "stray_separator";
  const straight = (linebroken.match(/"/g) || []).length;
  const opens = (linebroken.match(/\u201c/g) || []).length;
  const closes = (linebroken.match(/\u201d/g) || []).length;
  if (straight % 2 || opens !== closes) return "unbalanced_quotes";
  if (/^\s*[\u201d]|[\u201c]\s*$/m.test(linebroken)) return "stranded_quote";
  return "";
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
  // Only add line breaks and drop wrapping quotes; anything that would change the words waits for review.
  const rejection = linebreakRejection(current, entry.text_linebroken);
  if (rejection) return { action: "skip", reason: rejection };

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
