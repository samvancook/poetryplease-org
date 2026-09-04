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
  "contentText", "servedText", "served_text", "cleanedText", "cleaned_text", "fullText", "full_text",
  "poemText", "poem_text", "text", "body", "content",
];

function text(value) { return String(value ?? "").trim(); }
function normalize(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[‘’]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
}
function first(data, keys) { for (const key of keys) if (text(data?.[key])) return text(data[key]); return ""; }
function poemTitle(data) { return first(data, ["poemTitle", "title", "poem", "name", "poem_name", "poem_title"]); }
function bookIdentity(data) { return first(data, ["bookShortener", "bookCode", "book", "bookTitle", "bookName", "sourceBook", "book_shortener"]); }
function author(data) { return first(data, ["author", "authorName", "poet", "creator"]); }
function poemBody(data) { return first(data, TEXT_FIELDS); }
function bodyHash(data) {
  const value = normalize(poemBody(data));
  return value ? createHash("sha256").update(value).digest("hex") : "";
}
function refId(data) { return text(data?.imageId || data?.imageID || data?.contentId); }
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
function rowTimestamp(row) {
  return Math.max(timestampMs(row.data.timestamp), timestampMs(row.data.updatedAt), timestampMs(row.data.createdAt), timestampMs(row.data.dateAdded));
}
function serializable(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serializable);
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializable(v)]));
  return value;
}
function fail(message, details = {}) { const error = new Error(message); error.details = details; throw error; }

async function getAffectedFullPoems() {
  const snap = await db.collection("fullPoems").get();
  return snap.docs.map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() || {} }))
    .filter((row) => ["ATUB", "UN"].includes(bookIdentity(row.data)) && normalize(author(row.data)) === "ayanna florence");
}

function idSuffixMatches(oldId, targetId, key) {
  if (!oldId.startsWith("ATUB-FP-") || !targetId.startsWith("UN-FP-")) return false;
  const oldSuffix = oldId.slice("ATUB-FP-".length);
  const targetSuffix = targetId.slice("UN-FP-".length);
  if (oldSuffix === targetSuffix) return true;
  return key === "origin" && targetSuffix === "ORIGIN" && ["ORIGIN", "ORIGIN-2", "ORIGIN-3"].includes(oldSuffix);
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

  const atubTitles = new Set(atub.map((row) => normalize(poemTitle(row.data))));
  if (atubTitles.size !== EXPECTED.canonicalPoems) fail("Unexpected ATUB unique title count", { count: atubTitles.size });
  const missingFromAtub = [...unByTitle.keys()].filter((key) => !atubTitles.has(key));
  const extraInAtub = [...atubTitles].filter((key) => !unByTitle.has(key));
  if (missingFromAtub.length || extraInAtub.length) fail("ATUB and UN title inventories differ", { missingFromAtub, extraInAtub });

  const mappings = [];
  const bodyMismatches = [];
  const partialBodies = [];
  const badIds = [];
  let textVerified = 0;
  let metadataVerified = 0;
  for (const oldRow of atub) {
    const key = normalize(poemTitle(oldRow.data));
    const target = unByTitle.get(key);
    if (!target) fail("ATUB row has no UN title match", { id: oldRow.id, title: poemTitle(oldRow.data) });
    if (!idSuffixMatches(oldRow.id, target.id, key)) badIds.push({ oldId: oldRow.id, targetId: target.id, key });

    const oldHash = bodyHash(oldRow.data);
    const newHash = bodyHash(target.data);
    if (oldHash && newHash) {
      if (oldHash !== newHash) bodyMismatches.push({ oldId: oldRow.id, targetId: target.id, title: poemTitle(oldRow.data), oldHash, newHash });
      else textVerified += 1;
    } else if (oldHash || newHash) {
      partialBodies.push({ oldId: oldRow.id, targetId: target.id, oldHasText: Boolean(oldHash), newHasText: Boolean(newHash) });
    } else {
      metadataVerified += 1;
    }
    mappings.push({ oldRow, target, key });
  }
  if (badIds.length) fail("ATUB/UN FP ID suffixes do not match", { badIds });
  if (bodyMismatches.length) fail("ATUB and UN poem text mismatch", { bodyMismatches });
  if (partialBodies.length) fail("Only one side of an ATUB/UN pair contains text", { partialBodies });
  if (metadataVerified !== EXPECTED.atubFullPoems) fail("Unexpected text-bearing records in metadata-only FP inventory", { textVerified, metadataVerified });

  return { atub, un, mappings, unByTitle, identityVerification: { textVerified, metadataVerified, inventoryTitles: atubTitles.size, idSuffixesVerified: mappings.length } };
}

