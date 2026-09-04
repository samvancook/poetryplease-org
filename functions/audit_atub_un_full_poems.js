import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault(), projectId: "poetry-please" });
const db = getFirestore(undefined, "poetrypleasedatabase");

const NEEDLES = [
  "atub",
  "unreliable narrator",
  "all the ugly bits",
  "ayanna florence",
];
const DEPENDENT_COLLECTIONS = ["votes", "contentFlags", "contentClaims", "contentDuplicates"];

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function serialize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

function candidate(data) {
  const haystack = normalize(JSON.stringify(serialize(data)));
  return NEEDLES.some((needle) => haystack.includes(normalize(needle)));
}

function first(data, keys) {
  for (const key of keys) {
    if (text(data?.[key])) return text(data[key]);
  }
  return "";
}

function poemTitle(data) {
  return first(data, ["poemTitle", "title", "poem", "name", "poem_name", "poem_title"]);
}

function bookIdentity(data) {
  return first(data, ["bookShortener", "bookCode", "book", "bookTitle", "bookName", "sourceBook", "book_shortener"]);
}

function author(data) {
  return first(data, ["author", "authorName", "poet", "creator"]);
}

function scoreState(data) {
  const wanted = [
    "votes", "voteCount", "score", "rating", "ratings", "ranking", "rank",
    "flags", "flagged", "hidden", "reviewStatus", "status", "notes",
    "createdAt", "updatedAt", "sourceFileName", "sourceFolderLink", "driveLink",
  ];
  const out = {};
  for (const key of wanted) if (data?.[key] !== undefined) out[key] = serialize(data[key]);
  return out;
}

const snap = await db.collection("fullPoems").get();
const matches = [];

for (const doc of snap.docs) {
  const data = doc.data() || {};
  if (!candidate(data)) continue;
  matches.push({
    id: doc.id,
    poemTitle: poemTitle(data),
    normalizedTitle: normalize(poemTitle(data)),
    bookIdentity: bookIdentity(data),
    author: author(data),
    state: scoreState(data),
    fields: Object.keys(data).sort(),
    data: serialize(data),
  });
}

matches.sort((a, b) => a.normalizedTitle.localeCompare(b.normalizedTitle) || a.id.localeCompare(b.id));

const affectedRows = matches.filter((row) => row.bookIdentity === "ATUB" || row.bookIdentity === "UN");
const affectedIds = new Set(affectedRows.map((row) => row.id));
const dependentReferences = {};

for (const collectionName of DEPENDENT_COLLECTIONS) {
  const depSnap = await db.collection(collectionName).get();
  const countsByImageId = {};
  const voteTypesByImageId = {};
  let affectedReferenceCount = 0;

  for (const doc of depSnap.docs) {
    const data = doc.data() || {};
    const imageId = text(data.imageId || data.imageID || data.contentId);
    if (!affectedIds.has(imageId)) continue;
    affectedReferenceCount += 1;
    countsByImageId[imageId] = (countsByImageId[imageId] || 0) + 1;
    if (collectionName === "votes") {
      const voteType = text(data.voteType).toLowerCase() || "(blank)";
      voteTypesByImageId[imageId] ||= {};
      voteTypesByImageId[imageId][voteType] = (voteTypesByImageId[imageId][voteType] || 0) + 1;
    }
  }

  dependentReferences[collectionName] = {
    scanned: depSnap.size,
    affectedReferenceCount,
    affectedRecordIds: Object.keys(countsByImageId).length,
    countsByImageId,
    ...(collectionName === "votes" ? { voteTypesByImageId } : {}),
  };
}

const byTitle = new Map();
for (const row of matches) {
  const key = row.normalizedTitle || `__missing_title__:${row.id}`;
  if (!byTitle.has(key)) byTitle.set(key, []);
  byTitle.get(key).push(row);
}

const duplicateTitleGroups = [...byTitle.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([normalizedTitle, rows]) => ({
    normalizedTitle,
    count: rows.length,
    records: rows.map(({ id, poemTitle, bookIdentity, author, state }) => ({ id, poemTitle, bookIdentity, author, state })),
  }));

const summary = {
  collection: "fullPoems",
  scanned: snap.size,
  matched: matches.length,
  affectedAyannaRecords: affectedRows.length,
  affectedByBook: affectedRows.reduce((out, row) => {
    out[row.bookIdentity] = (out[row.bookIdentity] || 0) + 1;
    return out;
  }, {}),
  duplicateTitleGroups: duplicateTitleGroups.length,
  exactNeedles: NEEDLES,
  dependentReferenceTotals: Object.fromEntries(
    Object.entries(dependentReferences).map(([name, value]) => [name, value.affectedReferenceCount])
  ),
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY_NO_WRITES",
};

console.log(JSON.stringify({ summary, duplicateTitleGroups, dependentReferences, matches }, null, 2));
