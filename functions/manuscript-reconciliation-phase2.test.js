import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHmac, createHash } from "node:crypto";
import {
  CATALOG_PHASE2_API,
  CATALOG_SECRET_NAMES,
  SAFE_PREVIEW_RECONCILIATION_ID,
  SAFE_PREVIEW_RESOLUTION_ID,
  buildSignedCatalogHeaders,
  isSafePreviewTarget,
  normalizeReviewer,
  sanitizeDecision,
  sanitizeVisualContextFlag,
  savePhase2Resolution,
  saveVisualContextFlag,
  verifyReviewerViaPoetryPleaseApi,
} from "./manuscript-reconciliation-phase2.js";
import {
  buildPromotionPreflight,
  buildPromotionReadiness,
  buildVisualReviewQueue,
  fetchCatalogSourcePdf,
  validateVisualEvidenceInput,
} from "./manuscript-reconciliation-phase4.js";
import {
  SAFE_WRITABLE_RESOLUTION_ID,
  auditSummary,
  decisionNeedsNotes,
  mapPhase2Payload,
  nextRowId,
  normalizePhase2Row,
  rowMatchesSearch,
  saveDecision,
} from "../public/manuscript-reconciliation-phase2-preview.js";
import {
  COMMON_ACTIONS,
  candidateSourceMatches,
  filterRowsBySummary,
  combineNeedsMerge,
  needsNotes,
  reloadIfCandidateChanged,
  sourcesForAction,
  statusForAction,
} from "../public/manuscript-reconciliation-live.js";

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

