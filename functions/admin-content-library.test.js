import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
const helperStart = adminSource.indexOf("    const CONTENT_SEARCH_DEBOUNCE_MS");
const helperEnd = adminSource.indexOf("    async function buildContentUploadPayload", helperStart);

assert.notEqual(helperStart, -1, "Content Library request helpers must exist");
assert.notEqual(helperEnd, -1, "Content Library request helpers must have a stable boundary");

function createContentLibraryHarness() {
  const state = {
    contentLoadEpoch: 0,
    contentSearchTimer: null,
    contentType: "all",
    contentQuery: "",
    contentItems: [],
    contentTotalCount: 0,
  };
  const status = { textContent: "", className: "" };
  const list = { innerHTML: "" };
  const pending = [];
  let renderCount = 0;
  const document = {
    getElementById(id) {
      if (id === "content-status") return status;
      if (id === "content-library-list") return list;
      throw new Error(`Unexpected element: ${id}`);
    },
  };
  const timers = new Map();
  let nextTimerId = 1;
  const window = {
    clearTimeout(id) {
      timers.delete(id);
    },
    setTimeout(fn, delay) {
      const id = nextTimerId++;
      timers.set(id, { fn, delay });
      return id;
    },
  };
  const api = (url) => new Promise((resolve) => pending.push({ url, resolve }));
  const helpers = new Function(
    "state",
    "document",
    "window",
    "api",
    "renderContentLibrary",
    `${adminSource.slice(helperStart, helperEnd)}\nreturn { invalidateContentLibraryRequest, loadContentLibrary, queueContentLibrarySearch, clearContentSearchTimer, CONTENT_SEARCH_DEBOUNCE_MS };`,
  )(state, document, window, api, () => { renderCount += 1; });
  const runPendingTimers = () => {
    const due = [...timers.entries()];
    timers.clear();
    return due.map(([, timer]) => timer.fn());
  };
  return {
    ...helpers,
    pending,
    state,
    status,
    getRenderCount: () => renderCount,
    pendingTimers: () => [...timers.values()],
    runPendingTimers,
  };
}

test("Content Library ignores a stale response after a newer query begins", async () => {
  const harness = createContentLibraryHarness();
  const initialRequest = harness.loadContentLibrary();
  harness.state.contentQuery = "OADW-INT-FIRST-STAKE";
  harness.invalidateContentLibraryRequest();
  const searchedRequest = harness.loadContentLibrary();

  assert.equal(harness.pending.length, 2);
  assert.match(harness.pending[0].url, /q=$/);
  assert.match(harness.pending[1].url, /q=OADW-INT-FIRST-STAKE$/);

  harness.pending[1].resolve({ items: [{ id: "match" }], totalCount: 1 });
  await searchedRequest;
  harness.pending[0].resolve({ items: [{ id: "stale" }], totalCount: 250 });
  await initialRequest;

  assert.deepEqual(harness.state.contentItems, [{ id: "match" }]);
  assert.equal(harness.state.contentTotalCount, 1);
  assert.equal(harness.getRenderCount(), 1);
});

test("Content Library coalesces a burst of keystrokes into one request", async () => {
  // Every keystroke used to call loadContentLibrary directly, so typing an eight-character
  // id sent eight requests to a Firestore-backed endpoint. The debounce is the half of this
  // fix that reduces read volume, which is the same cost problem the billing work addresses.
  const harness = createContentLibraryHarness();
  for (const query of ["O", "OA", "OAD", "OADW"]) {
    harness.state.contentQuery = query;
    harness.invalidateContentLibraryRequest();
    harness.queueContentLibrarySearch();
  }

  // Four keystrokes, one surviving timer, and nothing sent yet.
  assert.equal(harness.pendingTimers().length, 1);
  assert.equal(harness.pendingTimers()[0].delay, harness.CONTENT_SEARCH_DEBOUNCE_MS);
  assert.equal(harness.pending.length, 0);
  // The reviewer is told a search is coming rather than left looking at stale rows.
  assert.match(harness.status.textContent, /Searching content library/);

  const request = harness.runPendingTimers()[0];
  assert.equal(harness.pending.length, 1);
  // The one request that goes out carries the final query, not an intermediate one.
  assert.match(harness.pending[0].url, /q=OADW$/);

  harness.pending[0].resolve({ items: [{ id: "match" }], totalCount: 1 });
  await request;
  assert.equal(harness.getRenderCount(), 1);
});

test("refreshing cancels a pending debounced search instead of racing it", async () => {
  const harness = createContentLibraryHarness();
  harness.state.contentQuery = "OADW";
  harness.queueContentLibrarySearch();
  assert.equal(harness.pendingTimers().length, 1);

  // This is what the refresh button does: drop the queued search, then load immediately.
  harness.clearContentSearchTimer();
  harness.invalidateContentLibraryRequest();
  const request = harness.loadContentLibrary();

  assert.equal(harness.pendingTimers().length, 0);
  assert.equal(harness.pending.length, 1);
  harness.pending[0].resolve({ items: [], totalCount: 0 });
  await request;
  assert.equal(harness.getRenderCount(), 1);
});
