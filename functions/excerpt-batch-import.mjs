// Plans a one-off import of hand-picked excerpts (for example a staff member's
// highlights in a book) into Poetry Please, without duplicating excerpts the
// library already has. Run from the functions folder:
//   node excerpt-batch-import.mjs plan <batch.json> <out-payload.json>
// It reads the author's existing excerpts from Firestore (read-only), prints
// each pick as "exists" (same text already in the library) or "new", and
// writes the new picks as a /internal/weaverImport payload. The workflow then
// posts that payload. Rerunning is safe: picks imported earlier are found by
// their sourceRecordId (and by text), so they come back as "exists".
import { readFileSync, writeFileSync } from "node:fs";

// Letters and digits only, so curly versus straight quotes, line breaks and
// punctuation do not hide a match.
export function excerptMatchKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// existing: [{ id, excerpt, sourceRecordId }]. A pick "exists" when an
// existing excerpt has its sourceRecordId or exactly its text. Longer or
// shorter passages that overlap are reported but still count as new, since a
// different cut of a poem is a different excerpt.
export function planExcerptBatch(records, existing) {
  const rows = existing.map((item) => ({ ...item, key: excerptMatchKey(item.excerpt) }));
  return records.map((record) => {
    const key = excerptMatchKey(record.excerpt);
    const same = rows.filter((row) => row.sourceRecordId === record.sourceRecordId || (key && row.key === key));
    const overlaps = key.length >= 20
      ? rows.filter((row) => !same.includes(row) && row.key && (row.key.includes(key) || key.includes(row.key)))
      : [];
    return {
      sourceRecordId: record.sourceRecordId,
      poem: record.poem,
      status: same.length ? "exists" : "new",
      existingIds: same.map((row) => row.id),
      overlappingIds: overlaps.map((row) => row.id),
    };
  });
}

async function main() {
  const [mode, batchPath, outPath] = process.argv.slice(2);
  if (mode !== "plan" || !batchPath || !outPath) {
    console.error("usage: node excerpt-batch-import.mjs plan <batch.json> <out-payload.json>");
    process.exit(2);
  }
  const batch = JSON.parse(readFileSync(batchPath, "utf8"));
  const records = Array.isArray(batch.records) ? batch.records : [];
  const authors = [...new Set(records.map((record) => record.author).filter(Boolean))];
  if (!records.length || authors.length !== 1) throw new Error("batch must hold records for exactly one author");

  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: "poetry-please" }), "poetrypleasedatabase");
  const snap = await db.collection("excerpts").where("author", "==", authors[0])
    .select("excerpt", "sourceRecordId", "book", "poem", "title", "hidden").get();
  const existing = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  console.log(`${existing.length} existing excerpts by ${authors[0]} in Poetry Please.`);

  const plan = planExcerptBatch(records, existing);
  plan.forEach((row) => console.log(JSON.stringify(row)));
  const newIds = new Set(plan.filter((row) => row.status === "new").map((row) => row.sourceRecordId));
  const payload = { schemaVersion: "1", contentType: "EXC", records: records.filter((record) => newIds.has(record.sourceRecordId)) };
  writeFileSync(outPath, JSON.stringify(payload));
  console.log(`exists: ${plan.length - newIds.size}, new (to import): ${newIds.size}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
