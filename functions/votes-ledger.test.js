import test from "node:test";
import assert from "node:assert/strict";
import { applyVotesLedgerChanges, isVotesLedgerUsable, votesLedgerRows } from "./index.js";

const H = 60 * 60 * 1000;
const ledger = (over = {}) => ({ version: 1, fullScanAtMs: 100 * H, syncedAtMs: 101 * H, votes: new Map(), ...over });

test("a ledger is trusted until a day after its full scan, and not after a reset", () => {
  assert.equal(isVotesLedgerUsable(ledger(), 110 * H), true);
  assert.equal(isVotesLedgerUsable(ledger(), 124 * H), false);
  assert.equal(isVotesLedgerUsable(ledger(), 110 * H, 99 * H), true);
  assert.equal(isVotesLedgerUsable(ledger(), 110 * H, 100 * H), false);
  assert.equal(isVotesLedgerUsable(ledger(), 110 * H, 105 * H), false);
  assert.equal(isVotesLedgerUsable(ledger({ version: 0 }), 110 * H), false);
  assert.equal(isVotesLedgerUsable(ledger({ syncedAtMs: 0 }), 110 * H), false);
  assert.equal(isVotesLedgerUsable(null, 110 * H), false);
});

test("new votes are added, changed ones replaced, superseded ones removed", () => {
  const votes = new Map([
    ["a", { id: "a", imageId: "img1", voteType: "like", userId: "u1", timestamp: 1000 }],
    ["b", { id: "b", imageId: "img2", voteType: "meh", userId: "u2", timestamp: 2000 }],
    ["c", { id: "c", imageId: "img3", voteType: "like", userId: "u3", timestamp: 3000 }],
  ]);
  applyVotesLedgerChanges(votes, {
    written: [
      { id: "d", imageId: "img4", voteType: "Dislike", userId: "u1", timestamp: { toMillis: () => 5000 } },
      { id: "e", imageId: "img5", voteType: "like", userId: "u1", timestamp: { toMillis: () => 6000 }, supersededAt: { toMillis: () => 7000 } },
    ],
    superseded: ["b"],
  });
  assert.deepEqual([...votes.keys()].sort(), ["a", "c", "d"]);
  assert.deepEqual(votes.get("d"), { id: "d", imageId: "img4", voteType: "dislike", userId: "u1", timestamp: 5000 });
});

test("rows come back in document id order with timestamps the scoreboard reads to the millisecond", () => {
  const votes = new Map([
    ["z9", { id: "z9", imageId: "i", voteType: "like", userId: "u", timestamp: 1732400000123 }],
    ["A1", { id: "A1", imageId: "i", voteType: "meh", userId: "u", timestamp: null }],
    ["m5", { id: "m5", imageId: "i", voteType: "like", userId: "u", timestamp: 1732400000999 }],
  ]);
  const rows = votesLedgerRows(votes);
  assert.deepEqual(rows.map((r) => r.id), ["A1", "m5", "z9"]);
  assert.equal(rows[0].timestamp, null);
  const ms = (t) => (t._seconds * 1000) + Math.floor((t._nanoseconds || 0) / 1e6);
  assert.equal(ms(rows[1].timestamp), 1732400000999);
  assert.equal(ms(rows[2].timestamp), 1732400000123);
});
