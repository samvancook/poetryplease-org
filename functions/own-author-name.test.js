import test from "node:test";
import assert from "node:assert/strict";
import { resolveOwnAuthorDisplayName } from "./index.js";

// Stand-in for the authorProfiles collection that records which documents were read.
function fakeFirestore(profiles) {
  const reads = [];
  return {
    reads,
    collection(name) {
      return { doc(id) { return { async get() {
        reads.push(`${name}/${id}`);
        const data = profiles[id];
        return { exists: data !== undefined, data: () => data };
      } }; } };
    },
  };
}

const decoded = { uid: "uid-1", name: "Token Name", email: "author@example.com" };

test("uses the linked profile's display name with a single document read", async () => {
  const firestore = fakeFirestore({ "profile-9": { displayName: "  Pen Name " } });
  const name = await resolveOwnAuthorDisplayName(decoded, { authorProfileId: "profile-9" }, { firestore });
  assert.equal(name, "Pen Name");
  assert.deepEqual(firestore.reads, ["authorProfiles/profile-9"]);
});

test("looks the profile up by uid when the account has no linked profile id", async () => {
  const firestore = fakeFirestore({ "uid-1": { displayName: "Uid Profile" } });
  assert.equal(await resolveOwnAuthorDisplayName(decoded, {}, { firestore }), "Uid Profile");
  assert.deepEqual(firestore.reads, ["authorProfiles/uid-1"]);
});

test("an existing profile without a display name resolves to empty, as the editor does", async () => {
  const firestore = fakeFirestore({ "uid-1": { slug: "x" } });
  assert.equal(await resolveOwnAuthorDisplayName(decoded, { displayName: "Record Name" }, { firestore }), "");
});

test("without a profile it falls back to token name, then account name, then email", async () => {
  const firestore = fakeFirestore({});
  assert.equal(await resolveOwnAuthorDisplayName(decoded, { displayName: "Record Name" }, { firestore }), "Token Name");
  assert.equal(await resolveOwnAuthorDisplayName({ uid: "u", email: "a@example.com" }, { displayName: "Record Name" }, { firestore }), "Record Name");
  assert.equal(await resolveOwnAuthorDisplayName({ uid: "u", email: "a@example.com" }, {}, { firestore }), "a@example.com");
});
