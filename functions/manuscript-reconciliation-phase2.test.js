import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHmac, createHash } from "node:crypto";
import {
  CATALOG_PHASE2_PREVIEW_API,
  CATALOG_SECRET_NAMES,
  SAFE_PREVIEW_RECONCILIATION_ID,
  SAFE_PREVIEW_RESOLUTION_ID,
  buildSignedCatalogHeaders,
  isSafePreviewTarget,
  normalizeReviewer,
  sanitizeDecision,
  savePhase2Resolution,
  verifyReviewerViaPoetryPleaseApi,
} from "./manuscript-reconciliation-phase2.js";
import {
  SAFE_WRITABLE_RESOLUTION_ID,
  auditSummary,
  decisionNeedsNotes,
  mapPhase2Payload,
  nextRowId,
  rowMatchesSearch,
  saveDecision,
} from "../public/manuscript-reconciliation.js";

const reviewer = { uid: "firebase-uid-1", email: "Reviewer@ButtonPoetry.com", roles: ["team", "admin"] };
const decision = {
  expectedReconciliationRevision: 5,
  reviewStatus: "approved",
  resolutionAction: "adopt_candidate",
  canonicalTitle: "Fixture poem",
  stablePoemIdentity: "fixture-poem",
  textSourcePoemId: 9000011,
  formatSourcePoemId: 9000011,
  notes: "Synthetic fixture decision.",
};
const readSecret = async (name) => ({
  [CATALOG_SECRET_NAMES.read]: "read-only-test-secret",
  [CATALOG_SECRET_NAMES.write]: "write-only-test-secret",
  [CATALOG_SECRET_NAMES.signature]: "signature-only-test-secret",
}[name]);

test("signed request construction matches the Catalog canonical contract", () => {
  const path = "/resolutions/900001";
  const bodyBytes = Buffer.from(JSON.stringify(decision));
  const headers = buildSignedCatalogHeaders({
    path,
    bodyBytes,
    reviewer: { ...reviewer, email: reviewer.email.toLowerCase() },
    idempotencyKey: "retry-key-1234567890",
    signedAt: 1788282000,
    writeCredential: "write-only-test-secret",
    signatureKey: "signature-only-test-secret",
  });
  const bodyHash = createHash("sha256").update(bodyBytes).digest("hex");
  const canonical = ["PATCH", path, "1788282000", "retry-key-1234567890", reviewer.uid, reviewer.email.toLowerCase(), "admin,team", bodyHash].join("\n");
  const expected = createHmac("sha256", "signature-only-test-secret").update(canonical).digest("hex");
  assert.equal(headers["X-Catalog-Signature"], `v1=${expected}`);
  assert.equal(headers["X-Catalog-Reviewer-Roles"], "admin,team");
  assert.equal(headers.Authorization, "Bearer write-only-test-secret");
});

test("missing and unauthorized reviewer identity fail closed", () => {
  assert.throws(() => normalizeReviewer({ decoded: {}, userRecord: {} }), /verified_reviewer_required/);
  assert.throws(() => normalizeReviewer({ decoded: { uid: "u", email: "u@example.com" }, userRecord: { roles: ["user"] } }), /reviewer_role_forbidden/);
  assert.deepEqual(normalizeReviewer({ decoded: reviewer, userRecord: reviewer }), {
    uid: reviewer.uid,
    email: reviewer.email.toLowerCase(),
    roles: ["admin", "team"],
  });
});

