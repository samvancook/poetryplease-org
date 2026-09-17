const RECONCILIATION_ID = 2;
const API = `/api/admin/manuscriptReconciliations/${RECONCILIATION_ID}`;
// Reviewer feedback (Saff Drayton, Phase 1; Emory Thompson, Phase 4) both flagged this list as
// too long and inconsistently worded for routine use. COMMON_ACTIONS covers the everyday cases;
// MORE_ACTIONS holds the same underlying values Catalog already accepts, just tucked behind an
// optgroup so they don't compete with the common path. No resolutionAction value was removed.
const COMMON_ACTIONS = [
  ["retain_prior", "Keep earlier source"],
  ["adopt_candidate", "Approve replacement"],
  ["combine_text_and_format", "Choose wording and formatting sources"],
];
// "Approve substantive replacement" was removed: reviewers could not tell it apart
// from "Approve replacement", and Catalog proposes it on most pending rows, so it
// was the accidental default. Its underlying value is still accepted by Catalog.
// The image and parser labels now say what a reviewer does, not what the pipeline
// calls it. Retire, create and reject are deliberately left alone for now.
const MORE_ACTIONS = [
  ["carry_forward_wording_adopt_final_format", "Approve candidate formatting only (keep earlier wording)"],
  ["review_create", "Create a new canonical poem"],
  ["review_retire", "Retire the earlier poem"],
  ["reject_extraction", "Reject this candidate extraction"],
  ["request_ocr", "Send to image review"],
  ["request_parser_correction", "Needs editing"],
  ["manual_source_required", "Needs editorial source decision"],
];
// A poem still in the queue starts with no decision selected. Catalog's proposal is
// a suggestion, not a choice a reviewer made, and pre-selecting it meant Save could
// record a decision nobody actually took.
const UNDECIDED = "";
const ACTIONS = [...COMMON_ACTIONS, ...MORE_ACTIONS];
const SOURCE_CHOICE_ACTION = "combine_text_and_format";

// Status used to live in its own dropdown defaulting to "Needs review", so a reviewer
// could pick an action, save successfully, and leave the poem in the queue anyway.
// Actions that settle a poem now carry their status; actions that ask for other work
// deliberately keep it pending, because they are requests rather than decisions.
const ACTION_STATUS = {
  retain_prior: "approved",
  adopt_candidate: "approved",
  combine_text_and_format: "approved",
  carry_forward_wording_adopt_final_format: "approved",
  review_create: "approved",
  review_retire: "approved",
  reject_extraction: "rejected",
  request_ocr: "pending",
  request_parser_correction: "pending",
  manual_source_required: "pending",
};
// Anything unrecognised, including no selection at all, keeps the poem queued.
const statusForAction = (action) => ACTION_STATUS[action] || "pending";
const STATUS_LABELS = { pending: "Needs review", approved: "Approved", rejected: "Rejected" };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const preserveText = (value) => String(value ?? "").replace(/\r\n?/g, "\n");
const normalizeWhitespace = (value) => preserveText(value).split("\n").map((line) => line.replace(/[ \t]+/g, " ").trimEnd()).join("\n");
const rowMatchesSearch = (row, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [row?.identity, row?.priorTitle, row?.candidateTitle, row?.canonicalTitle, row?.status, ...(row?.buckets || []), ...(row?.warnings || [])]
    .filter(Boolean).join(" ").toLowerCase().includes(q);
};
const withSourceIds = (row) => ({
  ...row,
  prior: row?.prior ? { ...row.prior, id: row.prior.id ?? row.prior.sourcePoemId } : row?.prior,
  candidate: row?.candidate ? { ...row.candidate, id: row.candidate.id ?? row.candidate.sourcePoemId } : row?.candidate,
});
const sourceOptions = (row, selected) => [
  row?.prior && [row.prior.id, `Earlier source · ${row.prior.title || row.priorTitle || "Untitled"}`],
  row?.candidate && [row.candidate.id, `Proposed replacement · ${row.candidate.title || row.candidateTitle || "Untitled"}`],
].filter(Boolean).map(([id, label]) => `<option value="${esc(id)}" ${Number(id) === Number(selected) ? "selected" : ""}>${esc(label)}</option>`).join("");
const poemLines = (text, normalized) => (normalized ? normalizeWhitespace(text) : preserveText(text)).split("\n")
  .map((line, index) => `<span class="line"><i>${index + 1}</i><b>${line ? esc(line) : "&nbsp;"}</b></span>`).join("");
