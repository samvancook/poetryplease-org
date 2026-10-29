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

export function weaverVideoDocId(sourceRecordId) {
  const digest = createHash("sha256")
    .update(normalizeText(sourceRecordId))
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
  return `WEAVER-VV-${digest}`;
}

// A later handoff is an incremental snapshot, not permission to delete earlier
// review history or excerpt associations from the same canonical video.
export function mergeWeaverVideoContext(existing = {}, incoming = {}) {
  if (Object.keys(existing).length && (
    normalizeKey(existing.sourceSystem) !== "weaver"
    || normalizeText(existing.sourceRecordId) !== normalizeText(incoming.sourceRecordId)
  )) {
    const error = new Error("weaver_video_identity_conflict");
    error.status = 409;
    throw error;
  }
  const patch = {};
  // An omitted book in a video gate is not a request to erase metadata already
  // verified on the canonical PP record. Never infer a new book here.
  for (const key of ["author", "title", "book", "bookLink", "bookShortener"]) {
    if (!normalizeText(incoming[key]) && normalizeText(existing[key])) patch[key] = existing[key];
  }
  if (Object.hasOwn(incoming, "weaverReviews")) {
    const reviews = new Map();
    for (const row of Array.isArray(existing.weaverReviews) ? existing.weaverReviews : []) {
      const id = normalizeText(row.reviewId);
      if (!id || reviews.has(id)) {
        const error = new Error("weaver_video_review_identity_conflict");
        error.status = 409;
        throw error;
      }
      reviews.set(id, row);
    }
    for (const row of Array.isArray(incoming.weaverReviews) ? incoming.weaverReviews : []) {
      const id = normalizeText(row.reviewId);
      if (!id) continue;
      const previous = reviews.get(id);
      reviews.set(id, previous ? {
        ...previous, ...row,
        excerptRecordIds: [...new Set([
          ...normalizeStringList(previous.excerptRecordIds),
          ...normalizeStringList(row.excerptRecordIds),
        ])],
      } : row);
    }
    patch.weaverReviews = [...reviews.values()];
  }
  if (Object.hasOwn(incoming, "weaverSelectedExcerptRecordIds")) {
    patch.weaverSelectedExcerptRecordIds = [...new Set([
      ...normalizeStringList(existing.weaverSelectedExcerptRecordIds),
      ...normalizeStringList(incoming.weaverSelectedExcerptRecordIds),
    ])];
  }
  return patch;
}

export function countReceivedWeaverVideoContext(stored = {}, submitted = {}) {
  const storedReviews = new Set((stored.weaverReviews || []).map(row => normalizeText(row.reviewId)).filter(Boolean));
  const submittedReviews = new Set((submitted.weaverReviews || []).map(row => normalizeText(row.reviewId)).filter(Boolean));
  const storedExcerpts = new Set(normalizeStringList(stored.weaverSelectedExcerptRecordIds));
  const submittedExcerpts = new Set(normalizeStringList(submitted.weaverSelectedExcerptRecordIds));
  return {
    receivedReviewCount: [...submittedReviews].filter(id => storedReviews.has(id)).length,
    receivedSelectedExcerptIdCount: [...submittedExcerpts].filter(id => storedExcerpts.has(id)).length,
    storedReviewCount: storedReviews.size,
    storedSelectedExcerptIdCount: storedExcerpts.size,
  };
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
      // A Weaver handoff is review-only until Poetry Please has made and
      // verified its own durable copy. Keep the final Drive asset playable for
      // reviewers, but never make it eligible for a public feed by accident.
      videoUrl: finalAssetUrl,
      storageMode: "external",
      mediaStatus: "review_ready",
      durableCopyStatus: "pending",
      reviewOnly: true,
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
