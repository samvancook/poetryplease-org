import test from "node:test";
import assert from "node:assert/strict";
import { getAuthorVoteUserIds, getVoteDocsForUserIds } from "./index.js";

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

function fakeUsersFirestore(users) {
  const calls = [];
  const query = (values, after = null, limit = 1000) => ({
    limit(n) { return query(values, after, n); },
    startAfter(doc) { return query(values, doc, limit); },
    async get() {
      calls.push({ after: after?.index ?? null });
      const matching = users
        .map((data, index) => ({ data, index }))
        .filter(({ data }) => (data.roles || []).some((role) => values.includes(role)));
      const start = after ? matching.findIndex((row) => row.index === after.index) + 1 : 0;
      const docs = matching.slice(start, start + limit)
        .map(({ data, index }) => ({ index, id: data.uid, data: () => data }));
      return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
    },
  });
  return {
    calls,
    collection() {
      return {
        where(field, op, values) {
          assert.equal(field, "roles");
          assert.equal(op, "array-contains-any");
          return query(values);
        },
      };
    },
  };
}

test("author lookup reads only author accounts and returns uid and email keys", async () => {
  const users = [
    { uid: "UidA", email: "Poet@Example.com", roles: ["user", "author"] },
    { uid: "uidB", email: "legacy@example.com", roles: ["Author"] },
    ...Array.from({ length: 1500 }, (_, i) => ({ uid: `reader${i}`, email: `r${i}@example.com`, roles: ["user"] })),
  ];
  const firestore = fakeUsersFirestore(users);
  const ids = await getAuthorVoteUserIds({ firestore });
  assert.deepEqual([...ids].sort(), ["legacy@example.com", "poet@example.com", "uida", "uidb"]);
  assert.equal(firestore.calls.length, 1);
});

test("author lookup pages past 1,000 authors", async () => {
  const users = Array.from({ length: 1001 }, (_, i) => ({ uid: `a${i}`, roles: ["author"] }));
  const firestore = fakeUsersFirestore(users);
  const ids = await getAuthorVoteUserIds({ firestore });
  assert.equal(ids.size, 1001);
  assert.equal(firestore.calls.length, 2);
});
