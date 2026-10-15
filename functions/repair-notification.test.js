import test from "node:test";
import assert from "node:assert/strict";
import { notifyWeaverRepair } from "./index.js";

const successfulReceipt = {
  ok: true, repairRequestId: "existing-repair", fetchedCount: 1, processedCount: 1,
  errorCount: 0, blockedCount: 0,
  records: [{ poetryPleaseRepairRequestId: "existing-repair", repairDestination: "pig",
    pigJobId: "same-durable-job", weaverRepairStatus: "waiting_on_pig" }],
};

test("repair notification retries the same identity after a failed delivery", async () => {
  const calls = [];
  const send = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => successfulReceipt };
  };
  await assert.rejects(notifyWeaverRepair("existing-repair", "test-key", send), /http_503/);
  await notifyWeaverRepair("existing-repair", "test-key", send);
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(url, "https://weaver-912447899335.us-central1.run.app/api/repair-requests/notify");
    assert.equal(options.headers["x-api-key"], "test-key");
    assert.deepEqual(JSON.parse(options.body), { repairRequestId: "existing-repair" });
  }
});

test("blocked or mismatched receipts never mark delivery successful", async () => {
  for (const receipt of [
    { ...successfulReceipt, blockedCount: 1 },
    { ...successfulReceipt, repairRequestId: "another-repair" },
    { ...successfulReceipt, records: [] },
    { ...successfulReceipt, errorCount: 1 },
  ]) {
    await assert.rejects(notifyWeaverRepair("existing-repair", "test-key", async () => ({
      ok: true, json: async () => receipt,
    })), /invalid_receipt/);
  }
});

test("a successful HTTP response without an accepted receipt remains retryable", async () => {
  await assert.rejects(notifyWeaverRepair("existing-repair", "test-key", async () => ({
    ok: true,
    json: async () => ({ ok: false, error: "sync_failed" }),
  })), /invalid_receipt/);
});