test("isolated reviewer verification delegates to the canonical Poetry Please role authority", async () => {
  const calls = [];
  const responseState = { status: 0, payload: null };
  const res = {
    status(value) { responseState.status = value; return this; },
    json(value) { responseState.payload = value; return this; },
  };
  const ctx = await verifyReviewerViaPoetryPleaseApi(
    { get: (name) => name === "Authorization" ? "Bearer firebase-token" : "" },
    res,
    { fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        uid: reviewer.uid,
        email: reviewer.email,
        displayName: "Fixture Reviewer",
        roles: ["team"],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://poetryplease.org/api/me");
  assert.equal(calls[0].options.headers.Authorization, "Bearer firebase-token");
  assert.deepEqual(ctx, {
    decoded: { uid: reviewer.uid, email: reviewer.email.toLowerCase(), name: "Fixture Reviewer" },
    userRecord: { roles: ["team"] },
  });
  assert.equal(responseState.status, 0);
});

test("isolated reviewer verification fails closed without a Firebase bearer", async () => {
  const responseState = { status: 0, payload: null };
  const res = {
    status(value) { responseState.status = value; return this; },
    json(value) { responseState.payload = value; return this; },
  };
  const ctx = await verifyReviewerViaPoetryPleaseApi({ get: () => "" }, res);
  assert.equal(ctx, null);
  assert.equal(responseState.status, 401);
  assert.deepEqual(responseState.payload, { error: "auth" });
});

test("authenticated save supplies verified attribution and authoritative readback", async () => {
  const calls = [];
  const authoritative = { resolutionId: SAFE_PREVIEW_RESOLUTION_ID, status: "approved", auditHistory: [{ reviewer: { email: reviewer.email.toLowerCase() } }] };
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === "PATCH") return new Response(JSON.stringify({
      resolution: authoritative,
      reconciliationRevision: 6,
      etag: "reconciliation-1-r6",
      auditEvent: authoritative.auditHistory[0],
      idempotent: false,
    }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"reconciliation-1-r6"' } });
    return new Response(JSON.stringify(authoritative), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await savePhase2Resolution({
    reconciliationId: SAFE_PREVIEW_RECONCILIATION_ID,
    resolutionId: SAFE_PREVIEW_RESOLUTION_ID,
    payload: decision,
    idempotencyKey: "retry-key-1234567890",
    reviewer,
    fetcher,
    readSecret,
    signedAt: 1788282000,
  });
  assert.equal(result.reconciliationRevision, 6);
  assert.equal(result.authoritativeResolution.auditHistory[0].reviewer.email, reviewer.email.toLowerCase());
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["X-Catalog-Reviewer-Uid"], reviewer.uid);
  assert.equal(calls[1].options.method, undefined);
});

test("idempotent retry is surfaced without storing a duplicate decision", async () => {
  let patchCount = 0;
  const fetcher = async (_url, options = {}) => {
    if (options.method === "PATCH") {
      patchCount += 1;
      return new Response(JSON.stringify({ reconciliationRevision: 6, etag: "reconciliation-1-r6", auditEvent: { auditEventId: 4 }, idempotent: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ resolutionId: SAFE_PREVIEW_RESOLUTION_ID, auditHistory: [{ auditEventId: 4 }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await savePhase2Resolution({
    reconciliationId: 1, resolutionId: 900001, payload: decision,
    idempotencyKey: "same-retry-key-123456", reviewer, fetcher, readSecret,
  });
  assert.equal(result.idempotent, true);
  assert.equal(patchCount, 1);
});

test("stale revision returns the Catalog error plus authoritative resolution", async () => {
  const fetcher = async (_url, options = {}) => options.method === "PATCH"
    ? new Response(JSON.stringify({ error: "stale_reconciliation_revision", currentRevision: 7 }), { status: 409, headers: { "Content-Type": "application/json" } })
    : new Response(JSON.stringify({ resolutionId: 900001, reconciliationRevision: 7, status: "approved" }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    savePhase2Resolution({
      reconciliationId: 1, resolutionId: 900001, payload: decision,
      idempotencyKey: "stale-retry-key-12345", reviewer, fetcher, readSecret,
    }),
    (error) => error.status === 409
      && error.payload.error === "stale_reconciliation_revision"
      && error.payload.authoritativeResolution.reconciliationRevision === 7,
  );
});

for (const [name, catalogError] of [
  ["invalid source handling", "source_outside_reconciliation"],
  ["required-note handling", "review_notes_required"],
]) {
  test(name + " preserves the authoritative Catalog 422 response", async () => {
    const fetcher = async () => new Response(JSON.stringify({ error: catalogError }), { status: 422, headers: { "Content-Type": "application/json" } });
    await assert.rejects(
      savePhase2Resolution({
        reconciliationId: 1, resolutionId: 900001, payload: decision,
        idempotencyKey: `${catalogError}-retry-key`, reviewer, fetcher, readSecret,
      }),
      (error) => error.status === 422 && error.payload.error === catalogError,
    );
  });
}

test("client save requires authoritative readback and supports save-and-advance ordering", async () => {
  const result = await saveDecision({
    token: "firebase-token",
    resolutionId: 900001,
    decision,
    idempotencyKey: "browser-retry-key-12345",
    fetcher: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer firebase-token");
      assert.equal(options.headers["Idempotency-Key"], "browser-retry-key-12345");
      return new Response(JSON.stringify({
        authoritativeResolution: { resolutionId: 900001, auditHistory: [] },
        reconciliationRevision: 6,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(result.authoritativeResolution.resolutionId, 900001);
  assert.equal(nextRowId([{ resolutionId: 900001 }, { resolutionId: 900002 }], 900001), 900002);
});

test("audit display uses Catalog reviewer attribution and revision", () => {
  assert.deepEqual(auditSummary({ auditHistory: [{ reviewer: { email: "reviewer@example.com" }, timestamp: "2026-09-01T00:00:00Z", notes: "Checked", resultingReconciliationRevision: 6 }] }), [{
    reviewer: "reviewer@example.com", timestamp: "2026-09-01T00:00:00Z", notes: "Checked", revision: 6,
  }]);
});

test("note policy catches destructive, identity, title, non-candidate, OCR, parser, and rejected decisions", () => {
  const row = { identity: "stable", canonicalTitle: "Title", prior: { id: 1 }, candidate: { id: 2 } };
  assert.equal(decisionNeedsNotes(row, { resolutionAction: "review_retire", reviewStatus: "approved", canonicalTitle: "Title", stablePoemIdentity: "stable", textSourcePoemId: 2 }), true);
  assert.equal(decisionNeedsNotes(row, { resolutionAction: "adopt_candidate", reviewStatus: "approved", canonicalTitle: "Title", stablePoemIdentity: "stable", textSourcePoemId: 2 }), false);
  assert.equal(decisionNeedsNotes(row, { resolutionAction: "request_ocr", reviewStatus: "pending", canonicalTitle: "Title", stablePoemIdentity: "stable", textSourcePoemId: 2 }), true);
});

test("proxy accepts only the guarded fixture and never production reconciliation 2", () => {
  assert.equal(CATALOG_PHASE2_PREVIEW_API.includes("phase2-preview"), true);
  assert.equal(isSafePreviewTarget(1, 900001), true);
  assert.equal(isSafePreviewTarget(2, 900001), false);
  assert.equal(isSafePreviewTarget(1, 2), false);
  assert.throws(() => sanitizeDecision({ reviewStatus: "approved" }), /expected_revision_required/);
  assert.equal(SAFE_WRITABLE_RESOLUTION_ID, 900001);
});

test("Phase 2 does not duplicate decisions and reads secrets without mutation", () => {
  const server = fs.readFileSync(new URL("./manuscript-reconciliation-phase2.js", import.meta.url), "utf8");
  assert.doesNotMatch(server, /getFirestore|\.collection\(|firestore/i);
  assert.match(server, /authoritativeResolution/);
  assert.match(server, /versions\/latest:access/);
  assert.match(server, /method: "GET"/);
  assert.doesNotMatch(server, /method: "POST"[\s\S]{0,120}secretmanager/);
  const index = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.match(index, /manuscriptreconciliationphase2preview[\s\S]{0,240}invoker: "public"[\s\S]{0,240}manuscript-phase2-preview@poetry-please/);
  assert.match(index, /verifyReviewerViaPoetryPleaseApi/);
  assert.doesNotMatch(index, /createManuscriptReconciliationPhase2App\(\{[\s\S]{0,180}requireRole/);
});

test("review feedback improvements preserve deliberate search and readable text", () => {
  const row = {
    identity: "yaarburnee",
    priorTitle: "Ya'arburnee",
    candidateTitle: "Ya’arburnee",
    warnings: ["pdf_possible_image_backed_poem"],
    buckets: ["image_backed_or_ocr_required"],
  };
  assert.equal(rowMatchesSearch(row, "Ya’arburnee"), true);
  assert.equal(rowMatchesSearch(row, "image_backed"), true);
  assert.equal(rowMatchesSearch(row, "unrelated"), false);
  const client = fs.readFileSync(new URL("../public/manuscript-reconciliation.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../public/manuscript-reconciliation.html", import.meta.url), "utf8");
  assert.match(client, /Search runs when you press Search or Enter/);
  assert.match(client, /Candidate source[\s\S]{0,180}not assumed to be correct/);
  assert.match(client, /Needs parser correction/);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /overflow-wrap:anywhere/);
});

test("Phase 2 mapper rejects read-only or wrong-fixture payloads", () => {
  assert.throws(() => mapPhase2Payload({ readOnly: true, writeEnabled: false }), /Unsupported/);
  assert.throws(() => mapPhase2Payload({ readOnly: false, writeEnabled: true, reconciliation: {}, rows: [], safeWritableResolutionId: 3 }), /fixture is unavailable/);
});
