import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import {
  approvedQiLibrarySourceRows,
  buildQiLibraryWritebackValues,
  canonicalImportManifestJson,
  contentIdSlug,
  deterministicGraphicStoragePath,
  detectRemoteMediaMimeType,
  importGraphicMetadataKey,
  inferRemoteMimeType,
  isTrustedDistinctQiLibraryAsset,
  isCacheGenerationCurrent,
  normalizeStorageObjectName,
  nextAvailableGraphicVariantId,
  normalizeQiLibraryYearBatchLimit,
  preserveExistingImportValues,
  qiLibraryYearStopReason,
  qiLibraryYearTaskDecision,
  qiLibraryGraphicBaseId,
  qiLibraryGraphicVariantCandidates,
  qiLibraryGraphicVariantId,
  shouldCreateSuppliedGraphicVariant,
  shouldForceGraphicAssetReplacement,
  selectQiLibraryYearRows,
  validateImportedGraphic,
  verifiedImageContentType,
} from "./uploader-helpers.js";
import {
  contentReleaseCatalogs,
  isBookReleaseCatalog,
  preservedEventReleaseCatalog,
} from "./catalog-identity.js";

const graphicRules = {
  allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
};

test("contentIdSlug preserves long canonical title text beyond the old 80-character limit", () => {
  const title = "Margot Robbie Greta Gerwig Are Not Nominated For An Oscar For Barbie America Ferrera Is The First Honduran Actress In History Nominated For An Oscar For Barbie";
  const slug = contentIdSlug(title);
  assert.ok(slug.length > 80);
  assert.equal(slug.endsWith("for-barbie"), true);
});

test("the Gigi Bella long-title control produces the existing live canonical ID", () => {
  const title = "margot robbie & greta gerwig are not nominated for an oscar for barbie/ america ferrera is the first honduran actress in history nominated for an oscar for barbie";
  const generatedId = `WTF-QI-${contentIdSlug(title)}`.toUpperCase();
  assert.equal(
    generatedId,
    "WTF-QI-MARGOT-ROBBIE-GRETA-GERWIG-ARE-NOT-NOMINATED-FOR-AN-OSCAR-FOR-BARBIE-AMERICA-FERRERA-IS-THE-FIRST-HONDURAN-ACTRESS-IN-HISTORY-NOMINATED-FOR-AN-OSCAR-FOR-BARBIE"
  );
});

test("byte sniffing recognizes PNG served as application/octet-stream", () => {
  const pngPrefix = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(detectRemoteMediaMimeType(pngPrefix), "image/png");
  assert.equal(
    inferRemoteMimeType("application/octet-stream", "graphic-without-extension", "", graphicRules),
    ""
  );
});

test("byte sniffing recognizes common hosted video containers", () => {
  const mp4Prefix = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const webmPrefix = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  assert.equal(detectRemoteMediaMimeType(mp4Prefix), "video/mp4");
  assert.equal(detectRemoteMediaMimeType(webmPrefix), "video/webm");
});

test("duplicate metadata matching normalizes punctuation, spacing, and case", () => {
  const incoming = importGraphicMetadataKey({
    author: "Gigi Bella",
    book: "Somewhere Between Shadow & Mourning",
    title: "For Whitney",
    imageType: "QI",
  });
  const existing = importGraphicMetadataKey({
    author: "  GIGI BELLA ",
    book: "Somewhere Between Shadow and Mourning",
    title: "For Whitney!",
    imageType: "qi",
  });
  assert.notEqual(incoming, existing);
  assert.equal(
    importGraphicMetadataKey({
      author: "  GIGI BELLA ",
      book: "Somewhere Between Shadow & Mourning",
      title: "For Whitney!",
      imageType: "qi",
    }),
    incoming
  );
});

test("an explicit unused graphic ID creates a distinct same-poem variant", () => {
  assert.equal(shouldCreateSuppliedGraphicVariant({
    suppliedDocId: "AGTU-QI-IDEATION-V2",
    sourceMatchCount: 0,
  }), true);
  assert.equal(shouldCreateSuppliedGraphicVariant({
    suppliedDocId: "AGTU-QI-IDEATION-V2",
    sourceMatchCount: 1,
  }), false);
  assert.equal(shouldCreateSuppliedGraphicVariant({ suppliedDocId: "", sourceMatchCount: 0 }), false);
});

test("a QI Library row with a new Drive identity is a trusted distinct graphic", () => {
  assert.equal(isTrustedDistinctQiLibraryAsset({
    sourceSystem: "qi_library",
    sourceSpreadsheetRow: 1400,
    sourceDriveFileId: "drive-new",
    sourceMatchCount: 0,
  }), true);
  assert.equal(isTrustedDistinctQiLibraryAsset({
    sourceSystem: "qi_library",
    sourceSpreadsheetRow: 1400,
    sourceDriveFileId: "drive-new",
    sourceMatchCount: 1,
  }), false);
  assert.equal(isTrustedDistinctQiLibraryAsset({
    sourceSystem: "manual",
    sourceSpreadsheetRow: 1400,
    sourceDriveFileId: "drive-new",
    sourceMatchCount: 0,
  }), false);
});

test("known-broken QI IDs force a fresh asset upload", () => {
  const brokenIds = new Set(["ond-qi-ocd-v2"]);
  assert.equal(shouldForceGraphicAssetReplacement({
    docId: "OND-QI-OCD-V2",
    brokenIds,
  }), true);
  assert.equal(shouldForceGraphicAssetReplacement({
    docId: "OND-QI-MEMORIAL-DAY",
    brokenIds,
  }), false);
  assert.equal(shouldForceGraphicAssetReplacement({
    docId: "OND-QI-MEMORIAL-DAY",
    requestedForce: true,
    brokenIds,
  }), true);
});

test("QI Library variant IDs always use the canonical V suffix", () => {
  assert.equal(qiLibraryGraphicVariantId("EX-QI-POEM", 1), "EX-QI-POEM");
  assert.equal(qiLibraryGraphicVariantId("EX-QI-POEM", 2), "EX-QI-POEM-V2");
  assert.equal(qiLibraryGraphicVariantId("EX-QI-POEM", 12), "EX-QI-POEM-V12");
});

