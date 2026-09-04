import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

initializeApp({ credential: applicationDefault(), projectId: "poetry-please" });
const db = getFirestore(undefined, "poetrypleasedatabase");

const APPLY = process.env.APPLY_ATUB_UN_MIGRATION === "YES";
const BACKUP_ID = "atub-un-full-poems-2026-09-04";
const EXPECTED = {
  atubFullPoems: 52,
  unFullPoems: 50,
  canonicalPoems: 50,
  votes: 433,
  flags: 18,
  claims: 0,
  duplicates: 0,
};
const DEPENDENT_COLLECTIONS = ["votes", "contentFlags", "contentClaims", "contentDuplicates"];
const TEXT_FIELDS = [
  "servedText", "served_text", "cleanedText", "cleaned_text", "fullText", "full_text",
  "poemText", "poem_text", "text", "body", "content",
];

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

function poemBody(data) {
  return first(data, TEXT_FIELDS);
}

function bodyHash(data) {
  const value = normalize(poemBody(data));
  return value ? createHash("sha256").update(value).digest("hex") : "";
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string" || typeof value === "number") {
    const n = new Date(value).getTime();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "object" && Number.isFinite(value._seconds)) return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6);
  return 0;
}

function serializable(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serializable);
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializable(v)]));
  return value;
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

async function getAffectedFullPoems() {
  const snap = await db.collection("fullPoems").get();
  return snap.docs
    .map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() || {} }))
    .filter((row) => ["ATUB", "UN"].includes(bookIdentity(row.data)) && normalize(author(row.data)) === "ayanna florence");
}

function buildMapping(rows) {
  const atub = rows.filter((row) => bookIdentity(row.data) === "ATUB");
  const un = rows.filter((row) => bookIdentity(row.data) === "UN");
  if (atub.length !== EXPECTED.atubFullPoems || un.length !== EXPECTED.unFullPoems) {
    fail("Unexpected ATUB/UN full-poem counts", { atub: atub.length, un: un.length, expected: EXPECTED });
  }

  const unByTitle = new Map();
  for (const row of un) {
    const key = normalize(poemTitle(row.data));
    if (!key) fail("UN row missing title", { id: row.id });
    if (unByTitle.has(key)) fail("Duplicate canonical UN title", { key, ids: [unByTitle.get(key).id, row.id] });
    unByTitle.set(key, row);
  }
  if (unByTitle.size !== EXPECTED.canonicalPoems) fail("Unexpected canonical UN title count", { count: unByTitle.size });

  const mappings = [];
  const missingBody = [];
  const bodyMismatches = [];
  for (const oldRow of atub) {
    const key = normalize(poemTitle(oldRow.data));
    const target = unByTitle.get(key);
    if (!target) fail("ATUB row has no UN title match", { id: oldRow.id, title: poemTitle(oldRow.data) });
    const oldHash = bodyHash(oldRow.data);
    const newHash = bodyHash(target.data);
    if (!oldHash || !newHash) missingBody.push({ oldId: oldRow.id, targetId: target.id, oldFields: Object.keys(oldRow.data).sort(), newFields: Object.keys(target.data).sort() });
    else if (oldHash !== newHash) bodyMismatches.push({ oldId: oldRow.id, targetId: target.id, title: poemTitle(oldRow.data), oldHash, newHash });
    mappings.push({ oldRow, target, key });
  }

  if (bodyMismatches.length) fail("ATUB and UN poem text mismatch", { bodyMismatches });
  if (missingBody.length) fail("Could not verify poem text for every mapping", { missingBody });

  return { atub, un, mappings, unByTitle };
}

