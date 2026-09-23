import { createHash } from "node:crypto";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizedUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch (_err) {
    return raw;
  }
}

function isTruthy(value) {
  return ["1", "true", "yes", "y"].includes(normalizeKey(value));
}

function isRestrictedRelease(value) {
  return ["restricted", "unreleased", "opted_out", "opted-out", "private"].includes(normalizeKey(value));
}

function normalizeStringList(values) {
  return Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : [];
}

function normalizeWeaverVideoReviews(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values.map((value) => {
    const row = value && typeof value === "object" ? value : {};
    const reviewId = normalizeText(row.reviewId || row.id || row.sourceRecordId);
    if (!reviewId || seen.has(reviewId)) return null;
    seen.add(reviewId);
    const legacyScore = Number(row.legacyNumericScore ?? row.legacyScore ?? row.numericScore ?? row.score);
    return {
      reviewId,
      sourceRecordId: normalizeText(row.sourceRecordId || row.recordId),
      reviewerIdentity: normalizeText(row.reviewerIdentity || row.reviewerId || row.reviewerUid || row.reviewerEmail || row.reviewer),
      reviewerEmail: normalizeText(row.reviewerEmail),
      rating: normalizeText(row.rating || row.decision),
      legacyNumericScore: Number.isFinite(legacyScore) ? legacyScore : null,
      notes: normalizeText(row.notes || row.note || row.reviewNotes),
      excerptRecordIds: normalizeStringList(row.excerptRecordIds || row.selectedExcerptRecordIds || row.excerptIds),
    };
  }).filter(Boolean);
}

function normalizeWeaverVideoExcerpts(values, selectedExcerptRecordIds = []) {
  const selectedIds = new Set(normalizeStringList(selectedExcerptRecordIds).map(normalizeKey));
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values.map((value) => {
    const row = value && typeof value === "object" ? value : {};
    const excerptId = normalizeText(row.excerptId || row.id || row.sourceRecordId);
    if (!excerptId || seen.has(excerptId)) return null;
    seen.add(excerptId);
    return {
      excerptId,
      sourceRecordId: normalizeText(row.sourceRecordId || row.recordId),
      reviewId: normalizeText(row.reviewId),
      excerptText: normalizeText(row.excerptText || row.excerpt || row.text || row.quote),
      selected: row.selected === true
        || selectedIds.has(normalizeKey(excerptId))
        || selectedIds.has(normalizeKey(row.sourceRecordId || row.recordId)),
    };
  }).filter(Boolean);
}

export function weaverVideoDocId(sourceRecordId) {
  const digest = createHash("sha256")
    .update(normalizeText(sourceRecordId))
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
  return `WEAVER-VV-${digest}`;
}

export function buildWeaverVideoIntake(body = {}) {
  const contentType = normalizeText(body.contentType).toUpperCase();
  if (contentType !== "VV") {
    return { ok: false, status: 400, error: "invalid_video_content_type" };
  }
  if (normalizeKey(body.sourceSystem) !== "weaver") {
    return { ok: false, status: 400, error: "invalid_source_system" };
  }
  if (normalizeKey(body.decision) !== "ready_for_poetry_please") {
    return { ok: false, status: 409, error: "video_not_ready_for_poetry_please" };
  }
  if (isTruthy(body.publicationRestricted) || isRestrictedRelease(body.releaseStatus)) {
    return { ok: false, status: 409, error: "video_release_restricted" };
  }

  const sourceRecordId = normalizeText(body.sourceRecordId);
  const finalAssetUrl = normalizeText(body.finalAssetUrl);
  const sourceEvent = normalizeText(body.sourceEvent || body.eventName);
  const sourceEventLabel = normalizeText(body.sourceEventLabel || body.eventName || sourceEvent);
  if (!sourceRecordId) return { ok: false, status: 400, error: "missing_source_record_id" };
  if (!finalAssetUrl) return { ok: false, status: 400, error: "missing_final_asset_url" };
  if (!sourceEvent || !sourceEventLabel) return { ok: false, status: 400, error: "missing_source_event" };

  const rawSourceUrl = normalizeText(body.sourceVideoUrl || body.rawSourceUrl);
  if (rawSourceUrl && normalizedUrl(rawSourceUrl) === normalizedUrl(finalAssetUrl)) {
    return { ok: false, status: 409, error: "final_asset_matches_raw_source" };
  }

  const docId = weaverVideoDocId(sourceRecordId);
  return {
    ok: true,
    item: {
      docId,
      videoId: docId,
      imageType: "VV",
      sourceSystem: "weaver",
      sourceRecordId,
      sourceDriveFileId: normalizeText(body.sourceDriveFileId || body.sourceFileId),
      driveLink: finalAssetUrl,
      updatedFileName: normalizeText(body.updatedFileName || body.finalAssetFileName),
      author: normalizeText(body.author),
      title: normalizeText(body.title || body.poemTitle),
      book: normalizeText(body.book || body.bookTitle),
      bookLink: normalizeText(body.bookLink),
      bookShortener: normalizeText(body.bookShortener),
      releaseCatalog: normalizeText(body.releaseCatalog),
      eventReleaseCatalog: normalizeText(body.eventReleaseCatalog),
      sourceEvent,
      sourceEventLabel,
      weaverCandidateId: normalizeText(body.candidateId),
      weaverPrioritySetId: normalizeText(body.prioritySetId),
      weaverSourceFileId: normalizeText(body.sourceFileId),
      weaverGateId: normalizeText(body.gateId),
      weaverReleaseStatus: normalizeText(body.releaseStatus),
      weaverPublicationRestricted: isTruthy(body.publicationRestricted),
      ...(Array.isArray(body.selectedExcerptRecordIds) ? {
        weaverSelectedExcerptRecordIds: body.selectedExcerptRecordIds.map(normalizeText).filter(Boolean),
      } : {}),
      // Private review context. Public video payloads must not map these fields.
      ...(Array.isArray(body.reviews) ? {
        weaverReviews: normalizeWeaverVideoReviews(body.reviews),
      } : {}),
      ...(Array.isArray(body.excerpts) ? {
        weaverExcerpts: normalizeWeaverVideoExcerpts(body.excerpts, body.selectedExcerptRecordIds),
      } : {}),
      weaverDiagnostics: {
        baseScore: Number(body.baseScore || 0) || 0,
        excerptBonus: Number(body.excerptBonus || 0) || 0,
        candidateScore: Number(body.candidateScore || 0) || 0,
        reviewCount: Number(body.reviewCount || 0) || 0,
        excerptCount: Number(body.excerptCount || 0) || 0,
        decision: normalizeText(body.decision),
        decidedBy: normalizeText(body.decidedBy),
        decidedAt: normalizeText(body.decidedAt),
      },
    },
  };
}
