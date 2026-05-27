import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

// Firebase Admin v12 (modular)
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

/** ====== CONFIG / CONSTANTS ====== */
const COLLECTIONS = {
  graphics: "graphics",
  excerpts: "excerpts",
  fullPoems: "fullPoems",
  videos: "videos",
  votes: "votes",
  users: "users",
  authorProfiles: "authorProfiles",
  authorInvites: "authorInvites",
  authorAssets: "authorAssets",
  contentAssets: "contentAssets",
  contentClaims: "contentClaims",
  contentFlags: "contentFlags",
  contentDuplicates: "contentDuplicates",
  contentSubmissions: "contentSubmissions",
  submissionResponses: "submissionResponses",
  systemState: "systemState",
};

const ADMIN_EMAILS = new Set([
  "sam@buttonpoetry.com",
]);

const FILE_SIZE_MB = 1024 * 1024;
const UPLOAD_RULES = {
  authorPhoto: {
    allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
    maxBytes: 5 * FILE_SIZE_MB,
  },
  replacementImage: {
    allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    maxBytes: 10 * FILE_SIZE_MB,
  },
  libraryGraphic: {
    allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    maxBytes: 15 * FILE_SIZE_MB,
  },
  libraryVideo: {
    allowedMimeTypes: new Set(["video/mp4", "video/quicktime", "video/webm", "video/ogg"]),
    maxBytes: 400 * FILE_SIZE_MB,
  },
  userSubmissionImage: {
    allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    maxBytes: 10 * FILE_SIZE_MB,
  },
};

const USER_SUBMISSION_CATALOG = "User submitted";
const USER_SUBMISSION_TITLE_MAX = 120;
const USER_SUBMISSION_TEXT_MAX = 2200;
const USER_SUBMISSION_IMAGE_NOTE_MAX = 600;
const USER_SUBMISSION_IMAGE_MAX_WIDTH = 3000;
const USER_SUBMISSION_IMAGE_MAX_HEIGHT = 3000;

/** ====== ADMIN INIT ====== */
const appAdmin = initializeApp({ storageBucket: "poetry-please.firebasestorage.app" });

// If your Firestore DB is the **default** "(default)", use: getFirestore(appAdmin)
// If your DB id is really "poetrypleasedatabase", keep the 2nd argument.
const db = getFirestore(appAdmin, "poetrypleasedatabase");
const auth = getAuth(appAdmin);
const storage = getStorage(appAdmin);
const CONTENT_CACHE_TTL_MS = 2 * 60 * 1000;
const SCOREBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const SCOREBOARD_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SCOREBOARD_SNAPSHOT_DOC_ID = "scoreboard";
const SCOREBOARD_SNAPSHOT_PATH = "system/scoreboard/latest.json";
const SCOREBOARD_SNAPSHOT_VERSION = 3;
let contentCache = {
  builtAt: 0,
  payload: null,
  inFlight: null,
};
let scoreboardCache = {
  builtAt: 0,
  payload: null,
  inFlight: null,
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOK_CATALOG_LOOKUP_ROWS = JSON.parse(
  readFileSync(path.join(__dirname, "book-catalog-lookup.json"), "utf8")
);
const BROKEN_QI_MANIFEST = JSON.parse(
  readFileSync(path.join(__dirname, "broken-qi-ids.json"), "utf8")
);
const BOOK_CATALOG_LOOKUP = new Map();
const BOOK_CATALOG_SHORTENER_LOOKUP = new Map();
const BOOK_CATALOG_TITLE_BUCKETS = new Map();
const BROKEN_QI_IDS = new Set(
  Array.isArray(BROKEN_QI_MANIFEST?.ids) ? BROKEN_QI_MANIFEST.ids.map((value) => normalizeKey(value)) : []
);
const POETRY_PLEASE_API_KEYS = new Set(
  [
    process.env.POETRY_PLEASE_API_KEY,
    process.env.PIG_POETRY_PLEASE_API_KEY,
  ].map((value) => String(value || "").trim()).filter(Boolean)
);

for (const record of BOOK_CATALOG_LOOKUP_ROWS) {
  const authorKey = String(record?.authorKey || "").trim();
  const shortener = sanitizeDocIdSegment(record?.bookShortener || "");
  if (shortener && !BOOK_CATALOG_SHORTENER_LOOKUP.has(shortener)) {
    BOOK_CATALOG_SHORTENER_LOOKUP.set(shortener, record);
  }
  const titleKeys = Array.isArray(record?.titleKeys) ? record.titleKeys.filter(Boolean) : [];
  titleKeys.forEach((titleKey) => {
    BOOK_CATALOG_TITLE_BUCKETS.set(titleKey, [
      ...(BOOK_CATALOG_TITLE_BUCKETS.get(titleKey) || []),
      record,
    ]);
    if (authorKey) {
      BOOK_CATALOG_LOOKUP.set(`${authorKey}|${titleKey}`, record);
    }
  });
}

function inferBookShortenerFromFilename(fileName = "") {
  const upper = String(fileName || "").toUpperCase();
  const candidates = [...new Set((upper.match(/[A-Z0-9]{2,8}/g) || []).filter(Boolean))];
  return candidates.find((candidate) => BOOK_CATALOG_SHORTENER_LOOKUP.has(candidate)) || "";
}

function resolveCatalogBookRecord({ author = "", book = "", bookShortener = "", fileName = "" } = {}) {
  const normalizedShortener = sanitizeDocIdSegment(bookShortener || inferBookShortenerFromFilename(fileName));
  if (normalizedShortener && BOOK_CATALOG_SHORTENER_LOOKUP.has(normalizedShortener)) {
    return BOOK_CATALOG_SHORTENER_LOOKUP.get(normalizedShortener);
  }
  const titleKey = normalizeKey(book);
  if (!titleKey) return null;
  const bucket = BOOK_CATALOG_TITLE_BUCKETS.get(titleKey) || [];
  if (!bucket.length) return null;
  const authorKey = normalizeKey(author);
  if (!authorKey) return bucket[0];
  return bucket.find((row) => normalizeKey(row.author) === authorKey || normalizeKey(row.authorKey) === authorKey) || bucket[0];
}

/** ====== EXPRESS / CORS ====== */
const app = express();
app.use(
  cors({
    origin: [
      "https://poetry-please.web.app",
      "https://poetry-please.firebaseapp.com",
      "https://poetryplease-org.web.app",
      "https://poetryplease-org.firebaseapp.com",
      "https://poetryplease.org",
      "https://www.poetryplease.org",
      "https://buttonpoetry.com",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: false,
  })
);
app.use(express.json({ limit: "16mb" }));

/** ====== HELPERS ====== */
function parseDoc(snap) {
  const d = snap.data() || {};
  const imageId = d.imageId || d.imageID || d.videoId || "";
  const contentId = d.contentId || snap.id || "";
  const imageUrl = d.imageUrl || d.thumbnailUrl || d.url || d.driveLink || d.videoUrl || "";
  return {
    author: d.author || "",
    title: d.title || d.poem || "",
    book: d.book || "",
    imageId,
    contentId,
    imageUrl,
    videoUrl: d.videoUrl || "",
    youtubeUrl: d.youtubeUrl || "",
    thumbnailUrl: d.thumbnailUrl || "",
    duration: d.duration || "",
    channel: d.channel || "",
    bookLink: d.bookLink || "",
    releaseCatalog: d.releaseCatalog || "",
    imageType: d.imageType || "",
    excerpt: d.excerpt || "",
    youtubeId: d.youtubeId || "",
    uploadTime: d.uploadTime || "",
    socialViews: Number(d.socialViews || 0) || 0,
    socialLikes: Number(d.socialLikes || 0) || 0,
    socialComments: Number(d.socialComments || 0) || 0,
    socialDislikes: Number(d.socialDislikes || 0) || 0,
    socialSyncSource: d.socialSyncSource || "",
    socialLastSyncedAt: d.socialLastSyncedAt || null,
  };
}

async function getAllFrom(collection) {
  const col = db.collection(collection);
  const out = [];
  let page = await col.limit(1000).get();
  while (!page.empty) {
    page.forEach((doc) => out.push({ id: doc.id, ...parseDoc(doc) }));
    const last = page.docs[page.docs.length - 1];
    page = await col.startAfter(last).limit(1000).get();
  }
  return out;
}

function sampleItems(items, limit) {
  if (!Array.isArray(items)) return [];
  if (items.length <= limit) return items.slice();
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limit);
}

function excludeBrokenContent(items = []) {
  return items.filter((item) => {
    const imageId = normalizeKey(item?.imageId || "");
    if (!imageId) return true;
    return !BROKEN_QI_IDS.has(imageId);
  });
}


async function getAllContent() {
  const [g, e, fp, v] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.fullPoems),
    getAllFrom(COLLECTIONS.videos),
  ]);
  return [...g, ...e, ...fp, ...v];
}

function invalidateContentCache() {
  contentCache.builtAt = 0;
  contentCache.payload = null;
  contentCache.inFlight = null;
}

async function getAllContentCached({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && contentCache.payload && (now - contentCache.builtAt) < CONTENT_CACHE_TTL_MS) {
    return contentCache.payload;
  }
  if (!forceRefresh && contentCache.inFlight) {
    return contentCache.inFlight;
  }
  contentCache.inFlight = getAllContent()
    .then((payload) => {
      contentCache.payload = payload;
      contentCache.builtAt = Date.now();
      contentCache.inFlight = null;
      return payload;
    })
    .catch((err) => {
      contentCache.inFlight = null;
      throw err;
    });
  return contentCache.inFlight;
}

async function findContentRecordByImageId(imageId) {
  const normalized = normalizeKey(imageId);
  if (!normalized) return null;
  for (const collection of [COLLECTIONS.graphics, COLLECTIONS.excerpts, COLLECTIONS.fullPoems, COLLECTIONS.videos]) {
    const snap = await db.collection(collection).limit(1000).get();
    const match = snap.docs.find((doc) => {
      const data = doc.data() || {};
      const candidate = data.imageId || data.imageID || data.videoId || "";
      return normalizeKey(candidate) === normalized;
    });
    if (match) {
      return { collection, docId: match.id, data: match.data() || {} };
    }
  }
  return null;
}

function extensionForUpload(fileName = "", mimeType = "") {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/ogg": "ogg",
  };
  const mapped = map[String(mimeType || "").toLowerCase()];
  if (mapped) return mapped;
  const fileExt = (String(fileName || "").split(".").pop() || "").trim().toLowerCase();
  return fileExt || "jpg";
}

function parseContentDispositionFileName(value = "") {
  const raw = String(value || "");
  const utfMatch = raw.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch (_err) {}
  }
  const plainMatch = raw.match(/filename\s*=\s*"?([^\";]+)"?/i);
  return plainMatch?.[1]?.trim() || "";
}

function extractGoogleDriveFileId(url = "") {
  const raw = normalizeText(url);
  if (!raw) return "";
  const directMatch = raw.match(/\/file\/d\/([A-Za-z0-9_-]+)/i);
  if (directMatch?.[1]) return directMatch[1];
  try {
    const parsed = new URL(raw);
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return "";
    const idParam = parsed.searchParams.get("id");
    if (idParam) return idParam;
    const parts = String(parsed.pathname || "").split("/").filter(Boolean);
    const marker = parts.findIndex((part) => part === "d");
    if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
  } catch (_err) {}
  return "";
}

function isGoogleDriveFileUrl(url = "") {
  return !!extractGoogleDriveFileId(url);
}

function isGoogleDriveFolderUrl(url = "") {
  const raw = normalizeText(url);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return /(^|\.)drive\.google\.com$/i.test(parsed.hostname) && /\/folders\//i.test(parsed.pathname || "");
  } catch (_err) {
    return false;
  }
}

function preferredRemoteMediaName(body = {}, sourceUrl = "") {
  return normalizeText(body.updatedFileName || body.fileName || body.title || sourceUrl);
}

function inferRemoteMimeType(contentType = "", fileName = "", sourceUrl = "", rules = null) {
  const rawType = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (rules?.allowedMimeTypes?.has(rawType)) return rawType;
  if (UPLOAD_RULES.libraryVideo.allowedMimeTypes.has(rawType)) return rawType;
  if (UPLOAD_RULES.libraryGraphic.allowedMimeTypes.has(rawType)) return rawType;
  const ext = extensionForUpload(fileName || sourceUrl, "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov" || ext === "qt") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "ogg" || ext === "ogv") return "video/ogg";
  return "";
}

async function fetchRemoteMediaResponse(sourceUrl, rules, body = {}) {
  if (isGoogleDriveFolderUrl(sourceUrl)) {
    const err = new Error("drive_folder_url_not_supported");
    err.status = 400;
    throw err;
  }
  const driveId = extractGoogleDriveFileId(sourceUrl);
  const candidates = driveId
    ? [
        `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`,
        sourceUrl,
      ]
    : [sourceUrl];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { redirect: "follow" });
      if (!response.ok) {
        lastError = new Error(`remote_fetch_${response.status}`);
        continue;
      }
      const dispositionName = parseContentDispositionFileName(response.headers.get("content-disposition"));
      const fileName = dispositionName || preferredRemoteMediaName(body, sourceUrl);
      const mimeType = inferRemoteMimeType(response.headers.get("content-type"), fileName, candidate, rules);
      if (!mimeType) {
        lastError = new Error("unsupported_remote_media_type");
        continue;
      }
      if (mimeType.startsWith("image/")) {
        const sniff = response.clone();
        const buffer = Buffer.from(await sniff.arrayBuffer());
        const detectedMimeType = detectImageMimeType(buffer);
        if (!detectedMimeType || detectedMimeType !== mimeType) {
          lastError = new Error("remote_image_type_mismatch");
          continue;
        }
      }
      const contentLength = Number(response.headers.get("content-length") || 0) || 0;
      if (contentLength && contentLength > rules.maxBytes) {
        const err = new Error("remote_media_too_large");
        err.status = 413;
        throw err;
      }
      return {
        sourceUrl: candidate,
        finalUrl: response.url || candidate,
        fileName,
        mimeType,
        fileSize: contentLength || null,
        response,
        extension: extensionForUpload(fileName, mimeType),
      };
    } catch (err) {
      lastError = err;
    }
  }

  const err = lastError || new Error("remote_media_fetch_failed");
  if (!err.status) err.status = 400;
  throw err;
}

async function streamRemoteMediaToStorage({ sourceUrl, storagePath, rules, body = {}, remoteMedia = null }) {
  const remote = remoteMedia || await fetchRemoteMediaResponse(sourceUrl, rules, body);
  if (!remote.response?.body) {
    const err = new Error("missing_remote_media_stream");
    err.status = 400;
    throw err;
  }
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  await new Promise((resolve, reject) => {
    const readStream = Readable.fromWeb(remote.response.body);
    let streamedBytes = 0;
    readStream.on("data", (chunk) => {
      streamedBytes += chunk.length;
      if (streamedBytes > rules.maxBytes) {
        readStream.destroy(new Error("remote_media_too_large"));
      }
    });
    const writeStream = file.createWriteStream({
      metadata: {
        contentType: remote.mimeType,
        cacheControl: "public,max-age=3600",
      },
      resumable: false,
    });
    readStream.on("error", reject);
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);
    readStream.pipe(writeStream);
  });
  const publicUrl = await getDownloadURL(file);
  return {
    ...remote,
    publicUrl,
    storagePath,
    fileSize: remote.fileSize,
  };
}

function detectImageMimeType(buffer) {
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

function parseBase64Upload(body, rules) {
  const mimeType = normalizeText(body?.mimeType).toLowerCase();
  const base64Data = normalizeText(body?.base64Data);
  const fileName = normalizeText(body?.fileName);
  const width = Number(body?.width || 0) || null;
  const height = Number(body?.height || 0) || null;
  const claimedFileSize = Number(body?.fileSize || 0) || null;

  if (!mimeType || !base64Data) {
    const err = new Error("missing_upload_payload");
    err.status = 400;
    throw err;
  }
  if (!rules.allowedMimeTypes.has(mimeType)) {
    const err = new Error("invalid_mime_type");
    err.status = 400;
    throw err;
  }
  if (!/^[a-z0-9+/]+=*$/i.test(base64Data)) {
    const err = new Error("invalid_base64_payload");
    err.status = 400;
    throw err;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    const err = new Error("invalid_base64_payload");
    err.status = 400;
    throw err;
  }
  if (!buffer.length) {
    const err = new Error("empty_upload");
    err.status = 400;
    throw err;
  }
  if (buffer.length > rules.maxBytes) {
    const err = new Error("file_too_large");
    err.status = 413;
    throw err;
  }
  if (claimedFileSize && Math.abs(claimedFileSize - buffer.length) > 16) {
    const err = new Error("file_size_mismatch");
    err.status = 400;
    throw err;
  }

  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType || detectedMimeType !== mimeType) {
    const err = new Error("file_type_mismatch");
    err.status = 400;
    throw err;
  }

  return {
    mimeType,
    fileName,
    width,
    height,
    fileSize: buffer.length,
    buffer,
    extension: extensionForUpload(fileName, mimeType),
  };
}

async function saveImageUpload({ storagePath, mimeType, buffer, cacheControl = "public,max-age=3600" }) {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl,
    },
    resumable: false,
  });
  const publicUrl = await getDownloadURL(file);
  return { file, publicUrl };
}

function buildFlagHistoryEntry(eventType, actor, note = "", extra = {}) {
  return {
    eventType,
    actorUid: actor?.uid || "",
    actorEmail: actor?.email || "",
    note: normalizeText(note || ""),
    createdAtIso: new Date().toISOString(),
    ...extra,
  };
}

function buildDuplicateHistoryEntry(eventType, actor, note = "", extra = {}) {
  return {
    eventType,
    actorUid: actor?.uid || "",
    actorEmail: actor?.email || "",
    note: normalizeText(note || ""),
    createdAtIso: new Date().toISOString(),
    ...extra,
  };
}

function mapContentDuplicateDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    imageId: data.imageId || "",
    title: data.title || "",
    author: data.author || "",
    imageType: data.imageType || "",
    releaseCatalog: data.releaseCatalog || "",
    currentImageUrl: data.currentImageUrl || "",
    driveLink: data.driveLink || "",
    duplicateOfImageId: data.duplicateOfImageId || "",
    duplicateOfTitle: data.duplicateOfTitle || "",
    duplicateOfAuthor: data.duplicateOfAuthor || "",
    duplicateOfBook: data.duplicateOfBook || "",
    duplicateOfDriveLink: data.duplicateOfDriveLink || "",
    duplicateMatchType: data.duplicateMatchType || "",
    duplicateFingerprint: data.duplicateFingerprint || "",
    sourceCompletionId: data.sourceCompletionId || "",
    sourceRequestId: data.sourceRequestId || "",
    sourceTool: data.sourceTool || "",
    status: data.status || "pending",
    detectedByUid: data.detectedByUid || "",
    detectedByEmail: data.detectedByEmail || "",
    createdAt: data.createdAt || null,
    reviewedAt: data.reviewedAt || null,
    reviewedBy: data.reviewedBy || "",
    reviewDecision: data.reviewDecision || "",
    reviewNote: data.reviewNote || "",
    moderationHistory: Array.isArray(data.moderationHistory) ? data.moderationHistory : [],
  };
}

function mapSubmissionDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    submissionType: data.submissionType || "",
    title: data.title || "",
    text: data.text || "",
    note: data.note || "",
    imageUrl: data.imageUrl || "",
    imageWidth: Number(data.imageWidth || 0) || 0,
    imageHeight: Number(data.imageHeight || 0) || 0,
    mimeType: data.mimeType || "",
    fileSize: Number(data.fileSize || 0) || 0,
    releaseCatalog: data.releaseCatalog || USER_SUBMISSION_CATALOG,
    status: data.status || "pending",
    reviewNote: data.reviewNote || "",
    submitterUid: data.submitterUid || "",
    submitterEmail: data.submitterEmail || "",
    submitterDisplayName: data.submitterDisplayName || "",
    likeCount: Number(data.likeCount || 0) || 0,
    movedMeCount: Number(data.movedMeCount || 0) || 0,
    mehCount: Number(data.mehCount || 0) || 0,
    dislikeCount: Number(data.dislikeCount || 0) || 0,
    positiveResponseCount: Number(data.positiveResponseCount || 0) || 0,
    lastSeenPositiveResponseCount: Number(data.lastSeenPositiveResponseCount || 0) || 0,
    createdAt: data.createdAt || null,
    reviewedAt: data.reviewedAt || null,
  };
}

function readMiscValue(misc = "", key = "") {
  const target = normalizeKey(key);
  if (!target) return "";
  return normalizeText(misc)
    .split("|")
    .map((part) => part.trim())
    .find((part) => normalizeKey(part).startsWith(`${target}=`))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim() || "";
}

function classifyExcQualityLane(item = {}) {
  const type = normalizeText(item.imageType).toUpperCase();
  if (type !== "EXC") return "";
  const excerpt = normalizeText(item.excerpt);
  const title = normalizeText(item.poem || item.title);
  if (!normalizeText(item.releaseCatalog)) return "missing_catalog";
  if (!title) return "missing_poem_title";
  if (excerpt.includes("...")) return "photo_instruction_ellipsis";
  if (excerpt.length > 280) return "too_long";
  return "";
}

function buildGraphicDuplicateKeys(item = {}) {
  const keys = [];
  const sourceCompletionId = normalizeKey(
    item.sourceCompletionId
    || readMiscValue(item.misc, "weaverSourceCompletionId")
    || readMiscValue(item.misc, "weaverPigCompletionId")
  );
  if (sourceCompletionId) {
    keys.push({ type: "sourceCompletionId", value: `sourceCompletionId:${sourceCompletionId}` });
  }

  const driveLink = normalizeText(item.driveLink);
  const driveLinkKey = normalizeKey(extractGoogleDriveFileId(driveLink) || driveLink);
  if (driveLinkKey) {
    keys.push({ type: "driveLink", value: `driveLink:${driveLinkKey}` });
  }

  const previewUrl = normalizeText(item.imageUrl);
  const previewKey = normalizeKey(extractGoogleDriveFileId(previewUrl) || previewUrl);
  if (previewKey && previewKey !== driveLinkKey) {
    keys.push({ type: "imageUrl", value: `imageUrl:${previewKey}` });
  }

  const seen = new Set();
  return keys.filter((entry) => {
    if (!entry?.value || seen.has(entry.value)) return false;
    seen.add(entry.value);
    return true;
  });
}

