"use strict";

// Shared helpers for the Poetry Dispenser public-domain pool.
// Used by build-pool.js (builds imports/dispenser-pool/pool.json),
// tests/dispenser-pool.test.js, and the Playdate export.

// ---------- Screen sizes ----------
// Each size says how many characters fit on a row and how many rows fit.
// A poem fits when every line, wrapped at that width, fits in the row budget.
const SIZES = {
  slip3: { label: "3-line slip", cols: 42, rows: 3, maxLines: 3 },
  slip5: { label: "5-line slip", cols: 42, rows: 5, maxLines: 5 },
  // Playdate: 400x240, 1-bit. With an ~8px-wide font and 20px line height
  // that is about 46 columns by 11 rows (leaving a title row).
  playdate: { label: "Playdate screen", cols: 46, rows: 11 },
  // Phone card at comfortable reading size: ~36 columns, ~26 rows visible.
  phone: { label: "Phone card", cols: 36, rows: 26 },
};

function wrappedRows(line, cols) {
  const text = String(line || "").trim();
  if (!text) return 1; // stanza break still takes a row
  const words = text.split(/\s+/);
  let rows = 1;
  let width = 0;
  for (const word of words) {
    const w = word.length;
    if (width === 0) {
      rows += Math.floor((w - 1) / cols); // a word longer than a row spills over
      width = ((w - 1) % cols) + 1;
    } else if (width + 1 + w <= cols) {
      width += 1 + w;
    } else {
      rows += 1;
      width = w;
    }
  }
  return rows;
}

function rowsAt(lines, cols) {
  return lines.reduce((sum, line) => sum + wrappedRows(line, cols), 0);
}

function sizeFits(lines) {
  const textLines = lines.filter((l) => String(l).trim());
  const out = {};
  for (const [key, size] of Object.entries(SIZES)) {
    if (size.maxLines && textLines.length > size.maxLines) {
      out[key] = false;
      continue;
    }
    out[key] = rowsAt(lines, size.cols) <= size.rows;
  }
  return out;
}

// Smallest size the poem fits, for sorting "by size".
const SIZE_ORDER = ["slip3", "slip5", "playdate", "phone"];
function smallestSize(fits) {
  return SIZE_ORDER.find((k) => fits[k]) || "long";
}

// ---------- Mood ----------
// Simple word lists. Sam's goal (25 Nov): classics on the cozy,
// thoughtful, nature end. "dark" is tracked so it can be pushed down.
const MOOD_WORDS = {
  nature: [
    "tree", "trees", "leaf", "leaves", "flower", "flowers", "rose", "roses", "bird", "birds",
    "lark", "nightingale", "robin", "wren", "thrush", "sea", "wave", "waves", "river", "brook",
    "stream", "hill", "hills", "mountain", "meadow", "field", "fields", "grass", "wood", "woods",
    "forest", "moon", "star", "stars", "sun", "sky", "cloud", "clouds", "rain", "snow", "frost",
    "wind", "spring", "summer", "autumn", "winter", "dawn", "dew", "bee", "bees", "garden",
    "blossom", "daisy", "violet", "lily", "earth", "green", "shore", "lake", "pond", "orchard",
  ],
  cozy: [
    "home", "hearth", "fire", "fireside", "warm", "child", "children", "sleep", "bed", "lamp",
    "evening", "night", "kind", "gentle", "friend", "friends", "mother", "cottage", "door",
    "window", "tea", "bread", "song", "sing", "sweet", "smile", "rest", "quiet", "peace",
    "little", "play", "laugh", "dream", "dreams",
  ],
  thoughtful: [
    "time", "soul", "mind", "heart", "think", "thought", "thoughts", "life", "truth", "wise",
    "know", "knew", "world", "hope", "memory", "remember", "silence", "alone", "god", "eternity",
    "forever", "wonder", "learn", "question", "answer", "years", "age",
  ],
  dark: [
    "death", "dead", "die", "dies", "died", "grave", "tomb", "blood", "war", "kill", "killed",
    "slain", "corpse", "murder", "hell", "curse", "cursed", "despair", "woe", "agony", "worm",
  ],
};

