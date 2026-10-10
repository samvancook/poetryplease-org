// Resolve the pending content flags that hide excerpts filled in from "start...end" shorthand
// (linebreakSource "book_filled"), so they return to the feed as full excerpts.
//
//   node resolve_filled_excerpt_flags.js                 dry run: counts and ids only
//   node resolve_filled_excerpt_flags.js --apply         resolve those flags
//   node resolve_filled_excerpt_flags.js --undo --apply  set flags this script resolved back to pending
//
// Prints ids and counts only, never excerpt text, so it is safe to run where logs are public.
// Each resolved flag keeps its prior status in maintenancePreviousStatus, which --undo restores.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const RESOLVER = "maintenance:resolve_filled_excerpt_flags";
const NOTE = "Excerpt filled in with the full book passage; the middle ellipsis this flag was raised for is gone.";
const apply = process.argv.includes("--apply");
const undo = process.argv.includes("--undo");

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

async function main() {
  initializeApp();
  const db = getFirestore(undefined, "poetrypleasedatabase");

  let targets;
  if (undo) {
    const snap = await db.collection("contentFlags").where("reviewedBy", "==", RESOLVER).get();
    targets = snap.docs.filter((doc) => doc.data().status === "resolved");
  } else {
    const filled = await db.collection("excerpts").where("linebreakSource", "==", "book_filled").get();
    const ids = new Set(filled.docs.map((doc) => normalizeKey(doc.data().imageId || doc.id)));
    const pending = await db.collection("contentFlags").where("status", "==", "pending").get();
    targets = pending.docs.filter((doc) => ids.has(normalizeKey(doc.data().imageId)));
    console.log(JSON.stringify({ filledExcerpts: ids.size, pendingFlags: pending.size }));
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    operation: undo ? "undo" : "resolve",
    flags: targets.length,
    excerpts: new Set(targets.map((doc) => doc.data().imageId)).size,
    imageIds: [...new Set(targets.map((doc) => doc.data().imageId))].sort(),
  };

  if (apply && targets.length) {
    const entry = (eventType) => ({ eventType, actorUid: RESOLVER, actorEmail: "", note: NOTE, createdAtIso: new Date().toISOString() });
    let batch = db.batch();
    let count = 0;
    for (const doc of targets) {
      const data = doc.data();
      const fields = undo
        ? {
          status: data.maintenancePreviousStatus || "pending",
          resolution: FieldValue.delete(),
          reviewNote: FieldValue.delete(),
          reviewedBy: FieldValue.delete(),
          reviewedAt: FieldValue.delete(),
          maintenancePreviousStatus: FieldValue.delete(),
          moderationHistory: FieldValue.arrayUnion(entry("reopened")),
        }
        : {
          status: "resolved",
          resolution: "keep",
          reviewNote: NOTE,
          reviewedBy: RESOLVER,
          reviewedAt: FieldValue.serverTimestamp(),
          maintenancePreviousStatus: data.status || "pending",
          moderationHistory: FieldValue.arrayUnion(entry("kept")),
        };
      batch.update(doc.ref, fields);
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count) await batch.commit();
    report.written = targets.length;
    // Same signal the backfill uses: the app rebuilds its cached feed on the next request.
    await db.collection("systemState").doc("content-feed").set({ invalidatedAt: FieldValue.serverTimestamp(), builtAt: null }, { merge: true });
    report.contentFeedInvalidated = true;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