async function createContentDuplicateForItem(item, primary, actor, extra = {}) {
  const existingSnap = await db.collection(COLLECTIONS.contentDuplicates)
    .where("imageId", "==", item.imageId)
    .limit(25)
    .get();
  const existingPending = existingSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .find((row) => row.status === "pending");
  if (existingPending) {
    return { ok: false, reason: "already_captured", duplicate: existingPending };
  }

  const duplicateRef = db.collection(COLLECTIONS.contentDuplicates).doc();
  await duplicateRef.set({
    imageId: item.imageId,
    title: item.title || "",
    author: item.author || "",
    imageType: item.imageType || "",
    releaseCatalog: item.releaseCatalog || "",
    qualityLane: extra.qualityLane || classifyExcQualityLane(item),
    currentImageUrl: item.imageUrl || "",
    driveLink: item.driveLink || "",
    duplicateOfImageId: primary?.imageId || "",
    duplicateOfTitle: primary?.title || "",
    duplicateOfAuthor: primary?.author || "",
    duplicateOfBook: primary?.book || "",
    duplicateOfDriveLink: primary?.driveLink || "",
    duplicateMatchType: extra.duplicateMatchType || "",
    duplicateFingerprint: extra.duplicateFingerprint || "",
    sourceCompletionId: item.sourceCompletionId || "",
    sourceRequestId: item.sourceRequestId || "",
    sourceTool: item.sourceTool || "",
    status: "pending",
    detectedByUid: actor?.uid || "",
    detectedByEmail: actor?.email || "",
    createdAt: FieldValue.serverTimestamp(),
    moderationHistory: [
      buildDuplicateHistoryEntry("duplicate_detected", actor, extra.note || "Captured during Weaver -> Poetry Please import.", {
        duplicateMatchType: extra.duplicateMatchType || "",
        duplicateFingerprint: extra.duplicateFingerprint || "",
        source: extra.source || "weaver_import",
        primaryImageId: primary?.imageId || "",
      }),
    ],
  });

  return { ok: true, duplicateId: duplicateRef.id };
}

async function createContentFlagForItem(item, ctx, note, extra = {}) {
  const existingSnap = await db.collection(COLLECTIONS.contentFlags)
    .where("imageId", "==", item.imageId)
    .limit(25)
    .get();
  const existingPending = existingSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .find((flag) => flag.status === "pending");
  if (existingPending) {
    return { ok: false, reason: "already_flagged", flag: existingPending };
  }

  const flagRef = db.collection(COLLECTIONS.contentFlags).doc();
  await flagRef.set({
    imageId: item.imageId,
    title: item.title || "",
    author: item.author || "",
    imageType: item.imageType || "",
    releaseCatalog: item.releaseCatalog || "",
    currentImageUrl: item.imageUrl || "",
    flaggedByUid: ctx.decoded.uid,
    flaggedByEmail: ctx.decoded.email,
    flaggedByRoles: Array.isArray(ctx.userRecord?.roles) ? ctx.userRecord.roles : [],
    note,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    moderationHistory: [
      buildFlagHistoryEntry("flagged", { uid: ctx.decoded.uid, email: ctx.decoded.email }, note, {
        roles: Array.isArray(ctx.userRecord?.roles) ? ctx.userRecord.roles : [],
        ...extra,
      }),
    ],
  });

  return { ok: true, flagId: flagRef.id };
}

async function getVotesByUser(userId) {
  const list = [];
  let q = db.collection(COLLECTIONS.votes).where("userId", "==", userId).limit(1000);
  let page = await q.get();
  while (!page.empty) {
    page.forEach((d) => {
      const f = d.data() || {};
      list.push({
        imageId: f.imageId || "",
        voteType: (f.voteType || "").toLowerCase(),
        userId: f.userId || "",
        timestamp: f.timestamp || null,
      });
    });
    const last = page.docs[page.docs.length - 1];
    page = await db
      .collection(COLLECTIONS.votes)
      .where("userId", "==", userId)
      .startAfter(last)
      .limit(1000)
      .get();
  }
  return list;
}

async function getUniqueVotedImageIdsByUser(userId) {
  const ids = new Set();
  let page = await db.collection(COLLECTIONS.votes).where("userId", "==", userId).select("imageId").limit(1000).get();
  while (!page.empty) {
    page.forEach((d) => {
      const f = d.data() || {};
      const imageId = normalizeText(f.imageId || "").toLowerCase();
      if (imageId) ids.add(imageId);
    });
    const last = page.docs[page.docs.length - 1];
    page = await db
      .collection(COLLECTIONS.votes)
      .where("userId", "==", userId)
      .select("imageId")
      .startAfter(last)
      .limit(1000)
      .get();
  }
  return ids;
}

async function getVoteDocsByUser(userId) {
  const list = [];
  let page = await db.collection(COLLECTIONS.votes).where("userId", "==", userId).limit(1000).get();
  while (!page.empty) {
    page.forEach((d) => {
      const f = d.data() || {};
      list.push({
        ref: d.ref,
        id: d.id,
        imageId: f.imageId || "",
        voteType: (f.voteType || "").toLowerCase(),
        userId: f.userId || "",
        timestamp: f.timestamp || null,
      });
    });
    const last = page.docs[page.docs.length - 1];
    page = await db
      .collection(COLLECTIONS.votes)
      .where("userId", "==", userId)
      .startAfter(last)
      .limit(1000)
      .get();
  }
  return list;
}

