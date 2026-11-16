import test from "node:test";
import assert from "node:assert/strict";
import { loadedSnapshotIsCurrent } from "./content-cache-policy.js";

const DAY = 24 * 60 * 60 * 1000;
const base = { loadedPath: "system/content-feed/a.json", metaPath: "system/content-feed/a.json", snapshotBuiltAtMs: 1_000_000, now: 1_000_000 + 60 * 60 * 1000, snapshotTtlMs: DAY };

test("the snapshot already in memory is reused while the metadata still names it", () => {
  assert.equal(loadedSnapshotIsCurrent(base), true);
});

test("a newer snapshot path forces a reload", () => {
  assert.equal(loadedSnapshotIsCurrent({ ...base, metaPath: "system/content-feed/b.json" }), false);
});

test("a snapshot past its age limit forces a reload", () => {
  assert.equal(loadedSnapshotIsCurrent({ ...base, now: base.snapshotBuiltAtMs + DAY }), false);
});

test("content that was never tied to a snapshot forces a reload", () => {
  assert.equal(loadedSnapshotIsCurrent({ ...base, loadedPath: "" }), false);
  assert.equal(loadedSnapshotIsCurrent({ ...base, metaPath: "" }), false);
  assert.equal(loadedSnapshotIsCurrent({ ...base, snapshotBuiltAtMs: 0 }), false);
});
