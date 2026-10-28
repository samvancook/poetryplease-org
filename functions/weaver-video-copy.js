import { createHash } from "node:crypto";

function text(value) {
  return String(value || "").trim();
}

export function weaverVideoCopyAttemptId({ sourceRecordId, canonicalVideoId, driveLink } = {}) {
  const identity = [text(sourceRecordId), text(canonicalVideoId), text(driveLink)].join("\n");
  return `weaver-video-copy-${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

export function canClaimWeaverVideoCopy(video = {}, attemptId = "", nowMs = Date.now()) {
  if (video.reviewOnly !== true || text(video.sourceSystem).toLowerCase() !== "weaver") return false;
  if (!text(video.sourceRecordId) || !text(video.driveLink) || !text(attemptId)) return false;
  if (text(video.durableCopyStatus).toLowerCase() === "verified") return false;
  if (text(video.durableCopyAttemptId) && text(video.durableCopyAttemptId) !== text(attemptId)) return false;
  const leaseExpiresAtMs = Number(video.durableCopyLeaseExpiresAtMs || 0) || 0;
  return !(text(video.durableCopyStatus).toLowerCase() === "copying" && leaseExpiresAtMs > nowMs);
}