test("QI Library variant lookup recognizes legacy IDs without creating new legacy IDs", () => {
  assert.deepEqual(qiLibraryGraphicVariantCandidates("EX-QI-POEM", 1), ["EX-QI-POEM"]);
  assert.deepEqual(qiLibraryGraphicVariantCandidates("EX-QI-POEM", 2), [
    "EX-QI-POEM-V2",
    "EX-QI-POEM-2",
  ]);
});

test("graphic variants use the first available deterministic suffix", () => {
  assert.equal(nextAvailableGraphicVariantId({
    baseId: "TCAW-QI-THE-CROWN-AIN-T-WORTH-MUCH",
    unavailableIds: new Set(),
  }), "TCAW-QI-THE-CROWN-AIN-T-WORTH-MUCH");
  assert.equal(nextAvailableGraphicVariantId({
    baseId: "TCAW-QI-THE-CROWN-AIN-T-WORTH-MUCH",
    unavailableIds: new Set([
      "tcaw-qi-the-crown-ain-t-worth-much",
      "TCAW-QI-THE-CROWN-AIN-T-WORTH-MUCH-V2",
    ]),
  }), "TCAW-QI-THE-CROWN-AIN-T-WORTH-MUCH-V3");
});

test("storage object normalization preserves the proven Apps Script filename rules", () => {
  assert.equal(
    normalizeStorageObjectName("SCHMINKEY - DBAT - QUOTE IMAGE – A good cry canary", "image/png"),
    "SCHMINKEY-DBAT-QUOTE-IMAGE-A-good-cry-canary.png"
  );
  assert.equal(normalizeStorageObjectName("already-safe.JPG", "image/jpeg"), "already-safe.JPG");
});

test("graphic storage paths are stable across retries", () => {
  const input = {
    docId: "DBAT-QI-A-GOOD-CRY-CANARY",
    fileName: "SCHMINKEY - DBAT - QUOTE IMAGE - A good cry canary.png",
    mimeType: "image/png",
  };
  assert.equal(
    deterministicGraphicStoragePath(input),
    "content-library/graphics/dbat-qi-a-good-cry-canary/SCHMINKEY-DBAT-QUOTE-IMAGE-A-good-cry-canary.png"
  );
  assert.equal(deterministicGraphicStoragePath(input), deterministicGraphicStoragePath(input));
});

test("manifest canonicalization ignores object key order but preserves item order", () => {
  const first = canonicalImportManifestJson("graphics", [{ imageId: "A", driveLink: "drive-1" }]);
  const reordered = canonicalImportManifestJson("graphics", [{ driveLink: "drive-1", imageId: "A" }]);
  const differentOrder = canonicalImportManifestJson("graphics", [
    { imageId: "B", driveLink: "drive-2" },
    { imageId: "A", driveLink: "drive-1" },
  ]);
  assert.equal(first, reordered);
  assert.notEqual(first, differentOrder);
});

test("import updates preserve enriched values when incoming cells are blank", () => {
  const merged = preserveExistingImportValues({
    releaseCatalog: "2026 Spring Catalog",
    book: "A Good Cry",
    misc: "old note",
  }, {
    releaseCatalog: "",
    book: "A Good Cry",
    misc: "",
    title: "Canary",
  });
  assert.deepEqual(merged, {
    book: "A Good Cry",
    title: "Canary",
  });
});

test("import updates only clear existing values when explicitly requested", () => {
  assert.deepEqual(
    preserveExistingImportValues({ releaseCatalog: "2026 Spring Catalog" }, { releaseCatalog: "" }, ["releaseCatalog"]),
    { releaseCatalog: "" }
  );
});

test("cross-instance cache generations reject invalidated or newer snapshots", () => {
  assert.equal(isCacheGenerationCurrent({ sourceBuiltAtMs: 200, snapshotBuiltAtMs: 200, invalidatedAtMs: 100 }), true);
  assert.equal(isCacheGenerationCurrent({ sourceBuiltAtMs: 200, snapshotBuiltAtMs: 0, invalidatedAtMs: 250 }), false);
  assert.equal(isCacheGenerationCurrent({ sourceBuiltAtMs: 200, snapshotBuiltAtMs: 300, invalidatedAtMs: 100 }), false);
});

function contentCacheFixture() {
  const state = { meta: {}, rows: [{ imageId: "original", imageUrl: "old" }], files: new Map(), sequence: 0 };
  const clone = (value) => structuredClone(value);
  const ref = {
    async get() { return { data: () => clone(state.meta) }; },
    async set(values) {
      for (const [key, value] of Object.entries(values)) {
        state.meta[key] = value?.increment ? Number(state.meta[key] || 0) + value.increment : value;
      }
    },
  };
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async (callback) => callback({ get: () => ref.get(), set: (_, values) => ref.set(values) }),
  };
  const storage = { bucket: () => ({ file: (name) => ({
    async save(bytes) {
      if (state.beforeSave) await state.beforeSave(bytes);
      state.files.set(name, bytes);
    },
    async download() { return [Buffer.from(state.files.get(name))]; },
    async delete() { state.files.delete(name); },
  }) }) };
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("async function invalidateContentCache()"), source.indexOf("async function findContentRecordByImageId"));
  const instance = () => runInNewContext(`${block}; ({ getAllContentCached, invalidateContentCache })`, {
    db, storage, Buffer, Date,
    COLLECTIONS: { systemState: "systemState" },
    CONTENT_SNAPSHOT_DOC_ID: "content-feed", CONTENT_SNAPSHOT_PATH: "system/content-feed/latest.json",
    CONTENT_SNAPSHOT_VERSION: 5, CONTENT_CACHE_TTL_MS: 900000, CONTENT_SNAPSHOT_TTL_MS: 86400000,
    contentCache: { builtAt: 0, generation: null, payload: null, inFlight: null, inFlightGeneration: null },
    FieldValue: { increment: (n) => ({ increment: n }), serverTimestamp: () => new Date() },
    randomBytes: () => ({ toString: () => String(++state.sequence) }),
    timestampToMs: (value) => value ? new Date(value).getTime() : 0,
    normalizeText: (value) => String(value || "").trim(),
    canonicalizeContentRecord: (item) => ({ ...item, canonicalized: true }),
    getAllContent: async () => {
      const captured = clone(state.rows);
      if (state.beforeRead) await state.beforeRead();
      return captured;
    },
    console: { info() {}, warn() {} },
  });
  return { state, instance };
}

