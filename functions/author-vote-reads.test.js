import test from "node:test";
import assert from "node:assert/strict";
import { getVoteDocsForUserIds } from "./index.js";

function fakeFirestore(votes) {
  const calls = [];
  const query = (ids, after = null, limit = 1000) => ({
    limit(n) { return query(ids, after, n); },
    startAfter(doc) { return query(ids, doc, limit); },
    async get() {
      calls.push({ ids: [...ids], after: after?.index ?? null });
      const matching = votes
        .map((data, index) => ({ data, index }))
        .filter(({ data }) => ids.includes(data.userId));
      const start = after ? matching.findIndex((row) => row.index === after.index) + 1 : 0;
      const docs = matching.slice(start, start + limit).map(({ data, index }) => ({ index, data: () => data }));
      return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
    },
  });
  return {
    calls,
    collection() {
      return { where(field, op, ids) { assert.equal(field, "userId"); assert.equal(op, "in"); assert.ok(ids.length <= 30); return query(ids); } };
    },
  };
}

test("reads only the requested users' votes in chunks of 30", async () => {
  const authors = Array.from({ length: 45 }, (_, i) => `author${i}@example.com`);
  const votes = [
    ...authors.map((userId) => ({ userId, imageId: `img-${userId}`, voteType: "dislike" })),
    ...Array.from({ length: 500 }, (_, i) => ({ userId: `poetrylover${i}`, imageId: "x", voteType: "like" })),
  ];
  const firestore = fakeFirestore(votes);
  const docs = await getVoteDocsForUserIds(new Set(authors), { firestore });
  assert.equal(docs.length, 45);
  assert.ok(docs.every((vote) => vote.userId.startsWith("author")));
  assert.equal(firestore.calls.length, 2);
});

test("pages through more than 1000 votes for one user", async () => {
  const votes = Array.from({ length: 2500 }, (_, i) => ({ userId: "a@example.com", imageId: `img${i}` }));
  const firestore = fakeFirestore(votes);
  const docs = await getVoteDocsForUserIds(["a@example.com"], { firestore });
  assert.equal(docs.length, 2500);
  assert.equal(firestore.calls.length, 3);
});

test("does no reads when there are no ids", async () => {
  const firestore = fakeFirestore([]);
  assert.deepEqual(await getVoteDocsForUserIds(new Set(), { firestore }), []);
  assert.equal(firestore.calls.length, 0);
});
