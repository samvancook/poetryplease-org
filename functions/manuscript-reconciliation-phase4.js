import express from "express";
import { createHash } from "node:crypto";
import {
  CATALOG_PHASE2_API,
  LIVE_RECONCILIATION_ID,
  normalizeReviewer,
  readPhase2Reconciliation,
} from "./manuscript-reconciliation-phase2.js";

const REVIEW_OUTCOMES = new Set(["confirmed", "needs_follow_up"]);
const SOURCE_SIDES = new Set(["prior", "candidate"]);
const MAX_EVIDENCE_NOTE_LENGTH = 4000;

function codedError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function requiredPositiveInt(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw codedError(code, 502);
  return number;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function visualSourceFor(row, side) {
  const source = row && row[side];
  const sourcePages = source && source.sourcePages;
  if (!source || !sourcePages || sourcePages.status !== "available") return null;

  const sourcePoemId = requiredPositiveInt(source.sourcePoemId, "catalog_visual_reference_invalid");
  const sourceVersionId = requiredPositiveInt(source.sourceVersionId, "catalog_visual_reference_invalid");
  const pages = Array.isArray(sourcePages.pages) ? sourcePages.pages : null;
  const asset = sourcePages.asset;
  if (!pages || !pages.length || !asset || asset.href !== "/source-page-assets/" + sourceVersionId
    || asset.mediaType !== "application/pdf" || !isSha256(asset.sha256)
    || !isSha256(sourcePages.sourceSha256) || asset.sha256 !== sourcePages.sourceSha256) {
    throw codedError("catalog_visual_reference_invalid");
  }

  for (const page of pages) {
    if (!page || !Number.isInteger(Number(page.pageIndex)) || Number(page.pageIndex) < 1) {
      throw codedError("catalog_visual_reference_invalid");
    }
  }

  return {
    sourcePoemId,
    sourceVersionId,
    title: String(source.title || ""),
    exactTextHash: String(source.exactTextHash || ""),
    sourcePages: {
      status: "available",
      sourceVersionId,
      sourceSha256: sourcePages.sourceSha256,
      mappingSha256: sourcePages.mappingSha256 || null,
      pages: sourcePages.pages,
      asset: {
        href: asset.href,
        mediaType: asset.mediaType,
        sha256: asset.sha256,
      },
    },
  };
}

function evidenceTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000).toISOString();
  }
  return null;
}

function normalizeEvidence(value) {
  if (!value || typeof value !== "object") return null;
  const source = value.source && typeof value.source === "object" ? value.source : {};
  const reviewer = value.reviewer && typeof value.reviewer === "object" ? value.reviewer : {};
  if (!REVIEW_OUTCOMES.has(value.outcome)) return null;
  return {
    id: String(value.id || ""),
    reconciliationId: Number(value.reconciliationId),
    resolutionId: Number(value.resolutionId),
    side: String(value.side || ""),
    outcome: value.outcome,
    notes: String(value.notes || ""),
    recordedAt: evidenceTimestamp(value.recordedAt),
    reviewer: {
      uid: String(reviewer.uid || ""),
      email: String(reviewer.email || ""),
    },
    source: {
      sourcePoemId: Number(source.sourcePoemId),
      sourceVersionId: Number(source.sourceVersionId),
      mappingSha256: String(source.mappingSha256 || ""),
      assetSha256: String(source.assetSha256 || ""),
    },
  };
}

function evidenceMatchesSource(evidence, item) {
  const source = item.source;
  return evidence
    && Number(evidence.reconciliationId) === Number(item.reconciliationId)
    && Number(evidence.resolutionId) === Number(item.resolutionId)
    && evidence.side === item.side
    && evidence.source.sourcePoemId === source.sourcePoemId
    && evidence.source.sourceVersionId === source.sourceVersionId
    && evidence.source.assetSha256 === source.sourcePages.asset.sha256
    && evidence.source.mappingSha256 === String(source.sourcePages.mappingSha256 || "");
}

export function buildVisualReviewQueue(phaseData, evidenceRows = []) {
  if (!phaseData || !Array.isArray(phaseData.rows)) {
    throw codedError("catalog_visual_queue_invalid");
  }

  const normalizedEvidence = evidenceRows.map(normalizeEvidence).filter(Boolean);
  const queue = [];
  for (const row of phaseData.rows) {
    for (const side of SOURCE_SIDES) {
      const source = visualSourceFor(row, side);
      if (!source) continue;
      const item = {
        reconciliationId: Number(phaseData.reconciliation && phaseData.reconciliation.id),
        resolutionId: Number(row.resolutionId),
        identity: String(row.identity || ""),
        canonicalTitle: String(row.canonicalTitle || ""),
        priorTitle: String(row.priorTitle || ""),
        candidateTitle: String(row.candidateTitle || ""),
        side,
        source,
      };
      if (!Number.isInteger(item.reconciliationId) || !Number.isInteger(item.resolutionId)) {
        throw codedError("catalog_visual_queue_invalid");
      }
      const evidence = normalizedEvidence
        .filter((entry) => evidenceMatchesSource({ ...entry, reconciliationId: entry.reconciliationId ?? phaseData.reconciliation.id }, item))
        .sort((a, b) => Date.parse(b.recordedAt || "") - Date.parse(a.recordedAt || ""));
      const latestEvidence = evidence[0] || null;
      queue.push({
        ...item,
        evidence,
        latestEvidence,
        visualStatus: latestEvidence ? latestEvidence.outcome : "pending",
      });
    }
  }
  return queue.sort((left, right) => left.resolutionId - right.resolutionId || left.side.localeCompare(right.side));
}