function words(lines) {
  return lines
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function moodScores(lines) {
  const ws = words(lines);
  const n = Math.max(ws.length, 1);
  const out = {};
  for (const [mood, list] of Object.entries(MOOD_WORDS)) {
    const set = new Set(list);
    const hits = ws.filter((w) => set.has(w)).length;
    // hits per 100 words, capped so long poems don't win by length
    out[mood] = Math.round(Math.min(10, (hits / n) * 100) * 10) / 10;
  }
  return out;
}

function moodTags(scores) {
  const tags = [];
  if (scores.nature >= 4) tags.push("nature");
  if (scores.cozy >= 4) tags.push("cozy");
  if (scores.thoughtful >= 4) tags.push("thoughtful");
  if (scores.dark >= 3) tags.push("dark");
  return tags;
}

// ---------- Readability ----------
// Archaic spellings make a poem harder on a small screen. Thee/thou are
// fine; Middle English spellings are not.
const ARCHAIC = new Set([
  "doth", "hath", "ere", "whilst", "thine", "thy", "thee", "thou", "art", "wilt", "shalt",
  "canst", "dost", "hast", "o'er", "e'en", "'tis", "twas", "'twas",
]);
const HARD = /\b(ye|y'|yt|wch|haue|loue|beautie|eies|sayd|ioy|vnto|vpon|euer|neuer|hir|whan|eke)\b/i;

function readability(lines) {
  const ws = words(lines);
  const n = Math.max(ws.length, 1);
  const archaic = ws.filter((w) => ARCHAIC.has(w)).length / n;
  const hard = HARD.test(lines.join(" "));
  // 1 = easy modern-feeling, 0 = hard
  let score = 1 - Math.min(1, archaic * 6);
  if (hard) score -= 0.5;
  return Math.max(0, Math.round(score * 100) / 100);
}

// ---------- Rights ----------
// US public domain: published before 1931 as of 2026. We only have author
// death years from PoetryDB, so an author who died before 1931 can't have a
// lifetime publication after it. Posthumous first publication is the gap;
// such authors are listed in POSTHUMOUS_CHECK and need a source check.
const PD_CUTOFF_YEAR = 1931;
const POSTHUMOUS_CHECK = new Set(["Emily Dickinson", "Gerard Manley Hopkins", "Wilfred Owen", "Edward Thomas"]);

function yearOf(text) {
  const m = String(text || "").match(/(\d{3,4})(?!.*\d{3,4})/);
  return m ? Number(m[1]) : null;
}

function rightsFor(author, authorInfo) {
  const died = yearOf(authorInfo && authorInfo.died);
  if (died && died < PD_CUTOFF_YEAR) {
    const posthumous = POSTHUMOUS_CHECK.has(author);
    return {
      status: posthumous ? "public-domain-us-check-posthumous" : "public-domain-us",
      basis: posthumous
        ? `Author died ${died}. Poems first printed after death were still printed long before ${PD_CUTOFF_YEAR} for this poet, but confirm the first edition.`
        : `Author died ${died}, so every lifetime publication predates ${PD_CUTOFF_YEAR} (US public domain cutoff for 2026).`,
      authorDied: died,
    };
  }
  return {
    status: "needs-review",
    basis: died ? `Author died ${died}; check first publication year.` : "Author death year unknown; check first publication year.",
    authorDied: died,
  };
}

// ---------- Cleaning ----------
function cleanLines(lines) {
  const out = [];
  for (const raw of lines || []) {
    const line = String(raw).replace(/\s+$/g, "");
    if (/\[back\]/i.test(line) || /^\s*Note \d+\./.test(line)) break; // footnotes
    out.push(
      line
        .replace(/(["”’.,;!?])\s+\d+$/, "$1") // trailing note markers
        .replace(/_([^_]+)_/g, "$1") // _italic_ markup
    );
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  while (out.length && !out[0].trim()) out.shift();
  // collapse multiple blank lines
  return out.filter((l, i) => l.trim() || (i > 0 && out[i - 1].trim()));
}

function isFragment(title, lines) {
  return /fragment|cancelled|^from |\bcanto\b|\bpart [ivx\d]+\b|^(stanza|chorus)/i.test(title) || lines.join(" ").length < 40;
}

// ---------- Ranking ----------
// "Best" has no world ranking, so we start from stand-ins and let the
// machine's own reactions take over as they come in.
//
// prior (0..1) =
//   0.40 * notable      (poem is on its author's notable-poems list, from PoetryDB's
//                        source-backed author pages)
//   0.20 * authorCanon  (how many notable poems the author has, capped at 8)
//   0.15 * readability  (modern-feeling language reads better on tiny screens)
//   0.25 * moodFit      (Sam's lean: nature, cozy, thoughtful; dark pulls down)
//
// Reactions (moved=+2, like=+1, meh=0, dislike=-1) are mapped to 0..1 and
// blended with the prior as if the prior were PRIOR_WEIGHT reactions, so a
// handful of reactions nudge and a lot of reactions decide.
const PRIOR_WEIGHT = 8;
const REACTION_VALUE = { moved: 1, like: 2 / 3, meh: 1 / 3, dislike: 0 };

function moodFit(scores) {
  const good = Math.min(10, scores.nature + scores.cozy * 0.8 + scores.thoughtful * 0.8);
  const fit = good / 10 - Math.min(0.5, scores.dark / 10);
  return Math.max(0, Math.min(1, fit));
}

function priorScore({ notable, authorNotableCount, readabilityScore, mood }) {
  const authorCanon = Math.min(8, authorNotableCount || 0) / 8;
  const p = 0.4 * (notable ? 1 : 0) + 0.2 * authorCanon + 0.15 * readabilityScore + 0.25 * moodFit(mood);
  return Math.round(p * 1000) / 1000;
}

function blendedScore(prior, reactions = {}) {
  let total = 0;
  let count = 0;
  for (const [kind, value] of Object.entries(REACTION_VALUE)) {
    const n = Number(reactions[kind] || 0);
    total += n * value;
    count += n;
  }
  const s = (prior * PRIOR_WEIGHT + total) / (PRIOR_WEIGHT + count);
  return Math.round(s * 1000) / 1000;
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

module.exports = {
  SIZES,
  SIZE_ORDER,
  MOOD_WORDS,
  PD_CUTOFF_YEAR,
  PRIOR_WEIGHT,
  REACTION_VALUE,
  wrappedRows,
  rowsAt,
  sizeFits,
  smallestSize,
  moodScores,
  moodTags,
  moodFit,
  readability,
  rightsFor,
  cleanLines,
  isFragment,
  priorScore,
  blendedScore,
  slug,
  yearOf,
};
