export const RECONCILIATION_ID = 1;
export const SAFE_WRITABLE_RESOLUTION_ID = 900001;
export const RECONCILIATION_API = `/api/admin/manuscriptReconciliations/${RECONCILIATION_ID}`;
export const ACTIONS = Object.freeze([
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
]);

export const isTeamProfile = (profile) => Array.isArray(profile?.roles)
  && profile.roles.some((role) => role === "team" || role === "admin");
export const available = (value, fallback = "Unavailable") => value === null || value === undefined || value === "" ? fallback : value;
export const preserveText = (value) => String(value ?? "").replace(/\r\n?/g, "\n");
export const normalizeWhitespace = (value) => preserveText(value).split("\n").map((line) => line.replace(/[ \t]+/g, " ").trimEnd()).join("\n");
export const rowMatchesSearch = (row, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [
    row?.identity, row?.priorTitle, row?.candidateTitle, row?.canonicalTitle, row?.status,
    ...(row?.buckets || []), ...(row?.warnings || []),
  ].filter(Boolean).join(" ").toLowerCase().includes(q);
};
const displayImpact = (value) => {
  if (value === null || value === undefined || value === "") return "No downstream impact supplied.";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};
const warningLabel = (value) => ({
  pdf_possible_image_backed_poem: "The PDF may store this poem as an image; OCR means recovering readable text from that image.",
  pdf_suspicious_short_poem: "The extracted poem text is suspiciously short and needs human review.",
  parser_reading_order_problem: "The parser may have included text in the wrong reading order.",
}[value] || String(value || ""));
export const nextRowId = (rows, currentId) => {
  const index = rows.findIndex((row) => Number(row.resolutionId) === Number(currentId));
  return rows[index + 1]?.resolutionId ?? rows[0]?.resolutionId ?? null;
};
export const auditSummary = (row) => {
  const history = Array.isArray(row?.auditHistory) ? row.auditHistory : [];
  return history.map((event) => ({
    reviewer: event?.reviewer?.email || event?.reviewedBy || "Unknown reviewer",
    timestamp: event?.timestamp || event?.reviewedAt || null,
    notes: event?.notes || "",
    revision: event?.resultingReconciliationRevision || null,
  }));
};
export function decisionNeedsNotes(row, decision) {
  const action = decision.resolutionAction;
  if (["review_create", "review_retire", "reject_extraction", "request_ocr", "request_parser_correction"].includes(action)) return true;
  if (decision.reviewStatus === "rejected") return true;
  if (String(decision.stablePoemIdentity || "") !== String(row.identity || "")) return true;
  const currentTitle = row.canonicalTitle || row.candidateTitle || row.priorTitle || "";
  if (String(decision.canonicalTitle || "") !== String(currentTitle)) return true;
  if (Number(decision.textSourcePoemId) !== Number(row.candidate?.id)) return true;
  return false;
}
export function createIdempotencyKey(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === "function") return cryptoObject.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const sourceOptions = (row, selected) => [
  row?.prior && [row.prior.id, `Prior · ${row.prior.title || row.priorTitle || "Untitled"}`],
  row?.candidate && [row.candidate.id, `Candidate · ${row.candidate.title || row.candidateTitle || "Untitled"}`],
].filter(Boolean).map(([id, label]) => `<option value="${esc(id)}" ${Number(id) === Number(selected) ? "selected" : ""}>${esc(label)}</option>`).join("");
const poemLines = (text, normalized) => (normalized ? normalizeWhitespace(text) : preserveText(text))
  .split("\n")
  .map((line, index) => `<span class="line"><i>${index + 1}</i><b>${line ? esc(line) : "&nbsp;"}</b></span>`)
  .join("");

export function normalizePhase2Row(row) {
  if (!row || typeof row !== "object") return row;
  const withId = (poem) => poem && typeof poem === "object"
    ? { ...poem, id: poem.id ?? poem.sourcePoemId }
    : poem;
  return { ...row, prior: withId(row.prior), candidate: withId(row.candidate) };
}

