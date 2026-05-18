import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const app = initializeApp();
const db = getFirestore(app, "poetrypleasedatabase");
const catalog = JSON.parse(readFileSync(new URL("./book-catalog-lookup.json", import.meta.url), "utf8"));

function text(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitize(value) {
  return text(value)
    .replace(/[\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const shortenerByBook = new Map(catalog.map((row) => [normalize(row.title), sanitize(row.bookShortener).toUpperCase()]));
shortenerByBook.set(normalize("Single, Young, & Worried"), "SYW");

function resolveShortener(data) {
  return sanitize(data.bookShortener).toUpperCase() || sanitize(shortenerByBook.get(normalize(data.book))).toUpperCase() || "";
}

function slugify(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function currentId(data, id) {
  return text(data.imageId || data.imageID || data.contentId || id);
}

function isWeaverHashId(data, id) {
  return currentId(data, id).toUpperCase().startsWith("WEAVER-EXC-");
}

function oldHash(data, id) {
  return text(data.excerptHash || data.sourceRecordId || currentId(data, id).replace(/^weaver-exc-/i, ""));
}

async function commitBatch(batch, count) {
  if (!count) return;
  await batch.commit();
}

async function main() {
  const excerptSnap = await db.collection("excerpts").get();
  const candidates = excerptSnap.docs
    .filter((doc) => isWeaverHashId(doc.data() || {}, doc.id))
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ data }) => resolveShortener(data) && text(data.poem || data.title) && text(data.excerpt));

  const votesByOldId = new Map();
  const votesSnap = await db.collection("votes").get();
  votesSnap.docs.forEach((doc) => {
    const imageId = text(doc.data()?.imageId);
    if (!imageId.toUpperCase().startsWith("WEAVER-EXC-")) return;
    if (!votesByOldId.has(imageId)) votesByOldId.set(imageId, []);
    votesByOldId.get(imageId).push(doc.ref);
  });

  const groups = new Map();
  candidates.forEach((entry) => {
    const shortener = resolveShortener(entry.data);
    const poemSlug = slugify(entry.data.poem || entry.data.title).toUpperCase();
    const key = `${shortener}|${poemSlug}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  const planned = [];
  groups.forEach((entries) => {
    entries.sort((a, b) => a.doc.id.localeCompare(b.doc.id));
    entries.forEach((entry, idx) => {
      const shortener = resolveShortener(entry.data);
      const baseId = `${shortener}-EXC-${slugify(entry.data.poem || entry.data.title)}`.toUpperCase();
      const newId = entries.length > 1 ? `${baseId}-${idx + 1}` : baseId;
      if (entry.doc.id !== newId) planned.push({ ...entry, newId });
    });
  });

  let renamed = 0;
  let voteUpdates = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const item of planned) {
    const oldId = item.doc.id;
    const oldData = item.data;
    const hash = oldHash(oldData, oldId);
    const newRef = db.collection("excerpts").doc(item.newId);
    const payload = {
      ...oldData,
      contentId: item.newId,
      imageId: item.newId,
      imageID: item.newId,
      bookShortener: resolveShortener(oldData),
      previousContentId: oldId,
      previousImageId: oldId,
      excerptHash: text(oldData.excerptHash || hash),
      sourceRecordId: text(oldData.sourceRecordId || hash),
      renamedFromWeaverHashIdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "migrate_weaver_excerpt_ids",
    };

    batch.set(newRef, payload, { merge: true });
    batch.delete(item.doc.ref);
    batchCount += 2;
    renamed += 1;

    for (const voteRef of votesByOldId.get(oldId) || []) {
      batch.update(voteRef, { imageId: item.newId, previousImageId: oldId });
      batchCount += 1;
      voteUpdates += 1;
    }

    if (batchCount >= 400) {
      await commitBatch(batch, batchCount);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount) await commitBatch(batch, batchCount);
  await db.collection("systemState").doc("scoreboardSnapshot").delete().catch(() => null);
  console.log(JSON.stringify({ candidates: candidates.length, planned: planned.length, renamed, voteUpdates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
