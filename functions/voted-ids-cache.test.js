import test from "node:test";
import assert from "node:assert/strict";
import { getUniqueVotedImageIdsByUser, noteVoteRecorded, clearVotedIdsCache } from "./index.js";

// Minimal stand-in for the votes collection: equality filter on userId, paging
// with limit/startAfter, and a count aggregation. Records what was read.
function fakeFirestore(votes) {
  const stats = { pageReads: 0, countReads: 0, failCount: false };
  const query = (userId, after = null, limit = 1000) => ({
    select() { return query(userId, after, limit); },
    limit(n) { return query(userId, after, n); },
    startAfter(doc) { return query(userId, doc, limit); },
    count() {
      return { async get() {
        stats.countReads += 1;
        if (stats.failCount) throw new Error("count unavailable");
        return { data: () => ({ count: votes.filter((v) => v.userId === userId).length }) };
      } };
    },
    async get() {
      stats.pageReads += 1;
      const matching = votes.map((data, index) => ({ data, index })).filter(({ data }) => data.userId === userId);
      const start = after ? matching.findIndex((row) => row.index === after.index) + 1 : 0;
      const docs = matching.slice(start, start + limit).map(({ data, index }) => ({ index, data: () => data }));
      return { empty: docs.length === 0, docs, forEach: (fn) => docs.forEach(fn) };
    },
  });
  return {
    stats, votes,
    collection() {
      return { where(field, op, userId) { assert.equal(field, "userId"); assert.equal(op, "=="); return query(userId); } };
    },
  };
}

const user = "reader@example.com";
const seed = (n) => Array.from({ length: n }, (_, i) => ({ userId: user, imageId: `IMG-${i}` }));
const clock = (start = 1_000_000) => { let t = start; const now = () => t; now.advance = (ms) => { t += ms; }; return now; };

test("a second load reuses the voted list after one count query", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore([...seed(2500), { userId: "other", imageId: "x" }]);
  const now = clock();
  const first = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.equal(first.size, 2500);
  assert.equal(firestore.stats.pageReads, 4); // 1000 + 1000 + 500 + the empty page
  assert.equal(firestore.stats.countReads, 0);

  now.advance(1000);
  const second = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.deepEqual([...second].sort(), [...first].sort());
  assert.equal(firestore.stats.pageReads, 4, "the vote history was read again");
  assert.equal(firestore.stats.countReads, 1);
});

test("callers get their own copy and cannot corrupt the cached list", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore(seed(3));
  const now = clock();
  const first = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  first.add("not-a-vote");
  const second = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.equal(second.has("not-a-vote"), false);
  assert.equal(second.size, 3);
});

test("a vote recorded by this instance is added without re-reading history", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore(seed(10));
  const now = clock();
  await getUniqueVotedImageIdsByUser(user, { firestore, now });
  now.advance(5000);
  const writeStartedAt = now();
  firestore.votes.push({ userId: user, imageId: "New-Poem" });
  noteVoteRecorded(user, "New-Poem", writeStartedAt);
  const pagesBefore = firestore.stats.pageReads;
  const ids = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.ok(ids.has("new-poem"), "the just-voted poem would be shown again");
  assert.equal(firestore.stats.pageReads, pagesBefore);
});

test("a vote this instance did not see forces a full re-read", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore(seed(10));
  const now = clock();
  await getUniqueVotedImageIdsByUser(user, { firestore, now });
  firestore.votes.push({ userId: user, imageId: "elsewhere" }); // written by another instance
  const pagesBefore = firestore.stats.pageReads;
  const ids = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.ok(ids.has("elsewhere"));
  assert.ok(firestore.stats.pageReads > pagesBefore);
});

test("a list loaded while a vote was being written is dropped, never guessed at", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore(seed(10));
  const now = clock();
  const writeStartedAt = now();          // the vote write begins...
  now.advance(50);
  await getUniqueVotedImageIdsByUser(user, { firestore, now }); // ...a load finishes meanwhile...
  firestore.votes.push({ userId: user, imageId: "racing" });
  noteVoteRecorded(user, "racing", writeStartedAt);              // ...then the write completes
  const pagesBefore = firestore.stats.pageReads;
  const ids = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.ok(ids.has("racing"));
  assert.ok(firestore.stats.pageReads > pagesBefore, "the uncertain list was reused");
});

test("the list expires so a superseded vote reappears within the lifetime", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore(seed(3));
  const now = clock();
  const first = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.ok(first.has("img-1"));
  firestore.votes[1].supersededAt = "later"; // same document count, different meaning
  now.advance(60 * 1000);
  assert.ok((await getUniqueVotedImageIdsByUser(user, { firestore, now })).has("img-1"));
  now.advance(10 * 60 * 1000);
  assert.equal((await getUniqueVotedImageIdsByUser(user, { firestore, now })).has("img-1"), false);
});

test("a failed count falls back to a full read", async () => {
  clearVotedIdsCache();
  const firestore = fakeFirestore(seed(3));
  const now = clock();
  await getUniqueVotedImageIdsByUser(user, { firestore, now });
  firestore.stats.failCount = true;
  const pagesBefore = firestore.stats.pageReads;
  const ids = await getUniqueVotedImageIdsByUser(user, { firestore, now });
  assert.equal(ids.size, 3);
  assert.ok(firestore.stats.pageReads > pagesBefore);
});
