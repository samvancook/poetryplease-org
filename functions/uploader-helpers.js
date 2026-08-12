function normalizeText(value) {
  return String(value || "").trim();
}

function extensionForRemoteMedia(fileName = "", sourceUrl = "") {
  const raw = normalizeText(fileName || sourceUrl).split(/[?#]/, 1)[0];
  const match = raw.match(/\.([a-z0-9]+)$/i);
  return (match?.[1] || "").toLowerCase();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return typeof value === "string" ? value.trim() : value;
}

export function stableJsonStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function contentIdSlug(value) {
  return normalizeText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 500);
}

export function normalizeStorageObjectName(value, contentType = "") {
  let name = normalizeText(value).split("/").pop() || "";
  name = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) throw new Error("empty_storage_object_name");
  if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) {
    const subtype = normalizeText(contentType).split("/")[1]?.toLowerCase() || "";
    const extension = subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]/g, "");
    name += `.${extension || "bin"}`;
  }
  return name;
}

export function deterministicGraphicStoragePath({ docId = "", fileName = "", mimeType = "" } = {}) {
  const docSegment = contentIdSlug(docId);
  if (!docSegment) throw new Error("missing_content_id");
  const objectName = normalizeStorageObjectName(fileName || docId, mimeType);
  return `content-library/graphics/${docSegment}/${objectName}`;
}

export function canonicalImportManifestJson(type, items = []) {
  const normalizedType = normalizeText(type).toLowerCase();
  const payload = {
    type: normalizedType,
    items: (Array.isArray(items) ? items : []).map((item) => stableValue(item || {})),
  };
  return stableJsonStringify(payload);
}

export function preserveExistingImportValues(existing = {}, incoming = {}, clearFields = []) {
  const allowedClears = new Set((Array.isArray(clearFields) ? clearFields : []).map(normalizeText).filter(Boolean));
  return Object.entries(incoming || {}).reduce((result, [key, value]) => {
    const incomingIsBlank = value === "" || value === null || value === undefined;
    const existingValue = existing?.[key];
    const existingHasValue = existingValue !== "" && existingValue !== null && existingValue !== undefined;
    if (incomingIsBlank && existingHasValue && !allowedClears.has(key)) return result;
    result[key] = value;
    return result;
  }, {});
}

export function isCacheGenerationCurrent({ sourceBuiltAtMs = 0, snapshotBuiltAtMs = 0, invalidatedAtMs = 0 } = {}) {
  if (!sourceBuiltAtMs || !snapshotBuiltAtMs) return false;
  if (invalidatedAtMs && invalidatedAtMs >= sourceBuiltAtMs) return false;
  return snapshotBuiltAtMs <= sourceBuiltAtMs;
}