async function getDependencies(affectedIds) {
  const out = {};
  for (const name of DEPENDENT_COLLECTIONS) {
    const snap = await db.collection(name).get();
    out[name] = snap.docs.map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() || {} })).filter((row) => affectedIds.has(refId(row.data)));
  }
  const actual = { votes: out.votes.length, flags: out.contentFlags.length, claims: out.contentClaims.length, duplicates: out.contentDuplicates.length };
  if (actual.votes !== EXPECTED.votes || actual.flags !== EXPECTED.flags || actual.claims !== EXPECTED.claims || actual.duplicates !== EXPECTED.duplicates) {
    fail("Dependent reference counts changed since audit", { actual, expected: EXPECTED });
  }
  return out;
}

function chooseLatest(rows, targetId) {
  return [...rows].sort((a, b) => {
    const ta = rowTimestamp(a), tb = rowTimestamp(b);
    if (tb !== ta) return tb - ta;
    const aOnTarget = refId(a.data) === targetId ? 1 : 0, bOnTarget = refId(b.data) === targetId ? 1 : 0;
    if (bOnTarget !== aOnTarget) return bOnTarget - aOnTarget;
    return a.id.localeCompare(b.id);
  })[0];
}

function buildVotePlan(votes, oldToTarget) {
  const groups = new Map();
  for (const row of votes) {
    const sourceId = refId(row.data), targetId = oldToTarget.get(sourceId) || sourceId, userId = text(row.data.userId);
    if (!userId) fail("Affected vote missing userId", { voteId: row.id, sourceId });
    const key = `${targetId}\u0000${userId}`;
    if (!groups.has(key)) groups.set(key, { targetId, userId, rows: [] });
    groups.get(key).rows.push(row);
  }
  const winners = [], losers = [];
  let conflictingGroups = 0, sameRatingDuplicateGroups = 0;
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
  const pendingGroups = new Map(), retained = [];
  for (const row of flags) {
    const oldId = refId(row.data), targetId = oldToTarget.get(oldId) || oldId, status = normalize(row.data.status);
    const entry = { row, oldId, targetId, needsMove: oldId !== targetId, status };
    if (status === "pending") {
      if (!pendingGroups.has(targetId)) pendingGroups.set(targetId, []);
      pendingGroups.get(targetId).push(entry);
    } else retained.push(entry);
  }
  const pendingWinners = [], pendingLosers = [];
  for (const [targetId, entries] of pendingGroups.entries()) {
    const winnerRow = chooseLatest(entries.map((entry) => entry.row), targetId);
    const winner = entries.find((entry) => entry.row.id === winnerRow.id);
    pendingWinners.push(winner);
    entries.filter((entry) => entry.row.id !== winner.row.id).forEach((entry) => pendingLosers.push(entry));
  }
  return { retained: [...retained, ...pendingWinners], pendingLosers, pendingConvergenceGroups: [...pendingGroups.values()].filter((entries) => entries.length > 1).length };
}