const needsNotes = (row, decision) => {
  if (["review_create", "review_retire", "reject_extraction", "request_ocr", "request_parser_correction"].includes(decision.resolutionAction)) return true;
  if (decision.reviewStatus === "rejected") return true;
  if (String(decision.stablePoemIdentity || "") !== String(row.identity || "")) return true;
  const currentTitle = row.canonicalTitle || row.candidateTitle || row.priorTitle || "";
  if (String(decision.canonicalTitle || "") !== String(currentTitle)) return true;
  return Number(decision.textSourcePoemId) !== Number(row.candidate?.id);
};
const idempotencyKey = () => crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map((v) => v.toString(16).padStart(2, "0")).join("");

const LABC_RECORDED_EXPECTED_FINAL_COUNT = 45;
const rowHasCatalogWarning = (row) => Array.isArray(row?.warnings) && row.warnings.length > 0;
const rowHasPlaceholderCandidate = (row) => row?.candidate && String(row.candidate.text || "").trim() === "*";
export const rowMatchesSummary = (row, summary = "all") => {
  if (summary === "auto-approved") return row?.status === "auto_approved";
  if (summary === "pending") return row?.status === "pending";
  if (summary === "warnings") return rowHasCatalogWarning(row) || rowHasPlaceholderCandidate(row);
  return true;
};
export const filterRowsBySummary = (rows, summary = "all") => rows.filter((row) => rowMatchesSummary(row, summary));
const uniquePositiveInts = (values) => [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
const expectedFinalCount = (reconciliation) => {
  const supplied = [
    reconciliation?.expectedFinalCount,
    reconciliation?.expectedFinalPoemCount,
    reconciliation?.expectedResolvedCount,
    reconciliation?.totals?.expectedFinalCount,
    reconciliation?.totals?.expectedFinalPoemCount,
  ].map(Number).find((value) => Number.isInteger(value) && value > 0);
  return supplied ?? (Number(reconciliation?.id) === RECONCILIATION_ID ? LABC_RECORDED_EXPECTED_FINAL_COUNT : null);
};
const visualPageMapping = (row) => [row?.prior, row?.candidate]
  .find((source) => source?.sourcePages?.status === "available") || null;
const visualPageSide = (row) => {
  const source = visualPageMapping(row);
  if (!source) return null;
  return source === row?.prior ? "prior" : "candidate";
};
const requestedResolutionId = () => {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get("resolutionId"));
  return Number.isInteger(value) && value > 0 ? value : null;
};
const visualReviewHref = (row) => {
  const side = visualPageSide(row);
  if (!side || !Number.isInteger(Number(row?.resolutionId))) return null;
  const query = new URLSearchParams({ resolutionId: String(row.resolutionId), side });
  return "/manuscript-visual-review.html?" + query.toString();
};

export const candidateSourceKey = (row) => {
  if (!row || typeof row !== "object") return null;
  if (row.candidate === null || row.candidate === undefined) return "none";
  const candidateId = Number(row.candidate.id ?? row.candidate.sourcePoemId);
  return Number.isInteger(candidateId) ? `source:${candidateId}` : null;
};
export const candidateSourceMatches = (reviewedRow, authoritativeRow) => {
  const reviewed = candidateSourceKey(reviewedRow);
  const authoritative = candidateSourceKey(authoritativeRow);
  return reviewed !== null && authoritative !== null && reviewed === authoritative;
};

async function authorize() {
  if (!firebase.apps?.length) {
    const configResponse = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!configResponse.ok) throw Error("Firebase configuration could not be loaded.");
    firebase.initializeApp(await configResponse.json());
  }
  const app = firebase.app();
  const user = await new Promise((resolve) => firebase.auth(app).onAuthStateChanged(resolve));
  if (!user) throw Error("Sign in through Poetry Please Admin with a team account.");
  const token = await user.getIdToken();
  const me = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!me.ok) throw Error("Poetry Please authorization check failed.");
  const profile = await me.json();
  if (!Array.isArray(profile.roles) || !profile.roles.some((role) => role === "team" || role === "admin")) {
    throw Error("A Poetry Please team or admin account is required.");
  }
  return { token, profile };
}

