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
  message: "",
};

const itemKey = (item) => String(item.resolutionId) + ":" + item.side;
const requestedItemKey = () => {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  const resolutionId = Number(query.get("resolutionId"));
  const side = query.get("side");
  return Number.isInteger(resolutionId) && resolutionId > 0 && (side === "prior" || side === "candidate")
    ? String(resolutionId) + ":" + side
    : null;
};
const textReviewHref = (item) => "/manuscript-reconciliation.html?resolutionId=" + encodeURIComponent(String(item.resolutionId));
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

async function loadQueue() {
  const response = await fetch(API, { headers: { Authorization: "Bearer " + state.auth.token } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(payload.error || "source_pdf_reference_unavailable");
  if (Number(payload.reconciliation && payload.reconciliation.id) !== RECONCILIATION_ID || !Array.isArray(payload.items)
    || payload.readOnly !== true || payload.writeEnabled !== false) {
    throw Error("Catalog source-PDF references are unavailable.");
  }
  const current = state.selectedKey || requestedItemKey();
  state.data = payload;
  state.selectedKey = payload.items.some((item) => itemKey(item) === current)
    ? current
    : payload.items[0] ? itemKey(payload.items[0]) : null;
}

function sourcePageLabel(page) {
  const spread = page.spreadIndex ? "Spread " + esc(page.spreadIndex) + " · " + esc(page.side || "page") : "Source page";
  const printed = page.pageLabel ? "printed " + esc(page.pageLabel) : "PDF page " + esc(page.pageIndex);
  return spread + " · " + printed;
}

function sourceViewer(item) {
  const source = item.source;
  const pages = source.sourcePages.pages || [];
  const viewer = state.sourceUrl && state.sourceKey === itemKey(item)
    ? "<div class='page-grid'>" + pages.map((page) => (
      "<section class='source-page'><h3>" + sourcePageLabel(page) + "</h3>" +
      "<iframe title='" + esc(sourcePageLabel(page)) + "' src='" + esc(state.sourceUrl) + "#page=" +
      encodeURIComponent(String(page.pageIndex)) + "&zoom=page-width'></iframe></section>"
    )).join("") + "</div><p><a class='open-source' target='_blank' rel='noopener' href='" +
      esc(state.sourceUrl) + "'>Open the hash-verified Catalog PDF</a></p>"
    : "<div class='source-loading'>" + (state.loadingSource ? "Loading the authenticated Catalog PDF…" : "Select this item to load its authenticated Catalog PDF.") + "</div>";
  return "<section class='source-view'><h2>Catalog-mapped source pages</h2><p class='muted'>Use this optional, read-only check for ordinary text: poem identity, lost words, and line breaks. Catalog supplies the page order, labels, and PDF; Poetry Please does not reconstruct them.</p>" +
    "<p class='inspection'>This page never saves a decision, creates source data, records visual evidence, or changes promotion. For materially visual pages, preserve the record and defer it to INT.</p>" + viewer + "</section>";
}

function detail(item) {
  if (!item) {
    return "<main class='empty'><h1>Source PDF check</h1><p>No Catalog-mapped source-PDF reference is available for this record.</p></main>";
  }
  const source = item.source;
  const title = source.title || item.canonicalTitle || item.candidateTitle || item.priorTitle || item.identity || "Untitled poem";
  return "<main class='detail'><p class='eyebrow'>Optional read-only reference</p><h1>" + esc(title) + "</h1>" +
    "<p class='muted'>" + esc(item.identity || "No stable identity supplied") + " · " + esc(item.side) +
    " source · Catalog poem " + esc(source.sourcePoemId) + " · source version " + esc(source.sourceVersionId) + "</p>" +
    "<p><a href='" + esc(textReviewHref(item)) + "'>← Return to text review for this poem</a></p>" +
    sourceViewer(item) + "<p class='message'>" + esc(state.message) + "</p></main>";
}

function queueList() {
  const items = state.data && state.data.items || [];
  return "<aside class='queue'><p class='eyebrow'>Catalog references</p><h2>" + items.length + " mapped source PDF" + (items.length === 1 ? "" : "s") + "</h2>" +
    "<p class='muted'>Only Catalog rows with an exact, hash-bound page reference appear here. A missing mapping does not create more mapping work.</p>" +
    "<div class='queue-items'>" + items.map((item) => {
      const title = item.source.title || item.canonicalTitle || item.candidateTitle || item.priorTitle || item.identity || "Untitled";
      return "<button class='queue-item " + (itemKey(item) === state.selectedKey ? "selected" : "") + "' data-item='" + esc(itemKey(item)) + "'>" +
        "<strong>" + esc(title) + "</strong><small>" + esc(item.side) + " · source " + esc(item.source.sourceVersionId) + "</small></button>";
    }).join("") + "</div></aside>";
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

function render() {
  const root = document.getElementById("visual-review-app");
  root.innerHTML = "<nav aria-label='Admin navigation'><strong>Poetry Please Admin</strong><a href='/admin.html'>Admin</a><a href='/manuscript-reconciliation.html'>Text review</a><a aria-current='page' href='/manuscript-visual-review.html'>Source PDF check</a></nav>" +
    "<div class='banner'>Optional source-PDF check · Catalog remains the source-page authority</div>" +
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
}

async function start() {
  const root = document.getElementById("visual-review-app");
  root.innerHTML = "<div class='state'>Checking authenticated team access and Catalog source-PDF references…</div>";
  try {
    state.auth = await authorize();
    await loadQueue();
    render();
    await loadSource();
  } catch (error) {
    root.innerHTML = "<div class='state error'><h1>Source PDF check is unavailable</h1><p>" + esc(error.message) + "</p></div>";
  }
}

window.addEventListener("beforeunload", discardSource);
start();