function deferredCacheStep() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a repair refreshes another warm instance immediately without waiting for the TTL", async () => {
  const { state, instance } = contentCacheFixture();
  const reviewer = instance();
  const publicViewer = instance();
  assert.equal((await publicViewer.getAllContentCached())[0].imageUrl, "old");
  state.rows[0].imageUrl = "accepted-replacement";
  await reviewer.invalidateContentCache();
  const updated = await publicViewer.getAllContentCached();
  assert.equal(updated[0].imageUrl, "accepted-replacement");
  assert.equal(updated[0].canonicalized, true);
  assert.equal(state.meta.generation, 1);
  assert.equal(state.files.size, 1);
});

test("a repair during a collection read cannot publish the captured old graphic", async () => {
  const { state, instance } = contentCacheFixture();
  const viewer = instance();
  const started = deferredCacheStep();
  const release = deferredCacheStep();
  state.beforeRead = async () => { state.beforeRead = null; started.resolve(); await release.promise; };
  const pending = viewer.getAllContentCached();
  await started.promise;
  state.rows[0].imageUrl = "accepted-replacement";
  await instance().invalidateContentCache();
  release.resolve();
  assert.equal((await pending)[0].imageUrl, "accepted-replacement");
  assert.equal(JSON.parse(state.files.get(state.meta.storagePath))[0].imageUrl, "accepted-replacement");
});

test("an older in-flight upload cannot overwrite a newer snapshot's bytes", async () => {
  const { state, instance } = contentCacheFixture();
  const started = deferredCacheStep();
  const release = deferredCacheStep();
  state.beforeSave = async () => { state.beforeSave = null; started.resolve(); await release.promise; };
  const oldBuild = instance().getAllContentCached();
  await started.promise;
  state.rows[0].imageUrl = "accepted-replacement";
  const reviewer = instance();
  await reviewer.invalidateContentCache();
  await reviewer.getAllContentCached();
  const publishedPath = state.meta.storagePath;
  release.resolve();
  assert.equal((await oldBuild)[0].imageUrl, "accepted-replacement");
  assert.equal(JSON.parse(state.files.get(publishedPath))[0].imageUrl, "accepted-replacement");
});

test("a fresh instance re-canonicalizes an existing durable snapshot", async () => {
  const { state, instance } = contentCacheFixture();
  await instance().getAllContentCached();
  state.beforeRead = () => { throw new Error("must reuse durable snapshot"); };
  assert.equal((await instance().getAllContentCached())[0].canonicalized, true);
});

test("QI Library graphics derive the canonical content ID required by the writer", () => {
  assert.equal(qiLibraryGraphicBaseId({
    bookShortener: "COTT",
    title: "3 Funerals",
  }), "COTT-QI-3-FUNERALS");
  assert.equal(qiLibraryGraphicBaseId({ bookShortener: "COTT", title: "" }), "");
});

test("year loader selects only unverified ready QI rows and retains sheet identity", () => {
  const header = Array(35).fill("");
  const ready = Array(35).fill("");
  ready[0] = "2019";
  ready[4] = "Example.png";
  ready[5] = "https://drive.google.com/file/d/drive-1/view";
  ready[6] = "drive-1";
  ready[11] = "Example Book";
  ready[12] = "Spring 2019";
  ready[15] = "Example Author";
  ready[16] = "EX";
  ready[20] = "ready_for_poetry_please_ingestion";
  ready[22] = "Example Poem";
  const complete = [...ready];
  complete[4] = "Complete.png";
  complete[29] = "https://example.com/complete.png";
  complete[30] = "cloud_upload_verified";
  complete[31] = "EX-QI-COMPLETE";
  complete[32] = "firestore_verified_public";
  const deferred = [...ready];
  deferred[4] = "Deferred.png";
  deferred[20] = "deferred_requires_new_matching_tools";
  const missingIdentity = [...ready];
  missingIdentity[4] = "Book Specific Quote Graphic - EX 1.png";
  missingIdentity[22] = "";

  const selection = selectQiLibraryYearRows([header, missingIdentity, ready, complete, deferred], { year: "2019", limit: 25 });
  assert.equal(selection.sourceYearCount, 4);
  assert.equal(selection.readyCount, 3);
  assert.equal(selection.remainingCount, 1);
  assert.equal(selection.reviewCount, 1);
  assert.deepEqual(selection.reviewRows, [{
    sourceSpreadsheetRow: 2,
    fileName: "Book Specific Quote Graphic - EX 1.png",
    error: "missing_qi_library_content_id",
    errors: ["missing_qi_library_content_id"],
  }]);
  assert.equal(selection.rows.length, 1);
  assert.equal(selection.rows[0].sourceSpreadsheetRow, 3);
  assert.equal(selection.rows[0].sourceDriveFileId, "drive-1");
  assert.equal(selection.rows[0].title, "Example Poem");
});

test("year loader blocks Sheet-ready rows that lack canonical source metadata", () => {
  const header = Array(35).fill("");
  const incomplete = Array(35).fill("");
  incomplete[0] = "2026";
  incomplete[4] = "Example.png";
  incomplete[16] = "EX";
  incomplete[20] = "ready_for_poetry_please_ingestion";
  incomplete[22] = "Example Poem";

  const selection = selectQiLibraryYearRows([header, incomplete], { year: "2026" });
  assert.equal(selection.remainingCount, 0);
  assert.equal(selection.reviewCount, 1);
  assert.deepEqual(selection.reviewRows[0].errors, [
    "missing_source_drive_file_id",
    "missing_normalized_author",
    "missing_book_title",
    "missing_release_catalog",
  ]);
});

