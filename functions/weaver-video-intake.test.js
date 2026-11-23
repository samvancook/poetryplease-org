import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {normalizeFootageConnections,mergeFootageConnections} from './footage-provenance.js';
import { buildWeaverVideoIntake, weaverVideoDocId, mergeWeaverVideoContext, countReceivedWeaverVideoContext, weaverVideoImportWarnings } from "./weaver-video-intake.js";

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

const footageRef={inventoryEventId:'inventory-39a607f0dd29e65a111e13892bf0b17b',inventoryEventName:'PAGES footage from Rudy Francisco 2026',
 sourceSpreadsheetId:'1npv-dpP22MV-cRs-DRjOimjbWIxf-xvbun5SdP6dl7U',sourceRow:6871,
 familyId:'footage-family-3e64fa77f2dd9229f0b1d6c41243324b',originalMediaFileId:'1pHdxNXRNgbdzRecfUYYsvNt1VyZS7Wws',
 finishedVideoFileId:'1Te0zeh7tmd820BBoUw2HOcDCbkBMjGwH',curationFileId:'1Te0zeh7tmd820BBoUw2HOcDCbkBMjGwH'};
test('footage references survive intake, payload mapping, retry and private readback without changing video identity',async()=>{
 const intake=buildWeaverVideoIntake({...validVideo,footageContextVersion:1,footageConnections:[footageRef,footageRef]});
 assert.equal(intake.ok,true);assert.equal(intake.item.docId,weaverVideoDocId(validVideo.sourceRecordId));
 assert.deepEqual(intake.item.weaverFootageConnections,[footageRef]);
 const source=readFileSync(new URL('./index.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function buildContentDocPayload('),source.indexOf('function collectionForContentType('));
 const build=runInNewContext(fn+';buildContentDocPayload',{normalizeText:x=>String(x||'').trim(),FieldValue:{serverTimestamp:()=> 'now'},deriveContentDocId:(_type,body)=>body.docId,normalizeFootageConnections});
 const payload=build('videos',intake.item).payload;
 assert.deepEqual(payload.weaverFootageConnections,[footageRef]);
 const existing={...intake.item,weaverReviews:[{reviewId:'review-a'}],weaverSelectedExcerptRecordIds:['excerpt-a']};
 const merged={...existing,...mergeWeaverVideoContext(existing,{...intake.item,weaverFootageConnections:[]})};
 assert.deepEqual(merged.weaverFootageConnections,[footageRef]);assert.deepEqual(merged.weaverReviews,existing.weaverReviews);
 assert.equal(merged.videoUrl,existing.videoUrl);assert.equal(merged.reviewOnly,true);
 const counts=countReceivedWeaverVideoContext(merged,intake.item);
 assert.deepEqual(counts.receivedFootageConnections,[footageRef]);assert.equal(counts.receivedFootageConnectionCount,1);
 const readSource=source.slice(source.indexOf('function weaverVideoReceiptLedgerRow('),source.indexOf('app.get(getBoth("/internal/weaverVideoReceipt")'));
 const read=runInNewContext(readSource+';readWeaverVideoReceipt',{weaverVideoDocId,normalizeFootageConnections,normalizeText:x=>String(x||'').trim(),COLLECTIONS:{videos:'videos',weaverImportLedger:'ledger'},db:{collection:()=>({doc:()=>({get:async()=>({exists:true,id:intake.item.docId,data:()=>merged})}),where:()=>({limit:()=>({get:async()=>({docs:[]})})})})}});
 const receipt=await read(validVideo.sourceRecordId);
 assert.equal(receipt.received,true);assert.deepEqual(receipt.footage.connections,[footageRef]);assert.equal(receipt.media.videoUrl,validVideo.finalAssetUrl);
});
test('footage retries preserve earlier references and reject conflicting asset identities',()=>{
 assert.deepEqual(mergeFootageConnections([footageRef],[]),[footageRef]);
 assert.deepEqual(mergeFootageConnections([footageRef],[footageRef]),[footageRef]);
 assert.throws(()=>mergeFootageConnections([footageRef],[{...footageRef,originalMediaFileId:'another_original_file_123456'}]),/identity_conflict/);
 assert.equal(buildWeaverVideoIntake({...validVideo,footageContextVersion:1,footageConnections:[{...footageRef,sourceRow:0}]}).error,'invalid_footage_connection');
 assert.equal(buildWeaverVideoIntake({...validVideo,footageConnections:[footageRef]}).error,'unsupported_footage_context_version');
});
test('footage UI remains collapsed and escapes source names',()=>{
 const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('    function renderWeaverFootageContext('),html.indexOf('    function renderWeaverVideoReviewContext('));
 const render=runInNewContext(fn+';renderWeaverFootageContext',{escapeHtml:x=>String(x||'').replaceAll('<','&lt;').replaceAll('>','&gt;')});
 const output=render({collection:'videos',weaverFootageConnections:[{...footageRef,inventoryEventName:'<script>event</script>'}]});
 assert.match(output,/Footage sources \(1\)/);assert.match(output,/OM source/);assert.match(output,/Linked FV/);
 assert.doesNotMatch(output,/<script>/);assert.equal(render({collection:'graphics',weaverFootageConnections:[footageRef]}),'');
});

