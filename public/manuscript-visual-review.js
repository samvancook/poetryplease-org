const RECONCILIATION_ID = 2;
const API = "/api/admin/manuscriptVisualReviews/" + RECONCILIATION_ID;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const state = {
  data: null,
  auth: null,
  selectedKey: null,
  sourceUrl: null,
  sourceKey: null,
  loadingSource: false,
  savingEvidence: false,
  message: "",
};

const itemKey = (item) => String(item.resolutionId) + ":" + item.side;
const selectedItem = () => state.data && state.data.items.find((item) => itemKey(item) === state.selectedKey) || null;

async function authorize() {
  if (!firebase.apps || !firebase.apps.length) {
    const config = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!config.ok) throw Error("Firebase configuration could not be loaded.");
    firebase.initializeApp(await config.json());
  }
  const user = await new Promise((resolve) => firebase.auth().onAuthStateChanged(resolve));
  if (!user) throw Error("Sign in through Poetry Please Admin with a team account.");
  const token = await user.getIdToken();
  const me = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
  if (!me.ok) throw Error("Poetry Please authorization check failed.");
  const profile = await me.json();
  if (!Array.isArray(profile.roles) || !profile.roles.some((role) => role === "team" || role === "admin")) {
    throw Error("A Poetry Please team or admin account is required.");
  }
  return { token, profile };
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: "Bearer " + state.auth.token,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(payload.error || "visual_review_request_failed");
  return payload;
}

async function loadQueue() {
  const payload = await apiJson(API);
  if (Number(payload.reconciliation && payload.reconciliation.id) !== RECONCILIATION_ID || !Array.isArray(payload.items)) {
    throw Error("Catalog visual-review queue is unavailable.");
  }
  const current = state.selectedKey;
  state.data = payload;
  state.selectedKey = payload.items.some((item) => itemKey(item) === current)
    ? current
    : payload.items[0] ? itemKey(payload.items[0]) : null;
}

function statusLabel(status) {
  if (status === "confirmed") return "Visual evidence recorded";
  if (status === "needs_follow_up") return "Needs follow-up";
  return "Needs visual confirmation";
}

function statusClass(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "needs_follow_up") return "followup";
  return "pending";
}

function sourcePageLabel(page) {
  const spread = page.spreadIndex ? "Spread " + esc(page.spreadIndex) + " · " + esc(page.side || "page") : "Source page";
  const printed = page.pageLabel ? "printed " + esc(page.pageLabel) : "PDF page " + esc(page.pageIndex);
  return spread + " · " + printed;
}

function evidenceHistory(item) {
  if (!item.evidence || !item.evidence.length) {
    return "<p class='muted'>No visual evidence has been recorded for this exact Catalog page mapping.</p>";
  }
  return "<ol class='evidence-history'>" + item.evidence.map((evidence) => (
    "<li><strong>" + esc(statusLabel(evidence.outcome)) + "</strong><br>" +
    esc(evidence.notes) + "<small>" + esc(evidence.reviewer.email || "Team reviewer") +
    (evidence.recordedAt ? " · " + esc(new Date(evidence.recordedAt).toLocaleString()) : "") + "</small></li>"
  )).join("") + "</ol>";
}

function sourceViewer(item) {
  const source = item.source;
  const pages = source.sourcePages.pages || [];
  const reminder = source.sourcePoemId === 238 && source.sourceVersionId === 10
    ? "<p class='inspection'>For <em>elephants</em>, inspect the black redaction after “I remember.”</p>"
    : "";
  const viewer = state.sourceUrl && state.sourceKey === itemKey(item)
    ? "<div class='page-grid'>" + pages.map((page) => (
      "<section class='source-page'><h3>" + sourcePageLabel(page) + "</h3>" +
      "<iframe title='" + esc(sourcePageLabel(page)) + "' src='" + esc(state.sourceUrl) + "#page=" +
      encodeURIComponent(String(page.pageIndex)) + "&zoom=page-width'></iframe></section>"
    )).join("") + "</div><p><a class='open-source' target='_blank' rel='noopener' href='" +
      esc(state.sourceUrl) + "'>Open the Catalog PDF</a></p>"
    : "<div class='source-loading'>" + (state.loadingSource ? "Loading the authenticated Catalog PDF…" : "Select this item to load its authenticated Catalog PDF.") + "</div>";
  return "<section class='source-view'><h2>Catalog source pages</h2><p class='muted'>The page order, labels, spread sides, and PDF are provided by Catalog. Poetry Please does not reconstruct them.</p>" +
    reminder + viewer + "</section>";
}