async function getDependencies(affectedIds) {
  const out = {};
  for (const name of DEPENDENT_COLLECTIONS) {
    const snap = await db.collection(name).get();
    out[name] = snap.docs
      .map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() || {} }))
      .filter((row) => affectedIds.has(text(row.data.imageId || row.data.imageID || row.data.contentId)));
  }
  const actual = {
    votes: out.votes.length,
    flags: out.contentFlags.length,
    claims: out.contentClaims.length,
    duplicates: out.contentDuplicates.length,
  };
  if (actual.votes !== EXPECTED.votes || actual.flags !== EXPECTED.flags || actual.claims !== EXPECTED.claims || actual.duplicates !== EXPECTED.duplicates) {
    fail("Dependent reference counts changed since audit", { actual, expected: EXPECTED });
  }
  return out;
}

function chooseLatest(rows, targetId) {
  return [...rows].sort((a, b) => {
    const ta = timestampMs(a.data.timestamp);
    const tb = timestampMs(b.data.timestamp);
    if (tb !== ta) return tb - ta;
    const aOnTarget = text(a.data.imageId) === targetId ? 1 : 0;
    const bOnTarget = text(b.data.imageId) === targetId ? 1 : 0;
    if (bOnTarget !== aOnTarget) return bOnTarget - aOnTarget;
    return a.id.localeCompare(b.id);
  })[0];
}

function buildVotePlan(votes, oldToTarget) {
  const groups = new Map();
  for (const row of votes) {
    const sourceId = text(row.data.imageId);
    const targetId = oldToTarget.get(sourceId) || sourceId;
    const userId = text(row.data.userId);
    if (!userId) fail("Affected vote missing userId", { voteId: row.id, sourceId });
    const key = `${targetId}\u0000${userId}`;
    if (!groups.has(key)) groups.set(key, { targetId, userId, rows: [] });
    groups.get(key).rows.push(row);
  }

  const winners = [];
  const losers = [];
  let conflictingGroups = 0;
  let sameRatingDuplicateGroups = 0;
  for (const group of groups.values()) {
    const winner = chooseLatest(group.rows, group.targetId);
    const distinctVotes = new Set(group.rows.map((row) => normalize(row.data.voteType)));
    if (group.rows.length > 1) {
      if (distinctVotes.size > 1) conflictingGroups += 1;
      else sameRatingDuplicateGroups += 1;
    }
    winners.push({ ...group, winner });
    group.rows.filter((row) => row.id !== winner.id).forEach((row) => losers.push({ ...group, loser: row, winner }));
  }
  return { groups, winners, losers, conflictingGroups, sameRatingDuplicateGroups };
}

function buildFlagPlan(flags, oldToTarget) {
  return flags.map((row) => {
    const oldId = text(row.data.imageId);
    const targetId = oldToTarget.get(oldId) || oldId;
    return { row, oldId, targetId, needsMove: oldId !== targetId };
  });
}