test("visual-context flag signs a POST and is independent of the PATCH decision path", async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      visualContextFlag: { id: 1, sourcePoemId: 9000011, status: "queued", reason: "Shaped/redacted layout." },
      idempotent: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await saveVisualContextFlag({
    reconciliationId: SAFE_PREVIEW_RECONCILIATION_ID,
    resolutionId: SAFE_PREVIEW_RESOLUTION_ID,
    payload: { sourcePoemId: 9000011, reason: "Shaped/redacted layout." },
    idempotencyKey: "flag-retry-key-1234567",
    reviewer,
    fetcher,
    readSecret,
    signedAt: 1788282000,
  });
  assert.equal(result.visualContextFlag.status, "queued");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${CATALOG_PHASE2_API}/resolutions/${SAFE_PREVIEW_RESOLUTION_ID}/visual-context-flags`);
  assert.equal(calls[0].options.method, "POST");
  const canonical = ["POST", `/resolutions/${SAFE_PREVIEW_RESOLUTION_ID}/visual-context-flags`, "1788282000", "flag-retry-key-1234567", reviewer.uid, reviewer.email.toLowerCase(), "admin,team", createHash("sha256").update(calls[0].options.body).digest("hex")].join("\n");
  const expectedSignature = createHmac("sha256", "signature-only-test-secret").update(canonical).digest("hex");
  assert.equal(calls[0].options.headers["X-Catalog-Signature"], `v1=${expectedSignature}`);
});

test("visual-context flag rejects a missing reason before any network call", async () => {
  let called = false;
  await assert.rejects(
    saveVisualContextFlag({
      reconciliationId: SAFE_PREVIEW_RECONCILIATION_ID,
      resolutionId: SAFE_PREVIEW_RESOLUTION_ID,
      payload: { sourcePoemId: 9000011, reason: "  " },
      idempotencyKey: "flag-retry-key-7654321",
      reviewer,
      fetcher: async () => { called = true; return new Response("{}", { status: 200 }); },
      readSecret,
    }),
    /reason_required/,
  );
  assert.equal(called, false);
});

test("sanitizeVisualContextFlag keeps only the allowed fields and requires a reason", () => {
  assert.deepEqual(
    sanitizeVisualContextFlag({ sourcePoemId: 42, reason: "Complex layout.", notes: "n", extra: "drop me" }),
    { sourcePoemId: 42, reason: "Complex layout.", notes: "n" },
  );
  assert.throws(() => sanitizeVisualContextFlag({ reason: "x" }), /source_poem_id_required/);
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

test("hand-edited text reaches Catalog and requires notes when it changes", () => {
  // The proxy copies an allowlist, so an unnamed field never reaches the signed PATCH.
  const sanitized = sanitizeDecision({ ...decision, manualText: "one line\nanother line" });
  assert.equal(sanitized.manualText, "one line\nanother line");
  assert.equal(sanitizeDecision({ ...decision, manualText: null }).manualText, null);
  assert.equal(Object.hasOwn(sanitizeDecision({ ...decision, unexpectedField: "x" }), "unexpectedField"), false);

  // Notes are required whenever the hand-edited text differs from what Catalog stores,
  // including when a reviewer clears one, because clearing returns the poem to its sources.
  const row = { identity: "fixture-poem", candidateTitle: "Fixture poem", candidate: { id: 9000011 }, manualText: "stored text" };
  const unchanged = { ...decision, manualText: "stored text" };
  assert.equal(needsNotes(row, unchanged), false);
  assert.equal(needsNotes(row, { ...decision, manualText: "edited text" }), true);
  assert.equal(needsNotes(row, { ...decision, manualText: null }), true);
  // Whitespace-only is how Catalog spells "cleared", so it must not read as a change.
  assert.equal(needsNotes({ ...row, manualText: null }, { ...decision, manualText: "   " }), false);
});

test("comparison headers stay the same height whatever the titles are", () => {
  const client = fs.readFileSync(new URL("../public/manuscript-reconciliation-live.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../public/manuscript-reconciliation.html", import.meta.url), "utf8");
  // The side label and the poem title used to be one run of text, so a long title
  // wrapped the whole header and pushed its own poem box down while the other stayed
  // put. They are separate elements now, and the title is clamped to a fixed two lines,
  // which is what keeps both columns level for line-by-line reading.
  assert.match(client, /<span class="side">/);
  assert.match(client, /<span class="ptitle" title="/);
  assert.match(html, /\.texts>article h3 \.ptitle\{[^}]*height:2\.8em/);
  assert.match(html, /\.texts>article h3 \.ptitle\{[^}]*-webkit-line-clamp:2/);
  // Reserving two lines without clamping to two is the shipped fix that did not hold.
  assert.doesNotMatch(html, /\.texts>article h3\{min-height:2\.8em/);
});

test("a reviewer can choose wording and formatting sources separately", () => {
  // This was unreachable. The Decision control only offered pending/approved/rejected and
  // mapped those to adopt_candidate or retain_prior, while the source pickers were revealed
  // only when the skip-reason dropdown equalled combine_text_and_format, a value that
  // dropdown never contained. So the action the roadmap prescribes for the prose poems
  // could not be recorded at all. The Decision control names the action now.
  const offered = COMMON_ACTIONS.map(([value]) => value);
  assert.ok(offered.includes("combine_text_and_format"));
  assert.ok(offered.includes("adopt_candidate"));
  assert.ok(offered.includes("retain_prior"));

  const client = fs.readFileSync(new URL("../public/manuscript-reconciliation-live.js", import.meta.url), "utf8");
  assert.match(client, /<select id="decision">/);
  // The pickers must follow the Decision control, not the skip-reason dropdown.
  assert.match(client, /const chosen = root\.querySelector\("#decision"\)\?\.value;[\s\S]{0,160}SOURCE_CHOICE_ACTION/);

  // Each settled action carries its own status, so a saved decision cannot leave a poem queued.
  assert.equal(statusForAction("combine_text_and_format"), "approved");
  assert.equal(statusForAction("adopt_candidate"), "approved");
  assert.equal(statusForAction("retain_prior"), "rejected");
  assert.equal(statusForAction("request_ocr"), "pending");
  assert.equal(statusForAction(""), "pending");

  // Only the combine action defers to what the reviewer picked.
  const row = { prior: { id: 11 }, candidate: { id: 22 } };
  assert.deepEqual(sourcesForAction("adopt_candidate", row, 11, 11), { text: 22, format: 22 });
  assert.deepEqual(sourcesForAction("retain_prior", row, 22, 22), { text: 11, format: 11 });
  assert.deepEqual(sourcesForAction("combine_text_and_format", row, 22, 11), { text: 22, format: 11 });
  // Catalog's seeder writes carry_forward_wording_adopt_final_format with BOTH ids set to
  // the candidate, because publication_wording found the texts identical and nothing was
  // carried forward. The action is not offered in the Decision control, so it only ever
  // appears on a row Catalog already decided, and saving must preserve what it stored
  // rather than rewriting the ids from the action name.
  assert.deepEqual(sourcesForAction("carry_forward_wording_adopt_final_format", row, 22, 22), { text: 22, format: 22 });

  // Wording from one source and formatting from the other is the subtle call; it needs a note.
  const noteRow = { identity: "p", candidateTitle: "T", candidate: { id: 22 } };
  const base = { reviewStatus: "approved", resolutionAction: "combine_text_and_format", canonicalTitle: "T", stablePoemIdentity: "p" };
  assert.equal(needsNotes(noteRow, { ...base, textSourcePoemId: 22, formatSourcePoemId: 11 }), true);
  assert.equal(needsNotes(noteRow, { ...base, textSourcePoemId: 22, formatSourcePoemId: 22 }), false);
});

test("an unmergeable combine is flagged before it blocks promotion", () => {
  // Catalog's promotion build takes the formatting source's text verbatim when the two
  // sources agree on wording once normalized, and returns needs_merge otherwise. The write
  // API accepts either, so a reviewer would only learn at promotion. Same normalization as
  // Catalog's publication_wording: strip all whitespace, lowercase.
  const wrapped = { prior: { text: "one long line of prose that runs on" }, candidate: { text: "one long line\nof prose that\nruns on" } };
  assert.equal(combineNeedsMerge(wrapped), false);
  assert.equal(combineNeedsMerge({ prior: { text: "Same Words" }, candidate: { text: "same words" } }), false);
  assert.equal(combineNeedsMerge({ prior: { text: "these words" }, candidate: { text: "different words" } }), true);

  const client = fs.readFileSync(new URL("../public/manuscript-reconciliation-live.js", import.meta.url), "utf8");
  assert.match(client, /id="merge-warning"/);
  assert.match(client, /would block promotion later/);
});

test("production proxy accepts only the guarded fixture and never editorial reconciliation 2", () => {
  assert.equal(CATALOG_PHASE2_API, "https://button-poetry-catalog-350789123099.us-central1.run.app");
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
  const client = fs.readFileSync(new URL("../public/manuscript-reconciliation-phase2-preview.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../public/manuscript-reconciliation-phase2-preview.html", import.meta.url), "utf8");
  assert.match(client, /Search runs when you press Search or Enter/);
  assert.match(client, /Candidate source[\s\S]{0,180}not assumed to be correct/);
  assert.match(client, /Needs parser correction/);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /overflow-wrap:anywhere/);
});

test("Phase 2 mapper preserves authoritative sourcePoemId values for form selections", () => {
  const row = normalizePhase2Row({
    resolutionId: 900001,
    prior: { sourcePoemId: 101, title: "Prior" },
    candidate: { sourcePoemId: 202, title: "Candidate" },
  });
  assert.equal(row.prior.id, 101);
  assert.equal(row.candidate.id, 202);
  const mapped = mapPhase2Payload({
    readOnly: false,
    writeEnabled: true,
    safeWritableResolutionId: 900001,
    reconciliation: { id: 1 },
    rows: [row],
  });
  assert.equal(mapped.rows[0].prior.id, 101);
  assert.equal(mapped.rows[0].candidate.id, 202);
});

test("Phase 2 mapper rejects read-only or wrong-fixture payloads", () => {
  assert.throws(() => mapPhase2Payload({ readOnly: true, writeEnabled: false }), /Unsupported/);
  assert.throws(() => mapPhase2Payload({ readOnly: false, writeEnabled: true, reconciliation: {}, rows: [], safeWritableResolutionId: 3 }), /fixture is unavailable/);
});
test("candidate guard reloads and prevents a write when the reviewed source changed", async () => {
  const calls = [];
  const current = {
    writeEnabled: true,
    readOnly: false,
    writeScope: "reconciliation",
    reconciliation: { id: 2, writeRevision: 8 },
    rows: [{ resolutionId: 42, candidate: { sourcePoemId: 102 } }],
  };
  const reload = await reloadIfCandidateChanged(
    "firebase-token",
    { resolutionId: 42, candidate: { id: 101 } },
    async (url, options = {}) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, undefined);
  assert.equal(reload.rows[0].candidate.id, 102);
  assert.equal(candidateSourceMatches({ candidate: { id: 101 } }, reload.rows[0]), false);
});

test("candidate guard permits the same candidate source and fails closed on malformed source data", async () => {
  const current = {
    writeEnabled: true,
    readOnly: false,
    writeScope: "reconciliation",
    reconciliation: { id: 2, writeRevision: 8 },
    rows: [{ resolutionId: 42, candidate: { id: 101 } }],
  };
  const reload = await reloadIfCandidateChanged(
    "firebase-token",
    { resolutionId: 42, candidate: { sourcePoemId: 101 } },
    async () => new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  assert.equal(reload, null);
  assert.equal(candidateSourceMatches({ candidate: { id: "not-an-id" } }, current.rows[0]), false);
});


test("Phase 4 queue uses only Catalog-bound source-page references and keeps evidence separate from decisions", () => {
  const sourcePages = {
    status: "available",
    sourceVersionId: 10,
    sourceSha256: "66b574bab33d41254d2522f4f3041243b989d113b175d73d9180030906d4ad68",
    mappingSha256: "f".repeat(64),
    pages: [
      { pageIndex: 34, pageLabel: "14", spreadIndex: 1, side: "left" },
      { pageIndex: 35, pageLabel: "15", spreadIndex: 1, side: "right" },
    ],
    asset: {
      href: "/source-page-assets/10",
      mediaType: "application/pdf",
      sha256: "66b574bab33d41254d2522f4f3041243b989d113b175d73d9180030906d4ad68",
    },
  };
  const phaseData = {
    reconciliation: { id: 2 },
    rows: [{
      resolutionId: 17,
      status: "pending",
      identity: "elephants",
      candidate: {
        sourcePoemId: 238,
        sourceVersionId: 10,
        title: "elephants",
        sourcePages,
      },
    }],
  };
  const queue = buildVisualReviewQueue(phaseData, [{
    id: "evidence-1",
    reconciliationId: 2,
    resolutionId: 17,
    side: "candidate",
    outcome: "confirmed",
    notes: "Reviewed the two-page spread.",
    recordedAt: "2026-09-12T00:00:00Z",
    reviewer: { uid: "reviewer-1", email: "reviewer@buttonpoetry.com" },
    source: {
      sourcePoemId: 238,
      sourceVersionId: 10,
      mappingSha256: "f".repeat(64),
      assetSha256: sourcePages.asset.sha256,
    },
  }]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].visualStatus, "confirmed");
  const readiness = buildPromotionReadiness(phaseData, queue);
  assert.equal(readiness.state, "locked");
  assert.equal(readiness.promotionEnabled, false);
  assert.equal(readiness.editorialReview.byStatus.pending, 1);
  assert.equal(readiness.visualReview.awaitingEvidence, 0);
  const preflight = buildPromotionPreflight(phaseData, queue);
  assert.equal(preflight.mode, "read_only");
  assert.equal(preflight.decisions.length, 1);
  assert.equal(preflight.decisions[0].candidate.sourcePoemId, 238);
  assert.equal(Object.hasOwn(preflight.decisions[0].candidate, "text"), false);
  assert.equal(preflight.blockers.some((blocker) => blocker.type === "promotion_authorization_required"), true);
  assert.match(preflight.integrity.value, /^[a-f0-9]{64}$/);
  assert.deepEqual(queue[0].source.sourcePages.pages, sourcePages.pages);
  assert.equal(queue[0].source.sourcePages.asset.href, "/source-page-assets/10");
  assert.deepEqual(validateVisualEvidenceInput({ outcome: "needs_follow_up", notes: "The source layout needs another look." }), {
    outcome: "needs_follow_up",
    notes: "The source layout needs another look.",
  });
  assert.throws(() => validateVisualEvidenceInput({ outcome: "confirmed", notes: "" }), /visual_evidence_notes_required/);
});

test("Phase 4 streams only the hash-verified Catalog PDF", async () => {
  const bytes = Buffer.from("%PDF-1.7 fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const item = {
    source: {
      sourceVersionId: 10,
      sourcePages: {
        asset: { href: "/source-page-assets/10", mediaType: "application/pdf", sha256 },
      },
    },
  };
  const result = await fetchCatalogSourcePdf(item, {
    readCatalogCredential: async () => "catalog-read-key",
    fetcher: async (url, options) => {
      assert.equal(url, CATALOG_PHASE2_API + "/source-page-assets/10");
      assert.equal(options.headers.Authorization, "Bearer catalog-read-key");
      return new Response(bytes, { headers: { "Content-Type": "application/pdf" } });
    },
  });
  assert.equal(result.sha256, sha256);
  await assert.rejects(
    fetchCatalogSourcePdf(item, {
      readCatalogCredential: async () => "catalog-read-key",
      fetcher: async () => new Response(Buffer.from("different"), { headers: { "Content-Type": "application/pdf" } }),
    }),
    (error) => error.code === "catalog_source_asset_integrity_mismatch",
  );
});

test("Phase 4 is served by the authenticated Poetry Please API without exposing a Catalog credential", () => {
  const index = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const phase4 = fs.readFileSync(new URL("./manuscript-reconciliation-phase4.js", import.meta.url), "utf8");
  assert.match(index, /createManuscriptVisualReviewApp/);
  assert.match(index, /admin\/manuscriptVisualReviews/);
  assert.match(phase4, /Authorization: "Bearer " \+ credential/);
  assert.doesNotMatch(phase4, /CATALOG_RECONCILIATION_API_KEY/);
});

test("summary cards filter only the intended reconciliation rows", () => {
  const rows = [
    { resolutionId: 1, status: "auto_approved", warnings: [] },
    { resolutionId: 2, status: "pending", warnings: ["pdf_possible_image_backed_poem"] },
    { resolutionId: 3, status: "pending", candidate: { text: "*" } },
    { resolutionId: 4, status: "approved", warnings: [] },
  ];
  assert.deepEqual(filterRowsBySummary(rows, "all").map((row) => row.resolutionId), [1, 2, 3, 4]);
  assert.deepEqual(filterRowsBySummary(rows, "auto-approved").map((row) => row.resolutionId), [1]);
  assert.deepEqual(filterRowsBySummary(rows, "pending").map((row) => row.resolutionId), [2, 3]);
  assert.deepEqual(filterRowsBySummary(rows, "warnings").map((row) => row.resolutionId), [2, 3]);
});
