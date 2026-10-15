import test from "node:test";
import assert from "node:assert/strict";
import { notifyWeaverRepair } from "./index.js";

test("repair notification retries the same identity after a failed delivery", async () => {
  const calls = [];
  const send = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ ok: true }) };
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

test("a successful HTTP response without an accepted receipt remains retryable", async () => {
  await assert.rejects(notifyWeaverRepair("existing-repair", "test-key", async () => ({
    ok: true,
    json: async () => ({ ok: false, error: "sync_failed" }),
  })), /invalid_receipt/);
});
