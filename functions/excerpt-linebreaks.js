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
  // An opening quote or bracket left at the end of a line, or a closing bracket starting one.
  if (/(^|\s)["'\u2018\u201c(\[]$/m.test(linebroken) || /\n\s*[)\]]/.test(linebroken)) return "stranded_quote";
  return "";
}

// Move an opening quote or bracket left alone at a line end onto the next line, beside its word.
export function reattachOpeningMarks(value) {
  return String(value || "").replace(/(^|[ \t])(["'\u2018\u201c(\[])[ \t]*\n[ \t]*/gm, (_, lead, mark) => `${lead ? "" : lead}\n${mark}`)
    .replace(/^\n/, "");
}

// Production notes appended to excerpt text: "[FB]", "(video)", "- Wood BG" and similar.
const NOTE_RE = /\s*(\((?:video|pick[^)]*|fb|ig)\)|\[[^\]]*\]|\s[-\u2013\u2014]\s*[A-Z][\w ]{0,20}BG)\s*$/i;

// Split trailing production notes off an excerpt: { text, note }.
export function splitProductionNote(value) {
  let text = String(value || "").trim();
  const notes = [];
  for (let match = text.match(NOTE_RE); match && match.index > 0; match = text.match(NOTE_RE)) {
    notes.unshift(match[1].trim().replace(/^[-\u2013\u2014]\s*/, "").trim());
    text = text.slice(0, match.index).trim();
  }
  return { text, note: notes.join(" ") };
}

function lookupTokens(value) {
  const normalized = normalizeLookupText(value);
  return normalized ? normalized.split(" ") : [];
}

// Lay the current excerpt's own words out on the line-broken text's lines, so only the layout changes.
// Words the excerpt has beyond the matched span (a trailing design note, say) stay on the first or last line.
// Returns "" when the two texts' words can't be lined up.
export function projectBreaksOntoText(current, linebroken) {
  const words = String(current || "").split(/\s+/).filter((word) => word && word !== "/");
  const counts = words.map((word) => lookupTokens(word).length);
  const flat = words.flatMap((word) => lookupTokens(word));
  const lines = String(linebroken || "").split("\n").map((line) => ({ blank: !line.trim(), size: lookupTokens(line).length }));
  const target = lookupTokens(linebroken);
  if (!target.length) return "";

  // Find the matched span inside the current words, allowing extra words before and after it.
  let offset = -1;
  for (let i = 0; i + target.length <= flat.length && offset < 0; i += 1) {
    if (target.every((token, j) => flat[i + j] === token)) offset = i;
  }
  if (offset < 0) return "";

  let wordIndex = 0;
  let seen = 0;
  const lead = [];
  while (wordIndex < words.length && seen + counts[wordIndex] <= offset && (seen < offset || !counts[wordIndex])) {
    lead.push(words[wordIndex]);
    seen += counts[wordIndex];
    wordIndex += 1;
  }
  if (seen !== offset) return "";

  const out = [];
  for (const line of lines) {
    if (line.blank) {
      out.push([]);
      continue;
    }
    const lineWords = [];
    let size = 0;
    while (wordIndex < words.length && size < line.size) {
      lineWords.push(words[wordIndex]);
      size += counts[wordIndex];
      wordIndex += 1;
    }
    if (size !== line.size) return "";
    // Punctuation-only words ("—", "...") stay with the line they follow.
    while (wordIndex < words.length && !counts[wordIndex] && wordIndex < words.length - 1) {
      lineWords.push(words[wordIndex]);
      wordIndex += 1;
    }
    out.push(lineWords);
  }
  const textLines = out.filter((line) => line.length);
  if (!textLines.length) return "";
  textLines[0].unshift(...lead);
  textLines[textLines.length - 1].push(...words.slice(wordIndex));

  let text = out.map((line) => line.join(" ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Drop quote marks that wrap the whole excerpt, as the book text does.
  const wrapped = text.match(/^["“]([\s\S]*)["”]$/);
  if (wrapped && !/["“”]/.test(wrapped[1])) text = wrapped[1].trim();
  return text;
}

// Decide what to do with one EXC document given an overlay index keyed by excerpt hash.
export function planLinebreakUpdate(data, overlayByHash, { tiers = ["auto"], ownWords = false } = {}) {
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
  let excerpt = reattachOpeningMarks(entry.text_linebroken);
  let source = entry.status.startsWith("exact") ? "book_exact" : "book_projected";
  const rejection = linebreakRejection(current, excerpt);
  const bookRejection = rejection === "words_changed" && normalizeLookupText(current) === normalizeLookupText(excerpt)
    ? linebreakRejection(excerpt, excerpt)
    : "skip";
  const { text: withoutNote, note } = splitProductionNote(current);
  let noteField = {};
  if (rejection && !bookRejection) {
    // Same words, different punctuation or capitals: defer to the book's text.
    source = "book_punctuation";
  } else if (rejection && note && normalizeLookupText(withoutNote) === normalizeLookupText(excerpt) && !linebreakRejection(excerpt, excerpt)) {
    // Same words once a production note is set aside: take the book's text and keep the note in its own field.
    source = "book_note_removed";
    noteField = { excerptNote: note };
  } else if (rejection) {
    // Optionally lay the excerpt's own words out on the book's lines.
    const projected = ownWords ? projectBreaksOntoText(current, excerpt) : "";
    if (!projected || linebreakRejection(current, projected) || lineCount(projected) <= lineCount(current)) {
      return { action: "skip", reason: rejection };
    }
    excerpt = projected;
    source = "book_lines_own_words";
  }

  return {
    action: "update",
    hash: currentHash,
    fields: {
      excerptOriginal: current,
      excerpt,
      linebreakSource: source,
      linebreakConfidence: entry.ratio,
      linebreakCatalogPoemId: entry.catalog_poem_id,
      ...noteField,
    },
  };
}

export function planLinebreakUndo(data) {
  if (!data.linebreakSource || !String(data.excerptOriginal || "").trim()) return { action: "skip", reason: "not_applied" };
  return { action: "undo", fields: { excerpt: data.excerptOriginal } };
}
