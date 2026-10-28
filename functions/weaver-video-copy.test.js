import test from "node:test";
import assert from "node:assert/strict";
import { canClaimWeaverVideoCopy, weaverVideoCopyAttemptId } from "./weaver-video-copy.js";

const copyInput = {
  sourceRecordId: "weaver:vv:source-1",
  canonicalVideoId: "WEAVER-VV-EXAMPLE",
  driveLink: "https://drive.google.com/file/d/final-asset/view",
};

test("Weaver durable-copy attempt IDs are stable and source-specific", () => {
  const first = weaverVideoCopyAttemptId(copyInput);
  assert.equal(first, weaverVideoCopyAttemptId({ ...copyInput }));
  assert.notEqual(first, weaverVideoCopyAttemptId({ ...copyInput, driveLink: "https://drive.google.com/file/d/replacement/view" }));
});

test("Weaver durable-copy claims reject published, stale, and active lease states", () => {
  const attemptId = weaverVideoCopyAttemptId(copyInput);
  const base = { reviewOnly: true, sourceSystem: "weaver", sourceRecordId: copyInput.sourceRecordId, driveLink: copyInput.driveLink };
  assert.equal(canClaimWeaverVideoCopy(base, attemptId, 1000), true);
  assert.equal(canClaimWeaverVideoCopy({ ...base, durableCopyStatus: "verified" }, attemptId, 1000), false);
  assert.equal(canClaimWeaverVideoCopy({ ...base, durableCopyAttemptId: "other" }, attemptId, 1000), false);
  assert.equal(canClaimWeaverVideoCopy({ ...base, durableCopyStatus: "copying", durableCopyAttemptId: attemptId, durableCopyLeaseExpiresAtMs: 1001 }, attemptId, 1000), false);
  assert.equal(canClaimWeaverVideoCopy({ ...base, durableCopyStatus: "copying", durableCopyAttemptId: attemptId, durableCopyLeaseExpiresAtMs: 999 }, attemptId, 1000), true);
});
