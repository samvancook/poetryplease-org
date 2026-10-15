// Same Firestore backup and feed-invalidation path as backfill_excerpt_linebreaks.js.
// Dry run: node backfill_excerpt_poem_keys.js --seed seed.csv
// Apply:   node backfill_excerpt_poem_keys.js --seed seed.csv --apply --backup /absolute/backup.json
// Undo:    node backfill_excerpt_poem_keys.js --undo /absolute/backup.json --apply
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { readFileSync, writeFileSync } from "node:fs";
import { parsePoemKeySeed, planExcerptPoemKey, POEM_KEY_FIELDS } from "./excerpt-poem-keys.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? "" : process.argv[i + 1]; };
const apply = process.argv.includes("--apply"), undo = arg("--undo");
const seed = undo ? null : parsePoemKeySeed(readFileSync(arg("--seed"), "utf8"));
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
} else {
  const snap = await db.collection("excerpts").get(); report.documents = snap.size;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.imageType || "EXC").toUpperCase() !== "EXC") { skip("not_excerpt"); continue; }
    const plan = planExcerptPoemKey(data, seed);
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
  await db.collection("systemState").doc("content-feed").set({ invalidatedAt: FieldValue.serverTimestamp(), builtAt: null }, { merge: true });
  report.contentFeedInvalidated = true;
}
console.log(JSON.stringify(report, null, 2));
