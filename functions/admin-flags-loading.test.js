import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
const expanded = html.slice(html.indexOf("    function loadExpandedSections()"), html.indexOf("    function setStatus("));
test("team plus contest-admin loads flags; contest-only and collapsed panels do not", () => {
  for (const [roles, collapsed, open, expected] of [
    [["user", "team", "contest_builder", "contest_admin"], false, true, ["flags"]],
    [["team"], false, true, ["flags"]],
    [["admin"], false, true, ["flags"]],
    [["contest_admin"], false, true, []],
    [["team"], true, true, []],
    [["team"], false, false, []],
  ]) {
    const loaded = [];
    const context = vm.createContext({ state: { me: { roles }, usersCollapsed: true, contentClaimsCollapsed: true,
      duplicateReviewCollapsed: true, userSubmissionsCollapsed: true, contentLibraryCollapsed: true,
      idHygieneCollapsed: true, flaggedContentCollapsed: collapsed },
    document: { getElementById: () => ({ open }) }, loadSectionOnce: (key) => loaded.push(key), loadFlags() {} });
    vm.runInContext(expanded + "\nloadExpandedSections();", context);
    assert.deepEqual(loaded, expected, JSON.stringify({ roles, collapsed, open }));
  }
});
test("failed flag load is retryable and marks both panels as failed", async () => {
  const elements = new Map();
  const getElementById = (id) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  const loaded = new Set(["flags"]);
  const context = vm.createContext({ document: { getElementById }, api: async () => { throw new Error("offline"); },
    loadedAdminSections: loaded, console: { error() {} } });
  const fn = html.slice(html.indexOf("    async function loadFlags()"), html.indexOf("    async function reviewClaim("));
  await vm.runInContext(fn + "\nloadFlags();", context);
  assert.equal(loaded.has("flags"), false);
  assert.equal(getElementById("flag-review-status").className, "status error");
  assert.match(getElementById("repair-request-status").textContent, /Refresh flags and repairs/);
});

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const normalizeKey = (value) => String(value || "").trim().toLowerCase();

test("account name and partial-email searches continue beyond the first 1,000 accounts", async () => {
  const source = apiSource.slice(apiSource.indexOf("export async function searchAuthUsersPage("), apiSource.indexOf("\n}\n", apiSource.indexOf("export async function searchAuthUsersPage(")) + 2).replace("export ", "");
  const context = vm.createContext({ normalizeKey });
  const search = vm.runInContext(source + "; searchAuthUsersPage", context);
  const calls = [];
  const list = async (size, token) => {
    calls.push([size, token]);
    return token ? { users: [{ uid: "target", email: "emory@example.test", displayName: "Emory Thompson" }] }
      : { users: Array.from({ length: 1000 }, (_, i) => ({ uid: String(i), email: `other${i}@example.test`, displayName: "Other Person" })), pageToken: "next" };
  };
  const first = await search("EMORY", "", list);
  assert.equal(first.users.length, 0);
  assert.equal(first.scannedCount, 1000);
  assert.equal(first.nextPageToken, "next");
  const second = await search("EMORY", first.nextPageToken, list);
  assert.equal(second.users[0].uid, "target");
  assert.equal(second.nextPageToken, null);
  assert.deepEqual(calls, [[1000, undefined], [1000, "next"]]);
  assert.equal((await search("ory@exam", "next", list)).users[0].uid, "target");
  const profileMatch = await search("Emory", "", async () => ({ users: [{ uid: "profile-only", email: "staff@example.test" }] }),
    async (uids) => { assert.deepEqual(Array.from(uids), ["profile-only"]); return new Map([["profile-only", { displayName: "Emory Thompson" }]]); });
  assert.equal(profileMatch.users[0].displayName, "Emory Thompson");
});

test("account search accumulates pages, ignores stale results and reports incomplete searches", async () => {
  const source = html.slice(html.indexOf("    async function searchAllUsers("), html.indexOf("    async function loadUsers("));
  const state = { query: "emory", userSearchRequestId: 1, users: [], userSearchLoading: true };
  const statuses = [];
  const result = {};
  const calls = [];
  const context = vm.createContext({ state, encodeURIComponent, Map, renderUsers() {}, setStatus: (text) => statuses.push(text), document: { getElementById: () => result },
    api: async (path) => { calls.push(path); return calls.length === 1 ? { users: [], scannedCount: 1000, nextPageToken: "next" } : { users: [{ uid: "target" }], scannedCount: 1 }; } });
  vm.runInContext(source, context);
  await context.searchAllUsers("emory", 1);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /pageToken=next/);
  assert.equal(state.exactUserResults[0].uid, "target");
  assert.equal(state.userSearchLoading, false);
  assert.match(statuses.at(-1), /Search complete/);
  state.userSearchRequestId = 2;
  await context.searchAllUsers("emory", 1);
  assert.equal(calls.length, 3);
  assert.equal(state.exactUserResults.length, 1);
  context.api = async () => { throw new Error("offline"); };
  await context.searchAllUsers("emory", 2);
  assert.match(statuses.at(-1), /incomplete/);
  assert.match(result.innerHTML, /Refresh users/);
});

