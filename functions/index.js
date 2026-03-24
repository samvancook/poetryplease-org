import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import { createHash, randomBytes } from "node:crypto";

// Firebase Admin v12 (modular)
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

/** ====== CONFIG / CONSTANTS ====== */
const COLLECTIONS = {
  graphics: "graphics",
  excerpts: "excerpts",
  videos: "videos",
  votes: "votes",
  users: "users",
  authorProfiles: "authorProfiles",
  authorInvites: "authorInvites",
  authorAssets: "authorAssets",
  contentAssets: "contentAssets",
  contentClaims: "contentClaims",
  contentFlags: "contentFlags",
  contentSubmissions: "contentSubmissions",
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
};

/** ====== ADMIN INIT ====== */
const appAdmin = initializeApp({ storageBucket: "poetry-please.firebasestorage.app" });

// If your Firestore DB is the **default** "(default)", use: getFirestore(appAdmin)
// If your DB id is really "poetrypleasedatabase", keep the 2nd argument.
const db = getFirestore(appAdmin, "poetrypleasedatabase");
const auth = getAuth(appAdmin);
const storage = getStorage(appAdmin);
const SCOREBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
let scoreboardCache = {
  builtAt: 0,
  payload: null,
  inFlight: null,
};

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
  const imageUrl = d.imageUrl || d.url || d.driveLink || d.videoUrl || "";
  return {
    author: d.author || "",
    title: d.title || d.poem || "",
    book: d.book || "",
    imageId,
    imageUrl,
    videoUrl: d.videoUrl || "",
    bookLink: d.bookLink || "",
    releaseCatalog: d.releaseCatalog || "",
    imageType: d.imageType || "",
    excerpt: d.excerpt || "",
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


async function getAllContent() {
  const [g, e, v] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
  ]);
  return [...g, ...e, ...v];
}

async function findContentRecordByImageId(imageId) {
  const normalized = normalizeKey(imageId);
  if (!normalized) return null;
  for (const collection of [COLLECTIONS.graphics, COLLECTIONS.excerpts, COLLECTIONS.videos]) {
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
  };
  const mapped = map[String(mimeType || "").toLowerCase()];
  if (mapped) return mapped;
  const fileExt = (String(fileName || "").split(".").pop() || "").trim().toLowerCase();
  return fileExt || "jpg";
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
  return [
    o.author || "",
    o.title || "",
    o.book || "",
    o.imageId || "",
    o.imageUrl || "",
    o.bookLink || "",
    o.releaseCatalog || "",
    o.imageType || "",
    o.excerpt || "",
  ];
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
    if (!agg[id]) agg[id] = { score: 0, total: 0 };
    agg[id].score += w;
    agg[id].total += 1;
  }
  const out = {};
  Object.keys(agg).forEach((id) => {
    const { score, total } = agg[id];
    out[id] = { score, total, rating: total ? score / total : 0 };
  });
  return out;
}

