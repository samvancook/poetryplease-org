import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore(undefined, "poetrypleasedatabase");

function text(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasMiddleEllipsis(excerpt) {
  const value = text(excerpt);
  if (!value.includes("...")) return false;
  const compact = value.replace(/^\s*\.\.\.\s*/, "").replace(/\s*\.\.\.\s*$/, "").trim();
  return compact.includes("...");
}

async function main() {
  const existingPending = new Set();
  const flagsSnap = await db.collection("contentFlags").where("status", "==", "pending").get();
  flagsSnap.docs.forEach((doc) => existingPending.add(normalizeKey(doc.data()?.imageId)));

  const excerptsSnap = await db.collection("excerpts").get();
  const candidates = excerptsSnap.docs
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ data }) => String(data.imageType || "").toUpperCase() === "EXC")
    .filter(({ data }) => hasMiddleEllipsis(data.excerpt))
    .filter(({ data, doc }) => !existingPending.has(normalizeKey(data.imageId || data.imageID || data.contentId || doc.id)));

  let created = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const { doc, data } of candidates) {
    const imageId = text(data.imageId || data.imageID || data.contentId || doc.id);
    const flagRef = db.collection("contentFlags").doc();
    batch.set(flagRef, {
      imageId,
      title: text(data.poem || data.title),
      author: text(data.author),
      imageType: "EXC",
      releaseCatalog: text(data.releaseCatalog),
      currentImageUrl: text(data.imageUrl || data.url),
      flaggedByUid: "system-batch",
      flaggedByEmail: "system-batch@poetryplease",
      flaggedByRoles: ["system"],
      note: "possible_photo_instruction_ellipsis: EXC contains middle ellipsis (...) and needs review before normal feed use.",
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      moderationHistory: [{
        eventType: "flagged",
        actorUid: "system-batch",
        actorEmail: "system-batch@poetryplease",
        note: "possible_photo_instruction_ellipsis",
        createdAt: new Date().toISOString(),
        source: "flag_exc_photo_instruction_ellipsis",
      }],
    });
    created += 1;
    batchCount += 1;
    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount) await batch.commit();
  if (created) await db.collection("systemState").doc("scoreboard").set({
    invalidatedAt: FieldValue.serverTimestamp(),
    invalidationReason: "flag_exc_photo_instruction_ellipsis",
    builtAt: null,
  }, { merge: true });
  console.log(JSON.stringify({ candidates: candidates.length, created }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
