import test from "node:test";
import assert from "node:assert/strict";
import { isScoreboardContentUsable, resolveScoreboardContent } from "./index.js";

const H = 60 * 60 * 1000;
const copy = (over = {}) => ({ version: 1, generation: 7, readAtMs: 100 * H, graphics: [], excerpts: [], fullPoems: [], videos: [], ...over });

test("a copy is used only for the same content generation and for 6 hours", () => {
  assert.equal(isScoreboardContentUsable(copy(), 7, 105 * H), true);
  assert.equal(isScoreboardContentUsable(copy(), 8, 105 * H), false);
  assert.equal(isScoreboardContentUsable(copy(), 7, 106 * H), false);
  assert.equal(isScoreboardContentUsable(copy({ version: 0 }), 7, 101 * H), false);
  assert.equal(isScoreboardContentUsable(copy({ videos: undefined }), 7, 101 * H), false);
  assert.equal(isScoreboardContentUsable(null, 7, 101 * H), false);
});

const deps = (over = {}) => {
  const calls = { collections: 0, stored: 0 };
  return {
    calls,
    readGeneration: async () => 7,
    readMemory: () => null,
    readStored: async () => null,
    readCollections: async () => { calls.collections += 1; return { graphics: [{ id: "g", when: new Date(0) }], excerpts: [], fullPoems: [], videos: [] }; },
    store: async () => { calls.stored += 1; },
    now: () => 101 * H,
    ...over,
  };
};

test("uses the in-memory copy, then the stored copy, before reading Firestore", async () => {
  let d = deps({ readMemory: () => copy() });
  assert.equal((await resolveScoreboardContent(d)).source, "memory");
  assert.equal(d.calls.collections, 0);
  d = deps({ readStored: async () => copy() });
  assert.equal((await resolveScoreboardContent(d)).source, "stored");
  assert.equal(d.calls.collections, 0);
});

test("reads the collections when the generation moved, and stores the copy under the generation read first", async () => {
  let generation = 8;
  const d = deps({ readMemory: () => copy(), readStored: async () => copy(), readGeneration: async () => generation });
  const result = await resolveScoreboardContent(d);
  generation = 9;
  assert.equal(result.source, "firestore");
  assert.equal(result.copy.generation, 8);
  assert.equal(result.copy.readAtMs, 101 * H);
  assert.equal(d.calls.collections, 1);
  assert.equal(d.calls.stored, 1);
  // A fresh read has the same JSON shape a stored copy would.
  assert.equal(result.copy.graphics[0].when, "1970-01-01T00:00:00.000Z");
});

test("a failed stored read or write still returns content", async () => {
  const d = deps({ readStored: async () => { throw new Error("offline"); }, store: async () => { throw new Error("offline"); } });
  const result = await resolveScoreboardContent(d);
  assert.equal(result.source, "firestore");
  assert.equal(result.copy.graphics.length, 1);
});
