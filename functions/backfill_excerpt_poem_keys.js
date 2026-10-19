// Same Firestore backup and feed-invalidation path as backfill_excerpt_linebreaks.js.
// Dry run: node backfill_excerpt_poem_keys.js --seed seed.csv
// Apply:   node backfill_excerpt_poem_keys.js --seed seed.csv --apply --backup /absolute/backup.json
// Undo:    node backfill_excerpt_poem_keys.js --undo /absolute/backup.json --apply
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { readFileSync, writeFileSync } from "node:fs";
import { parsePoemKeySeed, planExcerptPoemKey, POEM_KEY_FIELDS } from "./excerpt-poem-keys.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? "" : process.argv[i + 1]; };
const apply = process.argv.includes("--apply"), undo = arg("--undo"), planPath = arg("--plan");
if (undo && planPath) throw new Error("choose_undo_or_plan");
const seed = undo || planPath ? null : parsePoemKeySeed(readFileSync(arg("--seed"), "utf8"));
const db = getFirestore(initializeApp({ projectId: "poetry-please" }), "poetrypleasedatabase");
const report = { mode: apply ? "apply" : "dry-run", operation: undo ? "undo" : "backfill", planned: 0, written: 0, skipped: {} };
const encode = (value) => value instanceof Timestamp ? { seconds: value.seconds, nanoseconds: value.nanoseconds, timestamp: true } : value;
const decode = (value) => value?.timestamp ? new Timestamp(value.seconds, value.nanoseconds) : value;
const skip = (reason) => { report.skipped[reason] = (report.skipped[reason] || 0) + 1; };
let planned = [];
if (undo) {
  const entries = JSON.parse(readFileSync(undo, "utf8"));
  for (let offset = 0; offset < entries.length; offset += 400) {
    const part = entries.slice(offset, offset + 400);
    const docs = await db.getAll(...part.map((entry) => db.collection("excerpts").doc(entry.id)));
    docs.forEach((doc, i) => {
      const entry = part[i], data = doc.data() || {};
      if (!doc.exists || Object.entries(entry.applied).some(([key, value]) => data[key] !== value)) { skip("changed_since_backfill"); return; }
      const fields = Object.fromEntries(POEM_KEY_FIELDS.map((key) => [key, entry.before[key]?.present ? decode(entry.before[key].value) : FieldValue.delete()]));
      planned.push({ doc, fields });
    });
  }
} else if (planPath) {
  const entries = JSON.parse(readFileSync(planPath, "utf8"));
  const seen = new Set();
  for (const entry of entries) {
    if (!entry.id || entry.id.includes("/") || seen.has(entry.id)
      || !entry.updateTime || !Number.isInteger(entry.updateTime.seconds) || !Number.isInteger(entry.updateTime.nanoseconds)
      || !/^BPP-\d{5}$/.test(entry.fields?.poemKey)
      || !["catalog_registry_book_title", "catalog_exact_excerpt_span", "catalog_verified_seed_correction"].includes(entry.fields?.poemKeySource)
      || entry.fields.poemKeyConfidence !== 1
      || Object.keys(entry.fields).sort().join(",") !== "poemKey,poemKeyConfidence,poemKeySource") throw new Error("invalid_plan_entry");
    seen.add(entry.id);
  }
  for (let offset = 0; offset < entries.length; offset += 400) {
    const part = entries.slice(offset, offset + 400);
    const docs = await db.getAll(...part.map((entry) => db.collection("excerpts").doc(entry.id)));
    docs.forEach((doc, i) => {
      const entry = part[i], data = doc.data() || {};
      if (!doc.exists || doc.updateTime.seconds !== entry.updateTime.seconds || doc.updateTime.nanoseconds !== entry.updateTime.nanoseconds) {
        skip("changed_since_plan"); return;
      }
      if (String(data.imageType || "EXC").toUpperCase() !== "EXC") { skip("not_excerpt"); return; }
      if (data.poemKey && (data.poemKeySource !== "catalog_seed_2026-10-15" || entry.fields.poemKeySource !== "catalog_verified_seed_correction")) {
        skip("protected_existing_key"); return;
      }
      planned.push({ doc, data, fields: entry.fields });
    });
  }
} else {
  const snap = await db.collection("excerpts").get(); report.documents = snap.size;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.imageType || "EXC").toUpperCase() !== "EXC") { skip("not_excerpt"); continue; }
    const plan = planExcerptPoemKey(data, seed, { requireTitle: true });
    if (!plan.fields) { skip(plan.reason); continue; }
    planned.push({ doc, data, fields: plan.fields });
  }
}
const limit = Number(arg("--limit") || 0); if (limit) planned = planned.slice(0, limit);
report.planned = planned.length;
report.sample = planned.slice(0, 5).map(({ doc, fields }) => ({ id: doc.id, ...fields }));
if (apply && planned.length) {
  if (!undo) {
    if (!arg("--backup")) throw new Error("--backup is required for apply");
    writeFileSync(arg("--backup"), JSON.stringify(planned.map(({ doc, data, fields }) => ({
      id: doc.id, applied: fields,
      before: Object.fromEntries(POEM_KEY_FIELDS.map((key) => [key, Object.hasOwn(data, key) ? { present: true, value: encode(data[key]) } : { present: false }])),
    })), null, 2), { flag: "wx", mode: 0o600 });
    report.backup = arg("--backup");
  }
  for (let offset = 0; offset < planned.length; offset += 400) {
    const batch = db.batch();
    for (const { doc, fields } of planned.slice(offset, offset + 400)) {
      batch.update(doc.ref, { ...fields, ...(!undo ? { poemKeyAttachedAt: FieldValue.serverTimestamp() } : {}) }, { lastUpdateTime: doc.updateTime });
    }
    await batch.commit(); report.written += Math.min(400, planned.length - offset);
  }
  await db.collection("systemState").doc("content-feed").set({
    generation: FieldValue.increment(1), invalidatedAt: FieldValue.serverTimestamp(), builtAt: null,
  }, { merge: true });
  report.contentFeedInvalidated = true;
}
console.log(JSON.stringify(report, null, 2));