export function normalizeImportMatchValue(value) {
  return normalizeText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function importGraphicMetadataKey(item = {}) {
  const author = normalizeImportMatchValue(item.author);
  const book = normalizeImportMatchValue(item.book);
  const title = normalizeImportMatchValue(item.title || item.poem);
  const imageType = normalizeImportMatchValue(item.imageType || "QI");
  return author && book && title ? `${author}|${book}|${title}|${imageType}` : "";
}

export function shouldCreateSuppliedGraphicVariant({ suppliedDocId = "", sourceMatchCount = 0 } = {}) {
  return !!normalizeText(suppliedDocId) && Number(sourceMatchCount || 0) === 0;
}

export function isTrustedDistinctQiLibraryAsset({ sourceSystem = "", sourceSpreadsheetRow = 0, sourceDriveFileId = "", sourceMatchCount = 0 } = {}) {
  return normalizeText(sourceSystem).toLowerCase() === "qi_library"
    && Number(sourceSpreadsheetRow || 0) >= 2
    && !!normalizeText(sourceDriveFileId)
    && Number(sourceMatchCount || 0) === 0;
}

export function shouldForceGraphicAssetReplacement({
  docId = "",
  requestedForce = false,
  brokenIds = [],
} = {}) {
  if (requestedForce) return true;
  const normalizedDocId = normalizeImportMatchValue(docId).replace(/\s+/g, "-");
  if (!normalizedDocId) return false;
  const normalizedBrokenIds = brokenIds instanceof Set
    ? brokenIds
    : new Set((Array.isArray(brokenIds) ? brokenIds : []).map((value) => (
      normalizeImportMatchValue(value).replace(/\s+/g, "-")
    )));
  return normalizedBrokenIds.has(normalizedDocId);
}

export function nextAvailableGraphicVariantId({ baseId = "", unavailableIds = [] } = {}) {
  const cleanBaseId = normalizeText(baseId);
  if (!cleanBaseId) return "";
  const unavailable = new Set(
    Array.from(unavailableIds || []).map((value) => normalizeText(value).toLowerCase()).filter(Boolean)
  );
  if (!unavailable.has(cleanBaseId.toLowerCase())) return cleanBaseId;
  for (let variant = 2; variant < 10000; variant += 1) {
    const candidate = `${cleanBaseId}-V${variant}`;
    if (!unavailable.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("graphic_variant_limit_exceeded");
}

const QI_LIBRARY_COLUMN = {
  releaseYear: 0,
  authorFolder: 2,
  poemTitleCandidate: 3,
  fileName: 4,
  driveLink: 5,
  driveFileId: 6,
  sourceFolderLink: 8,
  book: 11,
  releaseCatalog: 12,
  normalizedAuthor: 15,
  bookShortener: 16,
  bookLink: 17,
  readiness: 20,
  canonicalPoemTitle: 22,
  cloudStorageUrl: 29,
  cloudUploadStatus: 30,
  firestoreDocumentId: 31,
  firestoreStatus: 32,
};

export function selectQiLibraryYearRows(values = [], { year = "", offset = 0, limit = 25 } = {}) {
  const normalizedYear = normalizeText(year);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const sourceRows = (Array.isArray(values) ? values : [])
    .map((cells, index) => ({ cells: Array.isArray(cells) ? cells : [], rowNumber: index + 1 }))
    .filter(({ rowNumber, cells }) => rowNumber > 1 && normalizeText(cells[QI_LIBRARY_COLUMN.releaseYear]) === normalizedYear);
  const readyRows = sourceRows.filter(({ cells }) => (
    normalizeText(cells[QI_LIBRARY_COLUMN.readiness]) === "ready_for_poetry_please_ingestion"
  ));
  const remainingRows = readyRows.filter(({ cells }) => !(
    normalizeText(cells[QI_LIBRARY_COLUMN.cloudStorageUrl])
    && normalizeText(cells[QI_LIBRARY_COLUMN.cloudUploadStatus]) === "cloud_upload_verified"
    && normalizeText(cells[QI_LIBRARY_COLUMN.firestoreDocumentId])
    && normalizeText(cells[QI_LIBRARY_COLUMN.firestoreStatus]) === "firestore_verified_public"
  ));
  const rows = remainingRows.slice(safeOffset, safeOffset + safeLimit).map(({ cells, rowNumber }) => ({
    fileName: normalizeText(cells[QI_LIBRARY_COLUMN.fileName]),
    author: normalizeText(cells[QI_LIBRARY_COLUMN.normalizedAuthor] || cells[QI_LIBRARY_COLUMN.authorFolder]),
    book: normalizeText(cells[QI_LIBRARY_COLUMN.book]),
    title: normalizeText(cells[QI_LIBRARY_COLUMN.canonicalPoemTitle] || cells[QI_LIBRARY_COLUMN.poemTitleCandidate]),
    driveLink: normalizeText(cells[QI_LIBRARY_COLUMN.driveLink]),
    sourceDriveFileId: normalizeText(cells[QI_LIBRARY_COLUMN.driveFileId]),
    folderLink: normalizeText(cells[QI_LIBRARY_COLUMN.sourceFolderLink]),
    bookLink: normalizeText(cells[QI_LIBRARY_COLUMN.bookLink]),
    releaseCatalog: normalizeText(cells[QI_LIBRARY_COLUMN.releaseCatalog]),
    bookShortener: normalizeText(cells[QI_LIBRARY_COLUMN.bookShortener]),
    sourceSystem: "qi_library",
    sourceRecordId: `qi-library-row-${rowNumber}`,
    sourceSpreadsheetRow: rowNumber,
  }));
  return {
    year: normalizedYear,
    sourceYearCount: sourceRows.length,
    readyCount: readyRows.length,
    remainingCount: remainingRows.length,
    offset: safeOffset,
    limit: safeLimit,
    rows,
  };
}

export function validateImportedGraphic({ requested = {}, saved = {}, imageStatus = 0, imageContentType = "" } = {}) {
  const expectedId = normalizeText(requested.docId || requested.imageId);
  const savedId = normalizeText(saved.id || saved.contentId || saved.imageId);
  const expectedFields = ["author", "book", "title", "releaseCatalog", "imageType"];
  const mismatchedFields = expectedFields.filter((field) => {
    const expected = normalizeText(requested[field]);
    return expected && normalizeText(saved[field]) !== expected;
  });
  const imageUrl = normalizeText(saved.imageUrl);
  const normalizedContentType = normalizeText(imageContentType).toLowerCase();
  return {
    ok: !!expectedId
      && normalizeText(savedId).toLowerCase() === expectedId.toLowerCase()
      && !mismatchedFields.length
      && !!imageUrl
      && Number(imageStatus) >= 200
      && Number(imageStatus) < 400
      && normalizedContentType.startsWith("image/"),
    expectedId,
    savedId,
    mismatchedFields,
    imageUrl,
    imageStatus: Number(imageStatus) || 0,
    imageContentType: normalizedContentType,
  };
}

export function verifiedImageContentType(headerContentType = "", detectedContentType = "") {
  const header = normalizeText(headerContentType).split(";")[0].trim().toLowerCase();
  if (header.startsWith("image/")) return header;
  const detected = normalizeText(detectedContentType).split(";")[0].trim().toLowerCase();
  return detected.startsWith("image/") ? detected : header;
}

export function buildQiLibraryWritebackValues({ imageUrl = "", docId = "", verifiedAt = "", batchId = "", action = "" } = {}) {
  return [
    normalizeText(imageUrl),
    "cloud_upload_verified",
    normalizeText(docId),
    "firestore_verified_public",
    normalizeText(verifiedAt),
    `Production Import Assistant batch ${normalizeText(batchId)}; ${normalizeText(action) || "upserted"}; automatic public metadata and image verification passed.`
  ];
}

export function inferRemoteMimeType(contentType = "", fileName = "", sourceUrl = "", rules = null) {
  const rawType = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (rules?.allowedMimeTypes?.has(rawType)) return rawType;
  const extensionMimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    qt: "video/quicktime",
    webm: "video/webm",
    ogg: "video/ogg",
    ogv: "video/ogg",
  };
  const inferred = extensionMimeTypes[extensionForRemoteMedia(fileName, sourceUrl)] || "";
  return rules?.allowedMimeTypes?.has(inferred) ? inferred : "";
}

export function detectImageMimeType(buffer) {
  if (!buffer || !buffer.length) return "";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }
  return "";
}

export function detectRemoteMediaMimeType(buffer) {
  const imageMimeType = detectImageMimeType(buffer);
  if (imageMimeType) return imageMimeType;
  if (!buffer || !buffer.length) return "";
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "video/ogg";
  }
  return "";
}