export function mapPhase2Payload(payload) {
  if (!payload || payload.writeEnabled !== true || payload.readOnly !== false || !payload.reconciliation || !Array.isArray(payload.rows)) {
    throw Error("Unsupported Catalog Phase 2 proxy response.");
  }
  if (Number(payload.safeWritableResolutionId) !== SAFE_WRITABLE_RESOLUTION_ID) {
    throw Error("The isolated write fixture is unavailable.");
  }
  return { ...payload, rows: payload.rows.map(normalizePhase2Row) };
}

export async function authorizeTeam(fetcher = fetch) {
  const config = {
    apiKey: "AIzaSyDhDlg_3VjDTfamRvjcsguqMaiFS3DogT8",
    authDomain: "poetry-please.firebaseapp.com",
    projectId: "poetry-please",
    storageBucket: "poetry-please.firebasestorage.app",
    messagingSenderId: "609992589187",
    appId: "1:609992589187:web:ea8aed51a08c3716b880b6",
    measurementId: "G-FBLJHKQ70B",
  };
  const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
  const user = await new Promise((resolve) => firebase.auth(app).onAuthStateChanged(resolve));
  if (!user) throw Error("Sign in through Poetry Please Admin with a team account.");
  const token = await user.getIdToken();
  const response = await fetcher("/api/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw Error("Poetry Please authorization check failed.");
  const profile = await response.json();
  if (!isTeamProfile(profile)) throw Error("A Poetry Please team or admin account is required.");
  return { profile, token };
}

export async function loadReconciliation(token, fetcher = fetch) {
  const response = await fetcher(RECONCILIATION_API, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw Error(`Catalog reconciliation request failed with HTTP ${response.status}.`);
  return mapPhase2Payload(await response.json());
}

export async function saveDecision({ token, resolutionId, decision, idempotencyKey, fetcher = fetch }) {
  const response = await fetcher(`${RECONCILIATION_API}/resolutions/${encodeURIComponent(resolutionId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(decision),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `Save failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  if (!payload.authoritativeResolution || !Number.isInteger(Number(payload.reconciliationRevision))) {
    throw Error("Catalog save succeeded without authoritative readback.");
  }
  return payload;
}

export function createApp(root, initialData, authorization, { fetcher = fetch } = {}) {
  let data = initialData;
  let state = {
    selected: SAFE_WRITABLE_RESOLUTION_ID,
    mode: "exact",
    search: "",
    searchDraft: "",
    saving: false,
    message: "",
    stale: false,
    retry: null,
  };
  const rows = () => data.rows.filter((row) => rowMatchesSearch(row, state.search));
  const selected = () => {
    const visible = rows();
    return visible.find((row) => Number(row.resolutionId) === Number(state.selected)) || visible[0] || null;
  };
  const decisionFromForm = (row) => ({
    expectedReconciliationRevision: Number(data.reconciliation.writeRevision || row.reconciliationRevision),
    reviewStatus: root.querySelector("#review-status")?.value || row.status || "pending",
    resolutionAction: root.querySelector("#resolution-action")?.value || row.proposedResolution,
    canonicalTitle: root.querySelector("#canonical-title")?.value.trim() || row.canonicalTitle || row.candidateTitle || row.priorTitle,
    stablePoemIdentity: root.querySelector("#stable-identity")?.value.trim() || row.identity,
    textSourcePoemId: Number(root.querySelector("#text-source")?.value),
    formatSourcePoemId: Number(root.querySelector("#format-source")?.value),
    notes: root.querySelector("#review-notes")?.value.trim() || null,
  });

  async function reload(message = "") {
    data = await loadReconciliation(authorization.token, fetcher);
    state.message = message;
    state.retry = null;
    render();
  }

  async function save(advance = false) {
    const row = selected();
    if (!row || Number(row.resolutionId) !== SAFE_WRITABLE_RESOLUTION_ID || state.saving) return;
    const decision = decisionFromForm(row);
    if (decisionNeedsNotes(row, decision) && !decision.notes) {
      state.message = "Notes are required for this decision.";
      render();
      root.querySelector("#review-notes")?.focus();
      return;
    }
    const serialized = JSON.stringify(decision);
    if (!state.retry || state.retry.serialized !== serialized) {
      state.retry = { serialized, key: createIdempotencyKey() };
    }
    state.saving = true;
    state.message = "Saving to the Catalog preview…";
    render();
    try {
      const result = await saveDecision({
        token: authorization.token,
        resolutionId: row.resolutionId,
        decision,
        idempotencyKey: state.retry.key,
        fetcher,
      });
      const index = data.rows.findIndex((item) => Number(item.resolutionId) === Number(row.resolutionId));
      data.rows[index] = normalizePhase2Row(result.authoritativeResolution);
      data.reconciliation.writeRevision = result.reconciliationRevision;
      state.message = result.idempotent
        ? "Verified idempotent retry and authoritative readback."
        : "Saved to Catalog and verified authoritative readback.";
      state.retry = null;
      if (advance) state.selected = nextRowId(rows(), row.resolutionId);
    } catch (error) {
      if (error.status === 409 && error.payload?.error === "stale_reconciliation_revision") {
        state.stale = true;
        await reload("A newer Catalog revision exists. Authoritative data was reloaded; review before saving again.");
      } else {
        state.message = `Save failed: ${error.message} You can retry without creating a duplicate decision.`;
      }
    } finally {
      state.saving = false;
      render();
    }
  }

  function render() {
    const rec = data.reconciliation;
    const visible = rows();
    const row = selected();
    if (row) state.selected = row.resolutionId;
    const writable = Number(row?.resolutionId) === SAFE_WRITABLE_RESOLUTION_ID;
    const currentTitle = row?.canonicalTitle || row?.candidateTitle || row?.priorTitle || "";
    const currentTextSource = row?.textSourcePoemId || row?.candidate?.id || row?.prior?.id;
    const currentFormatSource = row?.formatSourcePoemId || row?.candidate?.id || row?.prior?.id;
    const audits = auditSummary(row);
    root.innerHTML = `
      <div class="banner fixture">${esc(data.fixtureLabel)}</div>
      <div class="banner readonly">Authenticated Phase 2 preview · only guarded fixture resolution ${SAFE_WRITABLE_RESOLUTION_ID} can be saved</div>
      <section class="dashboard">
        <p class="eyebrow">Reconciliation ${esc(rec.id)} · revision ${esc(rec.writeRevision)}</p>
        <h1>${esc(available(rec.bookTitle))}</h1>
        <p>Signed in reviewer: ${esc(data.currentReviewer?.email)} · roles ${esc((data.currentReviewer?.roles || []).join(", "))}</p>
        <div class="stats"><b>${available(rec.totals?.resolutionRows, 0)}<span>comparison records</span></b><b>${available(rec.totals?.autoApproved, 0)}<span>low-risk matches already approved</span></b><b>${available(rec.totals?.pending, 0)}<span>decisions still needed</span></b><b>${available(rec.writeRevision, 0)}<span>Catalog decision revision</span></b></div>
        <details class="glossary"><summary>What do these terms mean?</summary><dl>
          <dt>Prior source</dt><dd>The earlier manuscript used for comparison.</dd>
          <dt>Candidate source</dt><dd>The proposed replacement. It is not assumed to be correct until a reviewer decides.</dd>
          <dt>Auto-approved</dt><dd>A low-risk match approved by Catalog rules; it remains reviewable.</dd>
          <dt>Rebroken only</dt><dd>The words match, but line breaks, stanzas, indentation, or layout changed.</dd>
          <dt>Image-backed / OCR</dt><dd>The PDF may contain the poem as an image. OCR recovers readable text, which must then be checked.</dd>
          <dt>Comparison record</dt><dd>One reconciliation decision to review—not necessarily one final poem.</dd>
        </dl></details>
      </section>
      <section class="workspace">
        <aside class="panel">
          <h2>Review queue</h2>
          <form id="search-form"><label for="search">Search titles, warnings, and statuses</label><div class="search-row"><input id="search" type="search" value="${esc(state.searchDraft)}"><button type="submit">Search</button><button type="button" id="clear-search">Clear</button></div></form>
          <p class="help">Search runs when you press Search or Enter, so you can finish typing first.</p>
          <p>${visible.length} comparison records · fixture record is marked writable</p>
          <div class="list">${visible.map((item) => `<button data-row="${item.resolutionId}" class="${Number(item.resolutionId) === SAFE_WRITABLE_RESOLUTION_ID ? "writable-row" : ""}"><span>${esc(item.identity)}</span><small>#${item.resolutionId} · ${esc(item.status)}${Number(item.resolutionId) === SAFE_WRITABLE_RESOLUTION_ID ? " · writable fixture" : " · view only"}</small></button>`).join("")}</div>
        </aside>
        <main class="panel comparison">
          ${row ? `<div class="comparehead"><h2>Text comparison</h2><div><button data-mode="exact" aria-pressed="${state.mode === "exact"}">Source text</button><button data-mode="normalized" aria-pressed="${state.mode === "normalized"}">Spacing-normalized text</button></div></div>
          <p class="help">${state.mode === "exact" ? "Source text preserves the extracted spaces and line breaks." : "Spacing-normalized text removes repeated spaces and trailing whitespace for comparison; it does not change Catalog data."}</p>
          <div class="texts"><article><h3>Earlier source · ${esc(available(row.priorTitle))}</h3><div class="poem">${poemLines(row.prior?.text, state.mode === "normalized")}</div></article><article><h3>Proposed replacement · ${esc(available(row.candidateTitle))}</h3><p class="help">Proposed does not mean correct; choose the wording and formatting sources after review.</p><div class="poem">${poemLines(row.candidate?.text, state.mode === "normalized")}</div></article></div>` : `<div class="empty">${state.search ? "No comparison records match this search. Clear or revise the search to continue." : "No comparison record selected."}</div>`}
        </main>
        <aside class="panel detail">
          ${row ? `<h2>Decision</h2>
          ${writable ? "" : '<p class="notice">View only in this isolated preview. Select fixture resolution 900001 to test saving.</p>'}
          <label>Status<select id="review-status" ${writable ? "" : "disabled"}><option value="pending" ${row.status === "pending" ? "selected" : ""}>Needs review</option><option value="approved" ${row.status === "approved" ? "selected" : ""}>Approved</option><option value="rejected" ${row.status === "rejected" ? "selected" : ""}>Rejected</option></select></label>
          <label>Resolution action<select id="resolution-action" ${writable ? "" : "disabled"}>${ACTIONS.map(([value, label]) => `<option value="${value}" ${row.proposedResolution === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
          <label>Canonical title<input id="canonical-title" value="${esc(currentTitle)}" ${writable ? "" : "disabled"}></label>
          <label>Stable poem identity<input id="stable-identity" value="${esc(row.identity)}" ${writable ? "" : "disabled"}></label>
          <label>Wording source<select id="text-source" ${writable ? "" : "disabled"}>${sourceOptions(row, currentTextSource)}</select></label>
          <label>Formatting source<select id="format-source" ${writable ? "" : "disabled"}>${sourceOptions(row, currentFormatSource)}</select></label>
          <label>Reviewer notes<textarea id="review-notes" rows="5" ${writable ? "" : "disabled"}>${esc(row.existingReviewNotes || "")}</textarea></label>
          <p class="notice">If the candidate contains a stray page number, neighboring title, missing text, or incorrect reading order, choose “Needs parser correction” and describe the problem here.</p>
          <h3>Downstream impact</h3><pre class="impact">${esc(displayImpact(row.downstreamImpact || row.downstreamArtifacts))}</pre>
          <div class="save-actions"><button id="save" ${writable && !state.saving ? "" : "disabled"}>Save</button><button id="save-advance" ${writable && !state.saving ? "" : "disabled"}>Save and advance</button></div>
          <p class="status-message" role="status">${esc(state.message)}</p>
          <h3>Current reviewer and audit history</h3>
          ${audits.length ? `<ol class="audit">${audits.slice().reverse().map((event) => `<li><b>${esc(event.reviewer)}</b><small>${esc(event.timestamp || "Time unavailable")}${event.revision ? ` · revision ${event.revision}` : ""}</small><p>${esc(event.notes || "No notes")}</p></li>`).join("")}</ol>` : "<p>No audit history supplied.</p>"}
          <h3>Warnings</h3><ul class="warnings">${row.warnings?.length ? row.warnings.map((warning) => `<li>${esc(warningLabel(warning))}</li>`).join("") : "<li>None supplied.</li>"}</ul>` : '<div class="empty">No detail available.</div>'}
        </aside>
      </section>`;
    bind();
  }

  function bind() {
    root.querySelector("#search")?.addEventListener("input", (event) => {
      state.searchDraft = event.target.value;
    });
    root.querySelector("#search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.searchDraft = root.querySelector("#search")?.value || "";
      state.search = state.searchDraft;
      const visible = rows();
      state.selected = visible[0]?.resolutionId ?? null;
      render();
    });
    root.querySelector("#clear-search")?.addEventListener("click", () => {
      state.search = "";
      state.searchDraft = "";
      state.selected = data.rows[0]?.resolutionId ?? null;
      render();
    });
    for (const button of root.querySelectorAll("[data-row]")) button.addEventListener("click", () => {
      state.selected = Number(button.dataset.row);
      state.message = "";
      state.retry = null;
      render();
    });
    for (const button of root.querySelectorAll("[data-mode]")) button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      render();
    });
    root.querySelector("#save")?.addEventListener("click", () => save(false));
    root.querySelector("#save-advance")?.addEventListener("click", () => save(true));
  }

  const onKey = (event) => {
    const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      save(true);
    } else if (!editing && ["j", "ArrowDown"].includes(event.key)) {
      state.selected = nextRowId(rows(), state.selected);
      render();
    } else if (!editing && ["k", "ArrowUp"].includes(event.key)) {
      const visible = rows();
      const index = visible.findIndex((row) => Number(row.resolutionId) === Number(state.selected));
      state.selected = visible[Math.max(0, index - 1)]?.resolutionId || visible[0]?.resolutionId;
      render();
    } else if (!editing && event.key.toLowerCase() === "a") {
      const control = root.querySelector("#review-status");
      if (control && !control.disabled) control.value = "approved";
    } else if (!editing && event.key.toLowerCase() === "r") {
      const control = root.querySelector("#review-status");
      if (control && !control.disabled) control.value = "pending";
    } else if (!editing && event.key.toLowerCase() === "n") {
      root.querySelector("#review-notes")?.focus();
    }
  };
  document.addEventListener("keydown", onKey);
  render();
  return { save, reload, getState: () => ({ ...state }), destroy: () => document.removeEventListener("keydown", onKey) };
}

function accessDenied(root, message) {
  root.innerHTML = `<div class="state locked"><h1>Team access required</h1><p>${esc(message)}</p><p><a href="/admin.html">Return to Poetry Please Admin</a></p></div>`;
}

export async function boot() {
  const root = document.querySelector("#reconciliation-app");
  try {
    const authorization = await authorizeTeam();
    const data = await loadReconciliation(authorization.token);
    createApp(root, data, authorization);
  } catch (error) {
    accessDenied(root, error.message);
  }
}

if (typeof document !== "undefined") boot();
