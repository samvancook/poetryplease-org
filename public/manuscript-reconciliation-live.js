const RECONCILIATION_ID = 2;
const API = `/api/admin/manuscriptReconciliations/${RECONCILIATION_ID}`;
const ACTIONS = [
  ["carry_forward_wording_adopt_final_format", "Approve candidate formatting"],
  ["adopt_candidate", "Approve candidate wording and formatting"],
  ["retain_prior", "Keep prior wording and formatting"],
  ["combine_text_and_format", "Choose wording and formatting sources"],
  ["review_replacement", "Approve substantive replacement"],
  ["review_create", "Create canonical poem"],
  ["review_retire", "Retire prior poem"],
  ["reject_extraction", "Reject candidate extraction"],
  ["request_ocr", "Needs OCR"],
  ["request_parser_correction", "Needs parser correction"],
  ["manual_source_required", "Needs editorial source decision"],
];

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
  row?.prior && [row.prior.id, `Prior · ${row.prior.title || row.priorTitle || "Untitled"}`],
  row?.candidate && [row.candidate.id, `Candidate · ${row.candidate.title || row.candidateTitle || "Untitled"}`],
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

export async function loadSourcePages(token, resolutionId, side, fetcher = fetch) {
  const sourceSide = String(side || "").trim().toLowerCase();
  if (sourceSide !== "prior" && sourceSide !== "candidate") throw Error("Choose an earlier or proposed source.");
  const base = `${API}/resolutions/${encodeURIComponent(resolutionId)}/source-pages`;
  const query = new URLSearchParams({ side: sourceSide }).toString();
  const response = await fetcher(`${base}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(payload?.error || `Source-page request failed with HTTP ${response.status}.`);
  if (!payload.source || !Array.isArray(payload.pages)) throw Error("Catalog returned an incomplete source-page reference.");
  return { ...payload, pdfUrl: `${base}/pdf?${query}`, selectedPage: 0 };
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
  let selectedId = data.rows[0]?.resolutionId ?? null;
  let search = "";
  let searchDraft = "";
  let mode = "exact";
  let saving = false;
  let message = "";
  let retry = null;
  let visual = null;
  let visualError = "";
  let visualLoading = false;
  const visibleRows = () => data.rows.filter((row) => rowMatchesSearch(row, search));
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

  async function openVisual(side) {
    const row = selected();
    if (!row || visualLoading) return;
    visualLoading = true;
    visualError = "";
    render();
    try {
      visual = await loadSourcePages(auth.token, row.resolutionId, side);
    } catch (error) {
      visual = null;
      visualError = error.message;
    } finally {
      visualLoading = false;
      render();
    }
  }

  async function save(advance = false) {
    const row = selected();
    if (!row || saving) return;
    const decision = {
      expectedReconciliationRevision: Number(data.reconciliation.writeRevision || row.reconciliationRevision),
      reviewStatus: root.querySelector("#review-status")?.value || row.status || "pending",
      resolutionAction: root.querySelector("#resolution-action")?.value || row.proposedResolution,
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
    root.innerHTML = `
      <div class="banner fixture">Live editorial reconciliation · decisions write to the production Catalog</div>
      <div class="banner readonly">Authenticated Phase 2 production · reconciliation ${esc(rec.id)} is writable</div>
      <section class="dashboard">
        <p class="eyebrow">Reconciliation ${esc(rec.id)} · revision ${esc(rec.writeRevision)}</p>
        <h1>${esc(rec.bookTitle || "Manuscript Reconciliation")}</h1>
        <p>Signed in reviewer: ${esc(data.currentReviewer?.email)} · roles ${esc((data.currentReviewer?.roles || []).join(", "))}</p>
        <div class="stats"><b>${rec.totals?.resolutionRows ?? 0}<span>comparison records</span></b><b>${rec.totals?.autoApproved ?? 0}<span>low-risk matches already approved</span></b><b>${rec.totals?.pending ?? 0}<span>decisions still needed</span></b><b>${rec.writeRevision ?? 0}<span>Catalog decision revision</span></b></div>
      </section>
      <section class="workspace">
        <aside class="panel"><h2>Review queue</h2>
          <form id="search-form"><label for="search">Search titles, warnings, and statuses</label><div class="search-row"><input id="search" type="search" value="${esc(searchDraft)}"><button type="submit">Search</button><button type="button" id="clear-search">Clear</button></div></form>
          <p class="help">Search runs when you press Search or Enter.</p>
          <p>${rows.length} comparison records · live editorial decisions are writable</p>
          <div class="list">${rows.map((item) => `<button data-row="${item.resolutionId}" class="writable-row"><span>${esc(item.identity)}</span><small>#${item.resolutionId} · ${esc(item.status)} · writable</small></button>`).join("")}</div>
        </aside>
        <main class="panel comparison">${row ? `
          <div class="comparehead"><h2>Text comparison</h2><div><button data-mode="exact" aria-pressed="${mode === "exact"}">Source text</button><button data-mode="normalized" aria-pressed="${mode === "normalized"}">Spacing-normalized text</button><button id="visual-prior" ${visualLoading || !row.prior ? "disabled" : ""}>Earlier-page context</button><button id="visual-candidate" ${visualLoading || !row.candidate ? "disabled" : ""}>Proposed-page context</button></div></div>
          <p class="help">${mode === "exact" ? "Source text preserves extracted spaces and line breaks." : "Spacing-normalized text is only for comparison and does not change Catalog data."}</p>
          <div class="texts"><article><h3>Earlier source · ${esc(row.priorTitle || "Unavailable")}</h3><div class="poem">${poemLines(row.prior?.text, mode === "normalized")}</div></article><article><h3>Proposed replacement · ${esc(row.candidateTitle || "Unavailable")}</h3><div class="poem">${poemLines(row.candidate?.text, mode === "normalized")}</div></article></div>${visual ? `
          <section class="visual-review" aria-live="polite"><div class="visual-head"><div><h3>Visual PDF context · ${esc(visual.side === "candidate" ? "Proposed replacement" : "Earlier source")}</h3><p class="help">Catalog page ${esc(visual.pages[visual.selectedPage]?.pageLabel || String((visual.pages[visual.selectedPage]?.pageIndex ?? 0) + 1))}. This is the protected source PDF; it does not change canonical text.</p></div><div class="visual-nav"><button id="visual-prev" ${visual.selectedPage <= 0 ? "disabled" : ""}>Previous page</button><select id="visual-page" aria-label="PDF page">${visual.pages.map((page, index) => `<option value="${index}" ${index === visual.selectedPage ? "selected" : ""}>Page ${esc(page.pageLabel || String(page.pageIndex + 1))}${page.side ? ` · ${esc(page.side)}` : ""}</option>`).join("")}</select><button id="visual-next" ${visual.selectedPage >= visual.pages.length - 1 ? "disabled" : ""}>Next page</button></div></div><iframe class="visual-pdf" title="Protected source PDF page ${esc(visual.pages[visual.selectedPage]?.pageLabel || "")}" src="${esc(visual.pdfUrl)}#page=${Number(visual.pages[visual.selectedPage]?.pageIndex || 0) + 1}"></iframe></section>` : visualError ? `<section class="visual-review error"><h3>Visual PDF context unavailable</h3><p>${esc(visualError)}</p></section>` : ""}` : '<div class="empty">No comparison record selected.</div>'}</main>
        <aside class="panel detail">${row ? `
          <h2>Decision</h2>
          <label>Status<select id="review-status"><option value="pending" ${row.status === "pending" ? "selected" : ""}>Needs review</option><option value="approved" ${row.status === "approved" ? "selected" : ""}>Approved</option><option value="rejected" ${row.status === "rejected" ? "selected" : ""}>Rejected</option></select></label>
          <label>Resolution action<select id="resolution-action">${ACTIONS.map(([value, label]) => `<option value="${value}" ${row.proposedResolution === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
          <label>Canonical title<input id="canonical-title" value="${esc(title)}"></label>
          <label>Stable poem identity<input id="stable-identity" value="${esc(row.identity)}"></label>
          <label>Wording source<select id="text-source">${sourceOptions(row, textSource)}</select></label>
          <label>Formatting source<select id="format-source">${sourceOptions(row, formatSource)}</select></label>
          <label>Reviewer notes<textarea id="review-notes" rows="5">${esc(row.existingReviewNotes || "")}</textarea></label>
          <p class="notice">If the candidate has a stray page number, neighboring title, missing text, or wrong reading order, choose “Needs parser correction” and describe it here.</p>
          <div class="save-actions"><button id="save" ${saving ? "disabled" : ""}>Save</button><button id="save-advance" ${saving ? "disabled" : ""}>Save and advance</button></div>
          <p class="status-message" role="status">${esc(message)}</p>
          <h3>Audit history</h3>${audits.length ? `<ol class="audit">${audits.slice().reverse().map((event) => `<li><b>${esc(event?.reviewer?.email || event?.reviewedBy || "Unknown reviewer")}</b><small>${esc(event?.timestamp || event?.reviewedAt || "Time unavailable")}${event?.resultingReconciliationRevision ? ` · revision ${event.resultingReconciliationRevision}` : ""}</small><p>${esc(event?.notes || "No notes")}</p></li>`).join("")}</ol>` : "<p>No audit history supplied.</p>"}` : '<div class="empty">No detail available.</div>'}</aside>
      </section>`;

    root.querySelector("#search")?.addEventListener("input", (event) => { searchDraft = event.target.value; });
    root.querySelector("#search-form")?.addEventListener("submit", (event) => { event.preventDefault(); search = searchDraft; selectedId = visibleRows()[0]?.resolutionId ?? null; render(); });
    root.querySelector("#clear-search")?.addEventListener("click", () => { search = ""; searchDraft = ""; selectedId = data.rows[0]?.resolutionId ?? null; render(); });
    for (const button of root.querySelectorAll("[data-row]")) button.addEventListener("click", () => { selectedId = Number(button.dataset.row); message = ""; retry = null; render(); });
    for (const button of root.querySelectorAll("[data-mode]")) button.addEventListener("click", () => { mode = button.dataset.mode; render(); });
    root.querySelector("#visual-prior")?.addEventListener("click", () => openVisual("prior"));
    root.querySelector("#visual-candidate")?.addEventListener("click", () => openVisual("candidate"));
    root.querySelector("#visual-prev")?.addEventListener("click", () => { visual.selectedPage -= 1; render(); });
    root.querySelector("#visual-next")?.addEventListener("click", () => { visual.selectedPage += 1; render(); });
    root.querySelector("#visual-page")?.addEventListener("change", (event) => { visual.selectedPage = Number(event.target.value); render(); });
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