import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";

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
};

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

// --- Add this vote endpoint before the export ---
app.post('/vote', async (req, res) => {
  try {
    const { imageId, voteType, userId } = req.body;

    if (!imageId || !voteType || !userId) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const vote = {
      imageId,
      voteType,
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await admin.firestore().collection('votes').add(vote);

    res.status(204).end(); // success
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'internal', message: err.message });
  }
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