async function getAllVotes() {
  const list = [];
  let page = await db.collection(COLLECTIONS.votes).limit(1000).get();
  while (!page.empty) {
    page.forEach((doc) => {
      const data = doc.data() || {};
      list.push({
        id: doc.id,
        imageId: data.imageId || "",
        voteType: (data.voteType || "").toLowerCase(),
        userId: data.userId || "",
        timestamp: data.timestamp || null,
      });
    });
    const last = page.docs[page.docs.length - 1];
    page = await db.collection(COLLECTIONS.votes).startAfter(last).limit(1000).get();
  }
  return list;
}

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?._seconds === "number") return (value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1e6);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapToArr(o) {
  const mediaUrl = (o.imageType || "") === "YT"
    ? (o.youtubeUrl || o.url || o.imageUrl || "")
    : (o.imageUrl || o.videoUrl || o.url || "");
  return [
    o.author || "",
    o.title || "",
    o.book || "",
    o.imageId || "",
    mediaUrl,
    o.bookLink || "",
    o.releaseCatalog || "",
    o.imageType || "",
    o.excerpt || "",
    o.youtubeId || "",
    o.uploadTime || "",
    Number(o.socialViews || 0) || 0,
    Number(o.socialLikes || 0) || 0,
    Number(o.socialComments || 0) || 0,
    Number(o.socialDislikes || 0) || 0,
  ];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderScoreboardTextPreviewPage(item) {
  const title = normalizeText(item.title || item.poem || "Untitled");
  const author = normalizeText(item.author);
  const book = normalizeText(item.book || item.bookTitle);
  const type = normalizeText(item.imageType || item.type).toUpperCase();
  const typeLabel = type === "FP" ? "Full poem" : type === "EXC" ? "Excerpt" : type || "Text";
  const text = normalizeText(item.excerpt || item.text || "");
  const sourceUrl = normalizeText(item.bookLink || item.driveLink || item.url || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - Poetry Please</title>
  <style>
    :root { color-scheme: light; --bg:#fffdf8; --ink:#231f1a; --muted:#71685c; --line:#e6dccb; --accent:#2f5d62; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family: ui-serif, Georgia, "Times New Roman", serif; }
    main { max-width: 760px; margin: 0 auto; padding: 34px 30px 42px; }
    .eyebrow { margin: 0 0 12px; color: var(--accent); font: 700 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 5vw, 48px); line-height: 1.04; font-weight: 700; }
    .meta { margin-top: 12px; color: var(--muted); font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .text { margin-top: 30px; border-top: 1px solid var(--line); padding-top: 26px; white-space: pre-wrap; font-size: 21px; line-height: 1.62; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">${escapeHtml(typeLabel)}</p>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${author ? `<div>${escapeHtml(author)}</div>` : ""}
      ${book ? `<div>${escapeHtml(book)}</div>` : ""}
      ${sourceUrl ? `<div><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a></div>` : ""}
    </div>
    <div class="text">${escapeHtml(text)}</div>
  </main>
</body>
</html>`;
}

function mapToCounterArr(o) {
  return [
    o.author || "",
    "",
    o.book || "",
    o.imageId || "",
    "",
    "",
    o.releaseCatalog || "",
    o.imageType || "",
    "",
  ];
}

function aggregateRatings(voteDocs) {
  const agg = {};
  for (const v of voteDocs) {
    const id = (v.imageId || "").trim();
    if (!id) continue;
    const t = (v.voteType || "").toLowerCase();
    let w = 0;
    if (t === "dislike") w = -1;
    else if (t === "meh") w = 0;
    else if (t === "like") w = 1;
    else if (t === "moved me" || t === "movedme" || t === "moved_me") w = 2;
    if (!agg[id]) agg[id] = { score: 0, total: 0, likes: 0, dislikes: 0, meh: 0, movedMe: 0 };
    agg[id].score += w;
    agg[id].total += 1;
    if (t === "like") agg[id].likes += 1;
    else if (t === "dislike") agg[id].dislikes += 1;
    else if (t === "meh") agg[id].meh += 1;
    else if (t === "moved me" || t === "movedme" || t === "moved_me") agg[id].movedMe += 1;
  }
  const out = {};
  Object.keys(agg).forEach((id) => {
    const { score, total, likes, dislikes, meh, movedMe } = agg[id];
    out[id] = { score, total, rating: total ? score / total : 0, likes, dislikes, meh, movedMe };
  });
  return out;
}

function buildFeedPayload({ all, votedIds, limit, includeDomainMeta = false, ratingsSummary = null }) {
  const newObjs = all.filter((o) => !votedIds.has((o.imageId || "").trim().toLowerCase()));
  const batch = sampleItems(newObjs, limit);
  const releaseCatalogs = [...new Set(all.map((o) => o.releaseCatalog).filter(Boolean))].sort();
  const imageTypes = [...new Set(all.map((o) => o.imageType).filter(Boolean))].sort();

  return {
    allGraphics: includeDomainMeta ? all.map(mapToCounterArr) : [],
    newGraphics: batch.map(mapToArr),
    totalImages: all.length,
    votedImagesCount: votedIds.size,
    remainingImagesCount: newObjs.length,
    releaseCatalogs,
    imageTypes,
    ...(ratingsSummary ? { ratingsSummary } : {}),
  };
}

function matchesFilterValue(actual, expected) {
  if (!normalizeText(expected)) return true;
  return normalizeKey(actual) === normalizeKey(expected);
}

function matchesRequestedType(item, requestedType) {
  const type = normalizeText(requestedType).toUpperCase();
  if (!type) return true;
  const actual = normalizeText(item?.imageType).toUpperCase();
  if (type === "VIDEO") return actual === "VV" || actual === "YT";
  return actual === type;
}

function filterContentByFeedFilters(items, filters = {}) {
  return (items || []).filter((item) => {
    if (!matchesRequestedType(item, filters.type)) return false;
    if (!matchesFilterValue(item?.releaseCatalog, filters.catalog)) return false;
    if (!matchesFilterValue(item?.author, filters.author)) return false;
    if (!matchesFilterValue(item?.book, filters.book)) return false;
    return true;
  });
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function normalizeWeaverGraphicsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return firstArray(
    payload.items,
    payload.records,
    payload.results,
    payload.requests,
    payload.data,
    payload.graphics,
    payload.completedGraphics
  );
}

function flattenWeaverGraphicsRecords(payload) {
  return normalizeWeaverGraphicsPayload(payload)
    .filter((record) => record && typeof record === "object")
    .map((record, parentIndex) => ({
      ...record,
      __weaverParentRecord: record,
      __weaverExcerpts: firstArray(
        record.excerpts,
        record.groupedExcerpts,
        record.requestExcerpts,
        record.lines
      ),
      __weaverParentIndex: parentIndex,
      __weaverAssetIndex: 0,
    }));
}

function deriveWeaverGraphicsDocId(record, defaultImageType = "QI") {
  const parent = record?.__weaverParentRecord || {};
  const explicit = sanitizeDocIdSegment(firstNonEmpty(
    record.docId,
    record.imageId,
    record.contentId,
    record.sourceCompletionId,
    record.graphicId,
    record.completedGraphicId,
    record.assetId,
    record.outputId,
    record.resultId
  ));
  if (explicit) return explicit;

  const requestId = sanitizeDocIdSegment(firstNonEmpty(
    record.graphicsRequestId,
    record.requestId,
    parent.graphicsRequestId,
    parent.requestId
  ));
  const excerptId = sanitizeDocIdSegment(firstNonEmpty(
    record.excerptId,
    record.sourceExcerptId,
    record.__weaverExcerpts?.[0]?.excerptId,
    record.__weaverExcerpts?.[0]?.sourceExcerptId
  ));
  if (requestId && excerptId) return `${requestId}-${excerptId}`.toUpperCase();

  const bookShortener = sanitizeDocIdSegment(firstNonEmpty(
    record.bookShortener,
    parent.bookShortener,
    record.bookCode,
    parent.bookCode
  ));
  const title = firstNonEmpty(
    record.title,
    record.poemTitle,
    record.poem,
    record.excerptTitle,
    record.displayTitle,
    record.__weaverExcerpts?.[0]?.title,
    record.__weaverExcerpts?.[0]?.poemTitle,
    record.__weaverExcerpts?.[0]?.poem
  );
  if (bookShortener && title) {
    return `${bookShortener}-${defaultImageType}-${slugify(title)}`.toUpperCase();
  }
  if (requestId) {
    return `${requestId}-${String((record.__weaverAssetIndex || 0) + 1).padStart(2, "0")}`.toUpperCase();
  }
  return "";
}

function mapWeaverGraphicRecord(record, options = {}) {
  const defaultImageType = normalizeText(options.defaultImageType || "QI").toUpperCase();
  const parent = record?.__weaverParentRecord || {};
  const firstExcerpt = (record?.__weaverExcerpts || []).find((entry) => entry && typeof entry === "object") || {};
  const author = firstNonEmpty(record.author, parent.author, firstExcerpt.author);
  const book = firstNonEmpty(record.book, parent.book, firstExcerpt.book);
  const catalogBookMetadata = lookupCatalogBookMetadata(book, author);
  const docId = deriveWeaverGraphicsDocId(record, defaultImageType);
  const assetLinkUrl = firstNonEmpty(
    record.assetLinkUrl,
    record.assetUrl,
    record.publicUrl,
    record.storageUrl,
    record.outputUrl,
    record.url,
    record.finalUrl,
    record.hostedUrl
  );
  const imageUrl = firstNonEmpty(
    record.previewUrl,
    record.assetPreviewUrl,
    record.imageUrl,
    assetLinkUrl
  );

  const excerptText = firstNonEmpty(
    record.quoteText,
    record.excerpt,
    record.excerptText,
    firstExcerpt.excerpt,
    firstExcerpt.excerptText
  );

  const miscParts = [
    firstNonEmpty(record.graphicsRequestId, parent.graphicsRequestId) && `weaverGraphicsRequestId=${firstNonEmpty(record.graphicsRequestId, parent.graphicsRequestId)}`,
    firstNonEmpty(record.pigCompletionId, parent.pigCompletionId) && `weaverPigCompletionId=${firstNonEmpty(record.pigCompletionId, parent.pigCompletionId)}`,
    firstNonEmpty(record.sourceRequestId, parent.sourceRequestId) && `weaverSourceRequestId=${firstNonEmpty(record.sourceRequestId, parent.sourceRequestId)}`,
    firstNonEmpty(record.sourceCompletionId, parent.sourceCompletionId) && `weaverSourceCompletionId=${firstNonEmpty(record.sourceCompletionId, parent.sourceCompletionId)}`,
    firstNonEmpty(record.storageTarget, parent.storageTarget) && `weaverStorageTarget=${firstNonEmpty(record.storageTarget, parent.storageTarget)}`,
    firstNonEmpty(record.graphicsQcDecision, parent.graphicsQcDecision) && `weaverQcDecision=${firstNonEmpty(record.graphicsQcDecision, parent.graphicsQcDecision)}`,
    firstNonEmpty(record.graphicsQcUpdatedAt, parent.graphicsQcUpdatedAt) && `weaverQcUpdatedAt=${firstNonEmpty(record.graphicsQcUpdatedAt, parent.graphicsQcUpdatedAt)}`,
    firstNonEmpty(record.qcApprovedAt, parent.qcApprovedAt) && `weaverQcApprovedAt=${firstNonEmpty(record.qcApprovedAt, parent.qcApprovedAt)}`,
    firstNonEmpty(record.graphicsQcNote, parent.graphicsQcNote) && `weaverQcNote=${firstNonEmpty(record.graphicsQcNote, parent.graphicsQcNote)}`,
    firstNonEmpty(record.qcNote, parent.qcNote) && `weaverQcNote=${firstNonEmpty(record.qcNote, parent.qcNote)}`,
    firstNonEmpty(record.productionNotes, parent.productionNotes) && `weaverProductionNotes=${firstNonEmpty(record.productionNotes, parent.productionNotes)}`,
    firstNonEmpty(record.sourceTool, parent.sourceTool) && `weaverSourceTool=${firstNonEmpty(record.sourceTool, parent.sourceTool)}`,
    firstNonEmpty(record.requestStatus, parent.requestStatus) && `weaverRequestStatus=${firstNonEmpty(record.requestStatus, parent.requestStatus)}`,
    firstNonEmpty(record.completedAt, parent.completedAt) && `weaverCompletedAt=${firstNonEmpty(record.completedAt, parent.completedAt)}`,
    firstNonEmpty(record.sourceExcerptId, firstExcerpt.excerptId, firstExcerpt.sourceExcerptId) && `weaverExcerptId=${firstNonEmpty(record.sourceExcerptId, firstExcerpt.excerptId, firstExcerpt.sourceExcerptId)}`,
    excerptText && `sourceExcerpt=${excerptText.slice(0, 280)}`,
  ].filter(Boolean).join(" | ");

  return {
    docId,
    contentId: docId,
    imageId: docId,
    imageType: defaultImageType,
    sourceCompletionId: firstNonEmpty(record.sourceCompletionId, parent.sourceCompletionId, record.pigCompletionId, parent.pigCompletionId),
    sourceRequestId: firstNonEmpty(record.sourceRequestId, parent.sourceRequestId, record.graphicsRequestId, parent.graphicsRequestId),
    sourceTool: firstNonEmpty(record.sourceTool, parent.sourceTool),
    author,
    book,
    title: firstNonEmpty(
      record.poemTitle,
      record.title,
      record.poemTitle,
      record.poem,
      record.displayTitle,
      parent.title,
      parent.poemTitle,
      firstExcerpt.title,
      firstExcerpt.poemTitle,
      firstExcerpt.poem
    ),
    imageUrl,
    driveLink: firstNonEmpty(
      record.assetLinkUrl,
      record.driveLink,
      record.sourceDriveLink,
      record.assetDriveLink,
      parent.driveLink,
      parent.sourceDriveLink
    ),
    bookLink: firstNonEmpty(
      record.bookLink,
      parent.bookLink,
      firstExcerpt.bookLink,
      catalogBookMetadata?.bookLink
    ),
    releaseCatalog: firstNonEmpty(
      record.releaseCatalog,
      parent.releaseCatalog,
      firstExcerpt.releaseCatalog,
      catalogBookMetadata?.releaseCatalog
    ),
    misc: miscParts,
  };
}

function shouldImportWeaverGraphicRecord(record) {
  if (firstNonEmpty(record?.sourceCompletionId, record?.__weaverParentRecord?.sourceCompletionId)) {
    return !!firstNonEmpty(record?.driveLink, record?.assetLinkUrl, record?.assetUrl, record?.publicUrl, record?.storageUrl);
  }
  const storageTarget = normalizeKey(firstNonEmpty(record?.storageTarget, record?.__weaverParentRecord?.storageTarget));
  const qcDecision = normalizeKey(firstNonEmpty(record?.graphicsQcDecision, record?.__weaverParentRecord?.graphicsQcDecision));
  const assetLinkUrl = firstNonEmpty(record?.assetLinkUrl, record?.assetUrl, record?.publicUrl, record?.storageUrl);
  return storageTarget === "pig_sheet" && qcDecision === "approve" && !!assetLinkUrl;
}

async function buildWeaverGraphicsDuplicatePlan(mappedItems = []) {
  const existingGraphics = await getAllFrom(COLLECTIONS.graphics);
  const existingByDuplicateKey = new Map();

  existingGraphics.forEach((item) => {
    buildGraphicDuplicateKeys(item).forEach((entry) => {
      if (!existingByDuplicateKey.has(entry.value)) {
        existingByDuplicateKey.set(entry.value, {
          imageId: item.imageId || item.id || "",
          title: item.title || "",
          author: item.author || "",
          book: item.book || "",
          driveLink: item.driveLink || "",
          duplicateMatchType: entry.type,
        });
      }
    });
  });

  const acceptedItems = [];
  const duplicateItems = [];
  const acceptedByDuplicateKey = new Map();

  mappedItems.forEach((item) => {
    const duplicateKeys = buildGraphicDuplicateKeys(item);
    let primary = null;
    let matchedKey = null;

    for (const entry of duplicateKeys) {
      const existingPrimary = existingByDuplicateKey.get(entry.value);
      if (existingPrimary && normalizeKey(existingPrimary.imageId) !== normalizeKey(item.imageId)) {
        primary = existingPrimary;
        matchedKey = entry;
        break;
      }
      const acceptedPrimary = acceptedByDuplicateKey.get(entry.value);
      if (acceptedPrimary && normalizeKey(acceptedPrimary.imageId) !== normalizeKey(item.imageId)) {
        primary = acceptedPrimary;
        matchedKey = entry;
        break;
      }
    }

    if (primary && matchedKey) {
      duplicateItems.push({
        ...item,
        duplicateMatchType: matchedKey.type,
        duplicateFingerprint: matchedKey.value,
        primaryImageId: primary.imageId || "",
        primaryTitle: primary.title || "",
        primaryAuthor: primary.author || "",
        primaryBook: primary.book || "",
        primaryDriveLink: primary.driveLink || "",
      });
      return;
    }

    acceptedItems.push(item);
    duplicateKeys.forEach((entry) => {
      if (!acceptedByDuplicateKey.has(entry.value)) {
        acceptedByDuplicateKey.set(entry.value, {
          imageId: item.imageId || "",
          title: item.title || "",
          author: item.author || "",
          book: item.book || "",
          driveLink: item.driveLink || "",
          duplicateMatchType: entry.type,
        });
      }
    });
  });

  return { acceptedItems, duplicateItems };
}

async function fetchRemoteJson(sourceUrl) {
  const target = normalizeText(sourceUrl);
  if (!/^https?:\/\//i.test(target)) {
    const err = new Error("invalid_source_url");
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = new Error(`source_fetch_failed_${response.status}`);
      err.status = 400;
      throw err;
    }
    return await response.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error("source_fetch_timeout");
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function buildWeaverGraphicsImportItems(rawPayload, options = {}) {
  const defaultImageType = normalizeText(options.defaultImageType || "QI").toUpperCase();
  return flattenWeaverGraphicsRecords(rawPayload)
    .filter((record) => shouldImportWeaverGraphicRecord(record))
    .map((record) => mapWeaverGraphicRecord(record, { defaultImageType }))
    .filter((item) => item.docId && item.imageUrl);
}

function countCharacters(parts = []) {
  return normalizeTextBody(parts.join(" ")).length;
}

async function buildScoreboardPayload() {
  const [voteDocs, metaObjs, excerptObjs, fullPoemObjs, videoObjs, flaggedIds] = await Promise.all([
    getAllVotes(),
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.fullPoems),
    getAllFrom(COLLECTIONS.videos),
    getFlaggedContentIds(),
  ]);

  const latestByUserImage = new Map();
  voteDocs.forEach((vote) => {
    const user = normalizeText(vote.userId);
    const imageId = normalizeText(vote.imageId);
    if (!user || !imageId) return;
    if (flaggedIds.has(normalizeKey(imageId))) return;
    const key = `${normalizeKey(user)}|${normalizeKey(imageId)}`;
    const time = timestampToMs(vote.timestamp);
    const current = latestByUserImage.get(key);
    if (!current || time > current.time) {
      latestByUserImage.set(key, {
        imageId,
        vote: vote.voteType || "",
        user,
        time,
      });
    }
  });

  const rawVotes = Array.from(latestByUserImage.values());
  const metaMap = new Map();
  const upsertMeta = (item) => {
    const imageId = normalizeText(item?.imageId);
    const contentId = normalizeText(item?.contentId);
    const keys = uniq([imageId, contentId].filter(Boolean));
    if (!keys.length) return;
    if (keys.some((key) => flaggedIds.has(normalizeKey(key)))) return;
    const cloudLink = normalizeText(item.imageUrl || item.url || item.videoUrl || "");
    const driveLink = normalizeText(item.driveLink || "");
    const sourceFolderLink = normalizeText(item.sourceFolderLink || readMiscValue(item.misc, "sourceFolderLink"));
    const sourceFileName = normalizeText(item.sourceFileName || readMiscValue(item.misc, "sourceFileName"));
    const payload = {
      imageId: imageId || contentId,
      author: item.author || "",
      poemTitle: item.title || item.poem || "",
      bookTitle: item.book || "",
      fileLink: cloudLink || item.bookLink || "",
      cloudLink,
      driveLink,
      sourceFolderLink,
      sourceFileName,
      type: item.imageType || "",
      excerpt: item.excerpt || "",
      releaseCatalog: item.releaseCatalog || "",
      charCount: countCharacters([item.author || "", item.title || item.poem || "", item.excerpt || ""]),
    };
    keys.forEach((key) => metaMap.set(key, payload));
  };
  metaObjs.forEach(upsertMeta);
  excerptObjs.forEach(upsertMeta);
  fullPoemObjs.forEach(upsertMeta);
  videoObjs.forEach(upsertMeta);

  const enrichedVotes = rawVotes.map((vote) => {
    const meta = metaMap.get(vote.imageId) || {};
    const normalizedImageId = normalizeKey(vote.imageId);
    const inferredType = meta.type
      || (normalizedImageId.includes("-fp-") ? "FP" : "")
      || (normalizedImageId.includes("-exc-") ? "EXC" : "")
      || (normalizedImageId.includes("-yt-") || normalizeKey(meta.fileLink).includes("youtube.com") || normalizeKey(meta.fileLink).includes("youtu.be") ? "YT" : "")
      || (normalizedImageId.endsWith(".mp4") || normalizedImageId.includes("-vv-") ? "VV" : "")
      || "";
    return {
      imageId: vote.imageId,
      vote: vote.vote,
      user: vote.user,
      author: meta.author || "‹no author›",
      poemTitle: meta.poemTitle || "‹no title›",
      bookTitle: meta.bookTitle || "‹no book›",
      fileLink: meta.fileLink || "",
      cloudLink: meta.cloudLink || "",
      driveLink: meta.driveLink || "",
      sourceFolderLink: meta.sourceFolderLink || "",
      sourceFileName: meta.sourceFileName || "",
      type: inferredType,
      excerpt: meta.excerpt || "",
      releaseCatalog: meta.releaseCatalog || "",
      charCount: Number(meta.charCount || 0) || 0,
    };
  });

  const board = new Map();
  enrichedVotes.forEach((vote) => {
    if (!board.has(vote.imageId)) {
      board.set(vote.imageId, {
        imageId: vote.imageId,
        author: vote.author,
        poemTitle: vote.poemTitle,
        bookTitle: vote.bookTitle,
        fileLink: vote.fileLink,
        cloudLink: vote.cloudLink || "",
        driveLink: vote.driveLink || "",
        sourceFolderLink: vote.sourceFolderLink || "",
        sourceFileName: vote.sourceFileName || "",
        excerpt: vote.excerpt || "",
        likes: 0,
        dislikes: 0,
        meh: 0,
        movedMe: 0,
        totalVotes: 0,
        type: vote.type || "",
        releaseCatalog: vote.releaseCatalog || "",
        charCount: Number(vote.charCount || 0) || 0,
      });
    }
    const entry = board.get(vote.imageId);
    if (vote.vote === "like") entry.likes += 1;
    else if (vote.vote === "dislike") entry.dislikes += 1;
    else if (vote.vote === "meh") entry.meh += 1;
    else if (vote.vote === "moved me") entry.movedMe += 1;
    entry.totalVotes += 1;
  });

  metaMap.forEach((meta) => {
    const imageId = normalizeText(meta.imageId);
    if (!imageId || board.has(imageId)) return;
    board.set(imageId, {
      imageId,
      author: meta.author || "‹no author›",
      poemTitle: meta.poemTitle || "‹no title›",
      bookTitle: meta.bookTitle || "‹no book›",
      fileLink: meta.fileLink || "",
      cloudLink: meta.cloudLink || "",
      driveLink: meta.driveLink || "",
      sourceFolderLink: meta.sourceFolderLink || "",
      sourceFileName: meta.sourceFileName || "",
      excerpt: meta.excerpt || "",
      likes: 0,
      dislikes: 0,
      meh: 0,
      movedMe: 0,
      totalVotes: 0,
      type: meta.type || "",
      releaseCatalog: meta.releaseCatalog || "",
      charCount: Number(meta.charCount || 0) || 0,
    });
  });

  const aggregated = Array.from(board.values()).map((entry) => ({
    ...entry,
    score: entry.likes + (entry.movedMe * 2) - entry.dislikes,
  }));

  const flaggedKeySet = flaggedIds;
  const allGraphics = [...metaObjs, ...excerptObjs, ...fullPoemObjs, ...videoObjs]
    .map((item) => ({
      imageId: item.imageId || "",
      bookTitle: item.book || "‹no book›",
      type: item.imageType || "",
      releaseCatalog: item.releaseCatalog || "",
      missingCatalog: !normalizeText(item.releaseCatalog),
      missingBucketUrl: ["QI", "INT", "GP", "VV"].includes(normalizeText(item.imageType).toUpperCase()) && !normalizeText(item.imageUrl || item.videoUrl || item.url),
      flagged: flaggedKeySet.has(normalizeKey(item.imageId || "")),
    }));

  return {
    aggregated,
    rawVotes: enrichedVotes,
    allGraphics,
  };
}

function normalizeTextBody(value) {
  return normalizeText(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildTextMetadataSignature({ author = "", title = "", book = "" }) {
  return [
    normalizeCatalogLookupKey(author),
    normalizeCatalogLookupKey(title),
    normalizeCatalogLookupKey(book),
  ].join("|");
}

function buildStableTextHash({ type = "", author = "", title = "", book = "", text = "" }) {
  const payload = [
    normalizeKey(type),
    normalizeCatalogLookupKey(author),
    normalizeCatalogLookupKey(title),
    normalizeCatalogLookupKey(book),
    normalizeTextBody(text),
  ].join("||");
  return createHash("sha256").update(payload).digest("hex");
}

async function buildRankedTextsPayload({
  limit = 100,
  minScore = 1,
  minVotes = 1,
  types = ["EXC", "FP"],
} = {}) {
  const normalizedTypes = uniq(
    (Array.isArray(types) ? types : [types])
      .map((type) => normalizeText(type).toUpperCase())
      .filter((type) => ["EXC", "FP"].includes(type))
  );

  const [
    scoreboardResult,
    excerptItems,
    fullPoemItems,
    graphicItems,
    flaggedIds,
  ] = await Promise.all([
    getScoreboardPayloadFromSnapshot(),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.fullPoems),
    getAllFrom(COLLECTIONS.graphics),
    getFlaggedContentIds(),
  ]);

  const aggregatedByImageId = new Map();
  (scoreboardResult?.payload?.aggregated || []).forEach((row) => {
    const imageId = normalizeText(row?.imageId);
    if (imageId) aggregatedByImageId.set(imageId, row);
  });

  const matchingGraphicsBySignature = new Map();
  graphicItems.forEach((item) => {
    if (flaggedIds.has(normalizeKey(item.imageId || ""))) return;
    const imageType = normalizeText(item.imageType).toUpperCase();
    if (!imageType || imageType === "EXC" || imageType === "FP") return;
    const signature = buildTextMetadataSignature(item);
    if (!signature.replace(/\|/g, "")) return;
    const payload = {
      imageId: item.imageId || "",
      contentId: item.contentId || "",
      imageType,
      title: item.title || "",
      author: item.author || "",
      book: item.book || "",
      imageUrl: item.imageUrl || "",
      driveLink: item.driveLink || "",
      bookLink: item.bookLink || "",
      releaseCatalog: item.releaseCatalog || "",
    };
    matchingGraphicsBySignature.set(signature, [
      ...(matchingGraphicsBySignature.get(signature) || []),
      payload,
    ]);
  });

  const candidates = [...excerptItems, ...fullPoemItems]
    .filter((item) => normalizedTypes.includes(normalizeText(item.imageType).toUpperCase()))
    .filter((item) => !flaggedIds.has(normalizeKey(item.imageId || "")))
    .map((item) => {
      const voteStats = aggregatedByImageId.get(item.imageId || "") || {};
      const text = normalizeTextBody(item.excerpt || "");
      const textHash = buildStableTextHash({
        type: item.imageType || "",
        author: item.author || "",
        title: item.title || "",
        book: item.book || "",
        text,
      });
      const signature = buildTextMetadataSignature(item);
      return {
        textHash,
        signature,
        sourceType: normalizeText(item.imageType).toUpperCase(),
        sourceRecordId: item.imageId || item.contentId || "",
        contentId: item.contentId || "",
        imageId: item.imageId || "",
        author: item.author || "",
        title: item.title || "",
        book: item.book || "",
        text,
        releaseCatalog: item.releaseCatalog || "",
        bookLink: item.bookLink || "",
        score: Number(voteStats.score || 0),
        likes: Number(voteStats.likes || 0),
        dislikes: Number(voteStats.dislikes || 0),
        meh: Number(voteStats.meh || 0),
        movedMe: Number(voteStats.movedMe || 0),
        totalVotes: Number(voteStats.totalVotes || 0),
      };
    })
    .filter((item) => item.text)
    .filter((item) => item.totalVotes >= minVotes)
    .filter((item) => item.score >= minScore);

  const groupedByTextHash = new Map();
  candidates.forEach((item) => {
    const current = groupedByTextHash.get(item.textHash);
    if (!current) {
      groupedByTextHash.set(item.textHash, {
        ...item,
        sourceRecordIds: uniq([item.sourceRecordId].filter(Boolean)),
        siblingRecordCount: 1,
      });
      return;
    }
    const shouldReplaceRepresentative = (
      item.score > current.score
      || (item.score === current.score && item.totalVotes > current.totalVotes)
    );
    current.score += item.score;
    current.likes += item.likes;
    current.dislikes += item.dislikes;
    current.meh += item.meh;
    current.movedMe += item.movedMe;
    current.totalVotes += item.totalVotes;
    current.siblingRecordCount += 1;
    current.sourceRecordIds = uniq([...current.sourceRecordIds, item.sourceRecordId].filter(Boolean));
    if (shouldReplaceRepresentative) {
      Object.assign(current, {
        sourceType: item.sourceType,
        sourceRecordId: item.sourceRecordId,
        contentId: item.contentId,
        imageId: item.imageId,
        author: item.author,
        title: item.title,
        book: item.book,
        text: item.text,
        releaseCatalog: item.releaseCatalog,
        bookLink: item.bookLink,
        signature: item.signature,
      });
    }
  });

  const rows = Array.from(groupedByTextHash.values())
    .sort((a, b) => (
      (b.score - a.score)
      || (b.movedMe - a.movedMe)
      || (b.totalVotes - a.totalVotes)
      || a.author.localeCompare(b.author)
      || a.title.localeCompare(b.title)
    ))
    .slice(0, limit)
    .map((item, index) => {
      const matchingGraphics = (matchingGraphicsBySignature.get(item.signature) || []).slice(0, 12);
      return {
        rank: index + 1,
        textId: `PP:${item.sourceType}:${item.textHash.slice(0, 16).toUpperCase()}`,
        textHash: item.textHash,
        sourceSystem: "poetry_please",
        sourceType: item.sourceType,
        sourceRecordId: item.sourceRecordId,
        sourceRecordIds: item.sourceRecordIds,
        siblingRecordCount: item.siblingRecordCount,
        author: item.author,
        title: item.title,
        book: item.book,
        text: item.text,
        releaseCatalog: item.releaseCatalog || "",
        bookLink: item.bookLink || "",
        score: item.score,
        likes: item.likes,
        dislikes: item.dislikes,
        meh: item.meh,
        movedMe: item.movedMe,
        totalVotes: item.totalVotes,
        matchingStrategy: "metadata_exact",
        matchingGraphicCount: matchingGraphics.length,
        matchingGraphics,
      };
    });

  return {
    rows,
    count: rows.length,
    filters: {
      limit,
      minScore,
      minVotes,
      types: normalizedTypes,
    },
    snapshotMeta: scoreboardResult?.builtAtMs ? {
      source: scoreboardResult.source,
      builtAtMs: scoreboardResult.builtAtMs,
      ttlMs: SCOREBOARD_SNAPSHOT_TTL_MS,
    } : null,
  };
}

async function getScoreboardBootstrapPayload() {
  const [allContent, flaggedIds] = await Promise.all([
    getAllContent(),
    getFlaggedContentIds(),
  ]);
  const sample = allContent.find((item) => !flaggedIds.has(normalizeKey(item.imageId || ""))) || null;
  return {
    ok: true,
    sample: sample ? {
      imageId: sample.imageId || "",
      title: sample.title || "",
      author: sample.author || "",
      book: sample.book || "",
      type: sample.imageType || "",
    } : null,
  };
}

async function getCachedScoreboardPayload() {
  const now = Date.now();
  if (scoreboardCache.payload && (now - scoreboardCache.builtAt) < SCOREBOARD_CACHE_TTL_MS) {
    return scoreboardCache.payload;
  }
  if (scoreboardCache.inFlight) {
    return scoreboardCache.inFlight;
  }
  scoreboardCache.inFlight = buildScoreboardPayload()
    .then((payload) => {
      scoreboardCache.payload = payload;
      scoreboardCache.builtAt = Date.now();
      scoreboardCache.inFlight = null;
      return payload;
    })
    .catch((err) => {
      scoreboardCache.inFlight = null;
      throw err;
    });
  return scoreboardCache.inFlight;
}

async function readScoreboardSnapshot() {
  const metaRef = db.collection(COLLECTIONS.systemState).doc(SCOREBOARD_SNAPSHOT_DOC_ID);
  const metaSnap = await metaRef.get();
  if (!metaSnap.exists) return null;
  const meta = metaSnap.data() || {};
  const builtAtMs = timestampToMs(meta.builtAt);
  const storagePath = normalizeText(meta.storagePath || SCOREBOARD_SNAPSHOT_PATH);
  if (!builtAtMs || !storagePath) return null;
  if (Number(meta.version || 1) !== SCOREBOARD_SNAPSHOT_VERSION) return null;

  const [buffer] = await storage.bucket().file(storagePath).download();
  const payload = JSON.parse(buffer.toString("utf8"));
  return { payload, meta, builtAtMs };
}

async function writeScoreboardSnapshot(payload) {
  const file = storage.bucket().file(SCOREBOARD_SNAPSHOT_PATH);
  const json = JSON.stringify(payload);
  await file.save(json, {
    contentType: "application/json; charset=utf-8",
    resumable: false,
    metadata: {
      cacheControl: "no-store, max-age=0",
    },
  });

  const snapshotMeta = {
    storagePath: SCOREBOARD_SNAPSHOT_PATH,
    version: SCOREBOARD_SNAPSHOT_VERSION,
    builtAt: FieldValue.serverTimestamp(),
    aggregatedCount: Array.isArray(payload?.aggregated) ? payload.aggregated.length : 0,
    rawVotesCount: Array.isArray(payload?.rawVotes) ? payload.rawVotes.length : 0,
    allGraphicsCount: Array.isArray(payload?.allGraphics) ? payload.allGraphics.length : 0,
    updatedBy: "server",
  };
  await db.collection(COLLECTIONS.systemState).doc(SCOREBOARD_SNAPSHOT_DOC_ID).set(snapshotMeta, { merge: true });
}

async function getGoogleApiAccessToken() {
  const tokenResult = await appAdmin.options.credential.getAccessToken();
  return tokenResult?.access_token || tokenResult?.accessToken || "";
}

async function createGoogleSheet({ title, headers, rows, shareWithEmail }) {
  const accessToken = await getGoogleApiAccessToken();
  if (!accessToken) {
    const err = new Error("missing_google_api_token");
    err.status = 500;
    throw err;
  }

  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Scoreboard Export" } }],
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    const err = new Error(`sheet_create_failed:${createRes.status}:${errText}`);
    err.status = 500;
    throw err;
  }

  const created = await createRes.json();
  const spreadsheetId = normalizeText(created.spreadsheetId);
  if (!spreadsheetId) {
    const err = new Error("missing_spreadsheet_id");
    err.status = 500;
    throw err;
  }

  const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorDimension: "ROWS",
      values: [headers, ...rows],
    }),
  });
  if (!valuesRes.ok) {
    const errText = await valuesRes.text().catch(() => "");
    const err = new Error(`sheet_write_failed:${valuesRes.status}:${errText}`);
    err.status = 500;
    throw err;
  }

  if (shareWithEmail) {
    const shareRes = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "writer",
        type: "user",
        emailAddress: shareWithEmail,
      }),
    });
    if (!shareRes.ok) {
      const errText = await shareRes.text().catch(() => "");
      console.warn("Scoreboard sheet share failed", errText);
    }
  }

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

async function invalidateScoreboardSnapshot(reason = "") {
  scoreboardCache = {
    builtAt: 0,
    payload: null,
    inFlight: null,
  };
  const metaRef = db.collection(COLLECTIONS.systemState).doc(SCOREBOARD_SNAPSHOT_DOC_ID);
  await metaRef.set({
    invalidatedAt: FieldValue.serverTimestamp(),
    invalidationReason: normalizeText(reason),
    builtAt: null,
  }, { merge: true });
}

async function getScoreboardPayloadFromSnapshot({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh) {
    try {
      const snapshot = await readScoreboardSnapshot();
      if (snapshot && (now - snapshot.builtAtMs) < SCOREBOARD_SNAPSHOT_TTL_MS) {
        scoreboardCache.payload = snapshot.payload;
        scoreboardCache.builtAt = snapshot.builtAtMs;
        return {
          payload: snapshot.payload,
          source: "snapshot",
          builtAtMs: snapshot.builtAtMs,
        };
      }
    } catch (err) {
      console.warn("Scoreboard snapshot read failed", err);
    }
  }

  const payload = await getCachedScoreboardPayload();
  try {
    await writeScoreboardSnapshot(payload);
  } catch (err) {
    console.warn("Scoreboard snapshot write failed", err);
  }
  return {
    payload,
    source: "live",
    builtAtMs: Date.now(),
  };
}

function normalizeScoreboardType(value = "") {
  const raw = normalizeKey(value);
  if (raw === "fp" || raw === "fullpoems" || raw === "fullpoem") return "fp";
  if (raw === "exc" || raw === "excerpts" || raw === "excerpt") return "exc";
  if (raw === "qi" || raw === "quoteimages" || raw === "quoteimage") return "qi";
  if (raw === "int" || raw === "interiorimages" || raw === "interiorimage") return "int";
  if (raw === "gp" || raw === "graphics" || raw === "graphic") return "gp";
  if (raw === "vv" || raw === "video" || raw === "videos") return "vv";
  if (raw === "yt" || raw === "youtube" || raw === "youtubevideo" || raw === "youtubevideos") return "yt";
  return raw;
}

function buildScoreboardFilterOptions(payload = {}) {
  const allGraphics = Array.isArray(payload.allGraphics) ? payload.allGraphics : [];
  const rawVotes = Array.isArray(payload.rawVotes) ? payload.rawVotes : [];
  const uniqueSorted = (values) => Array.from(new Map(values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .map((value) => [value.toLowerCase(), value])).values())
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return {
    users: uniqueSorted(rawVotes.map((row) => row.user)),
    books: uniqueSorted(allGraphics.map((row) => row.bookTitle)),
    catalogs: uniqueSorted(allGraphics.map((row) => row.releaseCatalog)),
    types: uniqueSorted(allGraphics.map((row) => row.type)),
  };
}

function isAnonymousScoreboardUser(user = "") {
  const normalized = normalizeText(user).toLowerCase();
  return /^local-[a-z0-9]{6,}$/.test(normalized) || /^poetrylover\d+$/.test(normalized);
}

function applyScoreboardQuery(payload = {}, query = {}) {
  const user = normalizeText(query.user).toLowerCase();
  const type = normalizeScoreboardType(query.type);
  const book = normalizeText(query.book).toLowerCase();
  const catalog = normalizeText(query.catalog).toLowerCase();
  const hideZero = normalizeText(query.hideZero) !== "false";
  const charMin = query.charMin === undefined || query.charMin === "" ? null : Number(query.charMin);
  const charMax = query.charMax === undefined || query.charMax === "" ? null : Number(query.charMax);
  const source = user
    ? (payload.rawVotes || []).filter((row) => (
        user === "__anon_local__"
          ? isAnonymousScoreboardUser(row.user)
          : normalizeText(row.user).toLowerCase() === user
      ))
    : [...(payload.aggregated || [])];
  let rows = source;
  if (!user && hideZero) rows = rows.filter((row) => Number(row.totalVotes || 0) > 0);
  if (type) rows = rows.filter((row) => normalizeScoreboardType(row.type) === type);
  if (book) rows = rows.filter((row) => normalizeText(row.bookTitle).toLowerCase() === book);
  if (catalog) rows = rows.filter((row) => normalizeText(row.releaseCatalog).toLowerCase() === catalog);
  if ((type === "fp" || type === "exc") && (Number.isFinite(charMin) || Number.isFinite(charMax))) {
    rows = rows.filter((row) => {
      const count = Number(row.charCount || 0) || 0;
      if (Number.isFinite(charMin) && count < charMin) return false;
      if (Number.isFinite(charMax) && count > charMax) return false;
      return true;
    });
  }
  return rows;
}

function sortScoreboardRows(rows = [], sortKey = "bookTitle", sortDir = 1) {
  const dir = Number(sortDir) < 0 ? -1 : 1;
  const allowed = new Set(["imageId", "author", "poemTitle", "bookTitle", "type", "charCount", "likes", "dislikes", "meh", "movedMe", "totalVotes", "score", "scorePerVote", "movedMeRate", "vote"]);
  const key = allowed.has(sortKey) ? sortKey : "bookTitle";
  const readValue = (row) => {
    if (key === "scorePerVote") {
      const totalVotes = Number(row.totalVotes || 0);
      return totalVotes ? Number(row.score || 0) / totalVotes : 0;
    }
    if (key === "movedMeRate") {
      const totalVotes = Number(row.totalVotes || 0);
      return totalVotes ? Number(row.movedMe || 0) / totalVotes : 0;
    }
    return row[key];
  };
  return [...rows].sort((a, b) => {
    let va = readValue(a);
    let vb = readValue(b);
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va > vb) return dir;
    if (va < vb) return -dir;
    return 0;
  });
}

async function verifyIdTokenFromHeader(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/i);
  if (!m) return null;
  try {
    return await auth.verifyIdToken(m[1]);
  } catch {
    return null;
  }
}

function getApiKeyFromRequest(req) {
  const headerKey = String(req.headers["x-api-key"] || "").trim();
  if (headerKey) return headerKey;
  const authHeader = String(req.headers.authorization || "");
  const bearerMatch = authHeader.match(/^Bearer (.+)$/i);
  const bearerValue = String(bearerMatch?.[1] || "").trim();
  if (bearerValue && POETRY_PLEASE_API_KEYS.has(bearerValue)) {
    return bearerValue;
  }
  const queryKey = String(req.query?.apiKey || "").trim();
  return queryKey || null;
}

function hasValidPoetryPleaseApiKey(req) {
  if (!POETRY_PLEASE_API_KEYS.size) return false;
  const provided = getApiKeyFromRequest(req);
  return !!provided && POETRY_PLEASE_API_KEYS.has(provided);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMetricValue(value) {
  const raw = normalizeText(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function positiveResponseCountForSubmission(submission = {}) {
  return Math.max(0, Number(submission.positiveResponseCount || 0) || 0);
}

function hasNewPositiveResponse(submission = {}) {
  return positiveResponseCountForSubmission(submission) > (Number(submission.lastSeenPositiveResponseCount || 0) || 0);
}

async function recomputeSubmissionResponseSummary(submissionId) {
  const snap = await db.collection(COLLECTIONS.submissionResponses)
    .where("submissionId", "==", submissionId)
    .limit(500)
    .get();
  let likeCount = 0;
  let movedMeCount = 0;
  let mehCount = 0;
  let dislikeCount = 0;
  snap.docs.forEach((doc) => {
    const voteType = normalizeKey(doc.data()?.voteType);
    if (voteType === "like") likeCount += 1;
    else if (voteType === "movedme") movedMeCount += 1;
    else if (voteType === "meh") mehCount += 1;
    else if (voteType === "dislike") dislikeCount += 1;
  });
  const positiveResponseCount = likeCount + movedMeCount;
  await db.collection(COLLECTIONS.contentSubmissions).doc(submissionId).set({
    likeCount,
    movedMeCount,
    mehCount,
    dislikeCount,
    positiveResponseCount,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { likeCount, movedMeCount, mehCount, dislikeCount, positiveResponseCount };
}

function normalizeCatalogLookupKey(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCatalogTitleLookupKeys(value) {
  const raw = normalizeText(value);
  if (!raw) return [];
  const keys = [];
  const pushKey = (candidate) => {
    const key = normalizeCatalogLookupKey(candidate);
    if (key && !keys.includes(key)) keys.push(key);
  };
  pushKey(raw);
  [":", " — ", " – ", " - "].forEach((separator) => {
    if (raw.includes(separator)) {
      pushKey(raw.split(separator, 1)[0]);
    }
  });
  pushKey(raw.replace(/\s*\([^)]*\)\s*$/, ""));
  return keys;
}

function lookupCatalogBookMetadata(book, author) {
  const titleKeys = buildCatalogTitleLookupKeys(book);
  const authorKey = normalizeCatalogLookupKey(author);
  if (!titleKeys.length) return null;

  if (authorKey) {
    for (const titleKey of titleKeys) {
      const direct = BOOK_CATALOG_LOOKUP.get(`${authorKey}|${titleKey}`);
      if (direct) return direct;
    }
  }

  for (const titleKey of titleKeys) {
    const bucket = BOOK_CATALOG_TITLE_BUCKETS.get(titleKey) || [];
    if (bucket.length === 1) return bucket[0];
  }

  return null;
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extractYouTubeId(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const direct = raw.match(/^[A-Za-z0-9_-]{11}$/);
  if (direct) return direct[0];
  try {
    const url = new URL(raw);
    if (/(^|\.)youtu\.be$/i.test(url.hostname)) {
      return normalizeText(url.pathname.replace(/^\/+/, "").split("/")[0]).slice(0, 32);
    }
    if (/youtube\.com$/i.test(url.hostname) || /(^|\.)youtube\.com$/i.test(url.hostname)) {
      const v = normalizeText(url.searchParams.get("v"));
      if (v) return v.slice(0, 32);
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
      if (marker >= 0 && parts[marker + 1]) return normalizeText(parts[marker + 1]).slice(0, 32);
    }
  } catch (_err) {
    return "";
  }
  return "";
}

function sanitizeDocIdSegment(value) {
  // Firestore document IDs cannot contain path separators like "/".
  return normalizeText(value)
    .replace(/[\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function uniq(values) {
  return [...new Set((values || []).map(normalizeText).filter(Boolean))];
}

function resolveRoles(existingRoles = [], email = "") {
  const roles = new Set(
    (Array.isArray(existingRoles) && existingRoles.length ? existingRoles : ["user"])
      .map(normalizeText)
      .filter(Boolean)
  );
  roles.add("user");
  if (ADMIN_EMAILS.has(normalizeKey(email))) roles.add("admin");
  return [...roles];
}

function sanitizeManagedRoles(inputRoles = [], email = "") {
  const allowed = new Set(["user", "author", "team", "admin"]);
  const roles = (Array.isArray(inputRoles) ? inputRoles : [])
    .map(normalizeText)
    .filter((role) => allowed.has(role));
  return resolveRoles(roles, email);
}

function mapProfileDoc(id, data = {}) {
  return {
    id,
    userId: data.userId || "",
    email: data.email || "",
    displayName: data.displayName || "",
    slug: data.slug || "",
    bio: data.bio || "",
    shortBio: data.shortBio || "",
    photoUrl: data.photoUrl || "",
    websiteUrl: data.websiteUrl || "",
    instagramUrl: data.instagramUrl || "",
    tiktokUrl: data.tiktokUrl || "",
    youtubeUrl: data.youtubeUrl || "",
    newsletterUrl: data.newsletterUrl || "",
    bookstoreUrl: data.bookstoreUrl || "",
    customLinks: Array.isArray(data.customLinks) ? data.customLinks : [],
    authorNameVariants: uniq(data.authorNameVariants),
    featuredContentIds: uniq(data.featuredContentIds),
    claimedContentIds: uniq(data.claimedContentIds),
    published: data.published !== false,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function mapAdminContentDoc(collection, doc) {
  const data = doc.data() || {};
  const contentId = data.imageId || data.imageID || data.videoId || doc.id;
  return {
    id: doc.id,
    collection,
    contentId,
    imageType: data.imageType || "",
    author: data.author || "",
    title: data.title || data.poem || "",
    poem: data.poem || "",
    excerpt: data.excerpt || "",
    book: data.book || "",
    pageNumber: data.pageNumber || "",
    url: data.url || "",
    youtubeUrl: data.youtubeUrl || "",
    thumbnailUrl: data.thumbnailUrl || "",
    duration: data.duration || "",
    channel: data.channel || "",
    imageUrl: data.imageUrl || data.thumbnailUrl || data.url || "",
    driveLink: data.driveLink || "",
    bookLink: data.bookLink || "",
    releaseCatalog: data.releaseCatalog || "",
    releaseYear: data.releaseYear || "",
    bookShortener: data.bookShortener || "",
    updatedFileName: data.updatedFileName || "",
    misc: data.misc || "",
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || "",
  };
}

async function getAdminContentDocs(collection, { searchMode = false, imageType = "" } = {}) {
  let query = db.collection(collection);
  const normalizedImageType = normalizeText(imageType).toUpperCase();
  if (normalizedImageType) {
    query = query.where("imageType", "==", normalizedImageType);
  }

  if (!searchMode) {
    const snap = await query.limit(250).get();
    return snap.docs.map((doc) => mapAdminContentDoc(collection, doc));
  }

  const rows = [];
  let page = await query.limit(1000).get();
  while (!page.empty) {
    rows.push(...page.docs.map((doc) => mapAdminContentDoc(collection, doc)));
    const last = page.docs[page.docs.length - 1];
    page = await query.startAfter(last).limit(1000).get();
  }
  return rows;
}

async function getAdminContentCount(collection, { imageType = "" } = {}) {
  let query = db.collection(collection);
  const normalizedImageType = normalizeText(imageType).toUpperCase();
  if (normalizedImageType) {
    query = query.where("imageType", "==", normalizedImageType);
  }

  const aggregate = await query.count().get();
  return Number(aggregate.data().count || 0);
}

function deriveContentDocId(type, body = {}) {
  if (type === "graphics") {
    return normalizeText(body.docId || body.imageId);
  }
  if (type === "excerpts") {
    const explicit = sanitizeDocIdSegment(body.docId || body.imageID || body.imageId);
    if (explicit) return explicit;
    const bookShortener = sanitizeDocIdSegment(body.bookShortener);
    const poem = normalizeText(body.poem || body.title);
    if (!bookShortener || !poem) return "";
    return `${bookShortener}-EXC-${slugify(poem)}`.toUpperCase();
  }
  if (type === "full-poems" || type === "fullpoems") {
    const explicit = sanitizeDocIdSegment(body.docId || body.contentId || body.imageId);
    if (explicit) return explicit;
    const bookShortener = sanitizeDocIdSegment(body.bookShortener);
    const title = normalizeText(body.title);
    if (!bookShortener || !title) return "";
    return `${bookShortener}-FP-${slugify(title)}`.toUpperCase();
  }
  if (type === "videos") {
    return normalizeText(body.docId || body.videoId || body.imageId);
  }
  if (type === "youtube") {
    const explicit = sanitizeDocIdSegment(body.docId || body.videoId || body.imageId || body.contentId);
    if (explicit) return explicit;
    const youtubeId = sanitizeDocIdSegment(extractYouTubeId(body.youtubeUrl || body.url));
    if (youtubeId) return `YT-${youtubeId}`.toUpperCase();
    const shortener = sanitizeDocIdSegment(body.bookShortener);
    const title = normalizeText(body.title);
    if (!shortener || !title) return "";
    return `${shortener}-YT-${slugify(title)}`.toUpperCase();
  }
  return "";
}

function buildContentDocPayload(type, body = {}, options = {}) {
  const now = FieldValue.serverTimestamp();
  const docId = deriveContentDocId(type, body);
  if (!docId) {
    const err = new Error("missing_content_id");
    err.status = 400;
    throw err;
  }

  const imageType = normalizeText(body.imageType || (type === "excerpts" ? "EXC" : (type === "full-poems" || type === "fullpoems") ? "FP" : type === "videos" ? "VV" : type === "youtube" ? "YT" : ""));
  const payload = {
    imageType,
    contentId: docId,
    author: normalizeText(body.author),
    book: normalizeText(body.book),
    driveLink: normalizeText(body.driveLink),
    bookLink: normalizeText(body.bookLink),
    releaseCatalog: normalizeText(body.releaseCatalog),
    updatedAt: now,
    updatedBy: normalizeText(options.updatedBy || ""),
  };
  const sourceSystem = normalizeText(body.sourceSystem);
  const sourceRecordId = normalizeText(body.sourceRecordId);
  if (sourceSystem) payload.sourceSystem = sourceSystem;
  if (sourceRecordId) payload.sourceRecordId = sourceRecordId;
  if (normalizeText(body.excerptHash)) payload.excerptHash = normalizeText(body.excerptHash);
  if (normalizeText(body.normalizedExcerpt)) payload.normalizedExcerpt = normalizeText(body.normalizedExcerpt);
  if (normalizeText(body.sourceUrl)) payload.sourceUrl = normalizeText(body.sourceUrl);
  if (normalizeText(body.approvedAt)) payload.approvedAt = normalizeText(body.approvedAt);
  if (normalizeText(body.sourceUpdatedAt || body.updatedAt)) payload.sourceUpdatedAt = normalizeText(body.sourceUpdatedAt || body.updatedAt);
  if (normalizeText(body.sourceContentId)) payload.sourceContentId = normalizeText(body.sourceContentId);

  if (type === "graphics") {
    payload.title = normalizeText(body.title);
    payload.imageId = docId;
    payload.imageUrl = normalizeText(options.imageUrl || body.imageUrl);
    payload.misc = normalizeText(body.misc);
  } else if (type === "excerpts") {
    payload.poem = normalizeText(body.poem || body.title);
    payload.excerpt = normalizeText(body.excerpt);
    payload.pageNumber = normalizeText(body.pageNumber);
    payload.bookShortener = normalizeText(body.bookShortener);
    payload.imageID = docId;
    payload.imageId = docId;
  } else if (type === "full-poems" || type === "fullpoems") {
    payload.title = normalizeText(body.title);
    payload.excerpt = normalizeText(body.excerpt);
    payload.pageNumber = normalizeText(body.pageNumber);
    payload.bookShortener = normalizeText(body.bookShortener);
    payload.releaseYear = normalizeText(body.releaseYear);
    payload.imageId = docId;
    payload.imageID = docId;
    payload.imageUrl = normalizeText(body.imageUrl);
    payload.videoUrl = normalizeText(body.videoUrl);
    payload.url = normalizeText(body.url);
  } else if (type === "videos") {
    payload.title = normalizeText(body.title);
    payload.videoId = docId;
    payload.url = normalizeText(options.mediaUrl || body.videoUrl || body.url || body.imageUrl);
    payload.videoUrl = normalizeText(options.mediaUrl || body.videoUrl || body.url || body.imageUrl);
    payload.imageUrl = normalizeText(options.imageUrl || body.imageUrl);
    payload.releaseYear = normalizeText(body.releaseYear);
    payload.bookShortener = normalizeText(body.bookShortener);
    payload.updatedFileName = normalizeText(body.updatedFileName);
    payload.pageNumber = normalizeText(body.pageNumber);
    payload.misc = normalizeText(body.misc);
  } else if (type === "youtube") {
    const youtubeUrl = normalizeText(body.youtubeUrl || body.url);
    const youtubeId = normalizeText(body.youtubeId || extractYouTubeId(youtubeUrl));
    payload.title = normalizeText(body.title);
    payload.videoId = docId;
    payload.url = youtubeUrl;
    payload.youtubeUrl = youtubeUrl;
    payload.youtubeId = youtubeId;
    payload.thumbnailUrl = normalizeText(body.thumbnailUrl || body.imageUrl);
    payload.imageUrl = normalizeText(body.thumbnailUrl || body.imageUrl);
    payload.releaseYear = normalizeText(body.releaseYear);
    payload.bookShortener = normalizeText(body.bookShortener);
    payload.updatedFileName = normalizeText(body.updatedFileName);
    payload.pageNumber = normalizeText(body.pageNumber);
    payload.misc = normalizeText(body.misc);
    payload.duration = normalizeText(body.duration);
    payload.channel = normalizeText(body.channel);
    payload.uploadTime = normalizeText(body.uploadTime);
    payload.socialViews = normalizeMetricValue(body.socialViews ?? body.views);
    payload.socialLikes = normalizeMetricValue(body.socialLikes ?? body.likes);
    payload.socialComments = normalizeMetricValue(body.socialComments ?? body.comments);
    payload.socialDislikes = normalizeMetricValue(body.socialDislikes ?? body.dislikes);
    payload.socialSyncSource = normalizeText(body.socialSyncSource || "youtube_export");
    payload.socialLastSyncedAt = normalizeText(body.socialLastSyncedAt || body.syncTime);
  } else {
    const err = new Error("invalid_content_type");
    err.status = 400;
    throw err;
  }

  return { docId, payload };
}

function collectionForContentType(type) {
  const normalized = normalizeKey(type);
  if (normalized === "graphics") return COLLECTIONS.graphics;
  if (normalized === "excerpts") return COLLECTIONS.excerpts;
  if (normalized === "fullpoems" || normalized === "full-poems") return COLLECTIONS.fullPoems;
  if (normalized === "videos") return COLLECTIONS.videos;
  if (normalized === "youtube") return COLLECTIONS.videos;
  return "";
}

async function resolveContentRefForDelete(collection, requestedId, type) {
  const directRef = db.collection(collection).doc(requestedId);
  const directSnap = await directRef.get();
  const matchesType = (snap) => !(type === "youtube" && normalizeKey(snap.data()?.imageType) !== "yt");

  if (directSnap.exists && matchesType(directSnap)) {
    return { ref: directRef, snap: directSnap };
  }

  const fallbackFields = ["contentId", "imageId"];
  for (const field of fallbackFields) {
    const querySnap = await db.collection(collection).where(field, "==", requestedId).limit(1).get();
    const hit = querySnap.docs.find((doc) => matchesType(doc));
    if (hit) {
      return { ref: hit.ref, snap: hit };
    }
  }

  return null;
}

async function upsertContentLibraryItem(type, body = {}, actor = {}) {
  const collection = collectionForContentType(type);
  if (!collection) {
    const err = new Error("invalid_content_type");
    err.status = 400;
    throw err;
  }

  const pendingDocId = deriveContentDocId(type, body);
  if (!pendingDocId) {
    const err = new Error("missing_content_id");
    err.status = 400;
    throw err;
  }

  const ref = db.collection(collection).doc(pendingDocId);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : {};

  let uploadImageUrl = "";
  if (normalizeKey(type) === "graphics" && normalizeText(body?.base64Data)) {
    const upload = parseBase64Upload(body, UPLOAD_RULES.replacementImage);
    const storagePath = `content-library/graphics/${normalizeKey(pendingDocId)}/${Date.now()}.${upload.extension}`;
    const { publicUrl } = await saveImageUpload({
      storagePath,
      mimeType: upload.mimeType,
      buffer: upload.buffer,
    });
    uploadImageUrl = publicUrl;

    const assetRef = db.collection(COLLECTIONS.contentAssets).doc();
    await assetRef.set({
      assetType: "library_graphic",
      imageId: pendingDocId,
      contentCollection: collection,
      contentDocId: pendingDocId,
      storagePath,
      publicUrl,
      width: upload.width,
      height: upload.height,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      uploadedByUid: actor.uid || "",
      uploadedByEmail: actor.email || "",
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (normalizeKey(type) === "graphics" && !uploadImageUrl) {
    const sourceUrl = normalizeText(body?.driveLink || body?.assetLinkUrl || body?.imageUrl || body?.url);
    const currentImageUrl = normalizeText(existing.imageUrl || "");
    const shouldIngestRemoteGraphic = !!sourceUrl && (!currentImageUrl || isGoogleDriveFileUrl(currentImageUrl));
    if (shouldIngestRemoteGraphic) {
      const remoteUpload = await fetchRemoteMediaResponse(sourceUrl, UPLOAD_RULES.libraryGraphic, body);
      const storagePath = `content-library/graphics/${normalizeKey(pendingDocId)}/${Date.now()}.${remoteUpload.extension}`;
      const streamedUpload = await streamRemoteMediaToStorage({
        sourceUrl,
        storagePath,
        rules: UPLOAD_RULES.libraryGraphic,
        body,
        remoteMedia: remoteUpload,
      });
      uploadImageUrl = streamedUpload.publicUrl;

      const assetRef = db.collection(COLLECTIONS.contentAssets).doc();
      await assetRef.set({
        assetType: "library_graphic",
        imageId: pendingDocId,
        contentCollection: collection,
        contentDocId: pendingDocId,
        storagePath: streamedUpload.storagePath,
        publicUrl: streamedUpload.publicUrl,
        fileSize: streamedUpload.fileSize,
        mimeType: streamedUpload.mimeType,
        originalFileName: streamedUpload.fileName,
        sourceUrl,
        sourceFinalUrl: streamedUpload.finalUrl,
        uploadedByUid: actor.uid || "",
        uploadedByEmail: actor.email || "",
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  let uploadMediaUrl = normalizeText(existing.videoUrl || existing.url);
  if (normalizeKey(type) === "videos" && normalizeText(body?.imageType || "VV").toUpperCase() !== "YT") {
    const requestedMode = normalizeKey(body?.storageMode || body?.mediaStorageMode || "");
    const shouldIngestRemoteMedia = requestedMode !== "external";
    const sourceUrl = normalizeText(body?.driveLink || body?.url || body?.videoUrl);
    const needsHostedMedia = !normalizeText(body?.videoUrl) && (!uploadMediaUrl || isGoogleDriveFileUrl(uploadMediaUrl));
    if (shouldIngestRemoteMedia && sourceUrl && needsHostedMedia) {
      const remoteUpload = await fetchRemoteMediaResponse(sourceUrl, UPLOAD_RULES.libraryVideo, body);
      const storagePath = `content-library/videos/${normalizeKey(pendingDocId)}/${Date.now()}.${remoteUpload.extension}`;
      const streamedUpload = await streamRemoteMediaToStorage({
        sourceUrl,
        storagePath,
        rules: UPLOAD_RULES.libraryVideo,
        body,
        remoteMedia: remoteUpload,
      });
      uploadMediaUrl = streamedUpload.publicUrl;

      const assetRef = db.collection(COLLECTIONS.contentAssets).doc();
      await assetRef.set({
        assetType: "library_video",
        imageId: pendingDocId,
        contentCollection: collection,
        contentDocId: pendingDocId,
        storagePath: streamedUpload.storagePath,
        publicUrl: streamedUpload.publicUrl,
        fileSize: streamedUpload.fileSize,
        mimeType: streamedUpload.mimeType,
        originalFileName: streamedUpload.fileName,
        sourceUrl,
        sourceFinalUrl: streamedUpload.finalUrl,
        uploadedByUid: actor.uid || "",
        uploadedByEmail: actor.email || "",
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  const existingImageUrl = normalizeText(existing.imageUrl || "");
  const shouldPreserveHostedGraphicUrl = normalizeKey(type) === "graphics"
    && !uploadImageUrl
    && !!existingImageUrl
    && !isGoogleDriveFileUrl(existingImageUrl);
  const imageUrlForPayload = shouldPreserveHostedGraphicUrl
    ? existingImageUrl
    : normalizeText(uploadImageUrl || body.imageUrl);

  const built = buildContentDocPayload(type, body, {
    imageUrl: imageUrlForPayload,
    mediaUrl: uploadMediaUrl,
    updatedBy: actor.uid || "",
  });
  await ref.set({
    ...existing,
    ...built.payload,
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
  }, { merge: true });

  const saved = await ref.get();
  return {
    ok: true,
    item: mapAdminContentDoc(collection, saved),
    created: !snap.exists,
  };
}

async function previewContentLibraryItem(type, body = {}) {
  const collection = collectionForContentType(type);
  if (!collection) {
    const err = new Error("invalid_content_type");
    err.status = 400;
    throw err;
  }

  const built = buildContentDocPayload(type, body, {});
  const ref = db.collection(collection).doc(built.docId);
  const snap = await ref.get();
  return {
    ok: true,
    id: built.docId,
    collection,
    action: snap.exists ? "update" : "create",
    title: normalizeText(body.title || body.poem || ""),
    author: normalizeText(body.author),
    imageType: normalizeText(body.imageType || built.payload.imageType || ""),
  };
}

function pickProfileContent(profile, allContent, ratings) {
  const authorKeys = new Set(
    uniq([profile.displayName, ...(profile.authorNameVariants || [])]).map(normalizeKey)
  );
  const claimedKeys = new Set((profile.claimedContentIds || []).map(normalizeKey));
  const authored = allContent.filter((item) => authorKeys.has(normalizeKey(item.author)) || claimedKeys.has(normalizeKey(item.imageId)));
  const byId = new Map(authored.map((item) => [normalizeKey(item.imageId), item]));
  const featured = (profile.featuredContentIds || [])
    .map((id) => byId.get(normalizeKey(id)))
    .filter(Boolean);

  const fallback = authored
    .slice()
    .sort((a, b) => {
      const ra = ratings[a.imageId] || { rating: -Infinity, total: 0 };
      const rb = ratings[b.imageId] || { rating: -Infinity, total: 0 };
      if (rb.rating !== ra.rating) return rb.rating - ra.rating;
      if (rb.total !== ra.total) return rb.total - ra.total;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 12);

  return {
    authored,
    featured: featured.length ? featured : fallback,
  };
}

async function getUserRecord(uid) {
  const snap = await db.collection(COLLECTIONS.users).doc(uid).get();
  return snap.exists ? snap.data() || {} : null;
}

async function ensureUserRecord(decoded) {
  const ref = db.collection(COLLECTIONS.users).doc(decoded.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const payload = {
      email: decoded.email || "",
      displayName: decoded.name || decoded.email || "",
      roles: resolveRoles([], decoded.email),
      createdAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
      status: "active",
    };
    await ref.set(payload, { merge: true });
    const saved = await ref.get();
    return saved.data() || payload;
  }
  const existing = snap.data() || {};
  await ref.set(
    {
      email: decoded.email || existing.email || "",
      displayName: decoded.name || existing.displayName || decoded.email || "",
      lastLoginAt: FieldValue.serverTimestamp(),
      status: existing.status || "active",
      roles: resolveRoles(existing.roles, decoded.email || existing.email || ""),
    },
    { merge: true }
  );
  const saved = await ref.get();
  return saved.data() || existing;
}

async function syncUserRecordFromAuthUser(authUser) {
  const ref = db.collection(COLLECTIONS.users).doc(authUser.uid);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : {};
  const payload = {
    email: authUser.email || existing.email || "",
    displayName: authUser.displayName || existing.displayName || authUser.email || authUser.uid,
    status: authUser.disabled ? "disabled" : (existing.status || "active"),
    roles: resolveRoles(existing.roles, authUser.email || existing.email || ""),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();
  await ref.set(payload, { merge: true });
  const saved = await ref.get();
  return { uid: authUser.uid, ...(saved.data() || payload) };
}

async function listAllAuthUsers(limit = 1000) {
  const users = [];
  let pageToken;
  do {
    const batchSize = Math.min(1000, limit - users.length);
    if (batchSize <= 0) break;
    const page = await auth.listUsers(batchSize, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken && users.length < limit);
  return users;
}


async function getVoteCountsByUserId() {
  const counts = new Map();
  let page = await db.collection(COLLECTIONS.votes).limit(1000).get();
  while (!page.empty) {
    page.forEach((doc) => {
      const data = doc.data() || {};
      const key = normalizeKey(data.userId || "");
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const last = page.docs[page.docs.length - 1];
    page = await db.collection(COLLECTIONS.votes).startAfter(last).limit(1000).get();
  }
  return counts;
}

async function getVoteStatsByUserId() {
  const stats = new Map();
  let page = await db.collection(COLLECTIONS.votes).limit(1000).get();
  while (!page.empty) {
    page.forEach((doc) => {
      const data = doc.data() || {};
      const key = normalizeKey(data.userId || "");
      if (!key) return;
      const current = stats.get(key) || { count: 0, lastActivityAt: null };
      current.count += 1;
      const ts = data.timestamp || null;
      const currentSeconds = current.lastActivityAt?._seconds || 0;
      const nextSeconds = ts?._seconds || 0;
      if (nextSeconds > currentSeconds) current.lastActivityAt = ts;
      stats.set(key, current);
    });
    const last = page.docs[page.docs.length - 1];
    page = await db.collection(COLLECTIONS.votes).startAfter(last).limit(1000).get();
  }
  return stats;
}


async function getFlaggedContentIds() {
  const ids = new Set();
  let page = await db.collection(COLLECTIONS.contentFlags).where("status", "==", "pending").limit(1000).get();
  while (!page.empty) {
    page.forEach((doc) => {
      const data = doc.data() || {};
      const imageId = normalizeKey(data.imageId || "");
      if (imageId) ids.add(imageId);
    });
    const last = page.docs[page.docs.length - 1];
    page = await db.collection(COLLECTIONS.contentFlags).where("status", "==", "pending").startAfter(last).limit(1000).get();
  }
  return ids;
}

function excludeFlaggedContent(items, flaggedIds) {
  return (items || []).filter((item) => !flaggedIds.has(normalizeKey(item.imageId || item.id || "")));
}

async function requireDecodedUser(req, res) {
  const decoded = await verifyIdTokenFromHeader(req);
  if (!decoded?.uid || !decoded?.email) {
    res.status(401).json({ error: "auth" });
    return null;
  }
  const userRecord = await ensureUserRecord(decoded);
  return { decoded, userRecord };
}

async function requireRole(req, res, roles) {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return null;
  const currentRoles = Array.isArray(ctx.userRecord?.roles) ? ctx.userRecord.roles : [];
  if (!roles.some((role) => currentRoles.includes(role))) {
    res.status(403).json({ error: "forbidden", requiredRoles: roles });
    return null;
  }
  return ctx;
}

async function requirePigReadAccess(req, res) {
  if (hasValidPoetryPleaseApiKey(req)) {
    return {
      machine: true,
      userRecord: {
        roles: ["team"],
        email: "machine:pig",
      },
    };
  }
  return requireRole(req, res, ["team", "admin"]);
}

/** ====== ROOT + HEALTH ====== */
app.get("/", (_req, res) => {
  res.type("text/plain").send("Poetry Please API is alive ✅  Try /imageTypes etc.");
});

/** ====== ROUTE REGISTRATION (supports both with and without /api) ====== */
const getBoth = (p) => [p, `/api${p}`];

app.get(getBoth("/healthz"), (_req, res) => res.json({ ok: true }));

// imageTypes
app.get(getBoth("/imageTypes"), async (_req, res) => {
  const [allContent, flaggedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  const imageTypes = [...new Set(all.map((i) => i.imageType).filter(Boolean))].sort();
  res.json(imageTypes);
});

// releaseCatalogs
app.get(getBoth("/releaseCatalogs"), async (_req, res) => {
  const [allContent, flaggedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  const cats = [...new Set(all.map((i) => i.releaseCatalog).filter(Boolean))].sort();
  res.json(cats);
});

app.get(getBoth("/books"), async (_req, res) => {
  const [allContent, flaggedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  const books = [...new Set(all.map((i) => i.book).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json(books);
});

// ratingsSummary
app.get(getBoth("/ratingsSummary"), async (_req, res) => {
  const votesSnap = await getAllVotes();
  const compact = votesSnap.map((v) => ({ imageId: v.imageId, voteType: v.voteType }));
  res.json(aggregateRatings(compact));
});

app.post(getBoth("/bootstrap"), async (req, res) => {
  const decoded = await verifyIdTokenFromHeader(req);
  const anonId = normalizeText(req.body?.anonId);
  const userId = decoded?.email || anonId;
  if (!userId) return res.status(400).json({ error: "missing_user_context" });

  const limit = Math.max(10, Math.min(Number(req.body?.limit) || 20, 120));
  const includeRatingsSummary = req.body?.includeRatingsSummary !== false;

  const tasks = [
    getAllContentCached(),
    getFlaggedContentIds(),
    getUniqueVotedImageIdsByUser(userId),
  ];

  if (includeRatingsSummary) {
    tasks.push(
      getAllVotes().then((votes) =>
        aggregateRatings(votes.map((vote) => ({ imageId: vote.imageId, voteType: vote.voteType })))
      )
    );
  }

  const [allContent, flaggedIds, votedIds, ratingsSummary = null] = await Promise.all(tasks);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  res.json(buildFeedPayload({ all, votedIds, limit, includeDomainMeta: false, ratingsSummary }));
});

app.post(getBoth("/fetchFiltered"), async (req, res) => {
  const decoded = await verifyIdTokenFromHeader(req);
  const anonId = normalizeText(req.body?.anonId);
  const userId = decoded?.email || anonId;
  if (!userId) return res.status(400).json({ error: "missing_user_context" });

  const filters = {
    type: normalizeText(req.body?.type),
    catalog: normalizeText(req.body?.catalog),
    author: normalizeText(req.body?.author),
    book: normalizeText(req.body?.book),
  };
  const limit = Math.max(10, Math.min(Number(req.body?.limit) || 500, 5000));

  const [allContent, flaggedIds, votedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
    getUniqueVotedImageIdsByUser(userId),
  ]);

  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  const filteredAll = filterContentByFeedFilters(all, filters);
  const filteredNew = filteredAll.filter((o) => !votedIds.has((o.imageId || "").trim().toLowerCase()));

  res.json({
    allGraphics: filteredAll.map(mapToCounterArr),
    newGraphics: sampleItems(filteredNew, limit).map(mapToArr),
    totalImages: all.length,
    votedImagesCount: votedIds.size,
    remainingImagesCount: filteredNew.length,
    domainTotalImages: filteredAll.length,
    domainVotedImagesCount: Math.max(filteredAll.length - filteredNew.length, 0),
    domainRemainingImagesCount: filteredNew.length,
    releaseCatalogs: [...new Set(all.map((o) => o.releaseCatalog).filter(Boolean))].sort(),
    imageTypes: [...new Set(all.map((o) => o.imageType).filter(Boolean))].sort(),
  });
});

app.get(getBoth("/contentById"), async (req, res) => {
  const targetId = normalizeText(req.query?.id);
  if (!targetId) return res.status(400).json({ error: "missing_id" });

  const [allContent, flaggedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  const normalizedTarget = normalizeKey(targetId);
  const item = all.find((entry) =>
    normalizeKey(entry.imageId) === normalizedTarget || normalizeKey(entry.contentId) === normalizedTarget
  );

  if (!item) return res.status(404).json({ error: "not_found" });

  res.json({
    item: mapToArr(item),
    imageId: item.imageId || "",
    contentId: item.contentId || "",
  });
});

app.get(getBoth("/scoreboard/textPreview"), async (req, res) => {
  const targetId = normalizeText(req.query?.id);
  if (!targetId) return res.status(400).send("Missing content id.");

  const [allContent, flaggedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  const normalizedTarget = normalizeKey(targetId);
  const item = all.find((entry) =>
    normalizeKey(entry.imageId) === normalizedTarget || normalizeKey(entry.contentId) === normalizedTarget
  );

  if (!item) return res.status(404).send("Content not found.");
  if (!normalizeText(item.excerpt || item.text)) return res.status(404).send("No text preview is available for this item.");

  res.type("html").send(renderScoreboardTextPreviewPage(item));
});

// scoreboard
app.get(getBoth("/scoreboard"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;
  const result = await getScoreboardPayloadFromSnapshot();
  if (normalizeText(req.query?.paged) === "1") {
    const pageSize = Math.max(1, Math.min(Number(req.query?.pageSize) || 25, 100));
    const page = Math.max(1, Number(req.query?.page) || 1);
    const rows = sortScoreboardRows(
      applyScoreboardQuery(result.payload, req.query),
      normalizeText(req.query?.sortKey || "bookTitle"),
      Number(req.query?.sortDir || 1)
    );
    const start = (page - 1) * pageSize;
    return res.json({
      ok: true,
      aggregated: rows.slice(start, start + pageSize),
      totalRows: rows.length,
      page,
      pageSize,
      filterOptions: buildScoreboardFilterOptions(result.payload),
      snapshotMeta: {
        source: result.source,
        builtAtMs: result.builtAtMs,
        ttlMs: SCOREBOARD_SNAPSHOT_TTL_MS,
      },
    });
  }
  res.json({
    ...result.payload,
    snapshotMeta: {
      source: result.source,
      builtAtMs: result.builtAtMs,
      ttlMs: SCOREBOARD_SNAPSHOT_TTL_MS,
    },
  });
});

app.get(getBoth("/scoreboard/bootstrap"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;
  const payload = await getScoreboardBootstrapPayload();
  res.json(payload);
});

app.get(getBoth("/pig/ranked-texts"), async (req, res) => {
  const ctx = await requirePigReadAccess(req, res);
  if (!ctx) return;
  const limit = Math.max(1, Math.min(Number(req.query?.limit) || 100, 500));
  const minScore = Math.max(0, Number(req.query?.minScore) || 1);
  const minVotes = Math.max(0, Number(req.query?.minVotes) || 1);
  const types = normalizeText(req.query?.types || "EXC,FP")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const payload = await buildRankedTextsPayload({ limit, minScore, minVotes, types });
  res.json(payload);
});

app.post(getBoth("/admin/scoreboard/refresh"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;
  const result = await getScoreboardPayloadFromSnapshot({ forceRefresh: true });
  res.json({
    ok: true,
    source: result.source,
    builtAtMs: result.builtAtMs,
    aggregatedCount: Array.isArray(result.payload?.aggregated) ? result.payload.aggregated.length : 0,
    rawVotesCount: Array.isArray(result.payload?.rawVotes) ? result.payload.rawVotes.length : 0,
  });
});

app.post(getBoth("/scoreboard/exportSheet"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;

  const isUserView = !!req.body?.isUserView;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "no_rows" });

  const headers = isUserView
    ? ["imageId", "author", "poemTitle", "bookTitle", "type", "fileLink", "cloudLink", "driveLink", "sourceFolderLink", "sourceFileName", "excerpt", "vote"]
    : ["imageId", "author", "poemTitle", "bookTitle", "type", "fileLink", "cloudLink", "driveLink", "sourceFolderLink", "sourceFileName", "excerpt", "likes", "dislikes", "meh", "movedMe", "totalVotes", "score"];

  const normalizedRows = rows.map((row) =>
    headers.map((key) => {
      const rawValue = key === "fileLink" ? (row?.driveLink || row?.fileLink || row?.cloudLink) : row?.[key];
      return typeof rawValue === "string" ? rawValue : rawValue == null ? "" : String(rawValue);
    })
  );

  const titleDate = new Date().toISOString().slice(0, 10);
  const title = `Poetry Please Scoreboard ${titleDate}`;
  try {
    const sheet = await createGoogleSheet({
      title,
      headers,
      rows: normalizedRows,
      shareWithEmail: normalizeText(ctx.decoded.email).toLowerCase(),
    });
    res.json({ ok: true, ...sheet });
  } catch (err) {
    console.error("Scoreboard exportSheet failed", err);
    res.status(err.status || 500).json({ error: "sheet_export_failed", message: err.message });
  }
});

// fetchData (auth)
app.post(getBoth("/fetchData"), async (req, res) => {
  const decoded = await verifyIdTokenFromHeader(req);
  if (!decoded?.email) return res.status(401).json({ error: "auth" });
  const includeDomainMeta = req.body?.includeDomainMeta !== false;
  const maxLimit = includeDomainMeta ? 5000 : 120;
  const limit = Math.max(10, Math.min(Number(req.body?.limit) || 20, maxLimit));

  const [allContent, flaggedIds, votedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
    getUniqueVotedImageIdsByUser(decoded.email),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  res.json(buildFeedPayload({ all, votedIds, limit, includeDomainMeta }));
});

// fetchDataAnon
app.post(getBoth("/fetchDataAnon"), async (req, res) => {
  const anonId = (req.body?.anonId || "").trim();
  if (!anonId) return res.status(400).json({ error: "missing anonId" });
  const includeDomainMeta = req.body?.includeDomainMeta !== false;
  const maxLimit = includeDomainMeta ? 5000 : 120;
  const limit = Math.max(10, Math.min(Number(req.body?.limit) || 20, maxLimit));

  const [allContent, flaggedIds, votedIds] = await Promise.all([
    getAllContentCached(),
    getFlaggedContentIds(),
    getUniqueVotedImageIdsByUser(anonId),
  ]);
  const all = excludeBrokenContent(excludeFlaggedContent(allContent, flaggedIds));
  res.json(buildFeedPayload({ all, votedIds, limit, includeDomainMeta }));
});

// submitVote
app.post(getBoth("/submitVote"), async (req, res) => {
  const { imageId, voteType, userId } = req.body || {};
  if (!imageId || !voteType || !userId) return res.status(400).json({ error: "bad request" });
  await db.collection(COLLECTIONS.votes).add({
    imageId,
    voteType,
    userId,
    timestamp: FieldValue.serverTimestamp(),
  });
  res.json({ ok: true });
});

// nextAnonymousId
app.post(getBoth("/nextAnonymousId"), async (_req, res) => {
  const ref = db.collection("admin").doc("anonCounter");
  let next = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap.exists && snap.data().count) || 0;
    next = cur + 1;
    tx.set(ref, { count: next });
  });
  res.json({ anonId: `poetrylover${next}` });
});

app.post(getBoth("/vote"), async (req, res) => {
  try {
    const { imageId, voteType, userId } = req.body;

    if (!imageId || !voteType || !userId) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const vote = {
      imageId,
      voteType,
      userId,
      timestamp: FieldValue.serverTimestamp(),
    };

    await db.collection(COLLECTIONS.votes).add(vote);
    res.status(204).end(); // success
  } catch (err) {
    console.error("Vote error:", err);
    res.status(500).json({ error: "internal", message: err.message });
  }
});

app.get(getBoth("/me"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;
  const fresh = (await getUserRecord(ctx.decoded.uid)) || ctx.userRecord || {};
  res.json({
    uid: ctx.decoded.uid,
    email: ctx.decoded.email || "",
    displayName: ctx.decoded.name || fresh.displayName || "",
    roles: Array.isArray(fresh.roles) ? fresh.roles : ["user"],
    authorProfileId: fresh.authorProfileId || null,
  });
});

app.post(getBoth("/me/scrubRecentMeh"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;
  const userId = normalizeText(ctx.decoded.email || "");
  if (!userId) {
    return res.status(400).json({ error: "missing_email" });
  }
  const hours = Math.max(1, Math.min(168, Number(req.body?.hours || 24) || 24));
  const cutoffMs = Date.now() - (hours * 60 * 60 * 1000);
  const voteDocs = await getVoteDocsByUser(userId);
  const refsToDelete = voteDocs
    .filter((vote) => vote.voteType === "meh" && timestampToMs(vote.timestamp) >= cutoffMs)
    .map((vote) => vote.ref);

  let deleted = 0;
  for (let i = 0; i < refsToDelete.length; i += 400) {
    const chunk = refsToDelete.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }

  if (deleted) {
    await invalidateScoreboardSnapshot("scrub_recent_meh");
  }

  res.json({ ok: true, deleted, hours });
});

app.post(getBoth("/mergeAnonVotes"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;

  const anonId = normalizeText(req.body?.anonId);
  if (!anonId) return res.status(400).json({ error: "missing_anon_id" });

  const targetUserId = normalizeText(ctx.decoded.email).toLowerCase();
  if (!targetUserId) return res.status(400).json({ error: "missing_target_user" });
  if (normalizeText(anonId).toLowerCase() === targetUserId) {
    return res.json({ ok: true, mergedVotes: 0, deletedVotes: 0 });
  }

  const [anonVotes, existingVotes] = await Promise.all([
    getVoteDocsByUser(anonId),
    getVoteDocsByUser(targetUserId),
  ]);

  const latestFor = (votes) => {
    const map = new Map();
    votes.forEach((vote) => {
      const key = normalizeKey(vote.imageId || "");
      if (!key) return;
      const prev = map.get(key);
      const prevMs = prev?.timestamp?.toMillis ? prev.timestamp.toMillis() : 0;
      const curMs = vote?.timestamp?.toMillis ? vote.timestamp.toMillis() : 0;
      if (!prev || curMs >= prevMs) map.set(key, vote);
    });
    return map;
  };

  const latestAnon = latestFor(anonVotes);
  const latestExisting = latestFor(existingVotes);

  let mergedVotes = 0;
  let deletedVotes = 0;
  const writes = [];

  latestAnon.forEach((anonVote, key) => {
    const existingVote = latestExisting.get(key);
    const anonMs = anonVote?.timestamp?.toMillis ? anonVote.timestamp.toMillis() : 0;
    const existingMs = existingVote?.timestamp?.toMillis ? existingVote.timestamp.toMillis() : 0;
    if (!existingVote || anonMs >= existingMs) {
      writes.push(
        db.collection(COLLECTIONS.votes).add({
          imageId: anonVote.imageId,
          voteType: anonVote.voteType,
          userId: targetUserId,
          timestamp: anonVote.timestamp || FieldValue.serverTimestamp(),
        })
      );
      mergedVotes += 1;
    }
  });

  anonVotes.forEach((voteDoc) => {
    writes.push(voteDoc.ref.delete());
    deletedVotes += 1;
  });

  await Promise.all(writes);
  res.json({ ok: true, mergedVotes, deletedVotes });
});

app.get(getBoth("/authorProfiles/:slug"), async (req, res) => {
  const slug = slugify(req.params.slug || "");
  if (!slug) return res.status(400).json({ error: "missing_slug" });

  const snap = await db
    .collection(COLLECTIONS.authorProfiles)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return res.status(404).json({ error: "not_found" });

  const profile = mapProfileDoc(snap.docs[0].id, snap.docs[0].data());
  if (!profile.published) return res.status(404).json({ error: "not_found" });

  const [g, e, fp, v, votes] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.fullPoems),
    getAllFrom(COLLECTIONS.videos),
    getAllFrom(COLLECTIONS.votes),
  ]);
  const ratings = aggregateRatings(votes.map((vote) => ({ imageId: vote.imageId, voteType: vote.voteType })));
  const allContent = [...g, ...e, ...fp, ...v];
  const { authored, featured } = pickProfileContent(profile, allContent, ratings);

  res.json({
    profile,
    stats: {
      authoredCount: authored.length,
      featuredCount: featured.length,
      featuredFallback: !(profile.featuredContentIds || []).length,
    },
    featuredContent: featured,
    authoredContent: authored,
  });
});

app.get(getBoth("/my/authorProfile"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;
  const userRecord = (await getUserRecord(ctx.decoded.uid)) || ctx.userRecord || {};
  if (!userRecord.authorProfileId) return res.json({ profile: null });

  const snap = await db.collection(COLLECTIONS.authorProfiles).doc(userRecord.authorProfileId).get();
  if (!snap.exists) return res.json({ profile: null });
  res.json({ profile: mapProfileDoc(snap.id, snap.data()) });
});

app.get(getBoth("/my/submissions"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentSubmissions)
    .where("submitterUid", "==", ctx.decoded.uid)
    .limit(250)
    .get();
  const submissions = snap.docs
    .map(mapSubmissionDoc)
    .sort((a, b) => (normalizeTimestamp(b.createdAt)?.getTime() || 0) - (normalizeTimestamp(a.createdAt)?.getTime() || 0))
    .map((row) => ({
      ...row,
      hasNewPositiveResponse: hasNewPositiveResponse(row),
    }));
  const newPositiveResponses = submissions.filter((row) => row.hasNewPositiveResponse).length;
  res.json({ submissions, newPositiveResponses });
});

app.post(getBoth("/my/submissions/markPositiveResponsesSeen"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentSubmissions)
    .where("submitterUid", "==", ctx.decoded.uid)
    .limit(250)
    .get();

  await Promise.all(snap.docs.map((doc) => {
    const data = mapSubmissionDoc(doc);
    if (!hasNewPositiveResponse(data)) return Promise.resolve();
    return doc.ref.set({
      lastSeenPositiveResponseCount: positiveResponseCountForSubmission(data),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }));

  res.json({ ok: true });
});

app.post(getBoth("/submissions"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;

  const submissionType = normalizeKey(req.body?.submissionType);
  const title = normalizeText(req.body?.title || "").slice(0, USER_SUBMISSION_TITLE_MAX);
  const text = normalizeText(req.body?.text || "");
  const note = normalizeText(req.body?.note || "");

  if (!["text", "image"].includes(submissionType)) {
    return res.status(400).json({ error: "invalid_submission_type" });
  }
  if (!title) return res.status(400).json({ error: "missing_title" });

  let payload = {
    submissionType,
    title,
    releaseCatalog: USER_SUBMISSION_CATALOG,
    status: "pending",
    reviewNote: "",
    submitterUid: ctx.decoded.uid,
    submitterEmail: ctx.decoded.email,
    submitterDisplayName: normalizeText(ctx.decoded.name || ctx.userRecord?.displayName || ctx.decoded.email),
    positiveResponseCount: 0,
    lastSeenPositiveResponseCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (submissionType === "text") {
    if (!text) return res.status(400).json({ error: "missing_text" });
    if (text.length > USER_SUBMISSION_TEXT_MAX) {
      return res.status(400).json({ error: "text_too_long", maxChars: USER_SUBMISSION_TEXT_MAX });
    }
    payload.text = text;
  } else {
    if (note.length > USER_SUBMISSION_IMAGE_NOTE_MAX) {
      return res.status(400).json({ error: "note_too_long", maxChars: USER_SUBMISSION_IMAGE_NOTE_MAX });
    }
    let upload;
    try {
      upload = parseBase64Upload(req.body, UPLOAD_RULES.userSubmissionImage);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "invalid_upload" });
    }
    if (!upload.width || !upload.height) {
      return res.status(400).json({ error: "missing_dimensions" });
    }
    if (upload.width > USER_SUBMISSION_IMAGE_MAX_WIDTH || upload.height > USER_SUBMISSION_IMAGE_MAX_HEIGHT) {
      return res.status(400).json({
        error: "image_dimensions_too_large",
        maxWidth: USER_SUBMISSION_IMAGE_MAX_WIDTH,
        maxHeight: USER_SUBMISSION_IMAGE_MAX_HEIGHT,
      });
    }
    const submissionRef = db.collection(COLLECTIONS.contentSubmissions).doc();
    const storagePath = `user-submissions/${ctx.decoded.uid}/${submissionRef.id}.${upload.extension}`;
    const { publicUrl } = await saveImageUpload({
      storagePath,
      mimeType: upload.mimeType,
      buffer: upload.buffer,
    });
    payload = {
      ...payload,
      note,
      imageUrl: publicUrl,
      imageWidth: upload.width,
      imageHeight: upload.height,
      mimeType: upload.mimeType,
      fileSize: upload.fileSize,
      storagePath,
    };
    await submissionRef.set(payload);
    const saved = await submissionRef.get();
    return res.json({ ok: true, submission: mapSubmissionDoc(saved) });
  }

  const submissionRef = db.collection(COLLECTIONS.contentSubmissions).doc();
  await submissionRef.set(payload);
  const saved = await submissionRef.get();
  res.json({ ok: true, submission: mapSubmissionDoc(saved) });
});

app.get(getBoth("/submissions/approved"), async (req, res) => {
  const decoded = await verifyIdTokenFromHeader(req);
  const userId = decoded?.uid || "";
  const [submissionSnap, responseSnap] = await Promise.all([
    db.collection(COLLECTIONS.contentSubmissions).where("status", "==", "approved").limit(100).get(),
    userId
      ? db.collection(COLLECTIONS.submissionResponses).where("userId", "==", userId).limit(250).get()
      : Promise.resolve({ docs: [] }),
  ]);
  const reactionsBySubmissionId = new Map(
    (responseSnap.docs || []).map((doc) => {
      const data = doc.data() || {};
      return [data.submissionId || "", data.voteType || ""];
    })
  );
  const submissions = submissionSnap.docs
    .map(mapSubmissionDoc)
    .sort((a, b) => (normalizeTimestamp(b.createdAt)?.getTime() || 0) - (normalizeTimestamp(a.createdAt)?.getTime() || 0))
    .map((row) => ({
      ...row,
      currentUserReaction: reactionsBySubmissionId.get(row.id) || "",
    }));
  res.json({ submissions });
});

app.post(getBoth("/submissions/:submissionId/react"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;

  const submissionId = normalizeText(req.params.submissionId);
  const voteType = normalizeKey(req.body?.voteType);
  if (!submissionId) return res.status(400).json({ error: "missing_submission_id" });
  if (!["like", "movedme", "meh", "dislike"].includes(voteType)) {
    return res.status(400).json({ error: "invalid_vote_type" });
  }

  const submissionRef = db.collection(COLLECTIONS.contentSubmissions).doc(submissionId);
  const submissionSnap = await submissionRef.get();
  if (!submissionSnap.exists) return res.status(404).json({ error: "submission_not_found" });
  if (normalizeKey(submissionSnap.data()?.status) !== "approved") {
    return res.status(409).json({ error: "submission_not_approved" });
  }

  const responseId = `${submissionId}__${ctx.decoded.uid}`;
  await db.collection(COLLECTIONS.submissionResponses).doc(responseId).set({
    submissionId,
    userId: ctx.decoded.uid,
    userEmail: ctx.decoded.email || "",
    voteType,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const summary = await recomputeSubmissionResponseSummary(submissionId);
  res.json({ ok: true, summary, voteType });
});


app.get(getBoth("/my/authorProfileEditorData"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  const userRecord = (await getUserRecord(ctx.decoded.uid)) || ctx.userRecord || {};
  const profileId = userRecord.authorProfileId || ctx.decoded.uid;
  const snap = await db.collection(COLLECTIONS.authorProfiles).doc(profileId).get();
  const existingProfile = snap.exists ? mapProfileDoc(snap.id, snap.data()) : null;
  const workingProfile = existingProfile || mapProfileDoc(profileId, {
    displayName: ctx.decoded.name || userRecord.displayName || ctx.decoded.email,
    slug: slugify(ctx.decoded.name || userRecord.displayName || ctx.decoded.email),
    authorNameVariants: uniq([ctx.decoded.name, userRecord.displayName, ctx.decoded.email]),
    featuredContentIds: [],
    published: false,
  });

  const [g, e, fp, v, votes] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.fullPoems),
    getAllFrom(COLLECTIONS.videos),
    getAllFrom(COLLECTIONS.votes),
  ]);
  const ratings = aggregateRatings(votes.map((vote) => ({ imageId: vote.imageId, voteType: vote.voteType })));
  const allContent = [...g, ...e, ...fp, ...v];
  const { authored, featured } = pickProfileContent(workingProfile, allContent, ratings);

  res.json({
    profile: existingProfile,
    workingProfile,
    authoredContent: authored,
    featuredContent: featured,
    stats: {
      authoredCount: authored.length,
      featuredCount: featured.length,
    },
  });
});

app.get(getBoth("/admin/authorReviewPreview"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;

  const author = normalizeText(req.query?.author);
  if (!author) return res.status(400).json({ error: "missing_author" });

  const workingProfile = mapProfileDoc(`preview-${slugify(author)}`, {
    displayName: author,
    slug: slugify(author),
    authorNameVariants: [author],
    featuredContentIds: [],
    published: false,
  });

  const [g, e, fp, v, votes] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.fullPoems),
    getAllFrom(COLLECTIONS.videos),
    getAllFrom(COLLECTIONS.votes),
  ]);
  const ratings = aggregateRatings(votes.map((vote) => ({ imageId: vote.imageId, voteType: vote.voteType })));
  const allContent = [...g, ...e, ...fp, ...v];
  const { authored, featured } = pickProfileContent(workingProfile, allContent, ratings);

  res.json({
    profile: null,
    workingProfile,
    authoredContent: authored,
    featuredContent: featured,
    stats: {
      authoredCount: authored.length,
      featuredCount: featured.length,
    },
    preview: true,
  });
});

app.post(getBoth("/authorProfiles"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  const userRef = db.collection(COLLECTIONS.users).doc(ctx.decoded.uid);
  const latestUser = (await userRef.get()).data() || {};
  const profileId = latestUser.authorProfileId || ctx.userRecord.authorProfileId || ctx.decoded.uid;
  const ref = db.collection(COLLECTIONS.authorProfiles).doc(profileId);
  const existing = (await ref.get()).data() || {};

  const displayName = normalizeText(req.body?.displayName || existing.displayName || ctx.decoded.name || ctx.decoded.email);
  const payload = {
    userId: ctx.decoded.uid,
    email: ctx.decoded.email,
    displayName,
    slug: slugify(req.body?.slug || existing.slug || displayName),
    bio: normalizeText(req.body?.bio || existing.bio),
    shortBio: normalizeText(req.body?.shortBio || existing.shortBio),
    photoUrl: normalizeText(req.body?.photoUrl || existing.photoUrl),
    websiteUrl: normalizeText(req.body?.websiteUrl || existing.websiteUrl),
    instagramUrl: normalizeText(req.body?.instagramUrl || existing.instagramUrl),
    tiktokUrl: normalizeText(req.body?.tiktokUrl || existing.tiktokUrl),
    youtubeUrl: normalizeText(req.body?.youtubeUrl || existing.youtubeUrl),
    newsletterUrl: normalizeText(req.body?.newsletterUrl || existing.newsletterUrl),
    bookstoreUrl: normalizeText(req.body?.bookstoreUrl || existing.bookstoreUrl),
    customLinks: Array.isArray(req.body?.customLinks) ? req.body.customLinks : existing.customLinks || [],
    authorNameVariants: uniq(req.body?.authorNameVariants || existing.authorNameVariants || [displayName]),
    featuredContentIds: uniq(req.body?.featuredContentIds || existing.featuredContentIds || []),
    published: req.body?.published ?? existing.published ?? false,
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(payload, { merge: true });
  await userRef.set(
    {
      authorProfileId: ref.id,
      roles: Array.isArray(latestUser.roles) && latestUser.roles.includes("author")
        ? latestUser.roles
        : [...new Set([...(latestUser.roles || ["user"]), "author"])],
    },
    { merge: true }
  );

  const saved = await ref.get();
  res.json({ ok: true, profile: mapProfileDoc(saved.id, saved.data()) });
});


app.post(getBoth("/authorAssets"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  const assetType = normalizeText(req.body?.assetType || "profile_photo");
  const storagePath = normalizeText(req.body?.storagePath);
  const publicUrl = normalizeText(req.body?.publicUrl);
  if (!storagePath || !publicUrl) {
    return res.status(400).json({ error: "missing_asset_fields" });
  }

  const assetRef = db.collection(COLLECTIONS.authorAssets).doc();
  await assetRef.set({
    ownerUid: ctx.decoded.uid,
    ownerEmail: ctx.decoded.email,
    assetType,
    storagePath,
    publicUrl,
    width: Number(req.body?.width || 0) || null,
    height: Number(req.body?.height || 0) || null,
    fileSize: Number(req.body?.fileSize || 0) || null,
    mimeType: normalizeText(req.body?.mimeType),
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true, assetId: assetRef.id });
});


app.post(getBoth("/authorAssets/uploadPhoto"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  let upload;
  try {
    upload = parseBase64Upload(req.body, UPLOAD_RULES.authorPhoto);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "invalid_upload" });
  }

  const storagePath = `author-profile-images/${ctx.decoded.uid}/${Date.now()}.${upload.extension}`;
  const { publicUrl } = await saveImageUpload({
    storagePath,
    mimeType: upload.mimeType,
    buffer: upload.buffer,
  });
  const assetRef = db.collection(COLLECTIONS.authorAssets).doc();
  await assetRef.set({
    ownerUid: ctx.decoded.uid,
    ownerEmail: ctx.decoded.email,
    assetType: "profile_photo",
    storagePath,
    publicUrl,
    width: upload.width,
    height: upload.height,
    fileSize: upload.fileSize,
    mimeType: upload.mimeType,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true, assetId: assetRef.id, storagePath, publicUrl });
});


app.get(getBoth("/my/contentClaims"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentClaims)
    .where("requesterUid", "==", ctx.decoded.uid)
    .limit(250)
    .get();
  const claims = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
  res.json({ claims });
});

app.get(getBoth("/contentClaims/candidates"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  const queryText = normalizeKey(req.query?.q || "");
  if (!queryText) return res.json({ items: [] });
  const allContent = await getAllContent();
  const items = allContent
    .filter((item) => mapToArr(item).some((value) => normalizeKey(value).includes(queryText)))
    .slice(0, 40);
  res.json({ items });
});

app.post(getBoth("/contentClaims"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "admin"]);
  if (!ctx) return;

  const imageId = normalizeText(req.body?.imageId);
  const note = normalizeText(req.body?.note || "");
  if (!imageId) return res.status(400).json({ error: "missing_image_id" });

  const existing = await db.collection(COLLECTIONS.contentClaims)
    .where("requesterUid", "==", ctx.decoded.uid)
    .where("imageId", "==", imageId)
    .limit(20)
    .get();
  const duplicate = existing.docs.find((doc) => {
    const status = normalizeText(doc.data()?.status || "pending");
    return status === "pending" || status === "approved";
  });
  if (duplicate) return res.status(409).json({ error: "claim_exists", status: duplicate.data()?.status || "pending" });

  const allContent = await getAllContent();
  const item = allContent.find((entry) => normalizeKey(entry.imageId) === normalizeKey(imageId));
  if (!item) return res.status(404).json({ error: "content_not_found" });

  const userRecord = (await getUserRecord(ctx.decoded.uid)) || ctx.userRecord || {};
  const profileId = userRecord.authorProfileId || ctx.decoded.uid;
  const claimRef = db.collection(COLLECTIONS.contentClaims).doc();
  await claimRef.set({
    imageId: item.imageId,
    title: item.title || "",
    author: item.author || "",
    imageType: item.imageType || "",
    releaseCatalog: item.releaseCatalog || "",
    requesterUid: ctx.decoded.uid,
    requesterEmail: ctx.decoded.email,
    profileId,
    note,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true, claimId: claimRef.id });
});


app.post(getBoth("/contentFlags"), async (req, res) => {
  const ctx = await requireRole(req, res, ["author", "team", "admin"]);
  if (!ctx) return;

  const imageId = normalizeText(req.body?.imageId);
  const note = normalizeText(req.body?.note || "");
  if (!imageId) return res.status(400).json({ error: "missing_image_id" });
  if (!note) return res.status(400).json({ error: "missing_note" });

  const allContent = await getAllContent();
  const item = allContent.find((entry) => normalizeKey(entry.imageId) === normalizeKey(imageId));
  if (!item) return res.status(404).json({ error: "content_not_found" });
  const result = await createContentFlagForItem(item, ctx, note);
  if (!result.ok && result.reason === "already_flagged") {
    return res.status(409).json({ error: "content_already_flagged", flag: result.flag });
  }
  await invalidateScoreboardSnapshot(`flag_created:${item.imageId || ""}`);
  res.json({ ok: true, flagId: result.flagId });
});

app.post(getBoth("/admin/contentFlags/batch"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const rawIdentifiers = Array.isArray(req.body?.identifiers) ? req.body.identifiers : [];
  const note = normalizeText(req.body?.note || "");
  if (!note) return res.status(400).json({ error: "missing_note" });

  const identifiers = rawIdentifiers
    .map((value) => normalizeText(value))
    .filter(Boolean);
  if (!identifiers.length) return res.status(400).json({ error: "missing_identifiers" });

  const allContent = await getAllContent();
  const contentById = new Map(allContent.map((entry) => [normalizeKey(entry.imageId), entry]));
  const seen = new Set();
  const results = [];

  for (const rawIdentifier of identifiers) {
    const normalizedIdentifier = normalizeKey(rawIdentifier);
    if (!normalizedIdentifier || seen.has(normalizedIdentifier)) continue;
    seen.add(normalizedIdentifier);

    const item = contentById.get(normalizedIdentifier);
    if (!item) {
      results.push({ identifier: rawIdentifier, status: "not_found" });
      continue;
    }

    const result = await createContentFlagForItem(item, ctx, note, { source: "batch_admin_flag" });
    if (!result.ok && result.reason === "already_flagged") {
      results.push({ identifier: rawIdentifier, imageId: item.imageId, status: "already_flagged", flagId: result.flag?.id || "" });
      continue;
    }
    results.push({ identifier: rawIdentifier, imageId: item.imageId, status: "flagged", flagId: result.flagId });
  }

  if (results.some((entry) => entry.status === "flagged")) {
    await invalidateScoreboardSnapshot("batch_flag_created");
  }
  res.json({
    ok: true,
    processed: results.length,
    flaggedCount: results.filter((entry) => entry.status === "flagged").length,
    alreadyFlaggedCount: results.filter((entry) => entry.status === "already_flagged").length,
    notFoundCount: results.filter((entry) => entry.status === "not_found").length,
    results,
  });
});

app.get(getBoth("/admin/contentFlags"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;

  const allContent = await getAllContent();
  const contentById = new Map(allContent.map((item) => [normalizeKey(item.imageId || ""), item]));
  const snap = await db.collection(COLLECTIONS.contentFlags).limit(250).get();
  const flags = snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      const current = contentById.get(normalizeKey(data.imageId || ""));
      return {
        id: doc.id,
        ...(data || {}),
        currentImageUrl: current?.imageUrl || data.currentImageUrl || "",
        currentTitle: current?.title || data.title || "",
      };
    })
    .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
  res.json({ flags });
});

app.get(getBoth("/admin/contentLibrary"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const type = normalizeKey(req.query?.type || "all");
  const queryText = normalizeKey(req.query?.q || "");
  const collections = [];
  const collectionConfigs = [];
  if (type === "all" || type === "graphics") collections.push(COLLECTIONS.graphics);
  if (type === "all" || type === "excerpts") collections.push(COLLECTIONS.excerpts);
  if (type === "all" || type === "fullpoems" || type === "full-poems") collections.push(COLLECTIONS.fullPoems);
  if (type === "all" || type === "videos" || type === "youtube") collections.push(COLLECTIONS.videos);
  if (!collections.length) return res.status(400).json({ error: "invalid_content_type" });

  collections.forEach((collection) => {
    collectionConfigs.push({
      collection,
      imageType: type === "youtube" && collection === COLLECTIONS.videos ? "YT" : "",
    });
  });

  const searchMode = !!queryText;
  const rows = (await Promise.all(
    collectionConfigs.map(async ({ collection, imageType }) => {
      return getAdminContentDocs(collection, {
        searchMode,
        imageType,
      });
    })
  ))
    .flat()
    .filter((row) => {
      if (!queryText) return true;
      return [
        row.collection,
        row.contentId,
        row.imageType,
        row.author,
        row.title,
        row.book,
        row.channel,
        row.releaseCatalog,
      ].some((value) => normalizeKey(value).includes(queryText));
    })
    .sort((a, b) => {
      const aTime = a.updatedAt?._seconds || a.createdAt?._seconds || 0;
      const bTime = b.updatedAt?._seconds || b.createdAt?._seconds || 0;
      return bTime - aTime;
    });

  const totalCount = searchMode
    ? rows.length
    : (await Promise.all(
      collectionConfigs.map(({ collection, imageType }) => getAdminContentCount(collection, { imageType }))
    )).reduce((sum, count) => sum + Number(count || 0), 0);
  res.json({ items: rows.slice(0, 250), totalCount });
});

app.post(getBoth("/admin/contentLibrary/upsert"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  try {
    const result = await upsertContentLibraryItem(req.body?.type, req.body, {
      uid: ctx.decoded.uid,
      email: ctx.decoded.email,
    });
    invalidateContentCache();
    await invalidateScoreboardSnapshot(`content_upsert:${normalizeKey(result?.item?.id || "")}`);
    res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "invalid_content_payload" });
  }
});

app.post(getBoth("/admin/contentLibrary/bulkPreview"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const type = normalizeKey(req.body?.type);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "missing_items" });

  const results = [];
  for (const item of items.slice(0, 500)) {
    try {
      const result = await previewContentLibraryItem(type, item);
      results.push(result);
    } catch (err) {
      results.push({
        ok: false,
        id: deriveContentDocId(type, item) || "",
        error: err.message || "preview_failed",
      });
    }
  }

  const createCount = results.filter((row) => row.ok && row.action === "create").length;
  const updateCount = results.filter((row) => row.ok && row.action === "update").length;
  const errorCount = results.filter((row) => !row.ok).length;
  res.json({ ok: true, createCount, updateCount, errorCount, results });
});

app.post(getBoth("/admin/contentLibrary/weaverPreview"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  try {
    const sourceUrl = normalizeText(req.body?.sourceUrl);
    const defaultImageType = normalizeText(req.body?.imageType || "QI").toUpperCase();
    const rawPayload = await fetchRemoteJson(sourceUrl);
    const sourceRecords = flattenWeaverGraphicsRecords(rawPayload);
    const eligibleRecords = sourceRecords.filter((record) => shouldImportWeaverGraphicRecord(record));
    const mappedItems = buildWeaverGraphicsImportItems(rawPayload, { defaultImageType });
    const { acceptedItems, duplicateItems } = await buildWeaverGraphicsDuplicatePlan(mappedItems);

    if (!mappedItems.length) {
      return res.status(400).json({ error: "no_importable_weaver_records" });
    }

    const results = [];
    for (const item of acceptedItems.slice(0, 500)) {
      try {
        const result = await previewContentLibraryItem("graphics", item);
        results.push(result);
      } catch (err) {
        results.push({
          ok: false,
          id: deriveContentDocId("graphics", item) || "",
          error: err.message || "preview_failed",
        });
      }
    }

    const createCount = results.filter((row) => row.ok && row.action === "create").length;
    const updateCount = results.filter((row) => row.ok && row.action === "update").length;
    const errorCount = results.filter((row) => !row.ok).length;
    res.json({
      ok: true,
      sourceCount: sourceRecords.length,
      eligibleCount: eligibleRecords.length,
      mappedCount: mappedItems.length,
      duplicateCount: duplicateItems.length,
      createCount,
      updateCount,
      errorCount,
      results,
      items: acceptedItems,
      duplicateItems,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "weaver_preview_failed" });
  }
});

app.post(getBoth("/admin/contentLibrary/bulkUpsert"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const type = normalizeKey(req.body?.type);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "missing_items" });

  const results = [];
  for (const item of items.slice(0, 500)) {
    try {
      const result = await upsertContentLibraryItem(type, item, {
        uid: ctx.decoded.uid,
        email: ctx.decoded.email,
      });
      results.push({ ok: true, id: result.item?.id || "", created: !!result.created });
    } catch (err) {
      results.push({
        ok: false,
        id: deriveContentDocId(type, item) || "",
        error: err.message || "import_failed",
      });
    }
  }

  const createdCount = results.filter((row) => row.ok && row.created).length;
  const updatedCount = results.filter((row) => row.ok && !row.created).length;
  const errorCount = results.filter((row) => !row.ok).length;
  if (createdCount || updatedCount) {
    invalidateContentCache();
    await invalidateScoreboardSnapshot(`content_bulk_upsert:${type}`);
  }
  res.json({ ok: true, createdCount, updatedCount, errorCount, results });
});

async function importWeaverGraphicsPayload(rawPayload, defaultImageType, actor = {}) {
  const sourceRecords = flattenWeaverGraphicsRecords(rawPayload);
  const eligibleRecords = sourceRecords.filter((record) => shouldImportWeaverGraphicRecord(record));
  const mappedItems = buildWeaverGraphicsImportItems(rawPayload, { defaultImageType });
  const { acceptedItems, duplicateItems } = await buildWeaverGraphicsDuplicatePlan(mappedItems);

  if (!mappedItems.length) {
    const err = new Error("no_importable_weaver_records");
    err.status = 400;
    throw err;
  }

  const results = [];
  for (const item of acceptedItems.slice(0, 500)) {
    try {
      const result = await upsertContentLibraryItem("graphics", item, actor);
      results.push({ ok: true, id: result.item?.id || "", created: !!result.created });
    } catch (err) {
      results.push({
        ok: false,
        id: deriveContentDocId("graphics", item) || "",
        error: err.message || "import_failed",
      });
    }
  }

  let capturedDuplicateCount = 0;
  for (const duplicate of duplicateItems.slice(0, 500)) {
    const capture = await createContentDuplicateForItem(duplicate, {
      imageId: duplicate.primaryImageId,
      title: duplicate.primaryTitle,
      author: duplicate.primaryAuthor,
      book: duplicate.primaryBook,
      driveLink: duplicate.primaryDriveLink,
    }, actor, {
      source: "weaver_import",
      duplicateMatchType: duplicate.duplicateMatchType,
      duplicateFingerprint: duplicate.duplicateFingerprint,
      note: "Captured as a duplicate during the Weaver -> Poetry Please import pipeline.",
    });
    if (capture.ok) {
      capturedDuplicateCount += 1;
    }
  }

  const createdCount = results.filter((row) => row.ok && row.created).length;
  const updatedCount = results.filter((row) => row.ok && !row.created).length;
  const errorCount = results.filter((row) => !row.ok).length;
  if (createdCount || updatedCount) {
    invalidateContentCache();
    await invalidateScoreboardSnapshot("content_weaver_import:graphics");
  }

  return {
    ok: true,
    sourceCount: sourceRecords.length,
    eligibleCount: eligibleRecords.length,
    mappedCount: mappedItems.length,
    duplicateCount: duplicateItems.length,
    capturedDuplicateCount,
    createdCount,
    updatedCount,
    errorCount,
    results,
    duplicateItems,
  };
}

function flattenWeaverExcerptRecords(rawPayload) {
  if (Array.isArray(rawPayload)) return rawPayload;
  if (Array.isArray(rawPayload?.records)) return rawPayload.records;
  if (Array.isArray(rawPayload?.items)) return rawPayload.items;
  if (Array.isArray(rawPayload?.excerpts)) return rawPayload.excerpts;
  return rawPayload && typeof rawPayload === "object" ? [rawPayload] : [];
}

function resolveExcerptBookShortener(item = {}) {
  const explicit = sanitizeDocIdSegment(item.bookShortener);
  if (explicit) return explicit.toUpperCase();
  const match = resolveCatalogBookRecord({ author: item.author, book: item.book });
  return sanitizeDocIdSegment(match?.bookShortener || "").toUpperCase();
}

function buildWeaverExcerptImportItem(record = {}) {
  const sourceRecordId = normalizeText(record.sourceRecordId || record.excerptHash || record.recordId || record.id || record.ledgerId);
  return {
    imageType: "EXC",
    sourceSystem: normalizeText(record.sourceSystem || "weaver"),
    sourceRecordId,
    excerptHash: normalizeText(record.excerptHash || sourceRecordId),
    sourceUrl: normalizeText(record.sourceUrl || record.weaverUrl || record.url),
    sourceContentId: normalizeText(record.sourceContentId || record.relatedGraphicId || ""),
    author: normalizeText(record.author),
    book: normalizeText(record.book || record.bookTitle),
    title: normalizeText(record.poem || record.poemTitle || record.title),
    poem: normalizeText(record.poem || record.poemTitle || record.title),
    excerpt: normalizeText(record.excerpt || record.excerptText || record.text),
    normalizedExcerpt: normalizeText(record.normalizedExcerpt),
    pageNumber: normalizeText(record.pageNumber),
    bookShortener: normalizeText(record.bookShortener),
    bookLink: normalizeText(record.bookLink),
    releaseCatalog: normalizeText(record.releaseCatalog),
    driveLink: normalizeText(record.driveLink),
    approvedAt: normalizeText(record.approvedAt),
    sourceUpdatedAt: normalizeText(record.updatedAt),
  };
}

function assignCanonicalExcerptIds(items = []) {
  const grouped = new Map();
  items.forEach((item, index) => {
    const bookShortener = resolveExcerptBookShortener(item);
    if (!bookShortener || !item.poem) return;
    const key = `${bookShortener}|${slugify(item.poem)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ item, index, bookShortener });
  });

  grouped.forEach((entries) => {
    entries.forEach(({ item, bookShortener }, idx) => {
      const baseId = `${bookShortener}-EXC-${slugify(item.poem)}`.toUpperCase();
      const docId = entries.length > 1 ? `${baseId}-${idx + 1}` : baseId;
      item.docId = docId;
      item.imageId = docId;
      item.imageID = docId;
      item.bookShortener = bookShortener;
    });
  });
  return items;
}

function isWeaverExcerptImportType(value = "") {
  const normalized = normalizeKey(value);
  return normalized === "exc" || normalized === "excerpt" || normalized === "excerpts";
}

function looksLikeDirectWeaverExcerptPayload(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return !!(
    body.excerpt
    || body.excerptText
    || body.normalizedExcerpt
    || body.excerptHash
    || body.poemTitle
  );
}

async function assignPersistentWeaverExcerptIds(items = []) {
  const usedIds = new Set();
  for (const item of items) {
    if (!item.docId || !item.bookShortener || !item.poem) continue;

    const sourceRecordId = normalizeText(item.sourceRecordId);
    const excerptHash = normalizeText(item.excerptHash);
    const sourceField = sourceRecordId ? "sourceRecordId" : (excerptHash ? "excerptHash" : "");
    const sourceValue = sourceRecordId || excerptHash;
    if (sourceField && sourceValue) {
      const existingBySource = await db.collection(COLLECTIONS.excerpts)
        .where(sourceField, "==", sourceValue)
        .limit(1)
        .get();
      if (!existingBySource.empty) {
        item.docId = existingBySource.docs[0].id;
        item.imageId = item.docId;
        item.imageID = item.docId;
        usedIds.add(item.docId);
        continue;
      }
    }

    const baseId = `${sanitizeDocIdSegment(item.bookShortener)}-EXC-${slugify(item.poem)}`.toUpperCase();
    const requestedId = sanitizeDocIdSegment(item.docId).toUpperCase();
    const suffixMatch = requestedId.match(/-(\d+)$/);
    let nextId = requestedId || baseId;
    let index = suffixMatch ? Number(suffixMatch[1]) : 1;
    while (usedIds.has(nextId) || (await db.collection(COLLECTIONS.excerpts).doc(nextId).get()).exists) {
      index += 1;
      nextId = `${baseId}-${index}`;
    }
    item.docId = nextId;
    item.imageId = nextId;
    item.imageID = nextId;
    usedIds.add(nextId);
  }
  return items;
}

async function importWeaverExcerptsPayload(rawPayload, actor = {}) {
  const sourceRecords = flattenWeaverExcerptRecords(rawPayload);
  const mappedItems = await assignPersistentWeaverExcerptIds(
    assignCanonicalExcerptIds(sourceRecords.map(buildWeaverExcerptImportItem))
  );
  const importableItems = mappedItems.filter((item) => item.docId && item.author && item.book && item.poem && item.excerpt);
  if (!importableItems.length) {
    const err = new Error("no_importable_weaver_excerpt_records");
    err.status = 400;
    throw err;
  }

  const results = [];
  for (const item of importableItems.slice(0, 500)) {
    try {
      const result = await upsertContentLibraryItem("excerpts", item, actor);
      results.push({ ok: true, id: result.item?.id || item.docId, created: !!result.created });
    } catch (err) {
      results.push({
        ok: false,
        id: deriveContentDocId("excerpts", item) || item.docId || "",
        error: err.message || "import_failed",
      });
    }
  }

  const createdCount = results.filter((row) => row.ok && row.created).length;
  const updatedCount = results.filter((row) => row.ok && !row.created).length;
  const errorCount = results.filter((row) => !row.ok).length;
  if (createdCount || updatedCount) {
    invalidateContentCache();
    await invalidateScoreboardSnapshot("content_weaver_import:excerpts");
  }

  return {
    ok: true,
    sourceCount: sourceRecords.length,
    eligibleCount: importableItems.length,
    mappedCount: importableItems.length,
    createdCount,
    updatedCount,
    errorCount,
    results,
  };
}

app.post(getBoth("/admin/contentLibrary/weaverImport"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  try {
    const sourceUrl = normalizeText(req.body?.sourceUrl);
    const defaultImageType = normalizeText(req.body?.imageType || "QI").toUpperCase();
    const rawPayload = await fetchRemoteJson(sourceUrl);
    const result = await importWeaverGraphicsPayload(rawPayload, defaultImageType, {
      uid: ctx.decoded.uid,
      email: ctx.decoded.email,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "weaver_import_failed" });
  }
});

app.post(getBoth("/internal/weaverImport"), async (req, res) => {
  if (!hasValidPoetryPleaseApiKey(req)) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  try {
    const defaultImageType = normalizeText(req.body?.contentType || req.body?.imageType || "QI").toUpperCase();
    const rawPayload = req.body?.payload
      || req.body?.records
      || req.body?.items
      || req.body?.excerpts
      || (normalizeText(req.body?.sourceUrl) ? await fetchRemoteJson(req.body.sourceUrl) : null);
    const payload = rawPayload || (isWeaverExcerptImportType(defaultImageType) && looksLikeDirectWeaverExcerptPayload(req.body) ? req.body : null);
    if (!payload) {
      return res.status(400).json({ error: "missing_weaver_payload" });
    }

    const actor = {
      uid: "weaver-automation",
      email: "weaver-automation@buttonpoetry.com",
    };
    const result = isWeaverExcerptImportType(defaultImageType)
      ? await importWeaverExcerptsPayload(payload, actor)
      : await importWeaverGraphicsPayload(payload, defaultImageType, actor);
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "weaver_import_failed" });
  }
});

