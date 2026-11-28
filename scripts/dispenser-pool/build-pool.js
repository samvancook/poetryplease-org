#!/usr/bin/env node
"use strict";

// Builds imports/dispenser-pool/pool.json from the PoetryDB snapshot.
//   node scripts/dispenser-pool/build-pool.js
// Output is deterministic so re-running it gives a clean diff.

const fs = require("node:fs");
const path = require("node:path");
const lib = require("./pool-lib.js");

const ROOT = path.join(__dirname, "..", "..");
const SNAPSHOT = path.join(ROOT, "imports", "dispenser-pool", "poetrydb-short-2026-11-24.json");
const GUTENBERG = path.join(ROOT, "imports", "dispenser-pool", "gutenberg-short.json");
const OUT = path.join(ROOT, "imports", "dispenser-pool", "pool.json");

function normTitle(t) {
  return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// One list of {title, author, lines, rights, extra} from both sources.
// PoetryDB first, so on a duplicate its notable-poem data wins.
function records(snapshot, gutenberg) {
  const out = [];
  for (const raw of snapshot.poems) {
    out.push({
      title: raw.title,
      author: raw.author,
      lines: raw.lines,
      rights: {
        ...lib.rightsFor(raw.author, snapshot.authors[raw.author] || {}),
        source: "PoetryDB (https://poetrydb.org), texts from Project Gutenberg and similar archives",
        credit: "Curation: PoetryDB, CC BY 4.0",
      },
      extra: {},
    });
  }
  for (const raw of (gutenberg && gutenberg.poems) || []) {
    const b = raw.book;
    out.push({
      title: raw.title,
      author: raw.author,
      lines: raw.lines,
      rights: {
        status: b.year < lib.PD_CUTOFF_YEAR ? "public-domain-us" : "needs-review",
        basis: `Published in ${b.title} (${b.year})${raw.translator ? `, translated by ${raw.translator}` : ""}, before ${lib.PD_CUTOFF_YEAR}.`,
        published: b.year,
        source: `Project Gutenberg #${b.gutenbergId} (https://www.gutenberg.org/ebooks/${b.gutenbergId})`,
      },
      extra: { collection: b.title, published: b.year, ...(raw.translator ? { translator: raw.translator } : {}) },
    });
  }
  return out;
}

function firstLineKey(author, lines) {
  const first = lines.find((l) => l.trim()) || "";
  return `${author}|${first.toLowerCase().replace(/[^a-z]+/g, "")}`;
}

function build(snapshot, gutenberg) {
  const notableByAuthor = new Map();
  for (const [author, info] of Object.entries(snapshot.authors || {})) {
    const set = new Set((info && info.notable_poems || []).map((n) => normTitle(n.title)));
    notableByAuthor.set(author, set);
  }

  const seen = new Set();
  const poems = [];
  const skipped = { fragment: 0, duplicate: 0, empty: 0 };

  for (const raw of records(snapshot, gutenberg)) {
    const lines = lib.cleanLines(raw.lines);
    if (!lines.length) { skipped.empty++; continue; }
    if (lib.isFragment(raw.title, lines)) { skipped.fragment++; continue; }
    const key = firstLineKey(raw.author, lines);
    if (seen.has(key)) { skipped.duplicate++; continue; }
    seen.add(key);

    const info = snapshot.authors[raw.author] || {};
    const notableSet = notableByAuthor.get(raw.author) || new Set();
    const t = normTitle(raw.title);
    // Exact title match, or the part before a colon ("Sonnet 18: Shall I compare...").
    // Numbered sections of a long poem ("In Memoriam A.H.H.: 7. ...") don't count.
    const colon = String(raw.title).split(":");
    const isSection = colon.length > 1 && /^\s*\d+[.)]/.test(colon[1]);
    const notable = notableSet.has(t) || (!isSection && colon.length > 1 && notableSet.has(normTitle(colon[0])));
    const fits = lib.sizeFits(lines);
    const mood = lib.moodScores(lines);
    const readabilityScore = lib.readability(lines);
    const textLines = lines.filter((l) => l.trim());
    const prior = lib.priorScore({
      notable,
      authorNotableCount: (info.notable_poems || []).length,
      readabilityScore,
      mood,
    });

    poems.push({
      id: `pd-${lib.slug(raw.author)}-${lib.slug(raw.title)}`,
      title: raw.title,
      author: raw.author,
      lines,
      lineCount: textLines.length,
      charCount: textLines.join(" ").length,
      longestLine: Math.max(...textLines.map((l) => l.trim().length)),
      size: lib.smallestSize(fits),
      fits,
      mood,
      moodTags: lib.moodTags(mood),
      readability: readabilityScore,
      notable,
      prior,
      ...raw.extra,
      rights: raw.rights,
    });
  }

  // Make ids unique (same title by same author, e.g. untitled sonnets).
  const counts = new Map();
  for (const p of poems) {
    const n = (counts.get(p.id) || 0) + 1;
    counts.set(p.id, n);
    if (n > 1) p.id = `${p.id}-${n}`;
  }

  poems.sort((a, b) => b.prior - a.prior || a.id.localeCompare(b.id));

  const bySize = {};
  const byStatus = {};
  for (const p of poems) {
    bySize[p.size] = (bySize[p.size] || 0) + 1;
    byStatus[p.rights.status] = (byStatus[p.rights.status] || 0) + 1;
  }

  return {
    builtFrom: [path.basename(SNAPSHOT), path.basename(GUTENBERG)],
    fetchedAt: { poetrydb: snapshot.fetchedAt, gutenberg: gutenberg && gutenberg.fetchedAt },
    license: `${snapshot.license} Gutenberg poems: published before ${lib.PD_CUTOFF_YEAR}, see each poem's rights.basis.`,
    sizes: lib.SIZES,
    ranking: {
      prior: "0.40 notable + 0.20 author canon + 0.15 readability + 0.25 mood fit (nature/cozy/thoughtful up, dark down)",
      reactions: lib.REACTION_VALUE,
      priorWeight: lib.PRIOR_WEIGHT,
    },
    counts: { poems: poems.length, skipped, bySize, byStatus },
    poems,
  };
}

if (require.main === module) {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const gutenberg = JSON.parse(fs.readFileSync(GUTENBERG, "utf8"));
  const pool = build(snapshot, gutenberg);
  fs.writeFileSync(OUT, JSON.stringify(pool, null, 1) + "\n");
  console.log(JSON.stringify(pool.counts, null, 2));
}

module.exports = { build, SNAPSHOT, GUTENBERG, OUT };