function detail(item) {
  if (!item) {
    return "<main class='empty'><h1>Phase 4 visual review</h1><p>No Catalog source-page references currently require visual confirmation.</p></main>";
  }
  const source = item.source;
  const title = source.title || item.canonicalTitle || item.candidateTitle || item.priorTitle || item.identity || "Untitled poem";
  return "<main class='detail'><p class='eyebrow'>Phase 4 · read-only source evidence</p><h1>" + esc(title) + "</h1>" +
    "<p class='muted'>" + esc(item.identity || "No stable identity supplied") + " · " + esc(item.side) +
    " source · Catalog poem " + esc(source.sourcePoemId) + " · source version " + esc(source.sourceVersionId) + "</p>" +
    "<div class='status " + statusClass(item.visualStatus) + "'>" + esc(statusLabel(item.visualStatus)) + "</div>" +
    sourceViewer(item) +
    "<section class='evidence'><h2>Record visual evidence</h2><p class='muted'>This does not save an editorial decision. It records review evidence for this exact source-page mapping first.</p>" +
    "<label>Result<select id='visual-outcome'><option value='confirmed'>Source visual confirmed</option><option value='needs_follow_up'>Needs follow-up</option></select></label>" +
    "<label>What did you verify?<textarea id='visual-notes' maxlength='4000' placeholder='Describe the visual finding, including formatting, image, redaction, page order, or OCR concern.'></textarea></label>" +
    "<button id='record-evidence' " + (state.savingEvidence ? "disabled" : "") + ">"+ (state.savingEvidence ? "Recording…" : "Record visual evidence") + "</button>" +
    "<p class='message'>" + esc(state.message) + "</p></section>" +
    "<section class='evidence'><h2>Evidence history</h2>" + evidenceHistory(item) + "</section></main>";
}

function queueList() {
  const items = state.data && state.data.items || [];
  return "<aside class='queue'><p class='eyebrow'>Catalog queue</p><h2>" + items.length + " source reference" + (items.length === 1 ? "" : "s") + "</h2>" +
    "<p class='muted'>Only Catalog rows with an available, hash-bound page reference appear here.</p>" +
    "<div class='queue-items'>" + items.map((item) => {
      const title = item.source.title || item.canonicalTitle || item.candidateTitle || item.priorTitle || item.identity || "Untitled";
      return "<button class='queue-item " + (itemKey(item) === state.selectedKey ? "selected" : "") + "' data-item='" + esc(itemKey(item)) + "'>" +
        "<strong>" + esc(title) + "</strong><small>" + esc(item.side) + " · source " + esc(item.source.sourceVersionId) + "</small>" +
        "<span class='pill " + statusClass(item.visualStatus) + "'>" + esc(statusLabel(item.visualStatus)) + "</span></button>";
    }).join("") + "</div></aside>";
}

function render() {
  const root = document.getElementById("visual-review-app");
  root.innerHTML = "<nav aria-label='Admin navigation'><strong>Poetry Please Admin</strong><a href='/admin.html'>Admin</a><a href='/manuscript-reconciliation.html'>Phase 2 text reconciliation</a><a aria-current='page' href='/manuscript-visual-review.html'>Phase 4 visual review</a></nav>" +
    "<div class='banner'>Phase 4 visual confirmation · Catalog remains the source-page authority</div>" +
    "<div class='workspace'>" + queueList() + detail(selectedItem()) + "</div>";
  root.querySelectorAll("[data-item]").forEach((button) => button.addEventListener("click", async () => {
    const nextKey = button.getAttribute("data-item");
    if (nextKey === state.selectedKey) return;
    state.selectedKey = nextKey;
    state.message = "";
    discardSource();
    render();
    await loadSource();
  }));
  const record = root.querySelector("#record-evidence");
  if (record) record.addEventListener("click", recordEvidence);
}

function discardSource() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
  state.sourceKey = null;
  state.loadingSource = false;
}

async function loadSource() {
  const item = selectedItem();
  if (!item || state.sourceKey === itemKey(item) || state.loadingSource) return;
  state.loadingSource = true;
  render();
  try {
    const path = API + "/items/" + encodeURIComponent(item.resolutionId) + "/" + encodeURIComponent(item.side) + "/source.pdf";
    const response = await fetch(path, { headers: { Authorization: "Bearer " + state.auth.token } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw Error(payload.error || "catalog_source_asset_unavailable");
    }
    const blob = await response.blob();
    if (selectedItem() !== item) return;
    discardSource();
    state.sourceUrl = URL.createObjectURL(blob);
    state.sourceKey = itemKey(item);
  } catch (error) {
    state.message = "Catalog source PDF could not be loaded: " + error.message;
  } finally {
    state.loadingSource = false;
    render();
  }
}

async function recordEvidence() {
  const item = selectedItem();
  const outcome = document.getElementById("visual-outcome").value;
  const notes = document.getElementById("visual-notes").value.trim();
  state.savingEvidence = true;
  state.message = "";
  render();
  try {
    await apiJson(API + "/items/" + encodeURIComponent(item.resolutionId) + "/" + encodeURIComponent(item.side) + "/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, notes }),
    });
    state.message = "Visual evidence recorded. No editorial decision was changed.";
    await loadQueue();
  } catch (error) {
    state.message = "Evidence was not recorded: " + error.message;
  } finally {
    state.savingEvidence = false;
    render();
  }
}

async function start() {
  const root = document.getElementById("visual-review-app");
  root.innerHTML = "<div class='state'>Checking authenticated team access and Catalog source-page references…</div>";
  try {
    state.auth = await authorize();
    await loadQueue();
    render();
    await loadSource();
  } catch (error) {
    root.innerHTML = "<div class='state error'><h1>Visual review is unavailable</h1><p>" + esc(error.message) + "</p></div>";
  }
}

window.addEventListener("beforeunload", discardSource);
start();