test("year loader admits only source rows approved for new ingestion", () => {
  const header = Array(35).fill("");
  const approved = Array(35).fill("");
  approved[0] = "2023";
  approved[4] = "Approved.png";
  approved[6] = "drive-approved";
  approved[11] = "Example Book";
  approved[12] = "Fall 2023";
  approved[15] = "Example Author";
  approved[16] = "EX";
  approved[20] = "ready_for_poetry_please_ingestion";
  approved[22] = "Approved Poem";
  const unapproved = [...approved];
  unapproved[4] = "Unapproved.png";
  unapproved[6] = "drive-unapproved";
  unapproved[22] = "Unapproved Poem";

  const approvedSourceRows = approvedQiLibrarySourceRows([
    ["Approved?", "Lane", "Source Row"],
    ["TRUE", "Ready for new ingestion", "2"],
    ["TRUE", "Confirm existing QI match", "3"],
  ]);
  const selection = selectQiLibraryYearRows(
    [header, approved, unapproved],
    { year: "2023", approvedSourceRows }
  );

  assert.equal(selection.readyCount, 2);
  assert.equal(selection.approvedReadyCount, 1);
  assert.equal(selection.unapprovedReadyCount, 1);
  assert.equal(selection.remainingCount, 1);
  assert.equal(selection.rows.length, 1);
  assert.equal(selection.rows[0].sourceSpreadsheetRow, 2);
  assert.equal(selection.rows[0].sourceDriveFileId, "drive-approved");
});

test("QI Library year batches retain the 25-row safety boundary", () => {
  assert.equal(normalizeQiLibraryYearBatchLimit(undefined), 25);
  assert.equal(normalizeQiLibraryYearBatchLimit(1), 1);
  assert.equal(normalizeQiLibraryYearBatchLimit(25), 25);
  assert.equal(normalizeQiLibraryYearBatchLimit(100), 25);
});

test("QI Library year checkpoints stop on unsafe child results", () => {
  assert.equal(qiLibraryYearStopReason({ remainingCount: 12 }), "checkpoint");
  assert.equal(qiLibraryYearStopReason({ remainingCount: 0 }), "complete");
  assert.equal(qiLibraryYearStopReason({ failedCount: 1, remainingCount: 12 }), "batch_failed");
  assert.equal(qiLibraryYearStopReason({ publishError: "publish_failed", remainingCount: 12 }), "publication_failed");
  assert.equal(qiLibraryYearStopReason({ timedOut: true, remainingCount: 12 }), "batch_timed_out");
});

test("QI Library year task decisions continue checkpoints and bound retries", () => {
  assert.deepEqual(qiLibraryYearTaskDecision({ stopReason: "checkpoint" }), {
    state: "queued",
    enqueue: true,
    delaySeconds: 65,
    nextAttempt: 0,
  });
  assert.deepEqual(qiLibraryYearTaskDecision({ complete: true }), {
    state: "complete",
    enqueue: false,
    delaySeconds: 0,
    nextAttempt: 0,
  });
  assert.deepEqual(qiLibraryYearTaskDecision({ stopReason: "task_error", attempt: 0 }), {
    state: "retrying",
    enqueue: true,
    delaySeconds: 65,
    nextAttempt: 1,
  });
  assert.equal(qiLibraryYearTaskDecision({ stopReason: "task_error", attempt: 2 }).state, "blocked");
  assert.equal(qiLibraryYearTaskDecision({ stopReason: "review_required" }).state, "blocked");
});

test("automatic graphic verification requires matching metadata and a working image", () => {
  const valid = validateImportedGraphic({
    requested: { docId: "EX-QI-POEM", author: "Example Author", book: "Example Book", title: "Poem", releaseCatalog: "Spring 2019", imageType: "QI", sourceDriveFileId: "drive-example" },
    saved: { id: "EX-QI-POEM", author: "Example Author", book: "Example Book", title: "Poem", releaseCatalog: "Spring 2019", imageType: "QI", sourceDriveFileId: "drive-example", imageUrl: "https://example.com/image.png" },
    imageStatus: 200,
    imageContentType: "image/png",
  });
  assert.equal(valid.ok, true);
  assert.equal(validateImportedGraphic({
    requested: { docId: "EX-QI-POEM", title: "Poem" },
    saved: { id: "EX-QI-POEM", title: "Wrong", imageUrl: "https://example.com/image.png" },
    imageStatus: 200,
    imageContentType: "image/png",
  }).ok, false);
});

test("automatic graphic verification rejects a different Drive source identity", () => {
  const validation = validateImportedGraphic({
    requested: {
      docId: "WASH-QI-FROM-PAGE-43",
      title: "From Page 43",
      sourceDriveFileId: "drive-from-page-43",
    },
    saved: {
      id: "WASH-QI-FROM-PAGE-43",
      title: "From Page 43",
      sourceDriveFileId: "drive-having-a-ball",
      imageUrl: "https://example.com/having-a-ball.png",
    },
    imageStatus: 200,
    imageContentType: "image/png",
  });
  assert.equal(validation.ok, false);
  assert.equal(validation.sourceIdentityMatches, false);
});

test("QI Library writeback has the canonical six audit values", () => {
  assert.deepEqual(buildQiLibraryWritebackValues({
    imageUrl: "https://example.com/image.png",
    docId: "EX-QI-POEM",
    verifiedAt: "2026-08-11T18:00:00Z",
    batchId: "batch-example",
    action: "created",
  }), [
    "https://example.com/image.png",
    "cloud_upload_verified",
    "EX-QI-POEM",
    "firestore_verified_public",
    "2026-08-11T18:00:00Z",
    "Production Import Assistant batch batch-example; created; automatic public metadata and image verification passed.",
  ]);
});

test("public image verification falls back to detected bytes for generic object metadata", () => {
  assert.equal(verifiedImageContentType("application/octet-stream", "image/png"), "image/png");
  assert.equal(verifiedImageContentType("image/jpeg; charset=binary", "image/png"), "image/jpeg");
  assert.equal(verifiedImageContentType("application/octet-stream", ""), "application/octet-stream"); }); test("explicitly confirmed no-poem QI uses the source filename stem and remains approval-gated", () => { const cells = Array(33).fill(""); cells[0] = "2025"; cells[4] = "Book Specific Quote Graphic - AEO 1.png"; cells[6] = "drive-no-poem"; cells[11] = "an everyday occurrence"; cells[12] = "Fall 2025"; cells[15] = "Hailey Tran"; cells[16] = "AEO"; cells[20] = "ready_for_poetry_please_ingestion"; cells[26] = "user_confirmed_no_poem_qi_uploaded"; cells[27] = "author_qi_book_confirmed_no_poem"; const selected = selectQiLibraryYearRows([[], cells], { year: "2025", approvedSourceRows: new Set([2]) }); assert.equal(selected.remainingCount, 1); assert.equal(selected.rows[0].title, "Book Specific Quote Graphic - AEO 1"); cells[27] = ""; const blocked = selectQiLibraryYearRows([[], cells], { year: "2025", approvedSourceRows: new Set([2]) }); assert.equal(blocked.remainingCount, 0); assert.equal(blocked.reviewRows[0].error, "missing_qi_library_content_id");
});

