// Backfill book line breaks into EXC excerpt text from a line-break overlay (JSONL keyed by excerpt_hash).
//
//   node backfill_excerpt_linebreaks.js --overlay <file.jsonl>                    coverage report + dry run (no writes)
//   node backfill_excerpt_linebreaks.js --overlay <file.jsonl> --apply --limit 50 write the first 50 planned updates
//   node backfill_excerpt_linebreaks.js --undo --apply                            restore excerptOriginal everywhere
//   ... --tiers auto,review --only book_punctuation                              only rows whose punctuation follows the book
//   node backfill_excerpt_linebreaks.js --refresh-feed                            only mark the app's content feed stale
//
// Every apply writes a JSON backup of the touched documents before committing.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, writeFileSync } from "node:fs";
import { excerptHash, planLinebreakUndo, planLinebreakUpdate } from "./excerpt-linebreaks.js";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : "";
}

const overlayPath = argValue("--overlay");
const apply = process.argv.includes("--apply");
const undo = process.argv.includes("--undo");
const limit = Number(argValue("--limit") || 0);
const tiers = (argValue("--tiers") || "auto").split(",");
const only = argValue("--only") ? argValue("--only").split(",") : null;
const ownWords = process.argv.includes("--own-words");

function loadOverlay(path) {
  const byHash = new Map();
  let version = "";
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    byHash.set(String(entry.excerpt_hash).toLowerCase(), entry);
    // Some stored hashes predate a change to Weaver's quote normalization; index the current hash as well.
    byHash.set(excerptHash(entry.text_original), entry);
    version ||= entry.overlay_version || path.split("/").pop();
  }
  return { byHash, version };
}

// The app serves content from a cached feed snapshot; mark it stale the same way the API does after edits.
async function invalidateContentFeed(db) {
  await db.collection("systemState").doc("content-feed").set({
    invalidatedAt: FieldValue.serverTimestamp(),
    builtAt: null,
  }, { merge: true });
}

async function main() {
  if (process.argv.includes("--refresh-feed")) {
    initializeApp();
    await invalidateContentFeed(getFirestore(undefined, "poetrypleasedatabase"));
    console.log(JSON.stringify({ contentFeedInvalidated: true }));
    return;
  }
  if (!undo && !overlayPath) throw new Error("--overlay is required unless --undo");
  initializeApp();
  const db = getFirestore(undefined, "poetrypleasedatabase");
  const overlay = undo ? null : loadOverlay(overlayPath);

  const snap = await db.collection("excerpts").get();
  const docs = snap.docs
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ data }) => String(data.imageType || "EXC").toUpperCase() === "EXC");

  const reasons = {};
  let planned = docs
    .map((entry) => ({ ...entry, plan: undo ? planLinebreakUndo(entry.data) : planLinebreakUpdate(entry.data, overlay.byHash, { tiers, ownWords }) }))
    .map((entry) => (only && entry.plan.action === "update" && !only.includes(entry.plan.fields.linebreakSource)
      ? { ...entry, plan: { action: "skip", reason: `source_${entry.plan.fields.linebreakSource}` } }
      : entry))
    .filter((entry) => {
      if (entry.plan.action === "skip") reasons[entry.plan.reason] = (reasons[entry.plan.reason] || 0) + 1;
      return entry.plan.action !== "skip";
    });
  if (limit) planned = planned.slice(0, limit);

  const report = {
    mode: apply ? "apply" : "dry-run",
    operation: undo ? "undo" : "backfill",
    excDocuments: docs.length,
    planned: planned.length,
    skipped: reasons,
    overlayEntries: overlay?.byHash.size || 0,
    sample: planned.slice(0, 5).map(({ doc, data, plan }) => ({ id: doc.id, before: data.excerpt, after: plan.fields.excerpt })),
  };

  if (apply && planned.length) {
    const backupPath = `excerpt-linebreak-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(backupPath, JSON.stringify(planned.map(({ doc, data }) => ({ id: doc.id, data })), null, 2));
    report.backup = backupPath;

    let batch = db.batch();
    let count = 0;
    for (const { doc, plan } of planned) {
      const fields = { ...plan.fields, updatedAt: FieldValue.serverTimestamp(), updatedBy: "backfill_excerpt_linebreaks" };
      if (undo) {
        Object.assign(fields, {
          excerptOriginal: FieldValue.delete(),
          linebreakSource: FieldValue.delete(),
          linebreakConfidence: FieldValue.delete(),
          linebreakCatalogPoemId: FieldValue.delete(),
          linebreakOverlayVersion: FieldValue.delete(),
        });
      } else {
        fields.linebreakOverlayVersion = overlay.version;
      }
      batch.update(doc.ref, fields);
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count) await batch.commit();
    report.written = planned.length;
    await invalidateContentFeed(db);
    report.contentFeedInvalidated = true;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