async function writeBackup({ rows, deps, summary }) {
  const root = db.collection("migrationBackups").doc(BACKUP_ID);
  const existing = await root.get();
  if (existing.exists && existing.data()?.status === "complete") return;

  await root.set({
    migration: "ATUB to UN full poems",
    status: "writing",
    createdAt: FieldValue.serverTimestamp(),
    summary,
  }, { merge: true });

  const collections = [
    ["fullPoems", rows],
    ["votes", deps.votes],
    ["contentFlags", deps.contentFlags],
    ["contentClaims", deps.contentClaims],
    ["contentDuplicates", deps.contentDuplicates],
  ];

  for (const [name, items] of collections) {
    for (let i = 0; i < items.length; i += 350) {
      const batch = db.batch();
      for (const item of items.slice(i, i + 350)) {
        batch.set(root.collection(name).doc(item.id), {
          sourceCollection: name,
          sourceId: item.id,
          data: item.data,
        });
      }
      await batch.commit();
    }
  }

  await root.set({ status: "complete", completedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function applyPlan({ mapping, deps, votePlan, flagPlan, summary }) {
  await writeBackup({ rows: [...mapping.atub, ...mapping.un], deps, summary });

  const mutations = [];
  for (const entry of votePlan.winners) {
    const row = entry.winner;
    const currentId = text(row.data.imageId);
    if (currentId !== entry.targetId) {
      mutations.push({ type: "update", ref: row.ref, data: {
        imageId: entry.targetId,
        previousImageId: currentId,
        atubUnMigratedAt: FieldValue.serverTimestamp(),
      }});
    }
  }
  for (const entry of votePlan.losers) mutations.push({ type: "delete", ref: entry.loser.ref });

  for (const entry of flagPlan) {
    if (!entry.needsMove) continue;
    mutations.push({ type: "update", ref: entry.row.ref, data: {
      imageId: entry.targetId,
      previousImageId: entry.oldId,
      atubUnMigratedAt: FieldValue.serverTimestamp(),
    }});
  }

  for (const entry of mapping.mappings) mutations.push({ type: "delete", ref: entry.oldRow.ref });

  for (let i = 0; i < mutations.length; i += 350) {
    const batch = db.batch();
    for (const mutation of mutations.slice(i, i + 350)) {
      if (mutation.type === "update") batch.update(mutation.ref, mutation.data);
      else if (mutation.type === "delete") batch.delete(mutation.ref);
    }
    await batch.commit();
  }

  await Promise.all([
    db.collection("systemState").doc("scoreboardSnapshot").delete().catch(() => null),
    db.collection("systemState").doc("scoreboard").delete().catch(() => null),
  ]);

  await db.collection("migrationBackups").doc(BACKUP_ID).set({
    appliedAt: FieldValue.serverTimestamp(),
    appliedSummary: summary,
    status: "applied",
  }, { merge: true });
}

async function verifyPostState() {
  const rows = await getAffectedFullPoems();
  const atub = rows.filter((row) => bookIdentity(row.data) === "ATUB");
  const un = rows.filter((row) => bookIdentity(row.data) === "UN");
  const oldIds = new Set(atub.map((row) => row.id));
  const dangling = {};
  for (const name of DEPENDENT_COLLECTIONS) {
    const snap = await db.collection(name).get();
    dangling[name] = snap.docs.filter((doc) => oldIds.has(text(doc.data()?.imageId))).length;
  }
  return { atub: atub.length, un: un.length, dangling };
}

async function main() {
  const rows = await getAffectedFullPoems();
  const mapping = buildMapping(rows);
  const affectedIds = new Set(rows.map((row) => row.id));
  const deps = await getDependencies(affectedIds);
  const oldToTarget = new Map(mapping.mappings.map((entry) => [entry.oldRow.id, entry.target.id]));
  const votePlan = buildVotePlan(deps.votes, oldToTarget);
  const flagPlan = buildFlagPlan(deps.contentFlags, oldToTarget);

  const originMappings = mapping.mappings.filter((entry) => entry.key === "origin").map((entry) => ({ oldId: entry.oldRow.id, targetId: entry.target.id }));
  const movedFlags = flagPlan.filter((entry) => entry.needsMove).length;
  const summary = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    backupId: BACKUP_ID,
    fullPoems: { atub: mapping.atub.length, un: mapping.un.length, canonical: mapping.unByTitle.size, originMappings },
    votes: {
      before: deps.votes.length,
      finalUniqueReviewerPoemVotes: votePlan.winners.length,
      redundantVotesToArchiveAndRemove: votePlan.losers.length,
      conflictingReviewerPoemGroups: votePlan.conflictingGroups,
      sameRatingDuplicateGroups: votePlan.sameRatingDuplicateGroups,
    },
    flags: { before: deps.contentFlags.length, movedFromAtubToUn: movedFlags, retained: deps.contentFlags.length },
    claims: deps.contentClaims.length,
    duplicates: deps.contentDuplicates.length,
  };

  if (!APPLY) {
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
    return;
  }

  await applyPlan({ mapping, deps, votePlan, flagPlan, summary });

  const post = await verifyPostState();
  if (post.atub !== 0 || post.un !== EXPECTED.unFullPoems || Object.values(post.dangling).some((value) => value !== 0)) {
    fail("Post-migration verification failed", { post, summary });
  }
  console.log(JSON.stringify({ ok: true, ...summary, post }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, details: serializable(error.details || {}) }, null, 2));
  process.exitCode = 1;
});
