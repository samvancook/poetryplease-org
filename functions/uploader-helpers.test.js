import test from "node:test";
import assert from "node:assert/strict";
import {
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
  preserveExistingImportValues,
  shouldCreateSuppliedGraphicVariant,
  shouldForceGraphicAssetReplacement,
  selectQiLibraryYearRows,
  validateImportedGraphic,
  verifiedImageContentType,
} from "./uploader-helpers.js";

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

  const selection = selectQiLibraryYearRows([header, ready, complete, deferred], { year: "2019", limit: 25 });
  assert.equal(selection.sourceYearCount, 3);
  assert.equal(selection.readyCount, 2);
  assert.equal(selection.remainingCount, 1);
  assert.equal(selection.rows.length, 1);
  assert.equal(selection.rows[0].sourceSpreadsheetRow, 2);
  assert.equal(selection.rows[0].sourceDriveFileId, "drive-1");
  assert.equal(selection.rows[0].title, "Example Poem");
});

test("automatic graphic verification requires matching metadata and a working image", () => {
  const valid = validateImportedGraphic({
    requested: { docId: "EX-QI-POEM", author: "Example Author", book: "Example Book", title: "Poem", releaseCatalog: "Spring 2019", imageType: "QI" },
    saved: { id: "EX-QI-POEM", author: "Example Author", book: "Example Book", title: "Poem", releaseCatalog: "Spring 2019", imageType: "QI", imageUrl: "https://example.com/image.png" },
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
  assert.equal(verifiedImageContentType("application/octet-stream", ""), "application/octet-stream");
});
