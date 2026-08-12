import { createHash } from "node:crypto";
import { canonicalImportManifestJson } from "./uploader-helpers.js";

const IMPORT_JOB_MAX_ITEMS = 500;
const IMPORT_PROCESS_BATCH_SIZE = 25;
const IMPORT_STALE_PROCESSING_MS = 10 * 60 * 1000;
const IMPORT_SERVER_RUN_LIMIT_MS = 7 * 60 * 1000;

export function registerImportJobRoutes({
  app,
  getBoth,
  requireRole,
  db,
  FieldValue,
  normalizeText,
  normalizeKey,
  sanitizeDocIdSegment,
  deriveContentDocId,
  extractGoogleDriveFileId,
  upsertContentLibraryItem,
  invalidateContentCache,
  invalidateScoreboardSnapshot,
}) {
  const importJobs = "importJobs";
  const importJobItems = "importJobItems";

  function itemId(type, item, index) {
    const supplied = normalizeText(item?.idempotencyKey || "");
    const identity = supplied || deriveContentDocId(type, item) || `row-${index + 1}`;
    return createHash("sha256")
      .update(`${normalizeKey(type)}:${identity}`)
      .digest("hex")
      .slice(0, 32);
  }

  function canonicalizeItem(type, item = {}) {
    const requestedId = deriveContentDocId(type, item) || "";
    const sourceDriveFileId = normalizeText(item.sourceDriveFileId)
      || extractGoogleDriveFileId(item.driveLink || item.assetLinkUrl || item.sourceUrl || item.imageUrl || item.url || "");
    const defaultKey = [
      normalizeKey(type),
      sourceDriveFileId || "no-drive-source",
      requestedId || "no-content-id",
    ].join(":");
    return {
      ...item,
      sourceDriveFileId,
      sourceSystem: normalizeText(item.sourceSystem || "poetry_please_import"),
      sourceRecordId: normalizeText(item.sourceRecordId || sourceDriveFileId || requestedId),
      idempotencyKey: normalizeText(item.idempotencyKey || defaultKey),
    };
  }

  function manifestHash(type, items) {
    return createHash("sha256")
      .update(canonicalImportManifestJson(type, items))
      .digest("hex");
  }

  function itemSummary(item, type, index) {
    return {
      type,
      index,
      requestedId: deriveContentDocId(type, item) || "",
      idempotencyKey: normalizeText(item?.idempotencyKey || item?.sourceDriveFileId || ""),
      sourceDriveFileId: normalizeText(item?.sourceDriveFileId || ""),
      sourceUrl: normalizeText(item?.driveLink || item?.assetLinkUrl || item?.imageUrl || item?.url || ""),
    };
  }

  async function createJob({ type, items, actor, batchId = "" }) {
    const canonicalItems = items.map((item) => canonicalizeItem(type, item));
    const hash = manifestHash(type, canonicalItems);
    const normalizedBatchId = sanitizeDocIdSegment(batchId) || `batch-${hash.slice(0, 24)}`;
    const jobRef = db.collection(importJobs).doc(normalizedBatchId);
    const existing = await jobRef.get();
    if (existing.exists) {
      const data = existing.data() || {};
      if (
        normalizeKey(data.type) !== type
        || Number(data.itemCount || 0) !== canonicalItems.length
        || normalizeText(data.manifestHash) !== hash
      ) {
        const err = new Error("import_batch_id_conflict");
        err.status = 409;
        throw err;
      }
      return { id: normalizedBatchId, existing: true, data };
    }

    const batch = db.batch();
    const seen = new Set();
    canonicalItems.forEach((item, index) => {
      const id = itemId(type, item, index);
      if (seen.has(id)) {
        const err = new Error("duplicate_manifest_item");
        err.status = 409;
        throw err;
      }
      seen.add(id);
      batch.set(db.collection(importJobItems).doc(`${normalizedBatchId}_${id}`), {
        batchId: normalizedBatchId,
        itemId: id,
        state: "pending",
        attempts: 0,
        ...itemSummary(item, type, index),
        payload: item,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    batch.set(jobRef, {
      batchId: normalizedBatchId,
      type,
      manifestVersion: 1,
      manifestHash: hash,
      state: "pending",
      itemCount: canonicalItems.length,
      completedCount: 0,
      failedCount: 0,
      pendingCount: canonicalItems.length,
      createdByUid: actor.uid || "",
      createdByEmail: actor.email || "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return {
      id: normalizedBatchId,
      existing: false,
      data: { batchId: normalizedBatchId, type, itemCount: canonicalItems.length, manifestHash: hash },
    };
  }

  async function updateCounts(batchId) {
    const snap = await db.collection(importJobItems).where("batchId", "==", batchId).get();
    const counts = { pending: 0, processing: 0, complete: 0, failed: 0, duplicate: 0, review: 0 };
    snap.docs.forEach((doc) => {
      const state = normalizeKey(doc.data()?.state || "pending");
      if (Object.prototype.hasOwnProperty.call(counts, state)) counts[state] += 1;
    });
    const terminal = counts.complete + counts.duplicate + counts.review;
    const state = counts.processing > 0 ? "processing"
      : counts.pending > 0 ? "pending"
        : counts.failed > 0 ? "failed" : "complete";
    await db.collection(importJobs).doc(batchId).set({
      state,
      pendingCount: counts.pending,
      processingCount: counts.processing,
      completedCount: terminal,
      failedCount: counts.failed,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { state, ...counts, completedCount: terminal };
  }

  async function recoverStaleItems(batchId) {
    const snap = await db.collection(importJobItems)
      .where("batchId", "==", batchId)
      .where("state", "==", "processing")
      .get();
    const cutoff = Date.now() - IMPORT_STALE_PROCESSING_MS;
    const stale = snap.docs.filter((doc) => {
      const updatedAt = doc.data()?.updatedAt;
      const updatedMs = typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : 0;
      return !updatedMs || updatedMs < cutoff;
    });
    if (!stale.length) return 0;
    const batch = db.batch();
    stale.forEach((doc) => batch.set(doc.ref, {
      state: "pending",
      recoveryReason: "stale_processing_lease_recovered",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
    await batch.commit();
    return stale.length;
  }

  async function snapshot(batchId) {
    const jobSnap = await db.collection(importJobs).doc(batchId).get();
    if (!jobSnap.exists) return null;
    const itemSnap = await db.collection(importJobItems).where("batchId", "==", batchId).get();
    return {
      job: { id: jobSnap.id, ...(jobSnap.data() || {}) },
      items: itemSnap.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() || {}), payload: undefined }))
        .sort((a, b) => Number(a.index || 0) - Number(b.index || 0)),
    };
  }

  async function processJob(batchId, actor, limit = IMPORT_PROCESS_BATCH_SIZE) {
    const jobRef = db.collection(importJobs).doc(batchId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      const err = new Error("import_job_not_found");
      err.status = 404;
      throw err;
    }
    const job = jobSnap.data() || {};
    const recoveredCount = await recoverStaleItems(batchId);
    const itemSnap = await db.collection(importJobItems)
      .where("batchId", "==", batchId)
      .where("state", "==", "pending")
      .limit(Math.min(Math.max(Number(limit) || IMPORT_PROCESS_BATCH_SIZE, 1), IMPORT_PROCESS_BATCH_SIZE))
      .get();
    await jobRef.set({
      state: itemSnap.empty ? (job.state || "complete") : "processing",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const processed = [];
    for (const itemDoc of itemSnap.docs) {
      const data = itemDoc.data() || {};
      const attempts = Number(data.attempts || 0) + 1;
      await itemDoc.ref.set({
        state: "processing",
        attempts,
        processingStartedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: new Date(Date.now() + IMPORT_STALE_PROCESSING_MS),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      try {
        const result = await upsertContentLibraryItem(job.type, data.payload || {}, actor);
        await itemDoc.ref.set({
          state: "complete",
          result: {
            id: result.item?.id || "",
            created: !!result.created,
            action: result.created ? "created" : "updated",
            imageUrl: result.item?.imageUrl || "",
            storagePath: result.asset?.storagePath || "",
            assetReused: !!result.asset?.reused,
            sourceDriveFileId: normalizeText(data.payload?.sourceDriveFileId),
          },
          error: FieldValue.delete(),
          errorCode: FieldValue.delete(),
          status: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        processed.push({ itemId: data.itemId, ok: true, id: result.item?.id || "" });
      } catch (err) {
        await itemDoc.ref.set({
          state: "failed",
          error: err.message || "import_failed",
          errorCode: err.message || "import_failed",
          status: Number(err.status || 0) || null,
          alternateMatches: err.alternateMatches || [],
          leaseExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        processed.push({ itemId: data.itemId, ok: false, error: err.message || "import_failed" });
      }
    }

    let counts = await updateCounts(batchId);
    let publishError = "";
    if (counts.pending === 0 && counts.processing === 0 && counts.completedCount > 0) {
      try {
        await invalidateContentCache({ strict: true });
        await invalidateScoreboardSnapshot(`content_import_job:${batchId}`);
        await jobRef.set({
          state: counts.state,
          publishError: FieldValue.delete(),
          publishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        publishError = err.message || "content_publish_invalidation_failed";
        await jobRef.set({
          state: "publish_failed",
          publishError,
          publishFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        counts = { ...counts, state: "publish_failed" };
      }
    }
    return { batchId, recoveredCount, processed, counts, publishError };
  }

  async function runToCompletion(batchId, actor) {
    const startedAt = Date.now();
    let result = null;
    do {
      result = await processJob(batchId, actor, 1);
      if ((result.counts?.pending || 0) === 0 && (result.counts?.processing || 0) === 0) break;
    } while (Date.now() - startedAt < IMPORT_SERVER_RUN_LIMIT_MS);
    return {
      batchId,
      elapsedMs: Date.now() - startedAt,
      timedOut: !!(result?.counts?.pending || result?.counts?.processing),
      counts: result?.counts || {},
      publishError: result?.publishError || "",
      snapshot: await snapshot(batchId),
    };
  }

  app.post(getBoth("/admin/contentLibrary/importJobs"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const type = normalizeKey(req.body?.type);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!type || !items.length) return res.status(400).json({ error: "missing_items" });
    if (items.length > IMPORT_JOB_MAX_ITEMS) {
      return res.status(413).json({ error: "too_many_items", maxItems: IMPORT_JOB_MAX_ITEMS });
    }
    try {
      const job = await createJob({
        type,
        items,
        batchId: req.body?.batchId,
        actor: { uid: ctx.decoded.uid, email: ctx.decoded.email },
      });
      return res.status(job.existing ? 200 : 201).json({
        ok: true,
        batchId: job.id,
        existing: job.existing,
        job: job.data,
      });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "import_job_create_failed" });
    }
  });

  app.post(getBoth("/admin/contentLibrary/importJobs/:batchId/process"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    try {
      const result = await processJob(req.params.batchId, {
        uid: ctx.decoded.uid,
        email: ctx.decoded.email,
      }, req.body?.limit);
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "import_job_process_failed" });
    }
  });

  app.post(getBoth("/admin/contentLibrary/importJobs/:batchId/run"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    try {
      const result = await runToCompletion(req.params.batchId, {
        uid: ctx.decoded.uid,
        email: ctx.decoded.email,
      });
      return res.status(result.timedOut ? 202 : 200).json({ ok: !result.timedOut, ...result });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "import_job_run_failed" });
    }
  });

  app.get(getBoth("/admin/contentLibrary/importJobs/:batchId"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const data = await snapshot(req.params.batchId);
    if (!data) return res.status(404).json({ error: "import_job_not_found" });
    return res.json({ ok: true, ...data });
  });

  app.post(getBoth("/admin/contentLibrary/importJobs/:batchId/retryFailed"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const itemSnap = await db.collection(importJobItems)
      .where("batchId", "==", req.params.batchId)
      .where("state", "==", "failed")
      .get();
    if (itemSnap.empty) {
      const jobSnap = await db.collection(importJobs).doc(req.params.batchId).get();
      return res.json({
        ok: true,
        retriedCount: 0,
        publicationRetry: !!normalizeText(jobSnap.data()?.publishError),
      });
    }
    const batch = db.batch();
    itemSnap.docs.forEach((doc) => batch.set(doc.ref, {
      state: "pending",
      error: FieldValue.delete(),
      errorCode: FieldValue.delete(),
      status: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
    await batch.commit();
    return res.json({
      ok: true,
      retriedCount: itemSnap.size,
      counts: await updateCounts(req.params.batchId),
    });
  });

  return { createJob, processJob, runToCompletion, snapshot };
}