test("verified Book Info product links are present in the Poetry Please lookup", () => {
  const catalog = JSON.parse(
    readFileSync(new URL("./book-catalog-lookup.json", import.meta.url), "utf8")
  );
  const linksByTitle = new Map(catalog.map((book) => [book.title, book.bookLink]));

  assert.equal(linksByTitle.get("Roads"), "https://buttonpoetry.com/product/roads/");
  assert.equal(
    linksByTitle.get("Living at Baggage Claim"),
    "https://buttonpoetry.com/product/living-at-baggage-claim/"
  );
  assert.equal(
    linksByTitle.get("Tooth Gaps in the Archives"),
    "https://buttonpoetry.com/product/tooth-gaps-in-the-archives/"
  );
});




const bookReleaseCatalogKeys = new Set(
  JSON.parse(readFileSync(new URL("./book-catalog-lookup.json", import.meta.url), "utf8"))
    .map((book) => String(book.releaseCatalog || "").trim().toLowerCase())
    .filter(Boolean)
);

test("event catalogs survive attribution to a book's release catalog", () => {
  const workshopVideo = {
    id: "Neil Hilborn - [Vertical Workshop Excerpt] Button Up: Poetry 101 - Neil Hilborn - November 20, 2025 [5-10 Minutes - Excerpt 1] - Vertical",
    author: "Neil Hilborn",
    book: "About Time",
    imageType: "VV",
    releaseCatalog: "2025 Vertical Workshop Excerpts",
  };
  const eventCatalog = preservedEventReleaseCatalog(workshopVideo, "Fall 2024", bookReleaseCatalogKeys);
  assert.equal(eventCatalog, "2025 Vertical Workshop Excerpts");
  assert.deepEqual(
    contentReleaseCatalogs({ ...workshopVideo, releaseCatalog: "Fall 2024", eventReleaseCatalog: eventCatalog }),
    ["Fall 2024", "2025 Vertical Workshop Excerpts"]
  );
});

test("misfiled book release catalogs are still replaced, not preserved", () => {
  assert.equal(preservedEventReleaseCatalog({ releaseCatalog: "Spring 2018" }, "Fall 2020", bookReleaseCatalogKeys), "");
  assert.equal(preservedEventReleaseCatalog({ releaseCatalog: "Contest" }, "Spring 2026", bookReleaseCatalogKeys), "");
  assert.equal(isBookReleaseCatalog("Kingdom of the Dinosaurs", bookReleaseCatalogKeys), true);
  assert.equal(isBookReleaseCatalog("2025 Vertical Workshop Excerpts", bookReleaseCatalogKeys), false);
});

test("event catalog preservation is stable across snapshot re-canonicalization", () => {
  const canonicalized = {
    releaseCatalog: "Fall 2024",
    eventReleaseCatalog: "2025 Vertical Workshop Excerpts",
  };
  assert.equal(
    preservedEventReleaseCatalog(canonicalized, "Fall 2024", bookReleaseCatalogKeys),
    "2025 Vertical Workshop Excerpts"
  );
  assert.equal(preservedEventReleaseCatalog({ releaseCatalog: "Fall 2024" }, "Fall 2024", bookReleaseCatalogKeys), "");
  assert.equal(preservedEventReleaseCatalog({}, "Fall 2024", bookReleaseCatalogKeys), "");
});

test("only public embeds match a preserved event catalog", () => {
  const indexSource = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.match(indexSource, /preservedEventReleaseCatalog\(item, releaseCatalog, BOOK_RELEASE_CATALOG_KEYS\)/);
  assert.match(indexSource, /const catalogs = includeEventCatalogs \? contentReleaseCatalogs\(item\) : \[item\?\.releaseCatalog\];/);
  assert.match(indexSource, /const CONTENT_SNAPSHOT_VERSION = 5;/);
  const calls = indexSource.match(/filterContentByFeedFilters\([\s\S]*?\);/g) || [];
  const embedCall = calls.find((call) => call.includes("allContent, flaggedIds"));
  const appCall = calls.find((call) => call.includes("filterContentByFeedFilters(all, filters)"));
  assert.ok(embedCall?.includes("includeEventCatalogs: true"), "embedBookLead includes event catalogs");
  assert.ok(appCall && !appCall.includes("includeEventCatalogs"), "fetchFiltered keeps releaseCatalog-only matching");
});

