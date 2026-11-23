import test from "node:test";
import assert from "node:assert/strict";
import { isFlaggedContentSnapshotUsable, resolveFlaggedContentIds } from "./index.js";

const MIN = 60 * 1000;
const fresh = (over = {}) => ({ version: 1, ids: ["a", "b"], builtFromMs: 100 * MIN, builtAtMs: 100 * MIN + 500, ...over });

test("a fresh, uninvalidated stored list is usable", () => {
  assert.equal(isFlaggedContentSnapshotUsable(fresh(), 110 * MIN), true);
});

test("a stored list is not used once it is 30 minutes old, has the wrong version, or no ids", () => {
  assert.equal(isFlaggedContentSnapshotUsable(fresh(), 130 * MIN), false);
  assert.equal(isFlaggedContentSnapshotUsable(fresh({ version: 0 }), 110 * MIN), false);
  assert.equal(isFlaggedContentSnapshotUsable(fresh({ ids: undefined }), 110 * MIN), false);
  assert.equal(isFlaggedContentSnapshotUsable(null, 110 * MIN), false);
});

test("an invalidation at or after the rebuild started makes the stored list unusable", () => {
  assert.equal(isFlaggedContentSnapshotUsable(fresh({ invalidatedAtMs: 99 * MIN }), 110 * MIN), true);
  assert.equal(isFlaggedContentSnapshotUsable(fresh({ invalidatedAtMs: 100 * MIN }), 110 * MIN), false);
  // Overlapping rebuild: invalidated after it started but before it was written.
  assert.equal(isFlaggedContentSnapshotUsable(fresh({ invalidatedAtMs: 100 * MIN + 200 }), 110 * MIN), false);
  // This instance's own invalidation counts before its write reaches the document.
  assert.equal(isFlaggedContentSnapshotUsable(fresh(), 110 * MIN, 105 * MIN), false);
});

test("uses the stored list without rebuilding when it is usable", async () => {
  let rebuilt = 0, written = 0;
  const ids = await resolveFlaggedContentIds({
    readSnapshot: async () => fresh(),
    writeSnapshot: async () => { written += 1; },
    rebuild: async () => { rebuilt += 1; return new Set(["x"]); },
    now: () => 110 * MIN,
  });
  assert.deepEqual([...ids], ["a", "b"]);
  assert.equal(rebuilt, 0);
  assert.equal(written, 0);
});

test("rebuilds and stores the list when the stored one is stale, recording when the rebuild started", async () => {
  let clock = 140 * MIN;
  const writes = [];
  const ids = await resolveFlaggedContentIds({
    readSnapshot: async () => fresh({ invalidatedAtMs: 120 * MIN }),
    writeSnapshot: async (doc) => { writes.push(doc); },
    rebuild: async () => { clock += 3000; return new Set(["x", "y"]); },
    now: () => clock,
  });
  assert.deepEqual([...ids].sort(), ["x", "y"]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].builtFromMs, 140 * MIN);
  assert.equal(writes[0].builtAtMs, 140 * MIN + 3000);
  assert.equal(writes[0].version, 1);
  assert.deepEqual(writes[0].ids.sort(), ["x", "y"]);
  assert.equal("invalidatedAtMs" in writes[0], false);
});

test("a failed read or write still returns a rebuilt list", async () => {
  const ids = await resolveFlaggedContentIds({
    readSnapshot: async () => { throw new Error("offline"); },
    writeSnapshot: async () => { throw new Error("offline"); },
    rebuild: async () => new Set(["z"]),
    now: () => 1,
  });
  assert.deepEqual([...ids], ["z"]);
});
