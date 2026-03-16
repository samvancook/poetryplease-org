import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import { createHash, randomBytes } from "node:crypto";

// Firebase Admin v12 (modular)
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

/** ====== CONFIG / CONSTANTS ====== */
const COLLECTIONS = {
  graphics: "graphics",
  excerpts: "excerpts",
  videos: "videos",
  votes: "votes",
  users: "users",
  authorProfiles: "authorProfiles",
  authorInvites: "authorInvites",
  contentClaims: "contentClaims",
  contentSubmissions: "contentSubmissions",
};

const ADMIN_EMAILS = new Set([
  "sam@buttonpoetry.com",
]);

/** ====== ADMIN INIT ====== */
const appAdmin = initializeApp();

// If your Firestore DB is the **default** "(default)", use: getFirestore(appAdmin)
// If your DB id is really "poetrypleasedatabase", keep the 2nd argument.
const db = getFirestore(appAdmin, "poetrypleasedatabase");
const auth = getAuth(appAdmin);

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
app.use(express.json());

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
  const allowed = new Set(["user", "author", "admin"]);
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
    published: data.published !== false,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function pickProfileContent(profile, allContent, ratings) {
  const authorKeys = new Set(
    uniq([profile.displayName, ...(profile.authorNameVariants || [])]).map(normalizeKey)
  );
  const authored = allContent.filter((item) => authorKeys.has(normalizeKey(item.author)));
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
  const [g, e, v] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
  ]);
  const all = [...g, ...e, ...v];
  const imageTypes = [...new Set(all.map((i) => i.imageType).filter(Boolean))].sort();
  res.json(imageTypes);
});

// releaseCatalogs
app.get(getBoth("/releaseCatalogs"), async (_req, res) => {
  const [g, e, v] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
  ]);
  const all = [...g, ...e, ...v];
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

  const [g, e, v] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
  ]);
  const all = [...g, ...e, ...v];

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

  const [g, e, v] = await Promise.all([
    getAllFrom(COLLECTIONS.graphics),
    getAllFrom(COLLECTIONS.excerpts),
    getAllFrom(COLLECTIONS.videos),
  ]);
  const all = [...g, ...e, ...v];
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