function catalogSyncFunction(name, globals = {}) {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const match = new RegExp(`export (?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `exported function ${name} exists`);
  const end = source.indexOf("\n}\n", match.index) + 2;
  const declaration = source.slice(match.index, end).replace(/^export /, "");
  return runInNewContext(`${declaration}; ${name}`, {
    normalizeText: (value) => String(value || "").trim(),
    normalizeKey: (value) => String(value || "").trim().toLowerCase(),
    normalizeCatalogLookupKey: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    ...globals,
  });
}

function contestGraphicsSource() {
  const program = { id: "fall-program", name: "Fall Short Form", sourceEvent: "Fall Short Form" };
  const submission = { id: "submission-123", submissionProgramId: program.id, contestSubmission: true,
    contestOutcomeStatus: "circle", title: "Poem", text: "first line\n\nlast line", submitterDisplayName: "writer@example.test" };
  const entrant = { submissionProgramId: program.id, firstName: "Actual", lastName: "Writer", phone: "private" };
  const build = catalogSyncFunction("buildContestGraphicsRequest", {
    sha256: (value) => createHash("sha256").update(value).digest("hex"),
  });
  return { program, submission, entrant, build };
}

test("contest graphics use stable submission provenance, exact line breaks and verified credits without contact details", () => {
  const { program, submission, entrant, build } = contestGraphicsSource();
  const request = build(program, submission, entrant);
  assert.equal(request.contentType, "QI");
  assert.equal(request.sourcePayload.author, "Actual Writer");
  assert.equal(request.sourcePayload.quoteText, submission.text);
  assert.equal(request.sourcePayload.submissionId, submission.id);
  assert.equal(request.sourcePayload.programId, program.id);
  assert.equal(JSON.stringify(request).includes("@"), false);
  assert.equal(JSON.stringify(request).includes("private"), false);
  assert.equal(build(program, { ...submission, title: "", text: "updated" }, entrant).graphicsRequestId, request.graphicsRequestId);
  assert.equal(build(program, { ...submission, title: "" }, entrant).sourcePayload.poemTitle, "");
  assert.equal(build(program, { ...submission, submitterDisplayName: "Chosen Pen Name" }, entrant).sourcePayload.author, "Chosen Pen Name");
});

test("contest graphics refuse unselected, archived, wrong-program and incomplete sources", () => {
  const { program, submission, entrant, build } = contestGraphicsSource();
  for (const patch of [{ contestOutcomeStatus: "undecided" }, { contestArchived: true }, { submissionProgramId: "another" }]) {
    assert.throws(() => build(program, { ...submission, ...patch }, entrant), /selection_required/);
  }
  assert.throws(() => build(program, submission, { ...entrant, firstName: "", lastName: "" }), /source_incomplete/);
});

test("contest graphics return to one stable content ID and retain source attribution without inventing a book or title", async () => {
  const { program, submission, entrant, build } = contestGraphicsSource();
  const request = build(program, { ...submission, title: "" }, entrant);
  const prepare = catalogSyncFunction("prepareContestGraphicReturn", {
    COLLECTIONS: { contentSubmissions: "submissions" },
    db: { collection: () => ({ where: (_, op, id) => {
      assert.equal(op, "=="); assert.equal(id, "weaver:qi:canonical");
      return { limit: () => ({ get: async () => ({ size: 1, docs: [{ id: submission.id,
        data: () => ({ ...submission, contestGraphicsRequest: request }) }] }) }) };
    } }) },
  });
  const item = { imageType: "QI", sourceRequestId: "weaver:qi:canonical", imageUrl: "saved.png", title: "guessed", book: "guessed", sourceCompletionId: "pig:1" };
  const result = await prepare(item);
  assert.equal(result.docId, "PP-CONTEST-QI-submission-123");
  assert.equal(result.sourceSubmissionId, submission.id);
  assert.equal(result.sourceProgramId, program.id);
  assert.equal(result.title, ""); assert.equal(result.book, "");
  assert.equal(result.author, "Actual Writer");
  assert.equal(result.imageUrl, item.imageUrl);
  assert.equal((await prepare({ ...item, sourceCompletionId: "pig:retry" })).docId, result.docId);
});

test("contest dispatch freezes a timed-out payload, saves the canonical receipt and reuses it on repeated sends", async () => {
  const { program, submission, entrant, build } = contestGraphicsSource();
  const state = { ...submission };
  let handler, sends = 0;
  const ref = { get: async () => ({ id: submission.id, exists: true, data: () => ({ ...state }) }),
    set: async (values) => Object.assign(state, values) };
  const db = { collection: (name) => ({ doc: () => name === "submissions" ? ref : {
    get: async () => ({ exists: true, data: () => name === "programs" ? program : entrant }),
  } }), runTransaction: async (callback) => callback({ get: () => ref.get(), set: (_, values) => ref.set(values) }) };
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf('app.post(getBoth("/internal/contestGraphicsHandoff")');
  runInNewContext(source.slice(start, source.indexOf("async function importWeaverGraphicsPayload", start)), {
    app: { post: (_, callback) => { handler = callback; } }, getBoth: (value) => value,
    hasValidPoetryPleaseApiKey: () => true, normalizeText: (value) => String(value || "").trim(),
    CONTEST_OUTCOME_EMAILS_ENABLED_PROGRAM_ID: program.id, buildContestGraphicsRequest: build,
    COLLECTIONS: { contentSubmissions: "submissions", submissionPrograms: "programs", submissionEntrants: "entrants" },
    db, Date, AbortSignal, POETRY_PLEASE_API_KEY_SECRET: { value: () => "existing-key" },
    FieldValue: { serverTimestamp: () => "now" },
    fetch: async (_, options) => {
      sends += 1;
      const request = JSON.parse(options.body).requests[0];
      if (sends === 1) throw new Error("timed_out");
      assert.equal(request.sourcePayload.quoteText, submission.text);
      return { ok: true, json: async () => ({ ok: true, records: [{ ...request, graphicsRequestId: "weaver:qi:canonical", handoffStatus: "requested" }] }) };
    },
  });
  const responses = [];
  const codes = [];
  const res = { status: (code) => { codes.push(code); return res; }, json: (body) => responses.push(body) };
  const req = { body: { programId: program.id, submissionId: submission.id } };
  await handler(req, res);
  assert.equal(codes[0], 502);
  assert.equal(state.contestGraphicsStatus, "dispatch_failed");
  state.text = "later edit must not create another request";
  await handler(req, res);
  assert.equal(state.contestGraphicsStatus, "queued");
  assert.equal(state.contestGraphicsRequestId, "weaver:qi:canonical");
  await handler(req, res);
  assert.equal(sends, 2);
  assert.equal(responses[2].alreadyDispatched, true);
});

test("Catalog text planning keeps the existing ID and requires an unambiguous title and key", () => {
  const plan = catalogSyncFunction("planExistingCatalogFullPoemUpdates");
  const result = plan([
    { id: "OLD-FP-STABLE-ID", book: "Book", title: "Poem!", excerpt: "old text", driveLink: "keep" },
  ], [{ title: "Poem", poem_key: "BPP-00001", served_text: "new\ntext" }]);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].id, "OLD-FP-STABLE-ID");
  assert.equal(result.updates[0].title, "Poem!");
  assert.equal(result.updates[0].expectedExcerpt, "old text");
  assert.equal(result.updates[0].excerpt, "new\ntext");
  assert.equal(result.updates[0].poemKey, "BPP-00001");
});

test("Catalog text planning leaves repeated titles, unmatched titles, and conflicting keys alone", () => {
  const plan = catalogSyncFunction("planExistingCatalogFullPoemUpdates");
  const result = plan([
    { id: "sonnet", title: "Sonnet", excerpt: "old" },
    { id: "renamed", title: "Earlier title", excerpt: "old" },
    { id: "conflict", title: "Known", excerpt: "old", poemKey: "BPP-00002" },
    { id: "unchanged", title: "Same", excerpt: "same" },
  ], [
    { title: "Sonnet", poem_key: "BPP-00001", text: "one" },
    { title: "Sonnet", poem_key: "BPP-00003", text: "two" },
    { title: "New title", poem_key: "BPP-00004", text: "old" },
    { title: "Known", poem_key: "BPP-00005", text: "new" },
    { title: "Same", poem_key: "BPP-00006", text: "same" },
  ]);
  assert.equal(result.updates.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.skipped)), [
    { id: "sonnet", reason: "ambiguous_title" },
    { id: "renamed", reason: "unmatched_title" },
    { id: "conflict", reason: "missing_or_conflicting_catalog_key" },
  ]);
  const duplicates = plan([{ id: "a", title: "Same" }, { id: "b", title: "Same" }], [
    { title: "Same", poem_key: "BPP-00001", text: "new" },
  ]);
  assert.equal(duplicates.updates.length, 0);
  assert.equal(duplicates.skipped.length, 2);
});

function catalogSyncTransactionFixture({ excerpt = "old text", book = "Book" } = {}) {
  const rows = new Map([
    ["fullPoems/stable", { imageId: "stable", book, title: "Poem", excerpt, driveLink: "keep", releaseYear: "2026", sourceRecordId: "original-source" }],
    ["contentFlags/pending", { imageId: "stable", status: "pending", reason: "appended text" }],
    ["contentFlags/resolved", { imageId: "stable", status: "resolved", reviewNote: "keep history" }],
    ["votes/uid", { imageId: "stable", userId: "author-uid", voteType: "dislike" }],
    ["votes/email", { imageId: "stable", userId: "author@example.com", voteType: "meh" }],
    ["votes/staff", { imageId: "stable", userId: "staff", voteType: "like" }],
    ["votes/history", { imageId: "stable", userId: "author-uid", supersededAt: "earlier" }],
    ["contentRepairRequests/source", { imageId: "stable", contentType: "FP", originalCollection: "fullPoems", status: "in_progress", history: [] }],
    ["contentRepairRequests/graphic", { imageId: "stable", contentType: "FPI", originalCollection: "graphics", status: "in_progress" }],
  ]);
  const writes = [];
  const ref = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
  const snap = (key) => ({ id: key.split("/")[1], ref: ref(...key.split("/")), exists: rows.has(key), data: () => rows.get(key) });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name, id), where: (field, op, value) => ({ collection: name, field, value }) }),
    runTransaction: async (callback) => {
      const queued = [];
      const result = await callback({
        get: async (target) => target.key ? snap(target.key) : { docs: [...rows.keys()]
          .filter((key) => key.startsWith(`${target.collection}/`) && rows.get(key)[target.field] === target.value).map(snap) },
        update: (target, fields) => queued.push({ target, fields }),
        set: (target, fields) => queued.push({ target, fields }),
      });
      for (const write of queued) {
        const current = { ...(rows.get(write.target.key) || {}) };
        for (const [key, value] of Object.entries(write.fields)) {
          current[key] = value?.union ? [...(current[key] || []), ...value.union] : value;
        }
        rows.set(write.target.key, current);
        writes.push(write);
      }
      return result;
    },
  };
  const apply = catalogSyncFunction("applyCatalogFullPoemTextUpdate", {
    db, COLLECTIONS: { fullPoems: "fullPoems", contentFlags: "contentFlags", votes: "votes", contentRepairRequests: "contentRepairRequests", systemState: "systemState" },
    RATINGS_SNAPSHOT_DOC_ID: "ratings",
    FieldValue: { serverTimestamp: () => "now", arrayUnion: (...union) => ({ union }) },
    buildFlagHistoryEntry: (action, actor, note) => ({ action, actor, note }),
    isActiveAuthorVote: catalogSyncFunction("isActiveAuthorVote"),
  });
  return { apply, rows, writes };
}

test("Catalog text correction resolves source flags and repairs and reopens UID/email author votes without changing staff votes or metadata", async () => {
  const fixture = catalogSyncTransactionFixture();
  const result = await fixture.apply({ id: "stable", book: "Book", title: "Poem", expectedExcerpt: "old text", excerpt: "new\ntext", poemKey: "BPP-00001" }, new Set(["author-uid", "author@example.com"]));
  assert.equal(result.resolvedFlagCount, 1);
  assert.equal(result.supersededVoteCount, 2);
  assert.deepEqual(Array.from(result.resolvedRepairIds), ["source"]);
  assert.equal(fixture.rows.get("fullPoems/stable").excerpt, "new\ntext");
  assert.equal(fixture.rows.get("fullPoems/stable").driveLink, "keep");
  assert.equal(fixture.rows.get("fullPoems/stable").releaseYear, "2026");
  assert.equal(fixture.rows.get("fullPoems/stable").sourceRecordId, "original-source");
  assert.equal(fixture.rows.get("contentFlags/pending").status, "resolved");
  assert.equal(fixture.rows.get("contentFlags/resolved").reviewNote, "keep history");
  assert.equal(fixture.rows.get("contentRepairRequests/source").status, "resolved");
  assert.equal(fixture.rows.get("contentRepairRequests/graphic").status, "in_progress");
  assert.equal(fixture.rows.get("votes/uid").voteType, "dislike");
  assert.equal(fixture.rows.get("votes/email").supersededAt, "now");
  assert.equal(fixture.rows.get("votes/staff").supersededAt, undefined);
  assert.equal(fixture.rows.get("votes/history").supersededAt, "earlier");
});

test("Catalog text correction rejects a concurrent edit or a wrong book before writing anything", async () => {
  for (const options of [{ excerpt: "staff just edited this" }, { book: "Another book" }]) {
    const fixture = catalogSyncTransactionFixture(options);
    await assert.rejects(fixture.apply({ id: "stable", book: "Book", title: "Poem", expectedExcerpt: "old text", excerpt: "new", poemKey: "BPP-00001" }, new Set()), /content_changed_refresh_first/);
    assert.equal(fixture.writes.length, 0);
  }
});

test("Spacing-only Catalog sync preserves every flag, repair and author vote", async () => {
  const fixture = catalogSyncTransactionFixture();
  const result = await fixture.apply({ id: "stable", book: "Book", title: "Poem", expectedExcerpt: "old text", excerpt: "old\ntext", poemKey: "BPP-00001" }, new Set(["author-uid", "author@example.com"]), { preserveReviews: true });
  assert.equal(result.resolvedFlagCount, 0);
  assert.equal(result.supersededVoteCount, 0);
  assert.equal(result.resolvedRepairIds.length, 0);
  assert.equal(fixture.rows.get("contentFlags/pending").status, "pending");
  assert.equal(fixture.rows.get("contentRepairRequests/source").status, "in_progress");
  assert.equal(fixture.rows.get("votes/uid").supersededAt, undefined);
  assert.equal(fixture.rows.get("fullPoems/stable").excerpt, "old\ntext");
});

test("Catalog sync resolves only explicitly selected flags while corrected text reopens author review", async () => {
  const fixture = catalogSyncTransactionFixture();
  const result = await fixture.apply({ id: "stable", book: "Book", title: "Poem", expectedExcerpt: "old text", excerpt: "new text", poemKey: "BPP-00001" }, new Set(["author-uid"]), { resolveFlagIds: [] });
  assert.equal(result.resolvedFlagCount, 0);
  assert.equal(result.supersededVoteCount, 1);
  assert.equal(fixture.rows.get("contentFlags/pending").status, "pending");
  assert.equal(fixture.rows.get("contentRepairRequests/source").status, "resolved");
});

test("Catalog text planning and updates cannot revive retired records", async () => {
  const plan = catalogSyncFunction("planExistingCatalogFullPoemUpdates");
  const planned = plan([{ id: "retired", title: "Poem", catalogRetired: true, excerpt: "old" }, { id: "live", title: "Poem", excerpt: "old" }],
    [{ title: "Poem", poem_key: "BPP-00001", text: "new" }]);
  assert.deepEqual(Array.from(planned.updates, row => row.id), ["live"]);
  const fixture = catalogSyncTransactionFixture();
  fixture.rows.get("fullPoems/stable").catalogRetired = true;
  await assert.rejects(fixture.apply({ id: "stable", book: "Book", title: "Poem", expectedExcerpt: "old text", excerpt: "new", poemKey: "BPP-00001" }, new Set()), /content_changed_refresh_first/);
  assert.equal(fixture.writes.length, 0);
});

test("Import refuses a retired existing identity before uploading or overwriting anything", async () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function upsertContentLibraryItem(");
  const end = source.indexOf("\n}\n", start) + 2;
  const retired = { exists: true, data: () => ({ catalogRetired: true }) };
  const upsert = runInNewContext(source.slice(start, end) + "; upsertContentLibraryItem", {
    collectionForContentType: () => "graphics", deriveContentDocId: () => "same-id",
    sanitizeDocIdSegment: value => value,
    db: { collection: () => ({ doc: () => ({ get: async () => retired }) }) },
  });
  await assert.rejects(upsert("graphics", { imageUrl: "https://example.test/reimport.jpg" }), /catalog_retired_content/);
});

test("Retired Catalog items stay out of both feed and direct-reading visibility even after flags close", () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("function excludeFlaggedContent(");
  const end = source.indexOf("\n}\n", start) + 2;
  const visible = runInNewContext(source.slice(start, end) + "; excludeFlaggedContent", {
    normalizeKey: value => String(value).toLowerCase(),
  });
  const rows = visible([{ imageId: "retired", catalogRetired: true }, { imageId: "live" }], new Set());
  assert.deepEqual(Array.from(rows, row => row.imageId), ["live"]);
});

test("The verified Political Theatre key is accepted without opening other auto-classified essays", async () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function fetchCanonicalPoems(");
  const end = source.indexOf("\n}\n", start) + 2;
  const load = runInNewContext(source.slice(start, end) + "; fetchCanonicalPoems", {
    CANONICAL_CATALOG_API: "https://catalog.test", AbortSignal,
    normalizeKey: value => String(value).toLowerCase(), normalizeText: value => String(value || '').trim(),
    normalizeCatalogLookupKey: value => String(value).toLowerCase(),
    fetch: async () => ({ok:true,json:async()=>[
      {title:"Political Theatre",poem_key:"BPP-00155",content_kind:"essay_or_interview",is_likely_poem:0,text:"verified poem"},
      {title:"Unreviewed essay",poem_key:"BPP-99999",content_kind:"essay_or_interview",is_likely_poem:0,text:"unreviewed"},
    ]}),
  });
  assert.deepEqual(Array.from(await load("Tooth Gaps in the Archives"), row=>row.poem_key), ["BPP-00155"]);
  assert.equal((await load("Another book")).length, 0);
});

test("Canonical FP reading tolerates only a same-key FP/FPI legacy ID collision", () => {
  const select = catalogSyncFunction("canonicalReadingMatch");
  const fp = { imageId:"same-id", imageType:"FP", poemKey:"BPP-00091", author:"Poet", book:"Book" };
  const graphic = {...fp,imageType:"FPI",imageUrl:"https://example.test/graphic.png"};
  assert.equal(select([graphic,fp]), fp);
  for (const other of [{...graphic,poemKey:"BPP-99999"},{...graphic,book:"Other book"},{...graphic,author:"Other poet"},{...graphic,imageType:"QI"}]) assert.equal(select([other,fp]),null);
  assert.equal(select([fp,{...fp}]),null);
  assert.equal(select([{...fp,poemKey:""},{...graphic,poemKey:""}]),null);
  assert.equal(select([graphic]),graphic);
});
