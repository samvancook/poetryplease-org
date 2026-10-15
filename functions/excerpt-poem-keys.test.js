import test from "node:test";
import assert from "node:assert/strict";
import { excerptHash } from "./excerpt-linebreaks.js";
import { parsePoemKeySeed, planExcerptPoemKey, lookupExcerptPoemKey } from "./excerpt-poem-keys.js";

test("CSV seed preserves quoted commas and multiline titles", () => {
  const seed = parsePoemKeySeed(`excerpt_hash,catalog_book,poem_key,match,poem_title\n${excerptHash("a line")},Roads,BPP-00001,unique,"Title, with\na newline"\n`);
  assert.equal([...seed.values()][0].poem_title, "Title, with\na newline");
  assert.throws(() => parsePoemKeySeed("poem_key\nBPP-00001"), /missing_seed_column/);
});

test("backfill requires the current hash, unique match, and matching book; existing keys survive", () => {
  const row = { match: "unique", catalog_book: "Roads", poem_key: "BPP-00001" };
  const seed = new Map([[excerptHash("a line"), row]]);
  const data = { book: "Roads", excerpt: "a\nline" };
  assert.equal(planExcerptPoemKey(data, seed).fields.poemKey, "BPP-00001");
  assert.equal(planExcerptPoemKey({ ...data, book: "Another book" }, seed).reason, "book_mismatch");
  assert.equal(planExcerptPoemKey({ ...data, excerpt: "different text" }, seed).reason, "hash_not_in_seed");
  assert.equal(planExcerptPoemKey({ ...data, poemKey: "BPP-00002" }, seed).reason, "already_keyed");
  assert.equal(planExcerptPoemKey(data, new Map([[excerptHash("a line"), { ...row, match: "ambiguous" }]])).reason, "ambiguous");
});

test("new excerpt lookup handles repeated titles and outages without blocking imports", async () => {
  const data = { book: "Roads", poem: '“Poem”' };
  const row = { book_title: "Roads", title: "Poem", poem_key: "BPP-00001" };
  assert.equal((await lookupExcerptPoemKey(data, {}, async () => [row])).poemKey, "BPP-00001");
  assert.equal((await lookupExcerptPoemKey(data, {}, async () => [row, { ...row, poem_key: "BPP-00002" }])).poemKey, "");
  assert.equal((await lookupExcerptPoemKey(data, {}, async () => { throw new Error("offline"); })).poemKeySource, "catalog_lookup_unavailable");
  assert.deepEqual(await lookupExcerptPoemKey(data, { ...data, poemKey: "BPP-00001" }, async () => { throw new Error("must not fetch"); }), {});
  assert.equal((await lookupExcerptPoemKey({ book: "" }, {}, null)).poemKeySource, "no_book_source");
});
