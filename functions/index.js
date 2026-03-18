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

/** ====== ADMIN INIT ====== */
const appAdmin = initializeApp({ storageBucket: "poetry-please.firebasestorage.app" });

// If your Firestore DB is the **default** "(default)", use: getFirestore(appAdmin)
// If your DB id is really "poetrypleasedatabase", keep the 2nd argument.
const db = getFirestore(appAdmin, "poetrypleasedatabase");
const auth = getAuth(appAdmin);
const storage = getStorage(appAdmin);

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
app.use(express.json({ limit: "10mb" }));

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
  const fileExt = (String(fileName || "").split(".").pop() || "").trim().toLowerCase();
  if (fileExt) return fileExt;
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[String(mimeType || "").toLowerCase()] || "jpg";
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
  const votesSnap = await getAllFrom(COLLECTIONS.votes);
  const compact = votesSnap.map((v) => ({ imageId: v.imageId, voteType: v.voteType }));
  res.json(aggregateRatings(compact));
});

// fetchData (auth)
app.post(getBoth("/fetchData"), async (req, res) => {
  const decoded = await verifyIdTokenFromHeader(req);
  if (!decoded?.email) return res.status(401).json({ error: "auth" });

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

  const releaseCatalogs = [...new Set(all.map((o) => o.releaseCatalog).filter(Boolean))].sort();
  const imageTypes = [...new Set(all.map((o) => o.imageType).filter(Boolean))].sort();

  res.json({
    allGraphics: all.map(mapToArr),
    newGraphics: newObjs.map(mapToArr),
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

  const releaseCatalogs = [...new Set(all.map((o) => o.releaseCatalog).filter(Boolean))].sort();
  const imageTypes = [...new Set(all.map((o) => o.imageType).filter(Boolean))].sort();

  res.json({
    allGraphics: all.map(mapToArr),
    newGraphics: newObjs.map(mapToArr),
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

  const mimeType = normalizeText(req.body?.mimeType);
  const base64Data = normalizeText(req.body?.base64Data);
  const fileName = normalizeText(req.body?.fileName || "author-photo");
  const width = Number(req.body?.width || 0) || null;
  const height = Number(req.body?.height || 0) || null;
  const fileSize = Number(req.body?.fileSize || 0) || null;
  if (!mimeType || !base64Data) {
    return res.status(400).json({ error: "missing_upload_payload" });
  }

  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  const storagePath = `author-profile-images/${ctx.decoded.uid}/${Date.now()}.${ext}`;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const buffer = Buffer.from(base64Data, 'base64');
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: 'public,max-age=3600',
    },
    resumable: false,
  });

  const publicUrl = await getDownloadURL(file);
  const assetRef = db.collection(COLLECTIONS.authorAssets).doc();
  await assetRef.set({
    ownerUid: ctx.decoded.uid,
    ownerEmail: ctx.decoded.email,
    assetType: 'profile_photo',
    storagePath,
    publicUrl,
    width,
    height,
    fileSize,
    mimeType,
    status: 'active',
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

  const existingSnap = await db.collection(COLLECTIONS.contentFlags)
    .where("imageId", "==", item.imageId)
    .limit(25)
    .get();
  const existingPending = existingSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .find((flag) => flag.status === "pending");
  if (existingPending) {
    return res.status(409).json({ error: "content_already_flagged", flag: existingPending });
  }

  const flagRef = db.collection(COLLECTIONS.contentFlags).doc();
  await flagRef.set({
    imageId: item.imageId,
    title: item.title || "",
    author: item.author || "",
    imageType: item.imageType || "",
    releaseCatalog: item.releaseCatalog || "",
    flaggedByUid: ctx.decoded.uid,
    flaggedByEmail: ctx.decoded.email,
    flaggedByRoles: Array.isArray(ctx.userRecord?.roles) ? ctx.userRecord.roles : [],
    note,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true, flagId: flagRef.id });
});

app.get(getBoth("/admin/contentFlags"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const snap = await db.collection(COLLECTIONS.contentFlags).limit(250).get();
  const flags = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
  res.json({ flags });
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
  await Promise.all(targets.map((ref) => ref.set({
    status: "resolved",
    resolution: decision,
    reviewNote: note,
    reviewedBy: ctx.decoded.uid,
    reviewedAt: FieldValue.serverTimestamp(),
  }, { merge: true })));

  const saved = await flagRef.get();
  res.json({ ok: true, flag: { id: saved.id, ...(saved.data() || {}) } });
});

app.post(getBoth("/admin/contentFlags/:flagId/uploadReplacement"), async (req, res) => {
  const ctx = await requireRole(req, res, ["admin"]);
  if (!ctx) return;

  const flagId = normalizeText(req.params.flagId);
  const mimeType = normalizeText(req.body?.mimeType);
  const base64Data = normalizeText(req.body?.base64Data);
  const fileName = normalizeText(req.body?.fileName || "replacement-image");
  const width = Number(req.body?.width || 0) || null;
  const height = Number(req.body?.height || 0) || null;
  const fileSize = Number(req.body?.fileSize || 0) || null;
  const reviewNote = normalizeText(req.body?.note || "");
  if (!flagId) return res.status(400).json({ error: "missing_flag_id" });
  if (!mimeType || !base64Data) return res.status(400).json({ error: "missing_upload_payload" });
  if (!/^image\//i.test(mimeType)) return res.status(400).json({ error: "invalid_mime_type" });

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

  const ext = extensionForUpload(fileName, mimeType);
  const storagePath = `content-replacements/${normalizeKey(flag.imageId || contentRecord.docId)}/${Date.now()}.${ext}`;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const buffer = Buffer.from(base64Data, "base64");
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: "public,max-age=3600",
    },
    resumable: false,
  });

  const publicUrl = await getDownloadURL(file);
  const assetRef = db.collection(COLLECTIONS.contentAssets).doc();
  await assetRef.set({
    assetType: "replacement_graphic",
    sourceFlagId: flagId,
    imageId: flag.imageId || "",
    contentCollection: contentRecord.collection,
    contentDocId: contentRecord.docId,
    storagePath,
    publicUrl,
    width,
    height,
    fileSize,
    mimeType,
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
  await Promise.all(targets.map((ref) => ref.set({
    status: "resolved",
    resolution: "updated",
    reviewNote,
    replacementAssetId: assetRef.id,
    replacementUrl: publicUrl,
    reviewedBy: ctx.decoded.uid,
    reviewedAt: FieldValue.serverTimestamp(),
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