app.post(getBoth("/admin/contentLibrary/deleteByIds"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const type = normalizeKey(req.body?.type);
  const collection = collectionForContentType(type);
  const ids = uniq(req.body?.ids || []);
  if (!collection) return res.status(400).json({ error: "invalid_content_type" });
  if (!ids.length) return res.status(400).json({ error: "missing_ids" });

  const deleted = [];
  const missing = [];
  for (const id of ids.slice(0, 500)) {
    const resolved = await resolveContentRefForDelete(collection, id, type);
    if (!resolved?.ref) {
      missing.push(id);
      continue;
    }
    await resolved.ref.delete();
    deleted.push(id);
  }
  if (deleted.length) {
    invalidateContentCache();
    await invalidateScoreboardSnapshot(`content_delete:${type}`);
  }
  res.json({ ok: true, deletedCount: deleted.length, missingCount: missing.length, deleted, missing });
});

app.post(getBoth("/admin/contentLibrary/deleteByDate"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const type = normalizeKey(req.body?.type);
  const collection = collectionForContentType(type);
  const targetDate = normalizeText(req.body?.targetDate);
  if (!collection) return res.status(400).json({ error: "invalid_content_type" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return res.status(400).json({ error: "invalid_target_date" });

  const snap = await db.collection(collection).limit(1000).get();
  const matches = snap.docs.filter((doc) => {
    if (type === "youtube" && normalizeKey(doc.data()?.imageType) !== "yt") return false;
    const createdAt = doc.data()?.createdAt;
    const date = createdAt?.toDate ? createdAt.toDate() : (createdAt ? new Date(createdAt) : null);
    if (!date || Number.isNaN(date.getTime())) return false;
    return date.toISOString().slice(0, 10) === targetDate;
  });

  await Promise.all(matches.map((doc) => doc.ref.delete()));
  if (matches.length) {
    invalidateContentCache();
    await invalidateScoreboardSnapshot(`content_delete_by_date:${type}:${targetDate}`);
  }
  res.json({ ok: true, deletedCount: matches.length, targetDate });
});

app.post(getBoth("/admin/contentFlags/:flagId/review"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;

  const flagId = normalizeText(req.params.flagId);
  const decision = normalizeText(req.body?.decision);
  const note = normalizeText(req.body?.note || "");
  if (!flagId) return res.status(400).json({ error: "missing_flag_id" });
  if (!["approved", "updated"].includes(decision)) return res.status(400).json({ error: "invalid_decision" });

  const flagRef = db.collection(COLLECTIONS.contentFlags).doc(flagId);
  const snap = await flagRef.get();
  if (!snap.exists) return res.status(404).json({ error: "flag_not_found" });
  const flagData = snap.data() || {};

  const matchingFlags = await db.collection(COLLECTIONS.contentFlags)
    .where("imageId", "==", flagData.imageId || "")
    .limit(25)
    .get();
  const targets = matchingFlags.empty ? [flagRef] : matchingFlags.docs.map((doc) => doc.ref);
  const historyEntry = buildFlagHistoryEntry(
    decision === "approved" ? "reapproved" : "marked_updated",
    { uid: ctx.decoded.uid, email: ctx.decoded.email },
    note
  );
  await Promise.all(targets.map((ref) => ref.set({
    status: "resolved",
    resolution: decision,
    reviewNote: note,
    reviewedBy: ctx.decoded.uid,
    reviewedAt: FieldValue.serverTimestamp(),
    moderationHistory: FieldValue.arrayUnion(historyEntry),
  }, { merge: true })));
  await invalidateScoreboardSnapshot(`flag_reviewed:${flagData.imageId || flagId}`);

  const saved = await flagRef.get();
  res.json({ ok: true, flag: { id: saved.id, ...(saved.data() || {}) } });
});

app.post(getBoth("/admin/contentFlags/:flagId/uploadReplacement"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const flagId = normalizeText(req.params.flagId);
  const reviewNote = normalizeText(req.body?.note || "");
  if (!flagId) return res.status(400).json({ error: "missing_flag_id" });

  let upload;
  try {
    upload = parseBase64Upload(req.body, UPLOAD_RULES.replacementImage);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "invalid_upload" });
  }

  const flagRef = db.collection(COLLECTIONS.contentFlags).doc(flagId);
  const flagSnap = await flagRef.get();
  if (!flagSnap.exists) return res.status(404).json({ error: "flag_not_found" });
  const flag = flagSnap.data() || {};
  if ((flag.status || "") !== "pending") return res.status(409).json({ error: "flag_not_pending" });

  const contentRecord = await findContentRecordByImageId(flag.imageId || "");
  if (!contentRecord) return res.status(404).json({ error: "content_not_found" });
  if (contentRecord.collection !== COLLECTIONS.graphics) {
    return res.status(400).json({ error: "replacement_supported_for_graphics_only" });
  }

  const storagePath = `content-replacements/${normalizeKey(flag.imageId || contentRecord.docId)}/${Date.now()}.${upload.extension}`;
  const { publicUrl } = await saveImageUpload({
    storagePath,
    mimeType: upload.mimeType,
    buffer: upload.buffer,
  });
  const assetRef = db.collection(COLLECTIONS.contentAssets).doc();
  await assetRef.set({
    assetType: "replacement_graphic",
    sourceFlagId: flagId,
    imageId: flag.imageId || "",
    contentCollection: contentRecord.collection,
    contentDocId: contentRecord.docId,
    storagePath,
    publicUrl,
    width: upload.width,
    height: upload.height,
    fileSize: upload.fileSize,
    mimeType: upload.mimeType,
    uploadedByUid: ctx.decoded.uid,
    uploadedByEmail: ctx.decoded.email,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection(contentRecord.collection).doc(contentRecord.docId).set({
    imageUrl: publicUrl,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.decoded.uid,
    replacementAssetId: assetRef.id,
  }, { merge: true });

  const matchingFlags = await db.collection(COLLECTIONS.contentFlags)
    .where("imageId", "==", flag.imageId || "")
    .limit(25)
    .get();
  const targets = matchingFlags.empty ? [flagRef] : matchingFlags.docs.map((doc) => doc.ref);
  const historyEntry = buildFlagHistoryEntry(
    "asset_replaced",
    { uid: ctx.decoded.uid, email: ctx.decoded.email },
    reviewNote,
    {
      replacementAssetId: assetRef.id,
      replacementUrl: publicUrl,
    }
  );
  await Promise.all(targets.map((ref) => ref.set({
    status: "resolved",
    resolution: "updated",
    reviewNote,
    replacementAssetId: assetRef.id,
    replacementUrl: publicUrl,
    reviewedBy: ctx.decoded.uid,
    reviewedAt: FieldValue.serverTimestamp(),
    moderationHistory: FieldValue.arrayUnion(historyEntry),
  }, { merge: true })));
  await invalidateScoreboardSnapshot(`flag_replaced:${flag.imageId || flagId}`);

  const saved = await flagRef.get();
  res.json({
    ok: true,
    assetId: assetRef.id,
    publicUrl,
    flag: { id: saved.id, ...(saved.data() || {}) },
  });
});

app.get(getBoth("/admin/contentClaims"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentClaims).limit(250).get();
  const claims = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
  res.json({ claims });
});

app.post(getBoth("/admin/contentClaims/:claimId/review"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const claimId = normalizeText(req.params.claimId);
  const decision = normalizeText(req.body?.decision);
  const note = normalizeText(req.body?.note || "");
  if (!claimId) return res.status(400).json({ error: "missing_claim_id" });
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "invalid_decision" });

  const claimRef = db.collection(COLLECTIONS.contentClaims).doc(claimId);
  const claimSnap = await claimRef.get();
  if (!claimSnap.exists) return res.status(404).json({ error: "claim_not_found" });
  const claim = claimSnap.data() || {};

  await claimRef.set({
    status: decision,
    reviewNote: note,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: ctx.decoded.uid,
  }, { merge: true });

  if (decision === "approved") {
    const profileId = claim.profileId || claim.requesterUid;
    const profileRef = db.collection(COLLECTIONS.authorProfiles).doc(profileId);
    const profileSnap = await profileRef.get();
    const existingProfile = profileSnap.exists ? (profileSnap.data() || {}) : {};
    await profileRef.set({
      userId: existingProfile.userId || claim.requesterUid,
      email: existingProfile.email || claim.requesterEmail,
      displayName: existingProfile.displayName || claim.requesterEmail,
      slug: existingProfile.slug || slugify(existingProfile.displayName || claim.requesterEmail),
      authorNameVariants: uniq(existingProfile.authorNameVariants || []),
      claimedContentIds: uniq([...(existingProfile.claimedContentIds || []), claim.imageId]),
      createdAt: existingProfile.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      published: existingProfile.published ?? false,
    }, { merge: true });

    await db.collection(COLLECTIONS.users).doc(claim.requesterUid).set({
      authorProfileId: profileId,
      roles: resolveRoles([...(Array.isArray(claim.roles) ? claim.roles : ["user", "author"]), "author"], claim.requesterEmail || ""),
    }, { merge: true });
  }

  const saved = await claimRef.get();
  res.json({ ok: true, claim: { id: saved.id, ...(saved.data() || {}) } });
});

