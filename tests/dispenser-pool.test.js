"use strict";

// Checks for the Poetry Dispenser public-domain pool
// (imports/dispenser-pool/pool.json) and its Playdate export.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lib = require("../scripts/dispenser-pool/pool-lib.js");
const { build, SNAPSHOT, GUTENBERG, PDP, OUT } = require("../scripts/dispenser-pool/build-pool.js");
const gutenbergBooks = require("../scripts/dispenser-pool/fetch-gutenberg.js").BOOKS;
const playdate = require("../scripts/dispenser-pool/build-playdate.js");

const pool = JSON.parse(fs.readFileSync(OUT, "utf8"));

test("dispenser pool: pool.json matches a fresh build of the snapshot", () => {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const gutenberg = JSON.parse(fs.readFileSync(GUTENBERG, "utf8"));
  const pdp = JSON.parse(fs.readFileSync(PDP, "utf8"));
  const fresh = JSON.parse(JSON.stringify(build(snapshot, gutenberg, pdp)));
  assert.deepEqual(pool, fresh, "run: node scripts/dispenser-pool/build-pool.js");
});

test("dispenser pool: every poem has text, a unique id and a rights record", () => {
  assert.ok(pool.poems.length >= 300, `expected a few hundred poems, got ${pool.poems.length}`);
  const ids = new Set();
  for (const p of pool.poems) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.title && p.author, `${p.id} missing title/author`);
    assert.ok(p.lines.some((l) => l.trim()), `${p.id} has no text`);
    assert.ok(!p.lines.some((l) => /\[back\]|^\s*Note \d+\./.test(l)), `${p.id} still has a footnote`);
    assert.ok(!lib.isGarbled(p.title, p.lines), `${p.id} has lost characters or is a picture caption`);
    assert.ok(p.rights && p.rights.source && p.rights.basis, `${p.id} missing rights source/basis`);
    assert.match(p.rights.status, /^public-domain-us/, `${p.id} is ${p.rights.status}`);
    if (p.collection) {
      // Gutenberg book: cleared by publication year.
      assert.ok(p.published < lib.PD_CUTOFF_YEAR, `${p.id} published ${p.published}`);
      assert.match(p.rights.source, /Project Gutenberg #\d+/);
    } else {
      assert.ok(p.rights.authorDied < lib.PD_CUTOFF_YEAR, `${p.id} author died ${p.rights.authorDied}`);
    }
  }
});

test("gutenberg sources: every book is pre-1931 and says why it is here", () => {
  for (const b of gutenbergBooks) {
    assert.ok(b.year < lib.PD_CUTOFF_YEAR, `#${b.id} ${b.year}`);
    assert.ok(b.why && b.book && b.repo.endsWith(`_${b.id}`), `#${b.id}`);
  }
  const g = JSON.parse(fs.readFileSync(GUTENBERG, "utf8"));
  // Translated work must name a public-domain translator.
  for (const p of g.poems) {
    if (/Rumi|Hafez|Japanese|Tagore/.test(p.author)) assert.ok(p.translator, `${p.author}: ${p.title} has no translator`);
    assert.ok(!/gutenberg|produced by|https?:/i.test(p.lines.join(" ")), `${p.title} has front matter`);
  }
});

test("public-domain-poetry.com set: only poets in the cleared table, all died before 1931", () => {
  const { CLEARED } = require("../scripts/dispenser-pool/pdp-authors.js");
  const cleared = new Set(Object.values(CLEARED).map((v) => v[0]));
  const pdp = JSON.parse(fs.readFileSync(PDP, "utf8"));
  for (const p of pdp.poems) {
    assert.ok(cleared.has(p.author), `${p.author} not in cleared table`);
    assert.ok(p.authorDied < lib.PD_CUTOFF_YEAR, `${p.author} died ${p.authorDied}`);
  }
  for (const name of ["Emily Dickinson", "Yehuda Amichai", "Nizar Qabbani", "Robert Lee Frost", "Basho"]) {
    assert.ok(!pdp.poems.some((p) => p.author === name), `${name} should not be cleared`);
  }
});

test("dispenser pool: size tags match the text", () => {
  for (const p of pool.poems) {
    const fits = lib.sizeFits(p.lines);
    assert.deepEqual(p.fits, fits, p.id);
    assert.equal(p.size, lib.smallestSize(fits), p.id);
    if (p.size === "slip3") assert.ok(p.lineCount <= 3, p.id);
    if (p.size === "slip5") assert.ok(p.lineCount <= 5, p.id);
    // Anything that fits a smaller size also fits the bigger ones.
    if (p.fits.slip3) assert.ok(p.fits.slip5, p.id);
    if (p.fits.playdate) assert.ok(p.fits.phone, p.id);
  }
  const counts = pool.counts.bySize;
  assert.ok((counts.slip3 || 0) + (counts.slip5 || 0) >= 30, "need some slips");
  assert.ok(counts.playdate >= 100, "need enough Playdate-sized poems");
});

test("dispenser pool: sorted best-first by prior score", () => {
  for (let i = 1; i < pool.poems.length; i++) {
    assert.ok(pool.poems[i - 1].prior >= pool.poems[i].prior, `order broken at ${i}`);
  }
  // Notable classics should sit near the top.
  const top = pool.poems.slice(0, 50);
  assert.ok(top.filter((p) => p.notable).length >= 15, "notable poems not near the top");
});