export function buildPromotionReadiness(phaseData, items) {
  if (!phaseData || !Array.isArray(phaseData.rows) || !Array.isArray(items)) {
    throw codedError("promotion_readiness_invalid");
  }
  const editorialByStatus = {};
  for (const row of phaseData.rows) {
    const status = String(row && row.status || "unknown");
    editorialByStatus[status] = (editorialByStatus[status] || 0) + 1;
  }
  const visualByStatus = {};
  for (const item of items) {
    const status = String(item && item.visualStatus || "unknown");
    visualByStatus[status] = (visualByStatus[status] || 0) + 1;
  }
  const visualItemsAwaitingEvidence = items.filter((item) => item.visualStatus !== "confirmed").length;
  return {
    state: "locked",
    promotionEnabled: false,
    reconciliationId: Number(phaseData.reconciliation && phaseData.reconciliation.id),
    editorialReview: {
      total: phaseData.rows.length,
      byStatus: editorialByStatus,
    },
    visualReview: {
      total: items.length,
      byStatus: visualByStatus,
      awaitingEvidence: visualItemsAwaitingEvidence,
    },
    prerequisites: [
      "Complete required editorial decisions through the normal reconciliation workflow.",
      "Record visual evidence for each current Catalog source-page reference.",
      "Obtain explicit authorization before any promotion or downstream publication.",
    ],
  };
}

function sourceBindingForPreflight(source) {
  if (!source || typeof source !== "object") return null;
  const sourcePages = source.sourcePages && typeof source.sourcePages === "object" ? source.sourcePages : null;
  return {
    sourcePoemId: Number.isInteger(Number(source.sourcePoemId)) ? Number(source.sourcePoemId) : null,
    sourceVersionId: Number.isInteger(Number(source.sourceVersionId)) ? Number(source.sourceVersionId) : null,
    title: String(source.title || ""),
    exactTextHash: String(source.exactTextHash || ""),
    sourcePages: sourcePages ? {
      status: String(sourcePages.status || "unavailable"),
      sourceSha256: String(sourcePages.sourceSha256 || ""),
      mappingSha256: String(sourcePages.mappingSha256 || ""),
      assetSha256: String(sourcePages.asset && sourcePages.asset.sha256 || ""),
    } : null,
  };
}

export function buildPromotionPreflight(phaseData, items) {
  const readiness = buildPromotionReadiness(phaseData, items);
  const decisions = phaseData.rows.map((row) => ({
    resolutionId: Number(row.resolutionId),
    reviewStatus: String(row.status || "unknown"),
    resolutionAction: row.proposedResolution || null,
    canonicalTitle: row.canonicalTitle || null,
    stablePoemIdentity: row.identity || null,
    textSourcePoemId: Number.isInteger(Number(row.textSourcePoemId)) ? Number(row.textSourcePoemId) : null,
    formatSourcePoemId: Number.isInteger(Number(row.formatSourcePoemId)) ? Number(row.formatSourcePoemId) : null,
    prior: sourceBindingForPreflight(row.prior),
    candidate: sourceBindingForPreflight(row.candidate),
  }));
  const visualEvidence = items.map((item) => ({
    resolutionId: item.resolutionId,
    side: item.side,
    visualStatus: item.visualStatus,
    sourcePoemId: item.source.sourcePoemId,
    sourceVersionId: item.source.sourceVersionId,
    mappingSha256: item.source.sourcePages.mappingSha256 || "",
    assetSha256: item.source.sourcePages.asset.sha256,
    latestEvidence: item.latestEvidence ? {
      id: item.latestEvidence.id,
      outcome: item.latestEvidence.outcome,
      recordedAt: item.latestEvidence.recordedAt,
      reviewer: item.latestEvidence.reviewer,
    } : null,
  }));
  const blockers = [
    ...(readiness.editorialReview.byStatus.pending
      ? [{ type: "editorial_decisions_pending", count: readiness.editorialReview.byStatus.pending }]
      : []),
    ...(readiness.visualReview.awaitingEvidence
      ? [{ type: "visual_evidence_pending", count: readiness.visualReview.awaitingEvidence }]
      : []),
    { type: "promotion_authorization_required" },
  ];
  const manifest = {
    schemaVersion: 1,
    phase: "promotion_preflight",
    mode: "read_only",
    reconciliation: {
      id: readiness.reconciliationId,
      writeRevision: phaseData.reconciliation && phaseData.reconciliation.writeRevision || null,
    },
    readiness,
    decisions,
    visualEvidence,
    blockers,
  };
  const sha256 = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return {
    ...manifest,
    integrity: { algorithm: "sha256", value: sha256 },
  };
}