test("a partial resend preserves historical reviews and excerpt links while acknowledging the submitted set", () => {
  const existing = {
    sourceSystem: "weaver", sourceRecordId: validVideo.sourceRecordId,
    weaverReviews: [
      { reviewId: "archived", notes: "Retain this review", excerptRecordIds: ["old-excerpt"] },
      { reviewId: "current", rating: "like", excerptRecordIds: ["earlier-link"] },
    ],
    weaverSelectedExcerptRecordIds: ["old-excerpt", "earlier-link"],
  };
  const incoming = buildWeaverVideoIntake({ ...validVideo,
    reviews: [{ reviewId: "current", rating: "love", excerptRecordIds: ["new-excerpt"] }],
    selectedExcerptRecordIds: ["new-excerpt", "new-excerpt"],
  }).item;
  const merged = { ...existing, ...mergeWeaverVideoContext(existing, incoming) };
  assert.deepEqual(merged.weaverReviews[0], existing.weaverReviews[0]);
  assert.equal(merged.weaverReviews[1].rating, "love");
  assert.deepEqual(merged.weaverReviews[1].excerptRecordIds, ["earlier-link", "new-excerpt"]);
  assert.deepEqual(merged.weaverSelectedExcerptRecordIds, ["old-excerpt", "earlier-link", "new-excerpt"]);
  assert.deepEqual(countReceivedWeaverVideoContext(merged, incoming), {
    receivedReviewCount: 1, receivedSelectedExcerptIdCount: 1,
    storedReviewCount: 2, storedSelectedExcerptIdCount: 3,
  });
  assert.deepEqual(mergeWeaverVideoContext(merged, incoming), {
    weaverReviews: merged.weaverReviews,
    weaverSelectedExcerptRecordIds: merged.weaverSelectedExcerptRecordIds,
  });
  assert.deepEqual(mergeWeaverVideoContext(merged, { ...incoming, weaverReviews: [], weaverSelectedExcerptRecordIds: [] }), {
    weaverReviews: merged.weaverReviews,
    weaverSelectedExcerptRecordIds: merged.weaverSelectedExcerptRecordIds,
  });
});

test("video review context cannot cross canonical source identities", () => {
  assert.throws(() => mergeWeaverVideoContext({ sourceSystem: "weaver", sourceRecordId: "other" }, validVideo), /identity_conflict/);
  assert.throws(() => mergeWeaverVideoContext({ sourceSystem: "other", sourceRecordId: validVideo.sourceRecordId }, validVideo), /identity_conflict/);
  assert.throws(() => mergeWeaverVideoContext({ sourceSystem: "weaver", sourceRecordId: validVideo.sourceRecordId,
    weaverReviews: [{ notes: "Unidentified history must not be dropped" }],
  }, { ...validVideo, weaverReviews: [] }), /review_identity_conflict/);
  assert.deepEqual(mergeWeaverVideoContext({}, { sourceRecordId: validVideo.sourceRecordId }), {});
  assert.deepEqual(countReceivedWeaverVideoContext({ weaverReviews: [{ reviewId: "earlier" }] }, {}), {
    receivedReviewCount: 0, receivedSelectedExcerptIdCount: 0,
    storedReviewCount: 1, storedSelectedExcerptIdCount: 0,
  });
});

