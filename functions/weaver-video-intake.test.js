import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildWeaverVideoIntake, weaverVideoDocId, weaverVideoImportWarnings } from "./weaver-video-intake.js";

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


test("Weaver video intake preserves reviews and selected excerpt IDs without excerpt text", () => {
  const result = buildWeaverVideoIntake({
    ...validVideo,
    selectedExcerptRecordIds: ["weaver:excerpt:1"],
    reviews: [{
      reviewId: "review-1",
      sourceRecordId: "weaver:review:1",
      reviewerEmail: "reviewer@buttonpoetry.com",
      rating: "approve",
      legacyScore: 4,
      note: "Use the opening excerpt.",
      selectedExcerptRecordIds: ["weaver:excerpt:1"],
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
  assert.deepEqual(result.item.weaverSelectedExcerptRecordIds, ["weaver:excerpt:1"]);
  assert.equal(Object.hasOwn(result.item, "weaverExcerpts"), false);
});

test("Weaver video intake omits private context fields when an older payload does not send them", () => {
  const result = buildWeaverVideoIntake(validVideo);
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.item, "weaverReviews"), false);
  assert.equal(Object.hasOwn(result.item, "weaverSelectedExcerptRecordIds"), false);
});

test("Weaver video intake de-duplicates review IDs for idempotent reimport", () => {
  const result = buildWeaverVideoIntake({
    ...validVideo,
    reviews: [{ reviewId: "review-1" }, { reviewId: "review-1", rating: "approve" }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.item.weaverReviews.length, 1);
});

test("a Weaver video with no release catalog is reported, not rejected", () => {
  // Poetry Please stores exactly what Weaver sends, and Weaver omits the release catalog.
  // The 12 BPL Charm City videos in production landed with it blank, which makes them
  // match no catalog filter: absent from embedBookLead?catalog=..., absent from the catalog
  // facet, while the import still reports success. Report it instead of rejecting, because
  // rejecting would stop the pipeline over a reporting gap.
  assert.deepEqual(weaverVideoImportWarnings({ releaseCatalog: "", eventReleaseCatalog: "" }), ["missing_release_catalog"]);
  assert.deepEqual(weaverVideoImportWarnings({}), ["missing_release_catalog"]);
  assert.deepEqual(weaverVideoImportWarnings({ releaseCatalog: "   " }), ["missing_release_catalog"]);
  // Either field is enough: the event catalog carries the identity when there is no book season.
  assert.deepEqual(weaverVideoImportWarnings({ releaseCatalog: "BPL Events" }), []);
  assert.deepEqual(weaverVideoImportWarnings({ eventReleaseCatalog: "BPL Events" }), []);

  // The route has to surface it in all three places, or it stays invisible to the sender.
  const server = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const route = server.slice(server.indexOf('/internal/weaverVideoImport'));
  const body = route.slice(0, route.indexOf("app.post(", 40) > 0 ? route.indexOf("app.post(", 40) : 9000);
  assert.match(body, /const importWarnings = weaverVideoImportWarnings\(/);
  assert.match(body, /warningCount: importWarnings\.length/);
  assert.match(body, /warnings: importWarnings/);
});
