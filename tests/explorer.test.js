"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const explorer = require("../public/explorer/explorer.js");

test("authorization accepts only team and admin roles", () => {
  assert.equal(explorer.isTeamProfile({ roles: ["team"] }), true);
  assert.equal(explorer.isTeamProfile({ roles: ["admin"] }), true);
  assert.equal(explorer.isTeamProfile({ roles: ["author"] }), false);
  assert.equal(explorer.isTeamProfile({ role: "admin" }), false);
});

test("search and author/book/catalog filters stay scoped to matching works", () => {
  const rows = [
    { title: "The Future", author: "Neil Hilborn", book: "Our Numbered Days", catalog: "Spring 2015", connectedItems: [{ type: "VV", sourceUrl: "https://youtu.be/video-1" }] },
    { title: "Complainers", author: "Rudy Francisco", book: "Helium", catalog: "Fall 2017" },
  ];
  assert.deepEqual(explorer.filterWorks(rows, { query: "future" }).map((row) => row.title), ["The Future"]);
  assert.deepEqual(explorer.filterWorks(rows, { author: "rudy francisco", book: "helium" }).map((row) => row.title), ["Complainers"]);
  assert.deepEqual(explorer.filterWorks(rows, { catalog: "spring 2015" }).map((row) => row.title), ["The Future"]);
  assert.deepEqual(explorer.filterWorks(rows, { query: "youtu.be/video-1" }).map((row) => row.title), ["The Future"]);
  assert.deepEqual(explorer.filterWorks(rows, { coverage: { VV: "has" } }).map((row) => row.title), ["The Future"]);
  assert.deepEqual(explorer.filterWorks(rows, { coverage: { VV: "missing" } }).map((row) => row.title), ["Complainers"]);
  assert.equal(explorer.filterWorks(rows, { author: "Neil Hilborn", book: "Helium" }).length, 0);
});

test("identity display distinguishes stable, linked, inferred, and unmatched relationships", () => {
  assert.equal(explorer.relationshipLabel({ workId: "work-1" }).key, "exact");
  assert.equal(explorer.relationshipLabel({ imageId: "asset-1" }).key, "linked");
  assert.equal(explorer.relationshipLabel({ title: "Possible title match" }).key, "inferred");
  assert.equal(explorer.relationshipLabel({}).key, "unmatched");
});

test("read-only guard rejects every mutating HTTP method", () => {
  assert.equal(explorer.assertReadOnlyRequest("GET"), "GET");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.throws(() => explorer.assertReadOnlyRequest(method), /read-only/i);
  }
});

test("view model derives selectors without mutating API rows", () => {
  const payload = { rows: [
    { title: "B", author: "Author B", book: "Book 2" },
    { title: "A", author: "Author A", book: "Book 1" },
    { title: "A2", author: "Author A", book: "Book 1" },
  ], bookSummaries: [{ book: "Book 1", releaseCatalog: "Spring 2026", bookLink: "https://poetryplease.org/books/book-1" }] };
  const model = explorer.viewModel(payload);
  assert.deepEqual(model.authors, ["Author A", "Author B"]);
  assert.deepEqual(model.books, ["Book 1", "Book 2"]);
  assert.deepEqual(model.catalogs, ["Spring 2026"]);
  assert.equal(model.rows[0].explorerCatalog, undefined);
  assert.equal(model.rows[1].explorerCatalog, "Spring 2026");
  assert.equal(model.rows[1].explorerProductLinks[0].url, "https://poetryplease.org/books/book-1");
  assert.deepEqual(explorer.filterWorks(model.rows, { productLink: "has" }).map((row) => row.title), ["A", "A2"]);
  assert.deepEqual(explorer.filterWorks(model.rows, { productLink: "missing" }).map((row) => row.title), ["B"]);
  assert.equal(payload.rows[1].explorerCatalog, undefined);
  assert.equal(payload.rows.length, 3);
});

function browserHarness() {
  const ids = [
    "login", "switch-account", "retry-auth", "logout", "search", "author", "book", "catalog",
    "asset-type", "confidence", "product-link", "flags-only", "reset", "load-more", "workspace",
    "results", "account-note", "status", "summary", "coverage",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, {
    id,
    hidden: false,
    textContent: "",
    className: "",
    value: "",
    checked: false,
    innerHTML: "",
    addEventListener() {},
  }]));
  let authCallback;
  const auth = {
    currentUser: null,
    onAuthStateChanged(callback) {
      authCallback = callback;
    },
    async signOut() {
      this.currentUser = null;
    },
  };
  const firebaseAuth = () => auth;
  firebaseAuth.GoogleAuthProvider = class GoogleAuthProvider {
    setCustomParameters() {}
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URLSearchParams,
    document: { getElementById: (id) => elements[id] },
    history: { replaceState() {} },
    location: { pathname: "/explorer/", search: "", reload() {} },
    firebase: {
      apps: [],
      initializeApp() { this.apps.push({}); },
      auth: firebaseAuth,
    },
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => url.endsWith("/me")
        ? { email: "staff@buttonpoetry.com", roles: ["team"] }
        : { rows: [], bookSummaries: [] },
    }),
  };
  sandbox.window = sandbox;
  const source = fs.readFileSync(path.join(__dirname, "../public/explorer/explorer.js"), "utf8");
  vm.runInNewContext(source, sandbox, { filename: "explorer.js" });
  return { auth, elements, getAuthCallback: () => authCallback };
}

test("signed-in browser lifecycle reaches content without a callback scope error", async () => {
  const harness = browserHarness();
  const user = {
    email: "staff@buttonpoetry.com",
    getIdToken: async () => "test-token",
  };
  harness.auth.currentUser = user;
  await harness.getAuthCallback()(user);
  assert.equal(harness.elements["account-note"].textContent, "Signed in as staff@buttonpoetry.com");
  assert.match(harness.elements.status.textContent, /0 matching works/);
  assert.equal(harness.elements.workspace.hidden, false);
});