test("an asset handoff without book metadata retains the canonical book without inventing one", () => {
  const existing = { sourceSystem: "weaver", sourceRecordId: validVideo.sourceRecordId,
    author: "Existing author", title: "Existing title", book: "Existing book",
    bookLink: "https://example.com/book", bookShortener: "EB" };
  assert.deepEqual(mergeWeaverVideoContext(existing, {
    sourceSystem: "weaver", sourceRecordId: validVideo.sourceRecordId, author: "", title: "", book: "",
  }), { author: existing.author, title: existing.title, book: existing.book,
    bookLink: existing.bookLink, bookShortener: existing.bookShortener });
  assert.equal(mergeWeaverVideoContext({}, validVideo).book, undefined);
  assert.equal(mergeWeaverVideoContext(existing, { ...validVideo, book: "Explicitly updated book" }).book, undefined);
});

test("Weaver video intake makes a deterministic VV record with a required event lane", () => {
  const result = buildWeaverVideoIntake(validVideo);
  assert.equal(result.ok, true);
  assert.equal(result.item.imageType, "VV");
  assert.equal(result.item.docId, weaverVideoDocId(validVideo.sourceRecordId));
  assert.equal(result.item.sourceEvent, "national-poetry-slam-2026");
  assert.equal(result.item.sourceEventLabel, "National Poetry Slam 2026");
  assert.equal(result.item.driveLink, validVideo.finalAssetUrl);
  assert.equal(result.item.videoUrl, validVideo.finalAssetUrl);
  assert.equal(result.item.storageMode, "external");
  assert.equal(result.item.mediaStatus, "review_ready");
  assert.equal(result.item.durableCopyStatus, "pending");
  assert.equal(result.item.reviewOnly, true);
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

test("exact excerpt receipt verifies the live binding and preserves the historical outcome", async () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function readExactWeaverExcerptReceipt(");
  const end = source.indexOf('app.get(getBoth("/internal/weaverImportHealth")', start);
  const legacy = { contentId: "excerpt", outcome: "created", sourceRecordId: "", canonicalVideoId: "" };
  const ledger = { status: "completed", contentType: "EXC", outcomes: [legacy] };
  const item = { sourceSystem: "weaver", sourceContentId: "video" };
  const excerpt = { id: "excerpt", data: () => item };
  let duplicates = false;
  let parentExists = true;
  const db = {
    collection: name => {
      if (name === "ledger") return { doc: () => ({ get: async () => ({ data: () => ledger }) }) };
      if (name === "videos") return { doc: () => ({ get: async () => ({ exists: parentExists }) }) };
      return { where: () => ({ limit: () => ({ get: async () => ({ docs: duplicates ? [excerpt, excerpt] : [excerpt] }) }) }) };
    },
  };
  const read = runInNewContext(source.slice(start, end) + ";readExactWeaverExcerptReceipt", {
    db, COLLECTIONS: { weaverImportLedger: "ledger", videos: "videos", excerpts: "excerpts" },
    normalizeText: value => String(value || "").trim(), isWeaverExcerptImportType: type => type === "EXC",
  });
  const result = await read("weaver:source", "ledger-id");
  assert.equal(result.bindingEvidence, "current_excerpt_and_completed_import_outcome");
  assert.equal(result.sourceRecordId, "weaver:source");
  assert.equal(result.canonicalExcerptId, "excerpt");
  assert.equal(result.canonicalVideoId, "video");
  assert.equal(result.originalOutcome.sourceRecordId, "");
  ledger.outcomes = [{ ...legacy, sourceRecordId: "weaver:other" }];
  assert.equal(await read("weaver:source", "ledger-id"), null);
  ledger.outcomes = [legacy];
  duplicates = true;
  assert.equal(await read("weaver:source", "ledger-id"), null);
  duplicates = false;
  parentExists = false;
  assert.equal(await read("weaver:source", "ledger-id"), null);
});

test("video readiness revokes when bound output, caption approval or parent changes", () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("function buildWeaverVideoReadiness(");
  const end = source.indexOf("async function readWeaverVideoReadiness(", start);
  const fingerprint = value => String(value || "").trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
  const sha256 = value => createHash("sha256").update(value).digest("hex");
  const build = runInNewContext(source.slice(start, end) + ";buildWeaverVideoReadiness", {
    normalizeTimestamp: value => value ? new Date(value) : null,
    normalizeText: value => String(value || "").trim(),
    buildExcerptFingerprint: fingerprint, sha256, COLLECTIONS: { videos: "videos" },
  });
  const date = "2026-11-17T21:00:00.000Z";
  const video = { sourceRecordId: "weaver:video:source" };
  const excerpt = {
    sourceSystem: "weaver", sourceContentId: "video", sourceRecordId: "weaver:excerpt",
    author: "Author", title: "Poem", approvedAt: date, excerpt: "Approved words",
    excerptFingerprint: "approved words",
  };
  const checksum = "a".repeat(64);
  const asset = {
    assetType: "video_rendition", contentCollection: "videos", contentDocId: "video",
    sourceRecordId: video.sourceRecordId, status: "active", validationState: "verified_bytes",
    sourceVersionFileId: "source-file", outputFileId: "output-file", outputRevisionId: "revision",
    profileId: "platform-720p-h264-aac", profileVersion: "1", sha256: checksum,
    verifiedSha256: checksum, byteCount: 100, verifiedByteCount: 100, updatedAt: date,
    durationSeconds: 30,
  };
  const binding = {
    schemaVersion: "1", canonicalVideoId: "video", sourceRecordId: video.sourceRecordId,
    renditionId: "asset", canonicalExcerptId: "excerpt", approvedSourceRecordId: excerpt.sourceRecordId,
    approvedAt: date, fingerprint: excerpt.excerptFingerprint, approvedTextHash: sha256(excerpt.excerptFingerprint),
    author: "Author", poem: "Poem", sourceVersionFileId: asset.sourceVersionFileId,
    outputFileId: asset.outputFileId, outputRevisionId: asset.outputRevisionId,
    profileId: asset.profileId, profileVersion: asset.profileVersion, sha256: checksum, byteCount: 100,
    renditionUpdatedAt: date, certifiedAt: date,
    evidence: { url: "https://drive.google.com/file/d/evidence/view", matchedExactly: true,
      uniqueMatchesInOutput: 1, fromMs: 1000, toMs: 2000 },
  };
  const checked = new Date("2026-11-19T12:00:00.000Z");
  const receipt = build("video", video, binding, asset, excerpt, checked);
  assert.equal(receipt.media.status, "verified");
  assert.equal(receipt.caption.status, "approved");
  assert.equal(receipt.caption.text, excerpt.excerpt);
  assert.equal(receipt.checkedAt, checked.toISOString());
  assert.equal(build("video", video, null, asset, excerpt), null);
  assert.equal(build("video", video, binding, undefined, excerpt), null);
  for (const patch of [
    { outputFileId: "replacement" }, { outputRevisionId: "new-revision" },
    { verifiedSha256: "b".repeat(64) }, { validationState: "source_reported" },
    { status: "retired" }, { updatedAt: "2026-11-18T21:00:00.000Z" },
    { contentDocId: "another-video" }, { verifiedByteCount: 99 },
  ]) assert.equal(build("video", video, binding, { ...asset, ...patch }, excerpt), null);
  for (const patch of [
    { excerpt: "Changed words" }, { approvedAt: null }, { sourceContentId: "other-video" },
    { sourceRecordId: "other-source" }, { catalogRetired: true }, { title: "Other poem" },
  ]) assert.equal(build("video", video, binding, asset, { ...excerpt, ...patch }), null);
  assert.equal(build("video", { ...video, weaverPublicationRestricted: true }, binding, asset, excerpt), null);
  assert.equal(build("video", { ...video, sourceRecordId: "different" }, binding, asset, excerpt), null);
});

test("a Weaver video with no release catalog is reported, not rejected", () => {
  assert.deepEqual(weaverVideoImportWarnings({ releaseCatalog: "", eventReleaseCatalog: "" }), ["missing_release_catalog"]);
  assert.deepEqual(weaverVideoImportWarnings({}), ["missing_release_catalog"]);
  assert.deepEqual(weaverVideoImportWarnings({ releaseCatalog: "   " }), ["missing_release_catalog"]);
  // Either field is enough: the event catalog carries the identity when there is no book season.
  assert.deepEqual(weaverVideoImportWarnings({ releaseCatalog: "BPL Events" }), []);
  assert.deepEqual(weaverVideoImportWarnings({ eventReleaseCatalog: "BPL Events" }), []);

  // The import route has to surface it in the ledger, the outcome and the response.
  const server = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = server.indexOf('getBoth("/internal/weaverVideoImport")');
  assert.notEqual(start, -1);
  const body = server.slice(start, server.indexOf("app.post(", start + 40));
  assert.match(body, /const importWarnings = weaverVideoImportWarnings\(/);
  assert.match(body, /warningCount: importWarnings\.length/);
  assert.equal(body.match(/warnings: importWarnings/g)?.length, 3);
});