async function buildScoreboardPayload() {
  const [voteDocs, metaObjs, excerptObjs, videoObjs, flaggedIds] = await Promise.all([
    getAllVotes(),
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
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
    if (!imageId) return;
    if (flaggedIds.has(normalizeKey(imageId))) return;
    metaMap.set(imageId, {
      author: item.author || "",
      poemTitle: item.title || "",
      bookTitle: item.book || "",
      fileLink: item.imageUrl || item.bookLink || "",
      type: item.imageType || "",
    });
  };
  metaObjs.forEach(upsertMeta);
  excerptObjs.forEach(upsertMeta);
  videoObjs.forEach(upsertMeta);

  const enrichedVotes = rawVotes.map((vote) => {
    const meta = metaMap.get(vote.imageId) || {};
    return {
      imageId: vote.imageId,
      vote: vote.vote,
      user: vote.user,
      author: meta.author || "‹no author›",
      poemTitle: meta.poemTitle || "‹no title›",
      bookTitle: meta.bookTitle || "‹no book›",
      fileLink: meta.fileLink || "",
      type: meta.type || "",
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
        likes: 0,
        dislikes: 0,
        meh: 0,
        movedMe: 0,
        totalVotes: 0,
        type: vote.type || "",
      });
    }
    const entry = board.get(vote.imageId);
    if (vote.vote === "like") entry.likes += 1;
    else if (vote.vote === "dislike") entry.dislikes += 1;
    else if (vote.vote === "meh") entry.meh += 1;
    else if (vote.vote === "moved me") entry.movedMe += 1;
    entry.totalVotes += 1;
  });

  const aggregated = Array.from(board.values()).map((entry) => ({
    ...entry,
    score: entry.likes + (entry.movedMe * 2) - entry.dislikes,
  }));

  const allGraphics = [...metaObjs, ...excerptObjs, ...videoObjs]
    .filter((item) => !flaggedIds.has(normalizeKey(item.imageId || "")))
    .map((item) => ({
      imageId: item.imageId || "",
      bookTitle: item.book || "‹no book›",
      type: item.imageType || "",
    }));

  return {
    aggregated,
    rawVotes: enrichedVotes,
    allGraphics,
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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
    imageUrl: data.imageUrl || data.url || "",
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

function deriveContentDocId(type, body = {}) {
  if (type === "graphics") {
    return normalizeText(body.docId || body.imageId);
  }
  if (type === "excerpts") {
    const explicit = normalizeText(body.docId || body.imageID || body.imageId);
    if (explicit) return explicit;
    const bookShortener = normalizeText(body.bookShortener);
    const poem = normalizeText(body.poem || body.title);
    if (!bookShortener || !poem) return "";
    return `${bookShortener}-EXC-${slugify(poem)}`.toUpperCase();
  }
  if (type === "videos") {
    return normalizeText(body.docId || body.videoId || body.imageId);
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

  const imageType = normalizeText(body.imageType || (type === "excerpts" ? "EXC" : type === "videos" ? "VV" : ""));
  const payload = {
    imageType,
    author: normalizeText(body.author),
    book: normalizeText(body.book),
    driveLink: normalizeText(body.driveLink),
    bookLink: normalizeText(body.bookLink),
    releaseCatalog: normalizeText(body.releaseCatalog),
    updatedAt: now,
    updatedBy: normalizeText(options.updatedBy || ""),
  };

  if (type === "graphics") {
    payload.title = normalizeText(body.title);
    payload.imageId = docId;
    payload.imageUrl = normalizeText(options.imageUrl || body.imageUrl);
  } else if (type === "excerpts") {
    payload.poem = normalizeText(body.poem || body.title);
    payload.excerpt = normalizeText(body.excerpt);
    payload.pageNumber = normalizeText(body.pageNumber);
    payload.bookShortener = normalizeText(body.bookShortener);
    payload.imageID = docId;
    payload.imageId = docId;
  } else if (type === "videos") {
    payload.title = normalizeText(body.title);
    payload.videoId = docId;
    payload.url = normalizeText(body.url || body.imageUrl);
    payload.imageUrl = normalizeText(options.imageUrl || body.imageUrl);
    payload.releaseYear = normalizeText(body.releaseYear);
    payload.bookShortener = normalizeText(body.bookShortener);
    payload.updatedFileName = normalizeText(body.updatedFileName);
    payload.pageNumber = normalizeText(body.pageNumber);
    payload.misc = normalizeText(body.misc);
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
  if (normalized === "videos") return COLLECTIONS.videos;
  return "";
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

  const built = buildContentDocPayload(type, body, {
    imageUrl: uploadImageUrl,
    updatedBy: actor.uid || "",
  });
  const ref = db.collection(collection).doc(built.docId);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : {};
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

/** ====== ROOT + HEALTH ====== */
app.get("/", (_req, res) => {
  res.type("text/plain").send("Poetry Please API is alive ✅  Try /imageTypes etc.");
});
app.get("/healthz", (_req, res) => res.json({ ok: true }));

/** ====== ROUTE REGISTRATION (supports both with and without /api) ====== */
const getBoth = (p) => [p, `/api${p}`];

// imageTypes
app.get(getBoth("/imageTypes"), async (_req, res) => {
  const [g, e, v, flaggedIds] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
    getFlaggedContentIds(),
  ]);
  const all = excludeFlaggedContent([...g, ...e, ...v], flaggedIds);
  const imageTypes = [...new Set(all.map((i) => i.imageType).filter(Boolean))].sort();
  res.json(imageTypes);
});

// releaseCatalogs
app.get(getBoth("/releaseCatalogs"), async (_req, res) => {
  const [g, e, v, flaggedIds] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
    getFlaggedContentIds(),
  ]);
  const all = excludeFlaggedContent([...g, ...e, ...v], flaggedIds);
  const cats = [...new Set(all.map((i) => i.releaseCatalog).filter(Boolean))].sort();
  res.json(cats);
});

// ratingsSummary
app.get(getBoth("/ratingsSummary"), async (_req, res) => {
  const votesSnap = await getAllVotes();
  const compact = votesSnap.map((v) => ({ imageId: v.imageId, voteType: v.voteType }));
  res.json(aggregateRatings(compact));
});

// scoreboard
app.get(getBoth("/scoreboard"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;
  const payload = await getCachedScoreboardPayload();
  res.json(payload);
});

app.get(getBoth("/scoreboard/bootstrap"), async (req, res) => {
  const ctx = await requireRole(req, res, ["team", "admin"]);
  if (!ctx) return;
  const payload = await getScoreboardBootstrapPayload();
  res.json(payload);
});

// fetchData (auth)
app.post(getBoth("/fetchData"), async (req, res) => {
  const decoded = await verifyIdTokenFromHeader(req);
  if (!decoded?.email) return res.status(401).json({ error: "auth" });
  const limit = Math.max(10, Math.min(Number(req.body?.limit) || 20, 120));

  const [g, e, v, flaggedIds] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
    getFlaggedContentIds(),
  ]);
  const all = excludeFlaggedContent([...g, ...e, ...v], flaggedIds);

  const voted = await getVotesByUser(decoded.email);
  const votedIds = new Set(voted.map((x) => (x.imageId || "").trim().toLowerCase()));
  const newObjs = all.filter((o) => !votedIds.has((o.imageId || "").trim().toLowerCase()));
  const batch = newObjs.slice(0, limit);

  const releaseCatalogs = [...new Set(all.map((o) => o.releaseCatalog).filter(Boolean))].sort();
  const imageTypes = [...new Set(all.map((o) => o.imageType).filter(Boolean))].sort();

  res.json({
    allGraphics: all.map(mapToCounterArr),
    newGraphics: batch.map(mapToArr),
    totalImages: all.length,
    votedImagesCount: voted.length,
    remainingImagesCount: newObjs.length,
    releaseCatalogs,
    imageTypes,
  });
});

