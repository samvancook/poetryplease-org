import express from "express";
import { createHash, createHmac } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { Readable } from "node:stream";

export const CATALOG_PHASE2_API = "https://button-poetry-catalog-350789123099.us-central1.run.app";
export const POETRY_PLEASE_REVIEWER_AUTHORITY = "https://poetryplease.org";
export const SAFE_PREVIEW_RECONCILIATION_ID = 1;
export const SAFE_PREVIEW_RESOLUTION_ID = 900001;
export const LIVE_RECONCILIATION_ID = 2;
export const CATALOG_SECRET_PROJECT = "button-poetry-catalog";
export const CATALOG_SECRET_NAMES = Object.freeze({
  read: "catalog-reconciliation-api-key",
  write: "catalog-reconciliation-write-api-key",
  signature: "catalog-reviewer-signature-key",
});

const ALLOWED_FIELDS = Object.freeze([
  "expectedReconciliationRevision",
  "reviewStatus",
  "resolutionAction",
  "canonicalTitle",
  "stablePoemIdentity",
  "textSourcePoemId",
  "formatSourcePoemId",
  "notes",
]);
const WRITE_ROLES = new Set(["admin", "team"]);
const secretCache = new Map();
const cloudAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export async function verifyReviewerViaPoetryPleaseApi(
  req,
  res,
  { fetcher = fetch, authority = POETRY_PLEASE_REVIEWER_AUTHORITY } = {},
) {
  const authorization = String(req?.get?.("Authorization") || req?.headers?.authorization || "").trim();
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    res.status(401).json({ error: "auth" });
    return null;
  }

  let response;
  try {
    response = await fetcher(`${authority}/api/me`, {
      headers: { Accept: "application/json", Authorization: authorization },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    res.status(502).json({ error: "reviewer_authority_unavailable" });
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? response.status : 502;
    res.status(status).json({ error: status === 401 ? "auth" : status === 403 ? "forbidden" : "reviewer_authority_unavailable" });
    return null;
  }

  const uid = String(payload?.uid || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  const roles = Array.isArray(payload?.roles) ? payload.roles : [];
  if (!uid || !email || !email.includes("@")) {
    res.status(502).json({ error: "reviewer_authority_shape_invalid" });
    return null;
  }

  return {
    decoded: { uid, email, name: String(payload?.displayName || "").trim() },
    userRecord: { roles },
  };
}

export function normalizeReviewer(ctx) {
  const uid = String(ctx?.decoded?.uid || "").trim();
  const email = String(ctx?.decoded?.email || "").trim().toLowerCase();
  const roles = [...new Set(
    (Array.isArray(ctx?.userRecord?.roles) ? ctx.userRecord.roles : [])
      .map((role) => String(role || "").trim().toLowerCase())
      .filter((role) => WRITE_ROLES.has(role)),
  )].sort();
  if (!uid || !email || !email.includes("@")) {
    const error = new Error("verified_reviewer_required");
    error.status = 401;
    throw error;
  }
  if (!roles.length) {
    const error = new Error("reviewer_role_forbidden");
    error.status = 403;
    throw error;
  }
  return { uid, email, roles };
}

export function sanitizeDecision(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("invalid_payload");
    error.status = 400;
    throw error;
  }
  const output = {};
  for (const field of ALLOWED_FIELDS) {
    if (Object.hasOwn(input, field)) output[field] = input[field];
  }
  if (!Number.isInteger(output.expectedReconciliationRevision)) {
    const error = new Error("expected_revision_required");
    error.status = 400;
    throw error;
  }
  return output;
}

export function isSafePreviewTarget(reconciliationId, resolutionId) {
  return Number(reconciliationId) === SAFE_PREVIEW_RECONCILIATION_ID
    && Number(resolutionId) === SAFE_PREVIEW_RESOLUTION_ID;
}

export function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{16,200}$/.test(key)) {
    const error = new Error("idempotency_key_required");
    error.status = 400;
    throw error;
  }
  return key;
}

export function buildSignedCatalogHeaders({
  path,
  bodyBytes,
  reviewer,
  idempotencyKey,
  signedAt,
  writeCredential,
  signatureKey,
}) {
  const roles = [...new Set(reviewer.roles.map((role) => String(role).toLowerCase()))].sort().join(",");
  const bodyHash = createHash("sha256").update(bodyBytes).digest("hex");
  const canonical = [
    "PATCH",
    path,
    String(signedAt),
    idempotencyKey,
    reviewer.uid,
    reviewer.email.toLowerCase(),
    roles,
    bodyHash,
  ].join("\n");
  const signature = createHmac("sha256", signatureKey).update(canonical).digest("hex");
  return {
    Accept: "application/json",
    Authorization: `Bearer ${writeCredential}`,
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Catalog-Reviewer-Uid": reviewer.uid,
    "X-Catalog-Reviewer-Email": reviewer.email.toLowerCase(),
    "X-Catalog-Reviewer-Roles": roles,
    "X-Catalog-Signed-At": String(signedAt),
    "X-Catalog-Signature": `v1=${signature}`,
  };
}

