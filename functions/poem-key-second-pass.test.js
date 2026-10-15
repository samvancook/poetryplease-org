import test from "node:test";
import assert from "node:assert/strict";
import { resolveExcerpt, planSecondPass } from "./plan_excerpt_poem_key_second_pass.js";
import { planExcerptPoemKey } from "./excerpt-poem-keys.js";
import { excerptHash } from "./excerpt-linebreaks.js";

const passage = "Here is a sufficiently long exact passage with several words for verification.";
const registry = { Canonical: { http: 200, book: "Home.Girl.Hood.", canonical_book_id: 1,
  rows: [{ poem_key: "BPP-00001", title: "First", status: "active" },
    { poem_key: "BPP-00002", title: "Second", status: "active" },
    { poem_key: "BPP-00003", title: "Retired", status: "retired" }] } };
const poems = { books: { Canonical: { rows: [{ poem_key: "BPP-00001", text: passage },
  { poem_key: "BPP-00002", text: "An entirely different poem." }] } } };
const data = { book: "Home. Girl. Hood.", poem: "First", excerpt: passage };

test("book punctuation resolves only one canonical book; retired keys are never assigned", () => {
  assert.equal(resolveExcerpt(data, registry, poems).key, "BPP-00001");
  const collision = { ...registry, Other: { ...registry.Canonical, canonical_book_id: 2 } };
  assert.equal(resolveExcerpt(data, collision, poems).reason, "ambiguous_book");
  assert.notEqual(resolveExcerpt({ ...data, poem: "Retired", excerpt: "short" }, registry, poems).key, "BPP-00003");
});
test("repeated titles require unique matching text, checking every source variant", () => {
  const repeated = structuredClone(registry);
  repeated.Canonical.rows[1].title = "First";
  assert.equal(resolveExcerpt(data, repeated, poems).key, "BPP-00001");
  const duplicatePassage = structuredClone(poems);
  duplicatePassage.books.Canonical.rows.push({ poem_key: "BPP-00002", text: passage });
  assert.equal(resolveExcerpt(data, repeated, duplicatePassage).reason, "ambiguous_poem_title");
});
test("existing seed corrections require passage proof and protect other sources", () => {
  const row = { id: "one", updateTime: { seconds: 1, nanoseconds: 0 },
    data: { ...data, poemKey: "BPP-00002", poemKeySource: "catalog_seed_2026-10-15" } };
  assert.equal(planSecondPass([row], registry, poems).plan[0].fields.poemKeySource, "catalog_verified_seed_correction");
  assert.equal(planSecondPass([{ ...row, data: { ...row.data, excerpt: "short" } }], registry, poems).plan.length, 0);
  assert.equal(planSecondPass([{ ...row, data: { ...row.data, poemKeySource: "manual" } }], registry, poems).plan.length, 0);
});
test("seed hash alone cannot override a conflicting poem title", () => {
  const seed = new Map([[excerptHash(passage), { catalog_book: data.book, match: "unique", poem_key: "BPP-00002", poem_title: "Second" }]]);
  assert.equal(planExcerptPoemKey(data, seed, { requireTitle: true }).reason, "poem_title_mismatch");
});