async function writeBackup({ rows, deps, summary }) {
  const root = db.collection("migrationBackups").doc(BACKUP_ID);
  const existing = await root.get();
  if (existing.exists && ["complete", "applied"].includes(existing.data()?.status)) return;
  await root.set({ migration: "ATUB to UN full poems", status: "writing", createdAt: FieldValue.serverTimestamp(), summary }, { merge: true });
  const collections = [["fullPoems", rows], ["votes", deps.votes], ["contentFlags", deps.contentFlags], ["contentClaims", deps.contentClaims], ["contentDuplicates", deps.contentDuplicates]];
  for (const [name, items] of collections) {
    for (let i = 0; i < items.length; i += 350) {
      const batch = db.batch();
      for (const item of items.slice(i, i + 350)) batch.set(root.collection(name).doc(item.id), { sourceCollection: name, sourceId: item.id, data: item.data });
      await batch.commit();
    }
  }
  await root.set({ status: "complete", completedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function applyPlan({ mapping, deps, votePlan, flagPlan, summary }) {
  await writeBackup({ rows: [...mapping.atub, ...mapping.un], deps, summary });
  const mutations = [];
  for (const entry of votePlan.winners) {
    const row = entry.winner, currentId = refId(row.data);
    if (currentId !== entry.targetId) mutations.push({ type: "update", ref: row.ref, data: { imageId: entry.targetId, previousImageId: currentId, atubUnMigratedAt: FieldValue.serverTimestamp() } });
  }
  for (const entry of votePlan.losers) mutations.push({ type: "delete", ref: entry.loser.ref });
  for (const entry of flagPlan.retained) if (entry.needsMove) mutations.push({ type: "update", ref: entry.row.ref, data: { imageId: entry.targetId, previousImageId: entry.oldId, atubUnMigratedAt: FieldValue.serverTimestamp() } });
  for (const entry of flagPlan.pendingLosers) mutations.push({ type: "delete", ref: entry.row.ref });
  for (const entry of mapping.mappings) mutations.push({ type: "delete", ref: entry.oldRow.ref });
  for (let i = 0; i < mutations.length; i += 350) {
    const batch = db.batch();
    for (const mutation of mutations.slice(i, i + 350)) mutation.type === "update" ? batch.update(mutation.ref, mutation.data) : batch.delete(mutation.ref);
    await batch.commit();
  }
  await Promise.all([db.collection("systemState").doc("scoreboardSnapshot").delete().catch(() => null), db.collection("systemState").doc("scoreboard").delete().catch(() => null)]);
  await db.collection("migrationBackups").doc(BACKUP_ID).set({ appliedAt: FieldValue.serverTimestamp(), appliedSummary: summary, status: "applied" }, { merge: true });
}

async function verifyPostState(oldIds, expectedVoteCount) {
  const rows = await getAffectedFullPoems();
  const atub = rows.filter((row) => bookIdentity(row.data) === "ATUB"), un = rows.filter((row) => bookIdentity(row.data) === "UN");
  const unIds = new Set(un.map((row) => row.id)), dangling = {};
  for (const name of DEPENDENT_COLLECTIONS) {
    const snap = await db.collection(name).get();
    dangling[name] = snap.docs.filter((doc) => oldIds.has(refId(doc.data() || {}))).length;
  }
  const votesSnap = await db.collection("votes").get();
  const liveVotes = votesSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} })).filter((row) => unIds.has(refId(row.data)));
  const voteKeys = new Set(); let duplicateVoteKeys = 0;
  for (const row of liveVotes) {
    const key = `${refId(row.data)}\u0000${text(row.data.userId)}`;
    if (voteKeys.has(key)) duplicateVoteKeys += 1;
    voteKeys.add(key);
  }
  const flagsSnap = await db.collection("contentFlags").get(), pendingByTarget = new Map();
  for (const doc of flagsSnap.docs) {
    const data = doc.data() || {}, imageId = refId(data);
    if (!unIds.has(imageId) || normalize(data.status) !== "pending") continue;
    pendingByTarget.set(imageId, (pendingByTarget.get(imageId) || 0) + 1);
  }
  return { atub: atub.length, un: un.length, dangling, liveVotes: liveVotes.length, expectedVoteCount, duplicateVoteKeys, duplicatePendingFlagTargets: [...pendingByTarget.values()].filter((count) => count > 1).length };
}

async function main() {
  const rows = await getAffectedFullPoems();
  const mapping = buildMapping(rows), oldIds = new Set(mapping.atub.map((row) => row.id)), affectedIds = new Set(rows.map((row) => row.id));
  const deps = await getDependencies(affectedIds);
  const oldToTarget = new Map(mapping.mappings.map((entry) => [entry.oldRow.id, entry.target.id]));
  const votePlan = buildVotePlan(deps.votes, oldToTarget), flagPlan = buildFlagPlan(deps.contentFlags, oldToTarget);
  const originMappings = mapping.mappings.filter((entry) => entry.key === "origin").map((entry) => ({ oldId: entry.oldRow.id, targetId: entry.target.id }));
  const summary = {
    mode: APPLY ? "APPLY" : "DRY_RUN", backupId: BACKUP_ID,
    fullPoems: { atub: mapping.atub.length, un: mapping.un.length, canonical: mapping.unByTitle.size, identityVerification: mapping.identityVerification, originMappings },
    votes: { before: deps.votes.length, finalUniqueReviewerPoemVotes: votePlan.winners.length, redundantVotesToArchiveAndRemove: votePlan.losers.length, conflictingReviewerPoemGroups: votePlan.conflictingGroups, sameRatingDuplicateGroups: votePlan.sameRatingDuplicateGroups },
    flags: { before: deps.contentFlags.length, movedFromAtubToUn: flagPlan.retained.filter((entry) => entry.needsMove).length, pendingConvergenceGroups: flagPlan.pendingConvergenceGroups, redundantPendingFlagsToArchiveAndRemove: flagPlan.pendingLosers.length, finalRetained: flagPlan.retained.length },
    claims: deps.contentClaims.length, duplicates: deps.contentDuplicates.length,
  };
  if (!APPLY) { console.log(JSON.stringify({ ok: true, ...summary }, null, 2)); return; }
  await applyPlan({ mapping, deps, votePlan, flagPlan, summary });
  const post = await verifyPostState(oldIds, votePlan.winners.length);
  if (post.atub !== 0 || post.un !== EXPECTED.unFullPoems || Object.values(post.dangling).some((value) => value !== 0) || post.liveVotes !== post.expectedVoteCount || post.duplicateVoteKeys !== 0 || post.duplicatePendingFlagTargets !== 0) fail("Post-migration verification failed", { post, summary });
  console.log(JSON.stringify({ ok: true, ...summary, post }, null, 2));
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message, details: serializable(error.details || {}) }, null, 2)); process.exitCode = 1; });
