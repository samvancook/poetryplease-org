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
      weaverSelectedExcerptRecordIds: Array.isArray(body.selectedExcerptRecordIds)
        ? body.selectedExcerptRecordIds.map(normalizeText).filter(Boolean)
        : [],
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
