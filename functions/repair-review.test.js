import test from "node:test";
import assert from "node:assert/strict";
import { extractReturnedRepairAssetFields, getRepairReviewDisposition } from "./index.js";

test("a repair displayed as returned can be accepted", () => {
  assert.equal(
    getRepairReviewDisposition(
      { status: "returned", returnReviewStatus: "pending" },
      "accepted"
    ),
    "apply"
  );
});

test("a repeated acceptance after resolution is idempotent", () => {
  assert.equal(
    getRepairReviewDisposition(
      { status: "resolved", returnReviewStatus: "accepted" },
      "accepted"
    ),
    "already_applied"
  );
});

test("a repair that has not returned remains guarded", () => {
  assert.equal(
    getRepairReviewDisposition(
      { status: "in_progress", returnReviewStatus: "pending" },
      "accepted"
    ),
    "not_returned"
  );
});

test("legacy Weaver return notes yield structured replacement fields", () => {
  assert.deepEqual(
    extractReturnedRepairAssetFields(
      {},
      "Replacement asset-123 | https://drive.google.com/file/d/asset-123/view | Weaver/P.I.G. job repair-1"
    ),
    {
      replacementAssetId: "asset-123",
      replacementAssetLink: "https://drive.google.com/file/d/asset-123/view",
    }
  );
});

test("explicit replacement fields take precedence over note inference", () => {
  assert.deepEqual(
    extractReturnedRepairAssetFields(
      {
        replacementAssetId: "canonical-id",
        replacementAssetLink: "https://example.com/canonical",
      },
      "Replacement legacy-id | https://example.com/legacy"
    ),
    {
      replacementAssetId: "canonical-id",
      replacementAssetLink: "https://example.com/canonical",
    }
  );
});