app.get(getBoth("/admin/contentDuplicates"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentDuplicates).limit(250).get();
  const duplicates = snap.docs
    .map(mapContentDuplicateDoc)
    .sort((a, b) => (normalizeTimestamp(b.createdAt)?.getTime() || 0) - (normalizeTimestamp(a.createdAt)?.getTime() || 0));
  res.json({ duplicates });
});

app.get(getBoth("/admin/weaverExcHealth"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.excerpts).limit(1000).get();
  const excerpts = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const weaverRows = excerpts.filter((row) => normalizeKey(row.sourceSystem) === "weaver" || normalizeText(row.sourceRecordId || row.excerptHash));
  const missingCatalog = weaverRows.filter((row) => !normalizeText(row.releaseCatalog));
  const duplicateGroups = new Map();
  weaverRows.forEach((row) => {
    const key = normalizeText(row.normalizedExcerpt || row.excerptHash || "").toLowerCase();
    if (!key) return;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), row]);
  });
  const possibleDuplicates = Array.from(duplicateGroups.values())
    .filter((rows) => rows.length > 1)
    .slice(0, 25)
    .map((rows) => ({
      count: rows.length,
      ids: rows.map((row) => row.imageId || row.id).slice(0, 8),
      title: rows[0]?.poem || rows[0]?.title || "",
      book: rows[0]?.book || "",
      author: rows[0]?.author || "",
    }));
  const recent = weaverRows
    .sort((a, b) => (normalizeTimestamp(b.updatedAt)?.getTime() || 0) - (normalizeTimestamp(a.updatedAt)?.getTime() || 0))
    .slice(0, 25)
    .map((row) => ({
      id: row.imageId || row.id,
      title: row.poem || row.title || "",
      author: row.author || "",
      book: row.book || "",
      releaseCatalog: row.releaseCatalog || "",
      sourceRecordId: row.sourceRecordId || "",
      excerptHash: row.excerptHash || "",
      updatedAt: row.updatedAt || null,
    }));
  res.json({
    ok: true,
    checkedCount: excerpts.length,
    weaverExcCount: weaverRows.length,
    missingCatalogCount: missingCatalog.length,
    possibleDuplicateGroupCount: possibleDuplicates.length,
    missingCatalog: missingCatalog.slice(0, 25).map((row) => ({
      id: row.imageId || row.id,
      title: row.poem || row.title || "",
      author: row.author || "",
      book: row.book || "",
      sourceRecordId: row.sourceRecordId || "",
    })),
    possibleDuplicates,
    recent,
  });
});

