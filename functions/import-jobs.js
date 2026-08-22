import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import {
  buildQiLibraryWritebackValues,
  canonicalImportManifestJson,
  detectImageMimeType,
  normalizeQiLibraryYearBatchLimit,
  qiLibraryGraphicBaseId,
  qiLibraryGraphicVariantCandidates,
  qiLibraryYearStopReason,
  qiLibraryYearTaskDecision,
  selectQiLibraryYearRows,
  validateImportedGraphic,
} from "./uploader-helpers.js";

const IMPORT_JOB_MAX_ITEMS = 500;
const IMPORT_PROCESS_BATCH_SIZE = 25;
const IMPORT_STALE_PROCESSING_MS = 10 * 60 * 1000;
const IMPORT_SERVER_RUN_LIMIT_MS = 7 * 60 * 1000;
const QI_LIBRARY_YEAR_BATCHES_PER_CHECKPOINT = 1;
const QI_LIBRARY_YEAR_CHECKPOINT_DELAY_MS = 65 * 1000;
const QI_LIBRARY_YEAR_TASK_MAX_ATTEMPTS = 3;
const QI_LIBRARY_YEAR_ACTIVE_STALE_MS = 15 * 60 * 1000;
const QI_LIBRARY_SPREADSHEET_ID = process.env.QI_LIBRARY_SPREADSHEET_ID || "1vfG1vAc095q_UM08bAOoeUkIEy1s5N2yIb0Q99XF95U";
const QI_LIBRARY_SHEET_NAME = process.env.QI_LIBRARY_SHEET_NAME || "QI Folder Inventory";
const QI_LIBRARY_SHEET_ID = Number(process.env.QI_LIBRARY_SHEET_ID || 91745643);
const qiLibrarySheetsAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export function registerImportJobRoutes({
  app,
  getBoth,
  requireRole,
  db,
  FieldValue,
  enqueueQiLibraryYearTask,
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


  async function getQiLibrarySheetsAccessToken() {
    const client = await qiLibrarySheetsAuth.getClient();
    const tokenResult = await client.getAccessToken();
    const token = typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
    if (!token) {
      const err = new Error("missing_qi_library_sheets_token");
      err.status = 500;
      throw err;
    }
    return token;
  }

  async function getQiLibraryValues(range) {
    const token = await getQiLibrarySheetsAccessToken();
    const encodedRange = encodeURIComponent(`'${QI_LIBRARY_SHEET_NAME.replaceAll("'", "''")}'!${range}`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${QI_LIBRARY_SPREADSHEET_ID}/values/${encodedRange}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const err = new Error(`qi_library_read_failed:${response.status}:${detail.slice(0, 300)}`);
      err.status = response.status === 403 ? 403 : 502;
      throw err;
    }
    const payload = await response.json();
    return Array.isArray(payload.values) ? payload.values : [];
  }

  async function writeQiLibraryAuditRow({ rowNumber, sourceDriveFileId, values }) {
    const safeRow = Number(rowNumber || 0);
    if (!Number.isInteger(safeRow) || safeRow < 2) throw new Error("invalid_qi_library_row");
    const current = await getQiLibraryValues(`A${safeRow}:AI${safeRow}`);
    const currentRow = current[0] || [];
    if (normalizeText(currentRow[6]) !== normalizeText(sourceDriveFileId)) {
      const err = new Error("qi_library_source_identity_changed");
      err.status = 409;
      throw err;
    }
    const token = await getQiLibrarySheetsAccessToken();
    const encodedRange = encodeURIComponent(`'${QI_LIBRARY_SHEET_NAME.replaceAll("'", "''")}'!AD${safeRow}:AI${safeRow}`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${QI_LIBRARY_SPREADSHEET_ID}/values/${encodedRange}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          range: `'${QI_LIBRARY_SHEET_NAME}'!AD${safeRow}:AI${safeRow}`,
          majorDimension: "ROWS",
          values: [values],
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const err = new Error(`qi_library_write_failed:${response.status}:${detail.slice(0, 300)}`);
      err.status = response.status === 403 ? 403 : 502;
      throw err;
    }
    const reread = await getQiLibraryValues(`AD${safeRow}:AI${safeRow}`);
    const savedValues = (reread[0] || []).map(normalizeText);
    if (values.map(normalizeText).some((value, index) => savedValues[index] !== value)) {
      const err = new Error("qi_library_write_verification_failed");
      err.status = 502;
      throw err;
    }
    return { verified: true, values: savedValues };
  }

  async function verifyAndWriteBackQiLibraryItem({ requested, result, batchId }) {
    const sourceRow = Number(requested.sourceSpreadsheetRow || 0);
    if (!sourceRow) return { skipped: true, verified: false };
    if (
      normalizeText(requested.sourceSpreadsheetId) !== QI_LIBRARY_SPREADSHEET_ID
      || Number(requested.sourceSpreadsheetSheetId || 0) !== QI_LIBRARY_SHEET_ID
      || normalizeText(requested.sourceSpreadsheetSheetName) !== QI_LIBRARY_SHEET_NAME
    ) {
      throw new Error("qi_library_destination_mismatch");
    }
    const saved = result.item || {};
    const imageUrl = normalizeText(saved.imageUrl);
    if (!imageUrl) throw new Error("public_image_missing");
    const imageResponse = await fetch(imageUrl, {
      method: "GET",
      headers: { Range: "bytes=0-511" },
      signal: AbortSignal.timeout(15000),
    });
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    const detectedImageType = detectImageMimeType(imageBytes.subarray(0, 512));
    const headerImageType = normalizeText(imageResponse.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const verification = validateImportedGraphic({
      requested,
      saved,
      imageStatus: imageResponse.status,
      imageContentType: headerImageType.startsWith("image/") ? headerImageType : detectedImageType,
    });
    if (!verification.ok) {
      const detail = verification.mismatchedFields.length
        ? `metadata_mismatch:${verification.mismatchedFields.join(",")}`
        : (!verification.sourceIdentityMatches
          ? `source_identity_mismatch:${verification.expectedSourceDriveFileId}:${verification.savedSourceDriveFileId}`
          : `image_verification_failed:${verification.imageStatus}:${verification.imageContentType}`);
      throw new Error(detail);
    }
    const verifiedAt = new Date().toISOString();
    const values = buildQiLibraryWritebackValues({
      imageUrl: verification.imageUrl,
      docId: normalizeText(saved.id || saved.contentId || saved.imageId),
      verifiedAt,
      batchId,
      action: result.created ? "created" : "updated",
    });
    await writeQiLibraryAuditRow({
      rowNumber: sourceRow,
      sourceDriveFileId: requested.sourceDriveFileId,
      values,
    });
    return {
      verified: true,
      spreadsheetId: QI_LIBRARY_SPREADSHEET_ID,
      sheetName: QI_LIBRARY_SHEET_NAME,
      rowNumber: sourceRow,
      range: `AD${sourceRow}:AI${sourceRow}`,
      verifiedAt,
    };
  }

  async function assignQiLibraryGraphicDocId(row = {}, reservedDocIds = new Set()) {
    const baseId = qiLibraryGraphicBaseId(row);
    if (!baseId) {
      const err = new Error("missing_qi_library_content_id");
      err.status = 400;
      throw err;
    }
    const sourceDriveFileId = normalizeText(row.sourceDriveFileId)
      || extractGoogleDriveFileId(row.driveLink || "");
    for (let suffix = 1; suffix <= 200; suffix += 1) {
      const candidateIds = qiLibraryGraphicVariantCandidates(baseId, suffix);
      const snapshots = await Promise.all(candidateIds.map(async (candidateId) => ({
        candidateId,
        snap: await db.collection("graphics").doc(candidateId).get(),
      })));
      for (const { candidateId, snap } of snapshots) {
        if (!snap.exists) continue;
        const existing = snap.data() || {};
        const existingDriveFileId = normalizeText(existing.sourceDriveFileId)
          || extractGoogleDriveFileId(existing.driveLink || existing.sourceUrl || existing.imageUrl || "");
        if (sourceDriveFileId && existingDriveFileId === sourceDriveFileId) {
          reservedDocIds.add(candidateId);
          return { ...row, docId: candidateId, imageId: candidateId };
        }
      }
      const canonical = snapshots[0];
      if (!reservedDocIds.has(canonical.candidateId) && !canonical.snap.exists) {
        reservedDocIds.add(canonical.candidateId);
        return { ...row, docId: canonical.candidateId, imageId: canonical.candidateId };
      }
    }
    const err = new Error("qi_library_graphic_suffix_exhausted");
    err.status = 409;
    throw err;
  }

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
        const libraryWriteback = await verifyAndWriteBackQiLibraryItem({
          requested: data.payload || {},
          result,
          batchId,
        });
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
            libraryWriteback,
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


  app.get(getBoth("/admin/importAssistant/qiLibraryYear"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const year = normalizeText(req.query?.year || "");
    if (!/^20\d{2}$/.test(year)) return res.status(400).json({ error: "invalid_release_year" });
    const limit = Math.min(Math.max(Number(req.query?.limit || 25), 1), 100);
    const offset = Math.max(Number(req.query?.offset || 0), 0);
    try {
      const values = await getQiLibraryValues("A1:AI8000");
      return res.json({
        ok: true,
        spreadsheetId: QI_LIBRARY_SPREADSHEET_ID,
        sheetId: QI_LIBRARY_SHEET_ID,
        sheetName: QI_LIBRARY_SHEET_NAME,
        ...selectQiLibraryYearRows(values, { year, limit, offset }),
      });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "qi_library_year_load_failed" });
    }
  });

  app.post(getBoth("/admin/importAssistant/qiLibraryYear/run"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const year = normalizeText(req.body?.year || "");
    if (!/^20\d{2}$/.test(year)) return res.status(400).json({ error: "invalid_release_year" });
    try {
      const values = await getQiLibraryValues("A1:AI8000");
      const limit = normalizeQiLibraryYearBatchLimit(req.body?.limit);
      const selection = selectQiLibraryYearRows(values, { year, limit, offset: 0 });
      if (!selection.rows.length) {
        const complete = selection.reviewCount === 0;
        return res.status(complete ? 200 : 409).json({
          ok: complete,
          complete,
          stopReason: complete ? "complete" : "review_required",
          ...selection,
          batches: [],
        });
      }
      const reservedDocIds = new Set();
      const items = await Promise.all(selection.rows.map(async (row) => ({
        ...(await assignQiLibraryGraphicDocId(row, reservedDocIds)),
        imageType: "QI",
        sourceSpreadsheetId: QI_LIBRARY_SPREADSHEET_ID,
        sourceSpreadsheetSheetId: QI_LIBRARY_SHEET_ID,
        sourceSpreadsheetSheetName: QI_LIBRARY_SHEET_NAME,
      })));
      const actor = { uid: ctx.decoded.uid, email: ctx.decoded.email };
      const job = await createJob({ type: "graphics", items, actor });
      const run = await runToCompletion(job.id, actor);
      const failed = (run.snapshot?.items || []).filter((item) => item.state === "failed");
      const finalValues = await getQiLibraryValues("A1:AI8000");
      const finalSelection = selectQiLibraryYearRows(finalValues, { year, limit: 1, offset: 0 });
      const complete = finalSelection.remainingCount === 0 && finalSelection.reviewCount === 0;
      const reviewRequired = finalSelection.remainingCount === 0 && finalSelection.reviewCount > 0;
      return res.status(failed.length || run.publishError || reviewRequired ? 409 : (complete ? 200 : 202)).json({
        ok: !failed.length && !run.publishError && !reviewRequired,
        complete,
        stopReason: failed.length ? "batch_failed" : (run.publishError ? "publication_failed" : (finalSelection.remainingCount ? "checkpoint" : (finalSelection.reviewCount ? "review_required" : "complete"))),
        remainingCount: finalSelection.remainingCount,
        reviewCount: finalSelection.reviewCount,
        reviewRows: finalSelection.reviewRows,
        readyCount: finalSelection.readyCount,
        batches: [{
          batchId: job.id,
          itemCount: items.length,
          failedCount: failed.length,
          writebackCount: (run.snapshot?.items || []).filter((item) => item.result?.libraryWriteback?.verified).length,
        }],
      });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "qi_library_year_run_failed" });
    }
  });

  async function runQiLibraryYearToCheckpoint(year, actor) {
    const startedAt = Date.now();
    const coordinatorRef = db.collection("systemState").doc(`qi-library-year-${year}`);
    const batches = [];
    let stopReason = "";
    let reviewRows = [];

    while (batches.length < QI_LIBRARY_YEAR_BATCHES_PER_CHECKPOINT) {
      const values = await getQiLibraryValues("A1:AI8000");
      const selection = selectQiLibraryYearRows(values, { year, limit: 25, offset: 0 });
      if (!selection.rows.length) {
        reviewRows = selection.reviewRows;
        stopReason = selection.reviewCount ? "review_required" : "complete";
        break;
      }

      const items = [];
      const reservedDocIds = new Set();
      reviewRows = [];
      for (const row of selection.rows) {
        try {
          items.push({
            ...(await assignQiLibraryGraphicDocId(row, reservedDocIds)),
            imageType: "QI",
            sourceSpreadsheetId: QI_LIBRARY_SPREADSHEET_ID,
            sourceSpreadsheetSheetId: QI_LIBRARY_SHEET_ID,
            sourceSpreadsheetSheetName: QI_LIBRARY_SHEET_NAME,
          });
        } catch (err) {
          reviewRows.push({
            sourceSpreadsheetRow: row.sourceSpreadsheetRow,
            fileName: row.fileName,
            error: err.message || "qi_library_row_requires_review",
          });
        }
      }
      if (reviewRows.length) {
        stopReason = "review_required";
        break;
      }

      const job = await createJob({ type: "graphics", items, actor });
      const run = await runToCompletion(job.id, actor);
      const failed = (run.snapshot?.items || []).filter((item) => item.state === "failed");
      const writebackCount = (run.snapshot?.items || [])
        .filter((item) => item.result?.libraryWriteback?.verified).length;
      batches.push({
        batchId: job.id,
        itemCount: items.length,
        failedCount: failed.length,
        writebackCount,
      });

      await coordinatorRef.set({
        year,
        state: failed.length || run.publishError || run.timedOut ? "blocked" : "running",
        lastBatchId: job.id,
        completedBatchCount: FieldValue.increment(1),
        lastWritebackCount: writebackCount,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.email || actor.uid || "",
      }, { merge: true });

      stopReason = qiLibraryYearStopReason({
        failedCount: failed.length,
        publishError: run.publishError,
        timedOut: run.timedOut,
        remainingCount: 1,
      });
      if (stopReason !== "checkpoint") break;
    }

    let finalValues;
    try {
      finalValues = await getQiLibraryValues("A1:AI8000");
    } catch (err) {
      if (!String(err.message || "").includes("qi_library_read_failed:429")) throw err;
      await new Promise((resolve) => setTimeout(resolve, 65000));
      finalValues = await getQiLibraryValues("A1:AI8000");
    }
    const finalSelection = selectQiLibraryYearRows(finalValues, { year, limit: 1, offset: 0 });
    const complete = finalSelection.remainingCount === 0 && finalSelection.reviewCount === 0;
    if (!stopReason || stopReason === "checkpoint") {
      stopReason = finalSelection.remainingCount
        ? "checkpoint"
        : (finalSelection.reviewCount ? "review_required" : "complete");
    }
    if (stopReason === "review_required") reviewRows = finalSelection.reviewRows;

    await coordinatorRef.set({
      year,
      state: complete ? "complete" : (stopReason === "checkpoint" ? "checkpoint" : "blocked"),
      remainingCount: finalSelection.remainingCount,
      reviewCount: finalSelection.reviewCount,
      reviewRows: stopReason === "review_required" ? reviewRows : [],
      stopReason,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.email || actor.uid || "",
    }, { merge: true });

    return {
      year,
      complete,
      stopReason,
      remainingCount: finalSelection.remainingCount,
      reviewCount: finalSelection.reviewCount,
      readyCount: finalSelection.readyCount,
      batches,
      reviewRows,
      nextBatchDelayMs: complete ? 0 : QI_LIBRARY_YEAR_CHECKPOINT_DELAY_MS,
      elapsedMs: Date.now() - startedAt,
    };
  }

  function qiLibraryYearRunPayload(snapshot) {
    if (!snapshot?.exists) return { exists: false };
    const data = snapshot.data() || {};
    const timestamp = (value) => value?.toDate?.().toISOString?.() || null;
    return {
      exists: true,
      year: normalizeText(data.year),
      runId: normalizeText(data.runId),
      state: normalizeText(data.state),
      stopReason: normalizeText(data.stopReason),
      remainingCount: Number(data.remainingCount || 0),
      reviewCount: Number(data.reviewCount || 0),
      reviewRows: Array.isArray(data.reviewRows) ? data.reviewRows : [],
      readyCount: Number(data.readyCount || 0),
      completedBatchCount: Number(data.completedBatchCount || 0),
      totalWritebackCount: Number(data.totalWritebackCount || 0),
      lastBatchId: normalizeText(data.lastBatchId),
      lastWritebackCount: Number(data.lastWritebackCount || 0),
      lastError: normalizeText(data.lastError),
      taskAttempt: Number(data.taskAttempt || 0),
      nextRunAtMs: Number(data.nextRunAtMs || 0),
      startedAt: timestamp(data.startedAt),
      updatedAt: timestamp(data.updatedAt),
      completedAt: timestamp(data.completedAt),
      updatedBy: normalizeText(data.updatedBy),
    };
  }

  async function enqueueYearTask(data, { delaySeconds = 0 } = {}) {
    if (typeof enqueueQiLibraryYearTask !== "function") {
      const err = new Error("qi_library_year_task_queue_unavailable");
      err.status = 503;
      throw err;
    }
    await enqueueQiLibraryYearTask(data, {
      scheduleDelaySeconds: Math.max(Number(delaySeconds) || 0, 0),
      dispatchDeadlineSeconds: 9 * 60,
    });
  }

  app.get(getBoth("/admin/importAssistant/qiLibraryYear/yearRun"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const year = normalizeText(req.query?.year || "");
    if (!/^20\d{2}$/.test(year)) return res.status(400).json({ error: "invalid_release_year" });
    const snapshot = await db.collection("systemState").doc(`qi-library-year-${year}`).get();
    return res.json({ ok: true, run: qiLibraryYearRunPayload(snapshot) });
  });

  app.post(getBoth("/admin/importAssistant/qiLibraryYear/yearRun/start"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const year = normalizeText(req.body?.year || "");
    if (!/^20\d{2}$/.test(year)) return res.status(400).json({ error: "invalid_release_year" });
    const actor = { uid: ctx.decoded.uid, email: ctx.decoded.email };
    const coordinatorRef = db.collection("systemState").doc(`qi-library-year-${year}`);
    try {
      const currentSnapshot = await coordinatorRef.get();
      const current = qiLibraryYearRunPayload(currentSnapshot);
      const activeStates = new Set(["queued", "running", "retrying", "scheduling", "checkpoint"]);
      const currentUpdatedAtMs = currentSnapshot.data()?.updatedAt?.toMillis?.() || 0;
      const activeIsFresh = activeStates.has(current.state)
        && currentUpdatedAtMs
        && Date.now() - currentUpdatedAtMs < QI_LIBRARY_YEAR_ACTIVE_STALE_MS;
      if (activeIsFresh) {
        return res.status(202).json({ ok: true, alreadyRunning: true, run: current });
      }

      const values = await getQiLibraryValues("A1:AI8000");
      const selection = selectQiLibraryYearRows(values, { year, limit: 1, offset: 0 });
      if (!selection.rows.length) {
        const complete = selection.reviewCount === 0;
        await coordinatorRef.set({
          year,
          state: complete ? "complete" : "blocked",
          stopReason: complete ? "complete" : "review_required",
          remainingCount: 0,
          reviewCount: selection.reviewCount,
          reviewRows: selection.reviewRows,
          readyCount: selection.readyCount,
          completedAt: complete ? FieldValue.serverTimestamp() : FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.email || actor.uid || "",
        }, { merge: true });
        return res.status(complete ? 200 : 409).json({
          ok: complete,
          complete,
          run: qiLibraryYearRunPayload(await coordinatorRef.get()),
        });
      }

      const runId = `qi-${year}-${Date.now()}-${createHash("sha256")
        .update(`${year}:${Date.now()}:${actor.uid || actor.email || ""}`)
        .digest("hex")
        .slice(0, 12)}`;
      await coordinatorRef.set({
        year,
        runId,
        state: "queued",
        stopReason: "",
        remainingCount: selection.remainingCount,
        reviewCount: selection.reviewCount,
        reviewRows: [],
        readyCount: selection.readyCount,
        completedBatchCount: 0,
        totalWritebackCount: 0,
        lastBatchId: "",
        lastWritebackCount: 0,
        lastError: "",
        taskAttempt: 0,
        nextRunAtMs: Date.now(),
        startedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.email || actor.uid || "",
      }, { merge: true });

      try {
        await enqueueYearTask({ year, runId, actor, attempt: 0 });
      } catch (err) {
        await coordinatorRef.set({
          state: "blocked",
          stopReason: "task_enqueue_failed",
          lastError: err.message || "task_enqueue_failed",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        throw err;
      }
      return res.status(202).json({ ok: true, alreadyRunning: false, run: qiLibraryYearRunPayload(await coordinatorRef.get()) });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || "qi_library_year_start_failed" });
    }
  });

  async function runQiLibraryYearTask(data = {}) {
    const year = normalizeText(data.year || "");
    const runId = normalizeText(data.runId || "");
    const actor = {
      uid: normalizeText(data.actor?.uid || ""),
      email: normalizeText(data.actor?.email || ""),
    };
    const attempt = Math.max(Number(data.attempt || 0), 0);
    if (!/^20\d{2}$/.test(year) || !runId) {
      return { ignored: true, reason: "invalid_task_payload" };
    }

    const coordinatorRef = db.collection("systemState").doc(`qi-library-year-${year}`);
    const currentSnapshot = await coordinatorRef.get();
    const current = currentSnapshot.data() || {};
    if (!currentSnapshot.exists || normalizeText(current.runId) !== runId) {
      return { ignored: true, reason: "stale_run" };
    }
    if (["complete", "blocked"].includes(normalizeText(current.state))) {
      return { ignored: true, reason: `run_${normalizeText(current.state)}` };
    }
    if (normalizeText(current.state) === "running" && Number(current.leaseExpiresAtMs || 0) > Date.now()) {
      return { ignored: true, reason: "active_lease" };
    }

    await coordinatorRef.set({
      state: "running",
      taskAttempt: attempt,
      leaseExpiresAtMs: Date.now() + IMPORT_STALE_PROCESSING_MS,
      nextRunAtMs: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.email || actor.uid || "",
    }, { merge: true });

    try {
      const result = await runQiLibraryYearToCheckpoint(year, actor);
      const writebackCount = (result.batches || [])
        .reduce((sum, batch) => sum + Number(batch.writebackCount || 0), 0);
      const decision = qiLibraryYearTaskDecision({
        complete: result.complete,
        stopReason: result.stopReason,
        attempt,
        maxAttempts: QI_LIBRARY_YEAR_TASK_MAX_ATTEMPTS,
        checkpointDelaySeconds: Math.ceil(QI_LIBRARY_YEAR_CHECKPOINT_DELAY_MS / 1000),
      });
      await coordinatorRef.set({
        state: decision.enqueue ? "scheduling" : decision.state,
        stopReason: result.stopReason,
        remainingCount: result.remainingCount,
        reviewCount: result.reviewCount,
        reviewRows: result.reviewRows,
        readyCount: result.readyCount,
        totalWritebackCount: FieldValue.increment(writebackCount),
        lastBatchId: normalizeText(result.batches?.at(-1)?.batchId || ""),
        lastWritebackCount: writebackCount,
        lastError: "",
        taskAttempt: decision.nextAttempt,
        leaseExpiresAtMs: 0,
        nextRunAtMs: decision.enqueue ? Date.now() + decision.delaySeconds * 1000 : 0,
        completedAt: decision.state === "complete" ? FieldValue.serverTimestamp() : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.email || actor.uid || "",
      }, { merge: true });

      if (decision.enqueue) {
        try {
          await enqueueYearTask(
            { year, runId, actor, attempt: decision.nextAttempt },
            { delaySeconds: decision.delaySeconds },
          );
          await coordinatorRef.set({
            state: decision.state,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          await coordinatorRef.set({
            state: "blocked",
            stopReason: "task_enqueue_failed",
            lastError: err.message || "task_enqueue_failed",
            nextRunAtMs: 0,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          throw err;
        }
      }
      return { ok: decision.state !== "blocked", result, decision };
    } catch (err) {
      const decision = qiLibraryYearTaskDecision({
        stopReason: "task_error",
        attempt,
        maxAttempts: QI_LIBRARY_YEAR_TASK_MAX_ATTEMPTS,
      });
      await coordinatorRef.set({
        state: decision.enqueue ? "scheduling" : "blocked",
        stopReason: "task_error",
        lastError: err.message || "qi_library_year_task_failed",
        taskAttempt: decision.nextAttempt,
        leaseExpiresAtMs: 0,
        nextRunAtMs: decision.enqueue ? Date.now() + decision.delaySeconds * 1000 : 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (decision.enqueue) {
        try {
          await enqueueYearTask(
            { year, runId, actor, attempt: decision.nextAttempt },
            { delaySeconds: decision.delaySeconds },
          );
          await coordinatorRef.set({
            state: "retrying",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          return { ok: true, retryScheduled: true, decision };
        } catch (enqueueErr) {
          await coordinatorRef.set({
            state: "blocked",
            stopReason: "task_retry_enqueue_failed",
            lastError: enqueueErr.message || "task_retry_enqueue_failed",
            nextRunAtMs: 0,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          throw enqueueErr;
        }
      }
      return { ok: false, blocked: true, error: err.message || "qi_library_year_task_failed" };
    }
  }

  app.post(getBoth("/admin/importAssistant/qiLibraryYear/runAll"), async (req, res) => {
    const ctx = await requireRole(req, res, ["admin"]);
    if (!ctx) return;
    const year = normalizeText(req.body?.year || "");
    if (!/^20\d{2}$/.test(year)) return res.status(400).json({ error: "invalid_release_year" });
    try {
      const result = await runQiLibraryYearToCheckpoint(year, {
        uid: ctx.decoded.uid,
        email: ctx.decoded.email,
      });
      const safeCheckpoint = result.complete || result.stopReason === "checkpoint";
      return res.status(result.complete ? 200 : (safeCheckpoint ? 202 : 409)).json({
        ok: safeCheckpoint,
        ...result,
      });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "qi_library_year_run_failed" });
    }
  });

  return { createJob, processJob, runToCompletion, snapshot, runQiLibraryYearTask };
}
