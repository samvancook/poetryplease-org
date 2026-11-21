import test from "node:test";
import assert from "node:assert/strict";
import { retitleGraphic, validRetitleItem } from "./graphic-retitle.js";

const DELETE = Symbol("delete");

function fake(docs) {
  const updates = [];
  return {
    updates,
    deps: {
      getGraphic: async (id) => docs[id] ?? null,
      updateGraphic: async (id, patch) => updates.push({ id, patch }),
      deleteValue: DELETE,
      now: () => Date.parse("2026-11-17T22:00:00Z"),
    },
  };
}

test("renames the title and keeps the old one", async () => {
  const { deps, updates } = fake({ a: { title: "Gravity", author: "Patrick Roche", book: "ASAB" } });
  const out = await retitleGraphic({ id: "a", expectTitle: "Gravity", title: "Hocus Pocus", excerptRow: 12 }, deps);
  assert.equal(out.status, "retitled");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.title, "Hocus Pocus");
  assert.equal(updates[0].patch.poem, undefined);
  assert.deepEqual(updates[0].patch.ocrRetitle.before, { title: "Gravity" });
  assert.equal(updates[0].patch.ocrRetitle.excerptRow, 12);
});

test("dry run writes nothing", async () => {
  const { deps, updates } = fake({ a: { title: "Gravity", author: "X" } });
  const out = await retitleGraphic({ id: "a", expectTitle: "Gravity", title: "Hudson" }, deps, { dryRun: true });
  assert.equal(out.status, "would_retitle");
  assert.equal(updates.length, 0);
});

test("skips when the title changed since the plan was made, or it was already fixed", async () => {
  const { deps, updates } = fake({ a: { title: "Edited by hand", author: "X" }, b: { title: "T", author: "X", ocrRetitle: {} } });
  assert.equal((await retitleGraphic({ id: "a", expectTitle: "Gravity", title: "Hudson" }, deps)).reason, "title_changed");
  assert.equal((await retitleGraphic({ id: "b", expectTitle: "T", title: "U" }, deps)).reason, "already_retitled");
  assert.equal((await retitleGraphic({ id: "zz", expectTitle: "T", title: "U" }, deps)).reason, "graphic_missing");
  assert.equal(updates.length, 0);
});

test("moves book fields from a same-author reference and clears the poem key", async () => {
  const { deps, updates } = fake({
    a: { title: "Chameleon", poem: "Chameleon", author: "Rudy Francisco", book: "Helium", bookShortener: "HELI", poemKey: "K1", poemKeySource: "s" },
    ref: { title: "Click", author: "Rudy Francisco", book: "I'll Fly Away", bookShortener: "IFA", bookLink: "https://x" },
  });
  const out = await retitleGraphic({ id: "a", expectTitle: "Chameleon", title: "Click", book: "I'll Fly Away", bookFieldsFrom: "ref" }, deps);
  assert.equal(out.status, "retitled");
  const { patch } = updates[0];
  assert.equal(patch.poem, "Click");
  assert.equal(patch.book, "I'll Fly Away");
  assert.equal(patch.bookShortener, "IFA");
  assert.equal(patch.bookLink, "https://x");
  assert.equal(patch.poemKey, DELETE);
  assert.equal(patch.poemKeySource, DELETE);
  assert.deepEqual(patch.ocrRetitle.before, { title: "Chameleon", poem: "Chameleon", book: "Helium", bookShortener: "HELI", bookLink: null, poemKey: "K1", poemKeySource: "s" });
});

test("refuses a book reference from another author or book", async () => {
  const { deps, updates } = fake({
    a: { title: "T", author: "A" },
    other: { author: "B", book: "Bk" },
  });
  assert.equal((await retitleGraphic({ id: "a", expectTitle: "T", title: "U", book: "Bk", bookFieldsFrom: "other" }, deps)).reason, "book_reference_other_author");
  assert.equal((await retitleGraphic({ id: "a", expectTitle: "T", title: "U", book: "Nope", bookFieldsFrom: "other" }, deps)).reason, "book_reference_mismatch");
  assert.equal(updates.length, 0);
});

test("moves a record to another poet when the image is theirs", async () => {
  const { deps, updates } = fake({
    a: { title: "Wishes", author: "Steven Willis", book: "APP", bookShortener: "APP" },
    ref: { title: "Quitters", author: "Stevie Edwards", book: "Sadness Workshop", bookShortener: "SW" },
  });
  const out = await retitleGraphic({ id: "a", expectTitle: "Wishes", title: "Against Desire", author: "Stevie Edwards", book: "Sadness Workshop", bookFieldsFrom: "ref" }, deps);
  assert.equal(out.status, "retitled");
  const { patch } = updates[0];
  assert.equal(patch.author, "Stevie Edwards");
  assert.equal(patch.bookShortener, "SW");
  assert.equal(patch.ocrRetitle.before.author, "Steven Willis");
  // A book reference from the old poet is refused once the author changes.
  const again = fake({ a: { title: "W", author: "X" }, ref: { author: "X", book: "B" } });
  assert.equal((await retitleGraphic({ id: "a", expectTitle: "W", title: "T", author: "Y", book: "B", bookFieldsFrom: "ref" }, again.deps)).reason, "book_reference_other_author");
});

test("validates items", () => {
  assert.ok(validRetitleItem({ id: "a", expectTitle: "", title: "U" }));
  assert.ok(!validRetitleItem({ id: "a/b", expectTitle: "T", title: "U" }));
  assert.ok(!validRetitleItem({ id: "a", expectTitle: "T", title: " " }));
  assert.ok(!validRetitleItem({ id: "a", expectTitle: "T", title: "U", book: "B" }));
  assert.ok(!validRetitleItem({ id: "a", expectTitle: "T", title: "U", author: " " }));
});