app.post(getBoth("/admin/contentDuplicates/:duplicateId/review"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const duplicateId = normalizeText(req.params.duplicateId);
  const decision = normalizeKey(req.body?.decision);
  const note = normalizeText(req.body?.note || "");
  if (!duplicateId) return res.status(400).json({ error: "missing_duplicate_id" });
  if (!["confirmed", "dismissed"].includes(decision)) return res.status(400).json({ error: "invalid_decision" });

  const duplicateRef = db.collection(COLLECTIONS.contentDuplicates).doc(duplicateId);
  const snap = await duplicateRef.get();
  if (!snap.exists) return res.status(404).json({ error: "duplicate_not_found" });
  const existing = snap.data() || {};
  if ((existing.status || "pending") !== "pending") return res.status(409).json({ error: "duplicate_not_pending" });

  const historyEntry = buildDuplicateHistoryEntry(
    decision === "confirmed" ? "duplicate_confirmed" : "duplicate_dismissed",
    { uid: ctx.decoded.uid, email: ctx.decoded.email },
    note,
    { reviewDecision: decision }
  );

  await duplicateRef.set({
    status: decision === "confirmed" ? "confirmed_duplicate" : "dismissed",
    reviewDecision: decision,
    reviewNote: note,
    reviewedBy: ctx.decoded.uid,
    reviewedAt: FieldValue.serverTimestamp(),
    moderationHistory: FieldValue.arrayUnion(historyEntry),
  }, { merge: true });

  const saved = await duplicateRef.get();
  res.json({ ok: true, duplicate: mapContentDuplicateDoc(saved) });
});