// fetchDataAnon
app.post(getBoth("/fetchDataAnon"), async (req, res) => {
  const anonId = (req.body?.anonId || "").trim();
  if (!anonId) return res.status(400).json({ error: "missing anonId" });
  const limit = Math.max(10, Math.min(Number(req.body?.limit) || 20, 120));

  const [g, e, v, flaggedIds] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
    getFlaggedContentIds(),
  ]);
  const all = excludeFlaggedContent([...g, ...e, ...v], flaggedIds);
  const voted = await getVotesByUser(anonId);
  const votedIds = new Set(voted.map((x) => (x.imageId || "").trim().toLowerCase()));
  const newObjs = all.filter((o) => !votedIds.has((o.imageId || "").trim().toLowerCase()));
  const batch = newObjs.slice(0, limit);

  const releaseCatalogs = [...new Set(all.map((o) => o.releaseCatalog).filter(Boolean))].sort();
  const imageTypes = [...new Set(all.map((o) => o.imageType).filter(Boolean))].sort();

  res.json({
    allGraphics: all.map(mapToCounterArr),
    newGraphics: batch.map(mapToArr),
    totalImages: all.length,
    votedImagesCount: voted.length,
    remainingImagesCount: newObjs.length,
    releaseCatalogs,
    imageTypes,
  });
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

  const [g, e, v, votes] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
    getAllFrom(COLLECTIONS.votes),
  ]);
  const ratings = aggregateRatings(votes.map((vote) => ({ imageId: vote.imageId, voteType: vote.voteType })));
  const allContent = [...g, ...e, ...v];
  const { authored, featured } = pickProfileContent(profile, allContent, ratings);

  res.json({
    profile,
    stats: {
      authoredCount: authored.length,
      featuredCount: featured.length,
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

  const [g, e, v, votes] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
    getAllFrom(COLLECTIONS.votes),
  ]);
  const ratings = aggregateRatings(votes.map((vote) => ({ imageId: vote.imageId, voteType: vote.voteType })));
  const allContent = [...g, ...e, ...v];
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
  const ctx = await requireRole(req, res, ["admin"]);
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
  if (type === "all" || type === "graphics") collections.push(COLLECTIONS.graphics);
  if (type === "all" || type === "excerpts") collections.push(COLLECTIONS.excerpts);
  if (type === "all" || type === "videos") collections.push(COLLECTIONS.videos);
  if (!collections.length) return res.status(400).json({ error: "invalid_content_type" });

  const rows = (await Promise.all(
    collections.map(async (collection) => {
      const snap = await db.collection(collection).limit(250).get();
      return snap.docs.map((doc) => mapAdminContentDoc(collection, doc));
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
        row.releaseCatalog,
      ].some((value) => normalizeKey(value).includes(queryText));
    })
    .sort((a, b) => {
      const aTime = a.updatedAt?._seconds || a.createdAt?._seconds || 0;
      const bTime = b.updatedAt?._seconds || b.createdAt?._seconds || 0;
      return bTime - aTime;
    })
    .slice(0, 250);

  res.json({ items: rows });
});

app.post(getBoth("/admin/contentLibrary/upsert"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  try {
    const result = await upsertContentLibraryItem(req.body?.type, req.body, {
      uid: ctx.decoded.uid,
      email: ctx.decoded.email,
    });
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
  res.json({ ok: true, createdCount, updatedCount, errorCount, results });
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
    const ref = db.collection(collection).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      missing.push(id);
      continue;
    }
    await ref.delete();
    deleted.push(id);
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
    const createdAt = doc.data()?.createdAt;
    const date = createdAt?.toDate ? createdAt.toDate() : (createdAt ? new Date(createdAt) : null);
    if (!date || Number.isNaN(date.getTime())) return false;
    return date.toISOString().slice(0, 10) === targetDate;
  });

  await Promise.all(matches.map((doc) => doc.ref.delete()));
  res.json({ ok: true, deletedCount: matches.length, targetDate });
});

app.post(getBoth("/admin/contentFlags/:flagId/review"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
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
  const [authUsers, voteCounts] = await Promise.all([
    listAllAuthUsers(1000),
    getVoteCountsByUserId(),
  ]);
  const synced = await Promise.all(authUsers.map((authUser) => syncUserRecordFromAuthUser(authUser)));
  const rows = synced
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
      voteCount: voteCounts.get(normalizeKey(row.email || "")) || 0,
    }));

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
export const api = onRequest({ region: "us-central1" }, app);