test("an email-shaped partial query falls back to paged search when no exact account exists", async () => {
  let route;
  let searches = 0;
  const context = vm.createContext({ app: { get: (_path, handler) => { route = handler; } }, getBoth: (path) => path,
    requireRole: async () => ({}), normalizeKey, normalizeText: (value) => String(value || '').trim(),
    auth: { getUserByEmail: async () => { const error = new Error('missing'); error.code = 'auth/user-not-found'; throw error; } },
    searchAuthUsersPage: async (query, token) => { searches++; assert.equal(query, 'ory@example.test'); assert.equal(token, '');
      return { users: [{ uid: 'target', email: 'emory@example.test', displayName: 'Emory' }], scannedCount: 1000, nextPageToken: 'next' }; },
    getVoteStatsByUserId: async () => new Map(), syncUserRecordFromAuthUser: async (user) => user });
  const source = apiSource.slice(apiSource.indexOf('app.get(getBoth("/admin/users"),'), apiSource.indexOf('app.post(getBoth("/admin/users/:uid/roles"),'));
  vm.runInContext(source, context);
  let response;
  await route({ query: { q: 'ory@example.test' } }, { json: (value) => { response = value; } });
  assert.equal(searches, 1);
  assert.equal(response.users[0].uid, 'target');
  assert.equal(response.nextPageToken, 'next');
  assert.equal(response.searchComplete, false);
});

test("author preview hides unrelated event filters while staff retains them", () => {
  const source = appSource.slice(appSource.indexOf('function updateFilterControlsVisibility()'), appSource.indexOf('\nasync function refreshCurrentAccount()'));
  for (const staff of [false, true]) {
    const elements = new Map();
    const document = { getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, { style: { display: 'none', removeProperty(key) { delete this[key]; } } });
      return elements.get(id);
    } };
    const context = vm.createContext({ document, currentUserIsTeamOrAdmin: () => staff, currentAccount: { roles: staff ? ['team'] : ['author'] },
      IS_MOBILE_UI: false, authorPreviewMode: !staff, isAuthorPromoLane: () => !staff, ensureFullPoemLengthControls: () => null,
      updateAuthorPromoControls() {} });
    vm.runInContext(source, context);
    context.updateFilterControlsVisibility();
    assert.equal(elements.get('event-filter-container').style.display, staff ? undefined : 'none');
    assert.equal(elements.get('type-filter-container').style.display, undefined);
  }
});

test("mobile vote controls expose their meaning without replacing their emoji", () => {
  const nodes = new Map(['moved', 'meh', 'like', 'dislike'].map((kind) => [`btn-mobile-${kind}`, { textContent: 'emoji', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }]));
  const context = vm.createContext({ $: () => null, document: { getElementById: (id) => nodes.get(id) } });
  const source = appSource.slice(appSource.indexOf('function resetVoteButtons(){'), appSource.indexOf('\nfunction renderItemMedia('));
  vm.runInContext(source, context);
  context.resetVoteButtons();
  assert.match(nodes.get('btn-mobile-moved').attributes['aria-label'], /Moved Me.*favorite/);
  assert.match(nodes.get('btn-mobile-meh').attributes['aria-label'], /no strong preference/);
  assert.match(nodes.get('btn-mobile-dislike').attributes['aria-label'], /do not use/);
  for (const node of nodes.values()) {
    assert.equal(node.title, node.attributes['aria-label']);
    assert.equal(node.textContent, 'emoji');
  }
});