app.post(getBoth("/authorInvites/create"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const email = normalizeKey(req.body?.email);
  if (!email) return res.status(400).json({ error: "missing_email" });
  const token = randomBytes(24).toString("hex");
  const inviteRef = db.collection(COLLECTIONS.authorInvites).doc();
  const expiresInDays = Math.max(1, Number(req.body?.expiresInDays || 14));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await inviteRef.set({
    email,
    createdBy: ctx.decoded.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    claimedAt: null,
    claimedByUserId: "",
    status: "active",
    tokenHash: sha256(token),
  });

  res.json({
    ok: true,
    inviteId: inviteRef.id,
    inviteUrl: `https://poetryplease.org/app?authorInvite=${token}`,
    email,
    expiresAt: expiresAt.toISOString(),
  });
});

app.post(getBoth("/authorInvites/redeem"), async (req, res) => {
  const ctx = await requireDecodedUser(req, res);
  if (!ctx) return;

  const token = normalizeText(req.body?.token);
  if (!token) return res.status(400).json({ error: "missing_token" });
  const tokenHash = sha256(token);
  const snap = await db
    .collection(COLLECTIONS.authorInvites)
    .where("tokenHash", "==", tokenHash)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (snap.empty) return res.status(404).json({ error: "invite_not_found" });

  const inviteDoc = snap.docs[0];
  const invite = inviteDoc.data() || {};
  const inviteEmail = normalizeKey(invite.email);
  if (inviteEmail !== normalizeKey(ctx.decoded.email)) {
    return res.status(403).json({ error: "email_mismatch", inviteEmail });
  }
  if (invite.expiresAt?.toDate && invite.expiresAt.toDate() < new Date()) {
    return res.status(410).json({ error: "invite_expired" });
  }

  const userRef = db.collection(COLLECTIONS.users).doc(ctx.decoded.uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const profileId = userData.authorProfileId || ctx.decoded.uid;
  const profileRef = db.collection(COLLECTIONS.authorProfiles).doc(profileId);
  const profileSnap = await profileRef.get();
  const displayName = normalizeText(
    profileSnap.data()?.displayName || ctx.decoded.name || userData.displayName || ctx.decoded.email
  );

  await profileRef.set(
    {
      userId: ctx.decoded.uid,
      email: ctx.decoded.email,
      displayName,
      slug: slugify(profileSnap.data()?.slug || displayName),
      authorNameVariants: uniq(profileSnap.data()?.authorNameVariants || [displayName]),
      published: profileSnap.data()?.published ?? false,
      createdAt: profileSnap.data()?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await userRef.set(
    {
      email: ctx.decoded.email,
      displayName,
      authorProfileId: profileRef.id,
      roles: [...new Set([...(userData.roles || ["user"]), "author"])],
      lastLoginAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await inviteDoc.ref.set(
    {
      status: "claimed",
      claimedAt: FieldValue.serverTimestamp(),
      claimedByUserId: ctx.decoded.uid,
    },
    { merge: true }
  );

  const savedProfile = await profileRef.get();
  res.json({ ok: true, profile: mapProfileDoc(savedProfile.id, savedProfile.data()) });
});

app.get(getBoth("/admin/authorProfiles"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.authorProfiles).limit(250).get();
  const profiles = snap.docs
    .map((doc) => mapProfileDoc(doc.id, doc.data()))
    .sort((a, b) => String(a.displayName || a.slug || "").localeCompare(String(b.displayName || b.slug || ""), undefined, { sensitivity: "base" }));
  res.json({ profiles });
});

app.get(getBoth("/admin/contentSubmissions"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentSubmissions).limit(250).get();
  const submissions = snap.docs
    .map(mapSubmissionDoc)
    .sort((a, b) => (normalizeTimestamp(b.createdAt)?.getTime() || 0) - (normalizeTimestamp(a.createdAt)?.getTime() || 0));
  res.json({ submissions });
});

app.post(getBoth("/admin/contentSubmissions/:submissionId/review"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const submissionId = normalizeText(req.params.submissionId);
  const decision = normalizeKey(req.body?.decision);
  const note = normalizeText(req.body?.note || "");
  if (!submissionId) return res.status(400).json({ error: "missing_submission_id" });
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "invalid_decision" });

  const ref = db.collection(COLLECTIONS.contentSubmissions).doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "submission_not_found" });
  const existing = mapSubmissionDoc(snap);

  await ref.set({
    status: decision,
    reviewNote: note,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: ctx.decoded.uid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const saved = await ref.get();
  res.json({ ok: true, submission: mapSubmissionDoc(saved) });
});

function resolveImportAssistantRows(rows = [], defaults = {}, imageType = "QI") {
  return rows.slice(0, 100).map((row, index) => {
    const fileName = normalizeText(row?.fileName || row?.sourceFileName || "");
    const author = normalizeText(row?.author || defaults?.author || "");
    const book = normalizeText(row?.book || defaults?.book || "");
    const title = normalizeText(row?.title || "");
    const driveLink = normalizeText(row?.driveLink || defaults?.driveFolderLink || "");
    const matched = resolveCatalogBookRecord({
      author,
      book,
      bookShortener: row?.bookShortener || defaults?.bookShortener || "",
      fileName,
    });
    const bookShortener = sanitizeDocIdSegment(row?.bookShortener || defaults?.bookShortener || matched?.bookShortener || inferBookShortenerFromFilename(fileName));
    const resolvedTitle = title || fileName.replace(/\.[a-z0-9]+$/i, "").trim();
    const resolvedRow = {
      index,
      fileName,
      driveLink,
      imageType,
      matched: !!matched,
      author: author || matched?.author || "",
      book: book || matched?.title || "",
      bookLink: normalizeText(row?.bookLink || defaults?.bookLink || matched?.bookLink || ""),
      releaseCatalog: normalizeText(row?.releaseCatalog || defaults?.releaseCatalog || matched?.releaseCatalog || ""),
      bookShortener,
      title: resolvedTitle,
      suggestedDocId: bookShortener && resolvedTitle ? `${bookShortener}-${imageType}-${slugify(resolvedTitle)}`.toUpperCase() : "",
      folderLink: normalizeText(defaults?.driveFolderLink || ""),
    };
    resolvedRow.contentItem = {
      docId: resolvedRow.suggestedDocId,
      imageId: resolvedRow.suggestedDocId,
      imageType,
      author: resolvedRow.author,
      book: resolvedRow.book,
      title: resolvedRow.title,
      imageUrl: "",
      driveLink: resolvedRow.driveLink,
      bookLink: resolvedRow.bookLink,
      releaseCatalog: resolvedRow.releaseCatalog,
      misc: [resolvedRow.fileName ? `Import Assistant source file: ${resolvedRow.fileName}` : "", resolvedRow.folderLink ? `Import Assistant folder: ${resolvedRow.folderLink}` : ""].filter(Boolean).join(" · "),
    };
    return resolvedRow;
  });
}

function finalizeImportAssistantGraphicRow(row, remoteMedia = null) {
  const effectiveFileName = normalizeText(row?.fileName || remoteMedia?.fileName || "");
  const effectiveTitle = normalizeText(row?.title || effectiveFileName.replace(/\.[a-z0-9]+$/i, "").trim());
  const effectiveDocId = row?.bookShortener && effectiveTitle
    ? `${row.bookShortener}-${row.imageType}-${slugify(effectiveTitle)}`.toUpperCase()
    : normalizeText(row?.suggestedDocId || "");
  return {
    ...row,
    fileName: effectiveFileName,
    title: effectiveTitle,
    suggestedDocId: effectiveDocId,
    contentItem: {
      ...(row?.contentItem || {}),
      docId: effectiveDocId,
      imageId: effectiveDocId,
      title: effectiveTitle,
      driveLink: normalizeText(row?.driveLink || ""),
      misc: [effectiveFileName ? `Import Assistant source file: ${effectiveFileName}` : "", row?.folderLink ? `Import Assistant folder: ${row.folderLink}` : ""].filter(Boolean).join(" · "),
    },
  };
}

app.post(getBoth("/admin/importAssistant/resolve"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const imageType = normalizeText(req.body?.imageType || "QI") || "QI";
  const resolved = resolveImportAssistantRows(rows, req.body?.defaults || {}, imageType);
  res.json({ resolved });
});

app.post(getBoth("/admin/importAssistant/previewGraphics"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const resolved = resolveImportAssistantRows(rows, req.body?.defaults || {}, "QI");
  const results = [];
  for (const row of resolved) {
    let resolvedRow = finalizeImportAssistantGraphicRow(row);
    let item = resolvedRow.contentItem || {};
    let action = "error";
    let validation = { ok: false, error: "missing_drive_link" };
    try {
      const preview = await previewContentLibraryItem("graphics", item);
      action = preview.action || "create";
    } catch (err) {
      action = "error";
    }
    if (item.driveLink) {
      try {
        const remote = await fetchRemoteMediaResponse(item.driveLink, UPLOAD_RULES.libraryGraphic, item);
        resolvedRow = finalizeImportAssistantGraphicRow(resolvedRow, remote);
        item = resolvedRow.contentItem || item;
        if (action === "error") {
          try {
            const preview = await previewContentLibraryItem("graphics", item);
            action = preview.action || "create";
          } catch (err) {}
        }
        validation = {
          ok: true,
          mimeType: remote.mimeType,
          fileName: remote.fileName,
          width: remote.width,
          height: remote.height,
          fileSize: remote.fileSize,
        };
      } catch (err) {
        validation = { ok: false, error: err.message || "validation_failed" };
      }
    }
    results.push({
      ...resolvedRow,
      action,
      validation,
    });
  }

  const createCount = results.filter((row) => row.action === "create").length;
  const updateCount = results.filter((row) => row.action === "update").length;
  const validCount = results.filter((row) => row.validation?.ok).length;
  const invalidCount = results.length - validCount;
  res.json({ ok: true, rows: results, createCount, updateCount, validCount, invalidCount });
});


app.get(getBoth("/admin/authorInvites"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.authorInvites).limit(250).get();
  const invites = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .map((invite) => {
      const expiresAt = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : (invite.expiresAt || null);
      const claimedAt = invite.claimedAt?.toDate ? invite.claimedAt.toDate() : (invite.claimedAt || null);
      const status = invite.status || ((expiresAt && expiresAt < new Date()) ? 'expired' : 'active');
      return {
        id: invite.id,
        email: invite.email || '',
        status,
        createdBy: invite.createdBy || '',
        createdAt: invite.createdAt || null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        claimedAt: claimedAt ? claimedAt.toISOString() : null,
        claimedByUserId: invite.claimedByUserId || '',
      };
    })
    .sort((a, b) => {
      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return bTime - aTime;
    });

  res.json({ invites });
});