test("pool-lib: wrapping counts rows the way a small screen would", () => {
  assert.equal(lib.wrappedRows("", 10), 1);
  assert.equal(lib.wrappedRows("one two", 10), 1);
  assert.equal(lib.wrappedRows("one two three", 10), 2);
  assert.equal(lib.wrappedRows("abcdefghijklmnop", 10), 2);
  assert.equal(lib.rowsAt(["a", "", "b"], 10), 3);
});

test("pool-lib: mood leans nature/cozy/thoughtful and flags dark", () => {
  const nature = lib.moodScores(["The trees and the river and the moon", "and the birds in spring"]);
  assert.ok(lib.moodTags(nature).includes("nature"));
  const dark = lib.moodScores(["Death and the grave and blood", "the dead lie slain"]);
  assert.ok(lib.moodTags(dark).includes("dark"));
  assert.ok(lib.moodFit(nature) > lib.moodFit(dark));
});

test("pool-lib: reactions blend with the prior and eventually decide", () => {
  assert.equal(lib.blendedScore(0.5, {}), 0.5);
  assert.ok(lib.blendedScore(0.5, { moved: 3 }) > 0.5);
  assert.ok(lib.blendedScore(0.5, { dislike: 3 }) < 0.5);
  assert.ok(lib.blendedScore(0.2, { moved: 200 }) > 0.95);
  assert.ok(lib.blendedScore(0.9, { dislike: 200 }) < 0.05);
});

test("pool-lib: rights only passes authors who died before the cutoff", () => {
  assert.equal(lib.rightsFor("X", { died: "3 May 1845" }).status, "public-domain-us");
  assert.equal(lib.rightsFor("X", { died: "1950" }).status, "needs-review");
  assert.equal(lib.rightsFor("X", {}).status, "needs-review");
  assert.equal(lib.rightsFor("Emily Dickinson", { died: "1886" }).status, "public-domain-us-check-posthumous");
});

test("playdate export: poems.json is current and fits the screen", () => {
  const file = JSON.parse(fs.readFileSync(playdate.OUT, "utf8"));
  const fresh = JSON.parse(JSON.stringify(playdate.exportPoems(pool)));
  assert.deepEqual(file, fresh, "run: node scripts/dispenser-pool/build-playdate.js");
  assert.ok(file.poems.length >= 50);
  const perAuthor = {};
  for (const p of file.poems) perAuthor[p.author] = (perAuthor[p.author] || 0) + 1;
  assert.ok(Math.max(...Object.values(perAuthor)) <= 10, "one author dominates the Playdate set");
  for (const p of file.poems) {
    assert.ok(lib.rowsAt(p.lines, lib.SIZES.playdate.cols) <= lib.SIZES.playdate.rows, p.id);
    assert.ok(!p.moodTags.includes("dark"), `${p.id} is dark`);
    assert.ok(p.lines.every((l) => /^[\x20-\x7e]*$/.test(l)), `${p.id} has characters the Playdate font may lack`);
  }
});

test("classics test mix: off by default, one in ten, never two in a row", async () => {
  const mix = await import("../public/scroll-feed-core.js");
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const s = store();
  assert.equal(mix.classicsTestOn("", s), false);
  assert.equal(mix.classicsTestOn("?classics=1", s), true);
  assert.equal(mix.classicsTestOn("", s), true, "remembered for the tab");
  assert.equal(mix.classicsTestOn("?classics=0", s), false);

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "classics-mix.json"), "utf8"));
  const classics = mix.classicItems(data);
  assert.ok(classics.length >= 30);
  for (const c of classics) {
    assert.ok(c.classic && c.type === "FP" && c.id.startsWith("PD-") && c.text && c.title && c.author, c.id);
    assert.ok(!c.bookUrl, `${c.id} must not link to a Button book`);
  }
  const mixer = mix.createClassicsMixer(classics, { random: () => 0.5 });
  const shown = [];
  for (let b = 0; b < 20; b++) shown.push(...mixer(Array.from({ length: 3 }, (_, i) => ({ id: `r${b}-${i}` }))));
  const flags = shown.map((x) => !!x.classic);
  for (let i = 1; i < flags.length; i++) assert.ok(!(flags[i] && flags[i - 1]), "two classics in a row");
  const n = flags.filter(Boolean).length;
  assert.equal(n, Math.floor(60 / (mix.CLASSICS_EVERY - 1)), "one classic after every nine regular cards");
  assert.equal(new Set(shown.filter((x) => x.classic).map((x) => x.id)).size, n, "no repeats");
});

test("classics test mix: data matches the checked sample", () => {
  const cm = require("../scripts/dispenser-pool/build-classics-mix.js");
  const fresh = JSON.parse(JSON.stringify(cm.exportMix(JSON.parse(fs.readFileSync(cm.SAMPLE, "utf8")))));
  assert.deepEqual(JSON.parse(fs.readFileSync(cm.OUT, "utf8")), fresh, "run: node scripts/dispenser-pool/build-classics-mix.js");
  const ids = new Set(pool.poems.map((p) => p.id));
  for (const p of fresh.poems) {
    assert.ok(ids.has(p.id), `${p.id} is not in the cleared pool`);
    assert.match(p.checkedUrl, /^https:\/\//, `${p.id} has no source for its date`);
  }
});