function flagFlowContext(fetchData) {
  const flagged = { id: "flagged", imageType: "FP", book: "Roads" };
  const next = { id: "next", imageType: "FP", book: "Roads" };
  const emptyStates = [];
  const rendered = [];
  const context = vm.createContext({ queue: [flagged, next], idx: 0, currentItem: flagged, selectedItemId: "flagged", selectedItemRecord: flagged,
    embedLockedItemId: "flagged", routeItemConsumed: false, historyStack: [flagged], sessionFlaggedContentIds: new Set(),
    lastData: { newGraphics: [flagged, next], allGraphics: [flagged, next] }, normalizeFilterValue: normalizeKey,
    writeRouteState() {}, fetchBestBatchForCurrentView: fetchData,
    initQueueFromData(data) { context.queue = data.newGraphics.filter((item) => !context.sessionFlaggedContentIds.has(item.id)); },
    renderEmptyFilterState: (...args) => emptyStates.push(args), renderWhenReady: (index) => rendered.push(context.queue[index].id) });
  const source = appSource.slice(appSource.indexOf("async function refreshAfterFlaggedContent("), appSource.indexOf("\nfunction removeItemFromQueueById("));
  vm.runInContext(source, context);
  return { context, emptyStates, rendered, flagged, next };
}

test("flag refresh uses the lane feed and clears pinned content even if a stale feed includes it", async () => {
  const fixture = flagFlowContext(async () => ({ newGraphics: [fixture.flagged, fixture.next] }));
  await fixture.context.refreshAfterFlaggedContent("flagged");
  assert.equal(fixture.context.queue.length, 1);
  assert.equal(fixture.context.queue[0].id, "next");
  assert.equal(fixture.context.selectedItemId, "");
  assert.equal(fixture.context.selectedItemRecord, null);
  assert.equal(fixture.context.embedLockedItemId, "");
  assert.equal(fixture.context.historyStack.length, 0);
  assert.equal(fixture.emptyStates.length, 0);
});

test("flag refresh keeps the next local item on network failure and offers actions when finished", async () => {
  const failed = flagFlowContext(async () => { throw new Error("offline"); });
  await failed.context.refreshAfterFlaggedContent("flagged");
  assert.deepEqual(failed.rendered, ["next"]);
  const exhausted = flagFlowContext(async () => { throw new Error("offline"); });
  exhausted.context.queue = [exhausted.next, exhausted.flagged];
  exhausted.context.idx = 1;
  await exhausted.context.refreshAfterFlaggedContent("flagged");
  assert.equal(exhausted.rendered.length, 0);
  assert.match(exhausted.emptyStates[0][0], /could not load the next item/);
  const empty = flagFlowContext(async () => ({ newGraphics: [] }));
  await empty.context.refreshAfterFlaggedContent("flagged");
  assert.match(empty.emptyStates[0][0], /Flag saved.*end of this review queue/);
  assert.equal(empty.emptyStates[0][2], true);
  // Exercise the actual shared desktop/mobile empty renderer with DOM fixtures.
  for (const mobile of [false, true]) {
    const makeNode = () => ({ children: [], style: {}, appendChild(node) { this.children.push(node); }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, remove() {} });
    const gallery = makeNode(), wrap = makeNode();
    const context = vm.createContext({ IS_MOBILE_UI: mobile, lockedLane: true, filterByAuthor: true, selectedAuthor: "Matt Mason", filterByBook: true, selectedBook: "Roads", historyStack: [], currentItem: null, idx: 0,
      window: { location: { href: "https://poetryplease.org/m?author=Matt+Mason&book=Roads&type=FP&authorPreview=1" }, dispatchEvent() {} }, URL, CustomEvent: class {},
      document: { createElement: () => makeNode(), getElementById: () => null }, $: (selector) => selector === '#gallery' ? gallery : null,
      ensureMediaWrap: () => wrap, exitLockedLane() {}, ppAutoloadFirstItem() {}, setVoteButtonsDisabled() {}, renderMetaRows() {}, renderCounter() {}, setViewportVars() {}, adjustViewportFit() {},
      LoaderController: { clearInline() {}, markScreenReady() {} }, currentUserIsAdmin: () => false });
    const source = appSource.slice(appSource.indexOf("function renderEmptyFilterState("), appSource.indexOf("\n// ===== Init / rebuild ====="));
    vm.runInContext(source, context);
    context.renderEmptyFilterState("Flag saved. Queue complete.", false, true);
    const links = [...gallery.children, ...wrap.children.flatMap((node) => node.children)].filter((node) => node.textContent === 'Review more graphics');
    assert.ok(links.length > 0, `visible next action on ${mobile ? "mobile" : "desktop"}`);
    const route = new URL(links[0].href);
    assert.equal(route.searchParams.get('author'), 'Matt Mason');
    assert.equal(route.searchParams.get('type'), 'PROMO');
    assert.equal(route.searchParams.has('book'), false);
  }
});
