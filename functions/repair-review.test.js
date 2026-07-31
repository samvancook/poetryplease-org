import test from "node:test";
import assert from "node:assert/strict";
import { getRepairReviewDisposition } from "./index.js";

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