export async function load(token, fetcher = fetch) {
  const response = await fetcher(API, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw Error(`Catalog reconciliation request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.writeEnabled !== true || payload.readOnly !== false || payload.writeScope !== "reconciliation" || Number(payload.reconciliation?.id) !== RECONCILIATION_ID || !Array.isArray(payload.rows)) {
    throw Error("Live reconciliation write scope is not available.");
  }
  return { ...payload, rows: payload.rows.map(withSourceIds) };
}

export async function reloadIfCandidateChanged(token, reviewedRow, fetcher = fetch) {
  const authoritativeData = await load(token, fetcher);
  const authoritativeRow = authoritativeData.rows.find((row) => Number(row.resolutionId) === Number(reviewedRow?.resolutionId));
  return authoritativeRow && candidateSourceMatches(reviewedRow, authoritativeRow) ? null : authoritativeData;
}

async function saveResolution(token, resolutionId, decision, key) {
  const response = await fetch(`${API}/resolutions/${encodeURIComponent(resolutionId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(decision),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `Save failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  if (!payload.authoritativeResolution || !Number.isInteger(Number(payload.reconciliationRevision))) throw Error("Catalog save succeeded without authoritative readback.");
  return payload;
}

function createApp(root, initialData, auth) {
  let data = initialData;
  const requestedId = requestedResolutionId();
  let selectedId = data.rows.some((row) => Number(row.resolutionId) === requestedId)
    ? requestedId
    : data.rows[0]?.resolutionId ?? null;
  let search = "";
  let searchDraft = "";
  let mode = "exact";
  let saving = false;
  let message = "";
  let retry = null;
  let summary = "all";
  const visibleRows = () => filterRowsBySummary(data.rows, summary).filter((row) => rowMatchesSearch(row, search));
  const selected = () => visibleRows().find((row) => Number(row.resolutionId) === Number(selectedId)) || visibleRows()[0] || null;
  const nextRowId = (rows, current) => {
    const index = rows.findIndex((row) => Number(row.resolutionId) === Number(current));
    return rows[index + 1]?.resolutionId ?? rows[0]?.resolutionId ?? null;
  };

  async function reload(note = "") {
    data = await load(auth.token);
    message = note;
    retry = null;
    render();
  }

  async function save(advance = false) {
    const row = selected();
    if (!row || saving) return;
    // No empty-value fallback to the proposal here: an unchosen decision must stop
    // the save, not quietly become Catalog's suggestion.
    const chosenAction = root.querySelector("#resolution-action")?.value ?? "";
    if (!chosenAction) {
      message = "Choose a resolution action before saving.";
      render();
      root.querySelector("#resolution-action")?.focus();
      return;
    }
    const decision = {
      expectedReconciliationRevision: Number(data.reconciliation.writeRevision || row.reconciliationRevision),      reviewStatus: root.querySelector("#review-status")?.value || row.status || "pending",
      resolutionAction: chosenAction,
      canonicalTitle: root.querySelector("#canonical-title")?.value.trim() || row.canonicalTitle || row.candidateTitle || row.priorTitle,
      stablePoemIdentity: root.querySelector("#stable-identity")?.value.trim() || row.identity,
      textSourcePoemId: Number(root.querySelector("#text-source")?.value),
      formatSourcePoemId: Number(root.querySelector("#format-source")?.value),
      notes: root.querySelector("#review-notes")?.value.trim() || null,
    };
    if (needsNotes(row, decision) && !decision.notes) {
      message = "Notes are required for this decision.";
      render();
      root.querySelector("#review-notes")?.focus();
      return;
    }
    const serialized = JSON.stringify(decision);
    if (!retry || retry.serialized !== serialized) retry = { serialized, key: idempotencyKey() };
    saving = true;
    message = "Saving to the production Catalog…";
    render();
    let writeStarted = false;
    try {
      const authoritativeData = await reloadIfCandidateChanged(auth.token, row);
      if (authoritativeData) {
        data = authoritativeData;
        message = "The candidate source changed. Authoritative data was reloaded; review before saving again.";
        retry = null;
        return;
      }
      writeStarted = true;
      const result = await saveResolution(auth.token, row.resolutionId, decision, retry.key);
      const index = data.rows.findIndex((item) => Number(item.resolutionId) === Number(row.resolutionId));
      data.rows[index] = withSourceIds(result.authoritativeResolution);
      data.reconciliation.writeRevision = result.reconciliationRevision;
      message = result.idempotent ? "Verified idempotent retry and authoritative readback." : "Saved to Catalog and verified authoritative readback.";
      retry = null;
      if (advance) selectedId = nextRowId(visibleRows(), row.resolutionId);
    } catch (error) {
      if (!writeStarted) {
        message = `Candidate check failed: ${error.message} No decision was saved.`;
      } else if (error.status === 409 && error.payload?.error === "stale_reconciliation_revision") {
        await reload("A newer Catalog revision exists. Authoritative data was reloaded; review before saving again.");
      } else {
        message = `Save failed: ${error.message} You can retry without creating a duplicate decision.`;
      }
    } finally {
      saving = false;
      render();
    }
  }

  function render() {
    const rec = data.reconciliation;
    const rows = visibleRows();
    const row = selected();
    if (row) selectedId = row.resolutionId;
    const title = row?.canonicalTitle || row?.candidateTitle || row?.priorTitle || "";
    const textSource = row?.textSourcePoemId || row?.candidate?.id || row?.prior?.id;
    const formatSource = row?.formatSourcePoemId || row?.candidate?.id || row?.prior?.id;
    const audits = Array.isArray(row?.auditHistory) ? row.auditHistory : [];
    const warningRows = data.rows.filter((item) => rowMatchesSummary(item, "warnings"));
    const candidateVersions = uniquePositiveInts(data.rows.map((item) => item?.candidate?.sourceVersionId));
    const expectedCount = expectedFinalCount(rec);
    const visualHref = visualReviewHref(row);
    // An already-decided poem keeps the status it was given. One still in the queue
    // shows the status its current action will actually save, so what the reviewer
    // sees is what gets written.
    // A decided poem shows what it was decided as. A queued poem shows no decision
    // yet, so Catalog's proposal can never be saved as though a reviewer chose it.
    const decided = Boolean(row?.status && row.status !== "pending");
    const actionValue = decided ? row.proposedResolution : UNDECIDED;
    const statusValue = decided ? row.status : statusForAction(actionValue);
    const visualSide = visualPageSide(row);
    const visualSideLabel = visualSide === "prior" ? "Earlier source" : visualSide === "candidate" ? "Proposed replacement" : null;
    const summaryCards = [
      ["all", data.rows.length, "comparison records"],
      ["auto-approved", data.rows.filter((item) => rowMatchesSummary(item, "auto-approved")).length, "low-risk matches already approved"],
      ["pending", data.rows.filter((item) => rowMatchesSummary(item, "pending")).length, "decisions still needed"],
      ["warnings", warningRows.length, "source or parser warnings"],
    ];
    root.innerHTML = `
      <div class="banner fixture">Live editorial reconciliation · decisions write to the production Catalog</div>
      <div class="banner readonly">Authenticated Phase 2 production · reconciliation ${esc(rec.id)} is writable</div>
      <section class="dashboard">
        <p class="eyebrow">Reconciliation ${esc(rec.id)} · Catalog decision revision ${esc(rec.writeRevision)}</p>
        <h1>${esc(rec.bookTitle || "Manuscript Reconciliation")}</h1>
        <p>Signed in reviewer: ${esc(data.currentReviewer?.email)} · roles ${esc((data.currentReviewer?.roles || []).join(", "))}</p>
        <p class="help"><b>Candidate source:</b> ${candidateVersions.length === 1 ? `Source ${esc(candidateVersions[0])}` : "Catalog did not provide one shared candidate source"} · <b>Expected resolved book:</b> ${expectedCount ? `${esc(expectedCount)} poems` : "not supplied by Catalog"}</p>
        <div class="stats">${summaryCards.map(([key, count, label]) => `<button type="button" class="stat" data-summary="${key}" aria-pressed="${summary === key}"><b>${esc(count)}<span>${esc(label)}</span></b></button>`).join("")}</div>
        <p class="help">Select a count to filter the review queue. The current filter is ${summary === "all" ? "all records" : esc(summary.replace("-", " "))}.</p>
      </section>
      <section class="workspace">
        <aside class="panel"><h2>Review queue</h2>
          <form id="search-form"><label for="search">Search titles, warnings, and statuses</label><div class="search-row"><input id="search" type="search" value="${esc(searchDraft)}"><button type="submit">Search</button><button type="button" id="clear-search">Clear</button></div></form>
          <p class="help">Search runs when you press Search or Enter.</p>
          <p>${rows.length} comparison records · live editorial decisions are writable</p>
          <div class="list">${rows.map((item) => `<button data-row="${item.resolutionId}" class="writable-row"><span>${esc(item.identity)}</span><small>#${item.resolutionId} · ${esc(item.status)} · writable</small></button>`).join("")}</div>
        </aside>
        <main class="panel comparison">${row ? `
          <div class="comparehead"><h2>Text comparison</h2><div><button data-mode="exact" aria-pressed="${mode === "exact"}">Source text</button><button data-mode="normalized" aria-pressed="${mode === "normalized"}">Spacing-normalized text</button></div></div>
          <p class="help">${mode === "exact" ? "Source text preserves extracted spaces and line breaks." : "Spacing-normalized text is only for comparison and does not change Catalog data."}</p>
          <div class="texts"><article><h3>Earlier source · ${esc(row.priorTitle || "Unavailable")}</h3><div class="poem">${poemLines(row.prior?.text, mode === "normalized")}</div></article><article><h3>Proposed replacement · ${esc(row.candidateTitle || "Unavailable")}</h3><div class="poem">${poemLines(row.candidate?.text, mode === "normalized")}</div></article></div>` : '<div class="empty">No comparison record selected.</div>'}</main>
        <aside class="panel detail">${row ? `
          <h2>Decision</h2>
          <h3>Visual PDF context</h3>
          ${visualHref
            ? `<p><a class="visual-link" href="${esc(visualHref)}">View available PDF context (${esc(visualSideLabel)})</a></p><p class="help">This opens the matching Catalog-bound PDF evidence for the ${esc(visualSideLabel.toLowerCase())} only, with a link back to this text-review record.</p>`
            : `<p class="warnings"><b>No verified PDF page mapping is available for this comparison.</b> Do not treat malformed extracted text as canonical wording. Request OCR or parser correction and have Catalog add the page mapping.</p>`}
          ${rowHasPlaceholderCandidate(row) ? `<p class="warnings"><b>Candidate text is a placeholder (*), not a reviewable poem body.</b></p>` : ""}
          ${rowHasCatalogWarning(row) ? `<h3>Catalog warnings</h3><ul class="warnings">${row.warnings.map((warning) => `<li>${esc(warning)}</li>`).join("")}</ul>` : ""}
          <label>Status<select id="review-status">${["pending", "approved", "rejected"].map((value) => `<option value="${value}" ${value === statusValue ? "selected" : ""}>${STATUS_LABELS[value]}</option>`).join("")}</select></label>
          <p class="help" id="status-help">${actionValue === UNDECIDED
            ? "Choose a resolution action above and this will follow."
            : statusValue === "pending"
              ? "This action asks for other work, so the poem stays in the review queue."
              : `Set from the resolution action above. Saving marks this poem ${esc(STATUS_LABELS[statusValue].toLowerCase())} and removes it from the queue. Change it here if you need a different outcome.`}</p>
          <label>Resolution action<select id="resolution-action">
            ${actionValue === UNDECIDED ? `<option value="" selected>Choose a decision…</option>` : ""}
            <optgroup label="Common decisions">${COMMON_ACTIONS.map(([value, label]) => `<option value="${value}" ${actionValue === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</optgroup>
            <optgroup label="More options">${MORE_ACTIONS.map(([value, label]) => `<option value="${value}" ${actionValue === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</optgroup>
          </select></label>
          <label>Canonical title<input id="canonical-title" value="${esc(title)}"></label>
          <div id="source-choice-fields" hidden>
            <p class="help">These only apply when the resolution action above is “Choose wording and formatting sources.”</p>
            <label>Stable poem identity<input id="stable-identity" value="${esc(row.identity)}"></label>
            <label>Wording source<select id="text-source">${sourceOptions(row, textSource)}</select></label>
            <p class="help">Which version's actual words become canonical.</p>
            <label>Formatting source<select id="format-source">${sourceOptions(row, formatSource)}</select></label>
            <p class="help">Which version's line breaks and spacing become canonical. Pick a different source here than above only if one version has the right words but the wrong line breaks, or the reverse.</p>
          </div>
          <label>Reviewer notes<textarea id="review-notes" rows="5">${esc(row.existingReviewNotes || "")}</textarea></label>
          <p class="notice">If the candidate has a stray page number, neighboring title, missing text, or wrong reading order, choose “Needs parser correction” and describe it here.</p>
          <div class="save-actions"><button id="save" ${saving ? "disabled" : ""}>Save decision</button><button id="save-advance" ${saving ? "disabled" : ""}>Save decision and next</button></div>
          <p class="help">Both buttons save your decision. The second opens the next record after the save is verified.</p>
          <p class="status-message" role="status">${esc(message)}</p>
          <h3>Audit history</h3>${audits.length ? `<ol class="audit">${audits.slice().reverse().map((event) => `<li><b>${esc(event?.reviewer?.email || event?.reviewedBy || "Unknown reviewer")}</b><small>${esc(event?.timestamp || event?.reviewedAt || "Time unavailable")}${event?.resultingReconciliationRevision ? ` · revision ${event.resultingReconciliationRevision}` : ""}</small><p>${esc(event?.notes || "No notes")}</p></li>`).join("")}</ol>` : "<p>No audit history supplied.</p>"}` : '<div class="empty">No detail available.</div>'}</aside>
      </section>`;

    const toggleSourceChoiceFields = () => {
      const actionValue = root.querySelector("#resolution-action")?.value;
      const fields = root.querySelector("#source-choice-fields");
      if (fields) fields.hidden = actionValue !== SOURCE_CHOICE_ACTION;
    };
    const syncStatusToAction = () => {
      const actionValue = root.querySelector("#resolution-action")?.value;
      const status = root.querySelector("#review-status");
      const help = root.querySelector("#status-help");
      if (!status) return;
      const next = statusForAction(actionValue);
      status.value = next;
      if (help) {
        help.textContent = next === "pending"
          ? "This action asks for other work, so the poem stays in the review queue."
          : `Set from the resolution action above. Saving marks this poem ${STATUS_LABELS[next].toLowerCase()} and removes it from the queue. Change it here if you need a different outcome.`;
      }
    };
    toggleSourceChoiceFields();
    root.querySelector("#resolution-action")?.addEventListener("change", () => {
      toggleSourceChoiceFields();
      syncStatusToAction();
    });

    for (const button of root.querySelectorAll("[data-summary]")) button.addEventListener("click", () => {
      summary = button.dataset.summary || "all";
      selectedId = visibleRows()[0]?.resolutionId ?? null;
      message = "";
      retry = null;
     
      render();
    });
    root.querySelector("#search")?.addEventListener("input", (event) => { searchDraft = event.target.value; });
    root.querySelector("#search-form")?.addEventListener("submit", (event) => { event.preventDefault(); search = searchDraft; selectedId = visibleRows()[0]?.resolutionId ?? null; render(); });
    root.querySelector("#clear-search")?.addEventListener("click", () => { search = ""; searchDraft = ""; selectedId = data.rows[0]?.resolutionId ?? null; render(); });
    for (const button of root.querySelectorAll("[data-row]")) button.addEventListener("click", () => { selectedId = Number(button.dataset.row); message = ""; retry = null; render(); });
    for (const button of root.querySelectorAll("[data-mode]")) button.addEventListener("click", () => { mode = button.dataset.mode; render(); });
    root.querySelector("#save")?.addEventListener("click", () => save(false));
    root.querySelector("#save-advance")?.addEventListener("click", () => save(true));
  }

  render();
}

async function boot() {
  const root = document.querySelector("#reconciliation-app");
  try {
    const auth = await authorize();
    const data = await load(auth.token);
    createApp(root, data, auth);
  } catch (error) {
    root.innerHTML = `<div class="state locked"><h1>Team access required</h1><p>${esc(error.message)}</p><p><a href="/admin.html">Return to Poetry Please Admin</a></p></div>`;
  }
}

if (typeof document !== "undefined") boot();