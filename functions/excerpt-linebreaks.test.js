import test from "node:test";
import assert from "node:assert/strict";
import { excerptHash, normalizeLookupText, planLinebreakUndo, planLinebreakUpdate } from "./excerpt-linebreaks.js";

// Expected values produced by Weaver's excerpt_library.normalize_lookup_text / fingerprint_excerpt.
const WEAVER_FIXTURES = [
  {
    "text": "“The river doesn’t ask\npermission to bend.”",
    "normalized": "the river doesn't ask permission to bend",
    "hash": "ebe81dc9dea779ab18f61b07e7b4c632c14b7450ac83a34f79f606b2c5dbb9cb"
  },
  {
    "text": "the river doesn't ask permission to bend",
    "normalized": "the river doesn't ask permission to bend",
    "hash": "ebe81dc9dea779ab18f61b07e7b4c632c14b7450ac83a34f79f606b2c5dbb9cb"
  },
  {
    "text": "*Italic* words & dashes—like this – and ‘single’ quotes",
    "normalized": "italic words and dashes like this and single quotes",
    "hash": "308ab603b31a0887c2b60ef726b4e4807fb3d51a126b22f3afa1aca24206dc7b"
  },
  {
    "text": "  Ends with... ellipsis / and slash  [FB]",
    "normalized": "ends with ellipsis and slash fb",
    "hash": "83e92c3a9994958896cc440ee2f90a39e537cbb627c3c266ca547628723bdbd6"
  },
  {
    "text": "Café naïve résumé",
    "normalized": "caf na ve r sum",
    "hash": "b8acd136f7cfb84e30378aea09b7f82f84c9f617555be662bb23b4ce089de924"
  },
  {
    "text": "rock 'n' roll isn't 'quoted'",
    "normalized": "rock n roll isn't quoted",
    "hash": "822c1582cb1c6c8eb2f0b63b3538128804dbf3fdd275a6da084d4b6b0b8c7451"
  },
  {
    "text": "Tabs\tand\n\nblank lines\n",
    "normalized": "tabs and blank lines",
    "hash": "44b261fa065b2185e300c92dc1ba9f8dcfda3fdd5f1f5ce3284e11ab7ed75242"
  }
];

test("matches Weaver's normalization and hash", () => {
  for (const fixture of WEAVER_FIXTURES) {
    assert.equal(normalizeLookupText(fixture.text), fixture.normalized, fixture.text);
    assert.equal(excerptHash(fixture.text), fixture.hash, fixture.text);
  }
});

test("hash is unchanged by adding line breaks", () => {
  assert.equal(excerptHash("one two three four"), excerptHash("one two\nthree four"));
});

const ORIGINAL = "\u201cThe river doesn\u2019t ask permission to bend.\u201d";
const overlay = new Map([[excerptHash(ORIGINAL), {
  tier: "auto",
  status: "exact",
  ratio: 1,
  catalog_poem_id: 7,
  text_original: ORIGINAL,
  text_linebroken: "The river doesn\u2019t ask\npermission to bend.",
}]]);

test("plans an update that preserves the original", () => {
  const plan = planLinebreakUpdate({ excerpt: ORIGINAL }, overlay);
  assert.equal(plan.action, "update");
  assert.equal(plan.fields.excerptOriginal, ORIGINAL);
  assert.equal(plan.fields.excerpt, "The river doesn\u2019t ask\npermission to bend.");
  assert.equal(plan.fields.linebreakSource, "book_exact");
});

test("skips documents that were already applied, not covered, or gain nothing", () => {
  assert.equal(planLinebreakUpdate({ excerpt: "x", excerptOriginal: "x", linebreakSource: "book_exact" }, overlay).reason, "already_applied");
  assert.equal(planLinebreakUpdate({ excerpt: "something else entirely" }, overlay).reason, "not_in_overlay");
  const flat = new Map([[excerptHash(ORIGINAL), { ...overlay.get(excerptHash(ORIGINAL)), text_linebroken: ORIGINAL }]]);
  assert.equal(planLinebreakUpdate({ excerpt: ORIGINAL }, flat).reason, "no_gain");
});

test("skips review-tier entries unless asked", () => {
  const review = new Map([[excerptHash(ORIGINAL), { ...overlay.get(excerptHash(ORIGINAL)), tier: "review" }]]);
  assert.equal(planLinebreakUpdate({ excerpt: ORIGINAL }, review).reason, "tier_review");
  assert.equal(planLinebreakUpdate({ excerpt: ORIGINAL }, review, { tiers: ["auto", "review"] }).action, "update");
});

test("undo restores the saved original", () => {
  assert.equal(planLinebreakUndo({ excerpt: "a\nb", excerptOriginal: "a b", linebreakSource: "book_exact" }).fields.excerpt, "a b");
  assert.equal(planLinebreakUndo({ excerpt: "a b" }).action, "skip");
});
