import assert from "node:assert/strict";
import test from "node:test";
import { planSecondPass, resolveExcerpt } from "./plan_excerpt_poem_key_second_pass.js";

const passage = "The morning light travels slowly across the empty kitchen floor";
const registry = {
  Roads: { http: 200, book: "Roads", canonical_book_id: "roads", rows: [
    { status: "active", poem_key: "BPP-00001", title: "Morning" },
  ] },
};
const poems = { books: { Roads: { rows: [
  { poem_key: "BPP-00001", served_text: `${passage}. Another line follows.` },
] } } };

test("a unique title cannot assign a key to an unverified excerpt passage", () => {
  const data = { book: "Roads", poem: "Morning", excerpt: "A completely different passage that does not belong to this poem" };
  assert.deepEqual(resolveExcerpt(data, registry, poems), {
    reason: "title_match_without_verified_passage",
  });
});

test("a matching title and verified passage still propose the permanent key", () => {
  const result = resolveExcerpt({ book: "Roads", poem: "Morning", excerpt: passage }, registry, poems);
  assert.equal(result.key, "BPP-00001");
  assert.equal(result.passageVerified, true);
});

test("holding an unverified title match preserves an existing key for review", () => {
  const row = { id: "existing-excerpt", data: {
    book: "Roads", poem: "Morning", excerpt: "Too short", poemKey: "BPP-00002",
    poemKeySource: "catalog_seed_2026-10-15",
  } };
  const before = structuredClone(row);
  const result = planSecondPass([row], registry, poems);
  assert.equal(result.plan.length, 0);
  assert.equal(result.review[0].existingKey, "BPP-00002");
  assert.equal(result.review[0].reason, "title_match_without_verified_passage");
  assert.deepEqual(row, before);
});