export function validateVisualEvidenceInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw codedError("invalid_visual_evidence", 400);
  }
  const outcome = String(input.outcome || "").trim();
  const notes = String(input.notes || "").trim();
  if (!REVIEW_OUTCOMES.has(outcome)) throw codedError("invalid_visual_outcome", 400);
  if (notes.length < 3 || notes.length > MAX_EVIDENCE_NOTE_LENGTH) {
    throw codedError("visual_evidence_notes_required", 400);
  }
  return { outcome, notes };
}

async function catalogJson(path, { fetcher, readCatalogCredential }) {
  const credential = await readCatalogCredential();
  const response = await fetcher(CATALOG_PHASE2_API + path, {
    headers: { Accept: "application/json", Authorization: "Bearer " + credential },
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw codedError("catalog_visual_reference_unavailable", 502);
  return payload;
}

async function phaseDataFor(reconciliationId, dependencies) {
  if (Number(reconciliationId) !== LIVE_RECONCILIATION_ID) {
    throw codedError("visual_reconciliation_not_found", 404);
  }
  return readPhase2Reconciliation(reconciliationId, {
    fetcher: dependencies.fetcher,
    readSecret: async () => dependencies.readCatalogCredential(),
  });
}

function findVisualItem(items, resolutionId, side) {
  if (!SOURCE_SIDES.has(side)) throw codedError("visual_review_item_not_found", 404);
  const item = items.find((candidate) => Number(candidate.resolutionId) === Number(resolutionId) && candidate.side === side);
  if (!item) throw codedError("visual_review_item_not_found", 404);
  return item;
}

export async function fetchCatalogSourcePdf(item, { fetcher = fetch, readCatalogCredential } = {}) {
  const asset = item && item.source && item.source.sourcePages && item.source.sourcePages.asset;
  if (!asset || asset.href !== "/source-page-assets/" + item.source.sourceVersionId) {
    throw codedError("catalog_visual_reference_invalid");
  }
  const credential = await readCatalogCredential();
  const response = await fetcher(CATALOG_PHASE2_API + asset.href, {
    headers: { Accept: "application/pdf", Authorization: "Bearer " + credential },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw codedError("catalog_source_asset_unavailable", 502);
  const mediaType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/pdf") throw codedError("catalog_source_asset_invalid");
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== asset.sha256) throw codedError("catalog_source_asset_integrity_mismatch");
  return { bytes, mediaType, sha256: actualSha256 };
}

function safeError(res, error) {
  const status = Number(error && error.status) || 502;
  const code = String(error && error.code || "visual_review_unavailable");
  res.status(status).set("Cache-Control", "private, no-store").json({ error: code });
}

export function createManuscriptVisualReviewApp({
  verifyReviewer,
  readCatalogCredential,
  fetcher = fetch,
}) {
  if (typeof verifyReviewer !== "function" || typeof readCatalogCredential !== "function") {
    throw new TypeError("source_pdf_reference_dependencies_required");
  }

  const app = express();

  async function reviewerFor(req, res) {
    const ctx = await verifyReviewer(req, res);
    if (!ctx) return null;
    return normalizeReviewer(ctx);
  }

  async function queueFor(reconciliationId) {
    const phaseData = await phaseDataFor(reconciliationId, { fetcher, readCatalogCredential });
    return { phaseData, items: buildVisualReviewQueue(phaseData) };
  }

  app.get("/:reconciliationId", async (req, res) => {
    const reviewer = await reviewerFor(req, res);
    if (!reviewer) return;
    try {
      const { phaseData, items } = await queueFor(req.params.reconciliationId);
      res.set("Cache-Control", "private, no-store").json({
        reconciliation: {
          id: Number(phaseData.reconciliation.id),
          writeRevision: phaseData.reconciliation.writeRevision || null,
        },
        currentReviewer: reviewer,
        readOnly: true,
        writeEnabled: false,
        items,
      });
    } catch (error) {
      safeError(res, error);
    }
  });

  app.get("/:reconciliationId/items/:resolutionId/:side/source.pdf", async (req, res) => {
    const reviewer = await reviewerFor(req, res);
    if (!reviewer) return;
    try {
      const { items } = await queueFor(req.params.reconciliationId);
      const item = findVisualItem(items, req.params.resolutionId, req.params.side);
      const pdf = await fetchCatalogSourcePdf(item, { fetcher, readCatalogCredential });
      res.status(200).set({
        "Cache-Control": "private, no-store",
        "Content-Type": pdf.mediaType,
        "Content-Length": String(pdf.bytes.length),
        "ETag": "\"" + pdf.sha256 + "\"",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      }).send(pdf.bytes);
    } catch (error) {
      safeError(res, error);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  return app;
}