export async function accessCatalogSecret(name) {
  if (!Object.values(CATALOG_SECRET_NAMES).includes(name)) {
    throw new Error("unsupported_catalog_secret");
  }
  const cached = secretCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const client = await cloudAuth.getClient();
  const resource = `projects/${CATALOG_SECRET_PROJECT}/secrets/${name}/versions/latest:access`;
  const response = await client.request({
    url: `https://secretmanager.googleapis.com/v1/${resource}`,
    method: "GET",
  });
  const encoded = response?.data?.payload?.data;
  const value = encoded ? Buffer.from(encoded, "base64").toString("utf8").trim() : "";
  if (!value) throw new Error("catalog_secret_unavailable");
  secretCache.set(name, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
  return value;
}

async function catalogJson(path, { fetcher = fetch, readSecret = accessCatalogSecret } = {}) {
  const credential = await readSecret(CATALOG_SECRET_NAMES.read);
  const response = await fetcher(`${CATALOG_PHASE2_API}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${credential}` },
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `catalog_read_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function normalizeSourcePageSide(value) {
  const side = String(value || "").trim().toLowerCase();
  if (side !== "prior" && side !== "candidate") {
    const error = new Error("source_page_side_invalid");
    error.status = 400;
    throw error;
  }
  return side;
}

export function sourcePageReferencePath(sourceVersionId, poemKey) {
  const version = Number(sourceVersionId);
  const key = String(poemKey || "").trim();
  if (!Number.isInteger(version) || version < 1 || !key) {
    const error = new Error("source_page_reference_unavailable");
    error.status = 422;
    throw error;
  }
  return `/source-page-references/${encodeURIComponent(version)}/${encodeURIComponent(key)}`;
}

function sourcePageContextFromRow(row, side) {
  const source = row?.[side];
  const sourceVersionId = Number(source?.sourceVersionId);
  const poemKey = String(source?.poemKey || "").trim();
  if (!source || !Number.isInteger(sourceVersionId) || sourceVersionId < 1 || !poemKey) {
    const error = new Error("source_page_reference_unavailable");
    error.status = 422;
    throw error;
  }
  return {
    sourceVersionId,
    poemKey,
    sourcePoemId: Number.isInteger(Number(source?.sourcePoemId)) ? Number(source.sourcePoemId) : null,
    title: String(source?.title || "").trim() || null,
  };
}

export async function readPhase2SourcePageReference({
  reconciliationId,
  resolutionId,
  side,
  dependencies = {},
}) {
  const normalizedSide = normalizeSourcePageSide(side);
  const data = await readPhase2Reconciliation(reconciliationId, dependencies);
  const row = data.rows.find((item) => Number(item?.resolutionId) === Number(resolutionId));
  if (!row) {
    const error = new Error("resolution_not_found");
    error.status = 404;
    throw error;
  }
  const source = sourcePageContextFromRow(row, normalizedSide);
  const reference = await catalogJson(sourcePageReferencePath(source.sourceVersionId, source.poemKey), dependencies);
  if (!reference || !Array.isArray(reference.pages)) {
    const error = new Error("source_page_reference_shape_invalid");
    error.status = 502;
    throw error;
  }
  return {
    reconciliationId: Number(data.reconciliation?.id || reconciliationId),
    resolutionId: Number(row.resolutionId),
    side: normalizedSide,
    source,
    pages: reference.pages.map((page) => ({
      pageIndex: Number(page?.pageIndex),
      pageLabel: String(page?.pageLabel || ""),
      spreadIndex: Number.isInteger(Number(page?.spreadIndex)) ? Number(page.spreadIndex) : null,
      side: String(page?.side || ""),
    })).filter((page) => Number.isInteger(page.pageIndex) && page.pageIndex >= 0),
  };
}

async function fetchPhase2SourcePdf({
  reconciliationId,
  resolutionId,
  side,
  fetcher = fetch,
  readSecret = accessCatalogSecret,
}) {
  const reference = await readPhase2SourcePageReference({
    reconciliationId,
    resolutionId,
    side,
    dependencies: { fetcher, readSecret },
  });
  const credential = await readSecret(CATALOG_SECRET_NAMES.read);
  const response = await fetcher(
    `${CATALOG_PHASE2_API}/source-page-assets/${encodeURIComponent(reference.source.sourceVersionId)}`,
    {
      headers: { Accept: "application/pdf", Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok || !response.body || !/^application\/pdf(?:;|$)/i.test(response.headers.get("content-type") || "")) {
    const error = new Error(`source_page_pdf_${response.status}`);
    error.status = response.status || 502;
    throw error;
  }
  return { reference, response };
}

function streamPdfResponse(res, response, sourceVersionId) {
  res.status(response.status);
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `inline; filename="source-${sourceVersionId}.pdf"`);
  const etag = response.headers.get("etag");
  const contentLength = response.headers.get("content-length");
  if (etag) res.set("ETag", etag);
  if (contentLength) res.set("Content-Length", contentLength);
  const body = Readable.fromWeb(response.body);
  body.once("error", () => res.destroy());
  body.pipe(res);
}

export async function readPhase2Reconciliation(reconciliationId, dependencies = {}) {
  const encoded = encodeURIComponent(reconciliationId);
  const [reconciliation, rows] = await Promise.all([
    catalogJson(`/reconciliations/${encoded}`, dependencies),
    catalogJson(`/reconciliations/${encoded}/resolutions`, dependencies),
  ]);
  if (!reconciliation || !Array.isArray(rows)) {
    const error = new Error("catalog_reconciliation_shape_invalid");
    error.status = 502;
    throw error;
  }
  const fixtureMode = Number(reconciliationId) === SAFE_PREVIEW_RECONCILIATION_ID;
  const liveMode = Number(reconciliationId) === LIVE_RECONCILIATION_ID;
  return {
    fixtureMode,
    fixtureLabel: fixtureMode
      ? "Catalog guarded write fixture · not editorial data"
      : liveMode
        ? "Live editorial reconciliation · decisions write to the production Catalog"
        : "Read-only reconciliation",
    readOnly: !fixtureMode && !liveMode,
    writeEnabled: fixtureMode || liveMode,
    writeScope: liveMode ? "reconciliation" : fixtureMode ? "single_resolution" : "none",
    safeWritableResolutionId: fixtureMode ? SAFE_PREVIEW_RESOLUTION_ID : null,
    dataSource: {
      type: liveMode ? "catalog_phase2_production_live" : "catalog_phase2_production_guarded",
      catalogAuthority: "Button Poetry Catalog",
      liveCatalogIntegration: true,
      catalogBase: CATALOG_PHASE2_API,
    },
    reconciliation,
    rows,
    contractGaps: Array.isArray(reconciliation.contractGaps) ? reconciliation.contractGaps : [],
  };
}

async function assertWritableTarget(reconciliationId, resolutionId, dependencies = {}) {
  if (isSafePreviewTarget(reconciliationId, resolutionId)) return;
  if (Number(reconciliationId) !== LIVE_RECONCILIATION_ID) {
    const error = new Error("guarded_write_target_forbidden");
    error.status = 403;
    throw error;
  }
  const data = await readPhase2Reconciliation(reconciliationId, dependencies);
  const belongsToReconciliation = data.rows.some((row) => Number(row?.resolutionId) === Number(resolutionId));
  if (!belongsToReconciliation) {
    const error = new Error("resolution_outside_live_reconciliation");
    error.status = 403;
    throw error;
  }
}

export async function savePhase2Resolution({
  reconciliationId,
  resolutionId,
  payload,
  idempotencyKey,
  reviewer,
  fetcher = fetch,
  readSecret = accessCatalogSecret,
  signedAt = Math.floor(Date.now() / 1000),
}) {
  await assertWritableTarget(reconciliationId, resolutionId, { fetcher, readSecret });
  const verifiedReviewer = normalizeReviewer({ decoded: reviewer, userRecord: reviewer });
  const cleanPayload = sanitizeDecision(payload);
  const retryKey = normalizeIdempotencyKey(idempotencyKey);
  const bodyBytes = Buffer.from(JSON.stringify(cleanPayload), "utf8");
  const path = `/resolutions/${encodeURIComponent(resolutionId)}`;
  const [writeCredential, signatureKey] = await Promise.all([
    readSecret(CATALOG_SECRET_NAMES.write),
    readSecret(CATALOG_SECRET_NAMES.signature),
  ]);
  const headers = buildSignedCatalogHeaders({
    path,
    bodyBytes,
    reviewer: verifiedReviewer,
    idempotencyKey: retryKey,
    signedAt,
    writeCredential,
    signatureKey,
  });
  const response = await fetcher(`${CATALOG_PHASE2_API}${path}`, {
    method: "PATCH",
    headers,
    body: bodyBytes,
    signal: AbortSignal.timeout(30000),
  });
  const catalogResult = await response.json().catch(() => ({}));
  if (!response.ok) {
    let authoritativeResolution = null;
    if (response.status === 409 && catalogResult?.error === "stale_reconciliation_revision") {
      authoritativeResolution = await catalogJson(path, { fetcher, readSecret }).catch(() => null);
    }
    const error = new Error(catalogResult?.error || `catalog_write_${response.status}`);
    error.status = response.status;
    error.payload = { ...catalogResult, authoritativeResolution };
    throw error;
  }
  const authoritativeResolution = await catalogJson(path, { fetcher, readSecret });
  return {
    catalogResult,
    authoritativeResolution,
    reconciliationRevision: Number(catalogResult.reconciliationRevision),
    etag: catalogResult.etag || response.headers.get("etag") || null,
    idempotent: catalogResult.idempotent === true,
  };
}

function sendError(res, error) {
  const status = Number(error?.status || 502);
  const payload = error?.payload && typeof error.payload === "object"
    ? error.payload
    : { error: String(error?.message || "catalog_phase2_unavailable") };
  res.status(status).set("Cache-Control", "private, no-store").json(payload);
}

export function createManuscriptReconciliationPhase2App({ verifyReviewer, fetcher = fetch, readSecret = accessCatalogSecret }) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", async (_req, res) => {
    try {
      const data = await readPhase2Reconciliation(LIVE_RECONCILIATION_ID, { fetcher, readSecret });
      res.set("Cache-Control", "no-store").json({
        ok: true,
        catalogBase: CATALOG_PHASE2_API,
        revision: process.env.K_REVISION || null,
        reconciliationId: LIVE_RECONCILIATION_ID,
        writeScope: data.writeScope,
        writeRevision: data.reconciliation?.writeRevision || null,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(["/admin/manuscriptReconciliations/:reconciliationId", "/api/admin/manuscriptReconciliations/:reconciliationId"], async (req, res) => {
    const ctx = await verifyReviewer(req, res);
    if (!ctx) return;
    try {
      const reviewer = normalizeReviewer(ctx);
      const data = await readPhase2Reconciliation(req.params.reconciliationId, { fetcher, readSecret });
      res.set("Cache-Control", "private, no-store").json({
        ...data,
        currentReviewer: { uid: reviewer.uid, email: reviewer.email, roles: reviewer.roles },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get([
    "/admin/manuscriptReconciliations/:reconciliationId/resolutions/:resolutionId/source-pages",
    "/api/admin/manuscriptReconciliations/:reconciliationId/resolutions/:resolutionId/source-pages",
  ], async (req, res) => {
    const ctx = await verifyReviewer(req, res);
    if (!ctx) return;
    try {
      normalizeReviewer(ctx);
      const reference = await readPhase2SourcePageReference({
        reconciliationId: req.params.reconciliationId,
        resolutionId: req.params.resolutionId,
        side: req.query?.side,
        dependencies: { fetcher, readSecret },
      });
      res.set("Cache-Control", "private, no-store").json(reference);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get([
    "/admin/manuscriptReconciliations/:reconciliationId/resolutions/:resolutionId/source-pages/pdf",
    "/api/admin/manuscriptReconciliations/:reconciliationId/resolutions/:resolutionId/source-pages/pdf",
  ], async (req, res) => {
    const ctx = await verifyReviewer(req, res);
    if (!ctx) return;
    try {
      normalizeReviewer(ctx);
      const { reference, response } = await fetchPhase2SourcePdf({
        reconciliationId: req.params.reconciliationId,
        resolutionId: req.params.resolutionId,
        side: req.query?.side,
        fetcher,
        readSecret,
      });
      streamPdfResponse(res, response, reference.source.sourceVersionId);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch([
    "/admin/manuscriptReconciliations/:reconciliationId/resolutions/:resolutionId",
    "/api/admin/manuscriptReconciliations/:reconciliationId/resolutions/:resolutionId",
  ], async (req, res) => {
    const ctx = await verifyReviewer(req, res);
    if (!ctx) return;
    try {
      const reviewer = normalizeReviewer(ctx);
      const result = await savePhase2Resolution({
        reconciliationId: req.params.reconciliationId,
        resolutionId: req.params.resolutionId,
        payload: req.body,
        idempotencyKey: req.get("Idempotency-Key"),
        reviewer: { ...reviewer, roles: reviewer.roles },
        fetcher,
        readSecret,
      });
      res.set("Cache-Control", "private, no-store").json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  return app;
}