app.get(getBoth("/admin/users"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const queryText = normalizeKey(req.query?.q || "");
  const [authUsers, voteStats] = await Promise.all([
    listAllAuthUsers(1000),
    getVoteStatsByUserId(),
  ]);
  const synced = await Promise.all(authUsers.map((authUser) => syncUserRecordFromAuthUser(authUser)));
  const anonymousRows = [];
  const namedRows = [];

  synced.forEach((row) => {
    if (!normalizeText(row.email)) anonymousRows.push(row);
    else namedRows.push(row);
  });

  const rows = namedRows
    .filter((row) => {
      if (!queryText) return true;
      const haystack = [
        row.email,
        row.displayName,
        ...(Array.isArray(row.roles) ? row.roles : []),
      ].map(normalizeKey);
      return haystack.some((value) => value.includes(queryText));
    })
    .sort((a, b) => normalizeKey(a.email || a.uid).localeCompare(normalizeKey(b.email || b.uid)))
    .map((row) => ({
      uid: row.uid,
      email: row.email || "",
      displayName: row.displayName || "",
      roles: Array.isArray(row.roles) ? row.roles : ["user"],
      status: row.status || "active",
      authorProfileId: row.authorProfileId || null,
      createdAt: row.createdAt || null,
      lastLoginAt: row.lastLoginAt || null,
      voteCount: voteStats.get(normalizeKey(row.email || ""))?.count || 0,
      lastAppActivityAt: voteStats.get(normalizeKey(row.email || ""))?.lastActivityAt || null,
    }));

  if (anonymousRows.length) {
    const anonymousVoteEntries = Array.from(voteStats.entries()).filter(([key]) => key.startsWith("local-") || key.startsWith("poetrylover"));
    const anonymousVoteCount = anonymousVoteEntries.reduce((sum, [, stat]) => sum + Number(stat?.count || 0), 0);
    const anonymousLastActivityAt = anonymousVoteEntries.reduce((latest, [, stat]) => {
      const latestSeconds = latest?._seconds || 0;
      const nextSeconds = stat?.lastActivityAt?._seconds || 0;
      return nextSeconds > latestSeconds ? stat.lastActivityAt : latest;
    }, null);
    const anonymousLastLoginAt = anonymousRows.reduce((latest, row) => {
      const latestSeconds = latest?._seconds || 0;
      const nextSeconds = row.lastLoginAt?._seconds || 0;
      return nextSeconds > latestSeconds ? row.lastLoginAt : latest;
    }, null);
    const aggregateRow = {
      uid: "__anonymous__",
      email: "",
      displayName: `Anonymous users (${anonymousRows.length})`,
      roles: ["user"],
      status: "active",
      authorProfileId: null,
      createdAt: null,
      lastLoginAt: anonymousLastLoginAt,
      voteCount: anonymousVoteCount,
      lastAppActivityAt: anonymousLastActivityAt,
      isAnonymousAggregate: true,
    };
    const haystack = [
      aggregateRow.displayName,
      "anonymous",
      "local",
    ].map(normalizeKey);
    if (!queryText || haystack.some((value) => value.includes(queryText))) {
      rows.push(aggregateRow);
    }
  }

  res.json({ users: rows, syncedCount: authUsers.length });
});

app.post(getBoth("/admin/users/:uid/roles"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const uid = normalizeText(req.params.uid);
  if (!uid) return res.status(400).json({ error: "missing_uid" });

  const ref = db.collection(COLLECTIONS.users).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "user_not_found" });

  const userData = snap.data() || {};
  const roles = sanitizeManagedRoles(req.body?.roles, userData.email || "");
  await ref.set(
    {
      roles,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: ctx.decoded.uid,
    },
    { merge: true }
  );

  const saved = await ref.get();
  res.json({
    ok: true,
    user: {
      uid: saved.id,
      ...(saved.data() || {}),
    },
  });
});


/** 404 fallback */
app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: "Try /healthz, /imageTypes, /releaseCatalogs, /ratingsSummary, etc.",
  });
});

// Keep this LAST
export const api = onRequest({
  region: "us-central1",
  memory: "1GiB",
  timeoutSeconds: 540,
}, app);
