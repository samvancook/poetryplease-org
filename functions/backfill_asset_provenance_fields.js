import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const COLLECTIONS = ["graphics", "excerpts", "fullPoems", "videos"];
const app = initializeApp();
const db = getFirestore(app, "poetrypleasedatabase");

function text(value) {
  return String(value || "").trim();
}

function readPipeValue(misc, key) {
  const target = key.toLowerCase();
  return text(misc)
    .split("|")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${target.toLowerCase()}=`))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim() || "";
}

function readImportAssistantValue(misc, label) {
  const re = new RegExp(`${label}:\\s*([^·|]+)`, "i");
  return text(misc).match(re)?.[1]?.trim() || "";
}

function storageObjectFromUrl(url) {
  const value = text(url);
  const match = value.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (!match) return { storageBucket: "", storageObject: "" };
  return {
    storageBucket: decodeURIComponent(match[1]),
    storageObject: decodeURIComponent(match[2]),
  };
}

function provenancePatch(data) {
  const misc = text(data.misc);
  const sourceFolderLink = text(data.sourceFolderLink)
    || readPipeValue(misc, "sourceFolderLink")
    || readImportAssistantValue(misc, "Import Assistant folder");
  const sourceFileName = text(data.sourceFileName)
    || readPipeValue(misc, "sourceFileName")
    || readImportAssistantValue(misc, "Import Assistant source file");
  const cloudLink = text(data.cloudLink) || text(data.imageUrl || data.url || data.videoUrl);
  const driveLink = text(data.driveLink);
  const { storageBucket, storageObject } = storageObjectFromUrl(cloudLink);

  const patch = {};
  if (cloudLink && !text(data.cloudLink)) patch.cloudLink = cloudLink;
  if (driveLink && !text(data.driveLink)) patch.driveLink = driveLink;
  if (sourceFolderLink && !text(data.sourceFolderLink)) patch.sourceFolderLink = sourceFolderLink;
  if (sourceFileName && !text(data.sourceFileName)) patch.sourceFileName = sourceFileName;
  if (storageBucket && !text(data.storageBucket)) patch.storageBucket = storageBucket;
  if (storageObject && !text(data.storageObject)) patch.storageObject = storageObject;
  if (Object.keys(patch).length) patch.provenanceBackfilledAt = FieldValue.serverTimestamp();
  return patch;
}

async function main() {
  let scanned = 0;
  let updated = 0;
  const byCollection = {};

  for (const collection of COLLECTIONS) {
    byCollection[collection] = { scanned: 0, updated: 0 };
    const snap = await db.collection(collection).get();
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      scanned += 1;
      byCollection[collection].scanned += 1;
      const patch = provenancePatch(doc.data() || {});
      if (!Object.keys(patch).length) continue;
      batch.update(doc.ref, patch);
      batchCount += 1;
      updated += 1;
      byCollection[collection].updated += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount) await batch.commit();
  }

  console.log(JSON.stringify({ scanned, updated, byCollection }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
