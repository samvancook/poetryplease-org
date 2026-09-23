import test from "node:test";
import assert from "node:assert/strict";
import { buildWeaverVideoIntake, weaverVideoDocId } from "./weaver-video-intake.js";

const validVideo = {
  contentType: "VV",
  sourceSystem: "weaver",
  sourceRecordId: "weaver-video-93c66a",
  finalAssetUrl: "https://example.com/final.mp4",
  sourceVideoUrl: "https://example.com/raw.mov",
  sourceEvent: "national-poetry-slam-2026",
  sourceEventLabel: "National Poetry Slam 2026",
  decision: "ready_for_poetry_please",
  releaseStatus: "approved",
  publicationRestricted: false,
  candidateId: "weaver:video:priority-4:file-9",
  prioritySetId: "priority-4",
  sourceFileId: "file-9",
};

test("Weaver video intake makes a deterministic VV record with a required event lane", () => {
  const result = buildWeaverVideoIntake(validVideo);
  assert.equal(result.ok, true);
  assert.equal(result.item.imageType, "VV");
  assert.equal(result.item.docId, weaverVideoDocId(validVideo.sourceRecordId));
  assert.equal(result.item.sourceEvent, "national-poetry-slam-2026");
  assert.equal(result.item.sourceEventLabel, "National Poetry Slam 2026");
  assert.equal(result.item.driveLink, validVideo.finalAssetUrl);
  assert.equal(result.item.weaverCandidateId, validVideo.candidateId);
});

test("Weaver video intake rejects a non-video, unready, restricted, or eventless request", () => {
  assert.equal(buildWeaverVideoIntake({ ...validVideo, contentType: "QI" }).error, "invalid_video_content_type");
  assert.equal(buildWeaverVideoIntake({ ...validVideo, decision: "send_to_editing" }).error, "video_not_ready_for_poetry_please");
  assert.equal(buildWeaverVideoIntake({ ...validVideo, publicationRestricted: true }).error, "video_release_restricted");
  assert.equal(buildWeaverVideoIntake({ ...validVideo, sourceEvent: "", sourceEventLabel: "" }).error, "missing_source_event");
});

test("Weaver video intake refuses to publish the declared raw source as the final asset", () => {
  const result = buildWeaverVideoIntake({
    ...validVideo,
    finalAssetUrl: "https://example.com/raw.mov#download",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "final_asset_matches_raw_source");
});


test("Weaver video intake preserves stable private review and excerpt context", () => {
  const result = buildWeaverVideoIntake({
    ...validVideo,
    reviews: [{
      reviewId: "review-1",
      sourceRecordId: "weaver:review:1",
      reviewerEmail: "reviewer@buttonpoetry.com",
      rating: "approve",
      score: 4,
      note: "Use the opening excerpt.",
      selectedExcerptRecordIds: ["weaver:excerpt:1"],
    }],
    excerpts: [{
      excerptId: "weaver:excerpt:1",
      sourceRecordId: "weaver:excerpt:1",
      reviewId: "review-1",
      excerpt: "The actual selected excerpt text.",
      selected: true,
    }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.item.weaverReviews, [{
    reviewId: "review-1",
    sourceRecordId: "weaver:review:1",
    reviewerIdentity: "reviewer@buttonpoetry.com",
    reviewerEmail: "reviewer@buttonpoetry.com",
    rating: "approve",
    legacyNumericScore: 4,
    notes: "Use the opening excerpt.",
    excerptRecordIds: ["weaver:excerpt:1"],
  }]);
  assert.deepEqual(result.item.weaverExcerpts, [{
    excerptId: "weaver:excerpt:1",
    sourceRecordId: "weaver:excerpt:1",
    reviewId: "review-1",
    excerptText: "The actual selected excerpt text.",
    selected: true,
  }]);
});

test("Weaver video intake de-duplicates review and excerpt IDs for idempotent reimport", () => {
  const result = buildWeaverVideoIntake({
    ...validVideo,
    reviews: [{ reviewId: "review-1" }, { reviewId: "review-1", rating: "approve" }],
    excerpts: [{ excerptId: "excerpt-1", excerpt: "A" }, { excerptId: "excerpt-1", excerpt: "B" }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.item.weaverReviews.length, 1);
  assert.equal(result.item.weaverExcerpts.length, 1);
});
