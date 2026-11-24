"use strict";

// The existing CI command names this file explicitly; include startup protection.
require("./browser-startup.test.js");
require("./swipe-intro.test.js");

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

function browserHarness({ search = "", rows = [], videos = [] } = {}) {
  const ids = [
    "login", "switch-account", "retry-auth", "logout", "search", "author", "book", "catalog",
    "asset-type", "confidence", "product-link", "flags-only", "reset", "load-more", "workspace",
    "results", "account-note", "status", "summary", "coverage",
    "youtube-panel", "yt-search", "yt-book", "yt-author", "yt-list", "yt-more", "yt-count",
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
    location: { pathname: "/explorer/", search, reload() {} },
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
        : url.endsWith("/explorer/youtubeVideos")
          ? { videos, totalCount: videos.length }
          : { rows, bookSummaries: [] },
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

const taggedPilotPoem = {
  title: "Bois D’Arc", author: "Buddy Wakefield", book: "A Choir of Honest Killers",
};

test("related products render only in the staff pilot and do not satisfy direct-link coverage", async () => {
  const user = { email: "staff@buttonpoetry.com", getIdToken: async () => "test-token" };
  for (const [search, visible] of [
    ["?q=Bois", false],
    ["?q=Bois&related=pilot&productLink=has", false],
    ["?q=Bois&related=pilot&productLink=missing", true],
  ]) {
    const harness = browserHarness({ search, rows: [taggedPilotPoem] });
    harness.auth.currentUser = user;
    await harness.getAuthCallback()(user);
    const html = harness.elements.results.innerHTML;
    assert.equal(html.includes("Suggested related products"), visible);
    assert.equal(html.includes("Shared theme: grief and loss"), visible);
    assert.equal(html.includes("Buddy Wakefield Books Bundle"), visible);
  }
});

test("thematic suggestions reject a conflicting poem key and ambiguous title matches", () => {
  const themes = (row, unique) => explorer.relatedProductSuggestions(row, unique)
    .filter((suggestion) => suggestion.kind === "Thematic connection");
  assert.equal(themes(taggedPilotPoem, false).length, 0);
  assert.equal(themes({ ...taggedPilotPoem, poemKey: "BPP-00001" }, true).length, 0);
  assert.equal(themes({ ...taggedPilotPoem, poemKey: "BPP-00222" }, false).length, 1);
});

test("YouTube helpers filter by book, author and search without reordering", () => {
  const videos = [
    { title: "Almosts", author: "Bianca Phipps", book: "CROWN NOBLE", views: 1077541 },
    { title: "The Future", author: "Neil Hilborn", book: "THE FUTURE", views: 900 },
    { title: "Liminality", author: "Neil Hilborn", book: "THE FUTURE", views: 50 },
  ];
  assert.deepEqual(explorer.youtubeFacets(videos).books, ["CROWN NOBLE", "THE FUTURE"]);
  assert.deepEqual(explorer.filterYoutubeVideos(videos, { book: "the future" }).map((v) => v.title), ["The Future", "Liminality"]);
  assert.deepEqual(explorer.filterYoutubeVideos(videos, { author: "bianca phipps" }).map((v) => v.title), ["Almosts"]);
  assert.deepEqual(explorer.filterYoutubeVideos(videos, { query: "limin" }).map((v) => v.title), ["Liminality"]);
  assert.equal(explorer.formatCount(1077541), "1,077,541");
});

test("signed-in Explorer shows the top YouTube videos panel, scoped by the ytBook link", async () => {
  const user = { email: "staff@buttonpoetry.com", getIdToken: async () => "test-token" };
  const videos = [
    { title: "Almosts", author: "Bianca Phipps", book: "CROWN NOBLE", views: 1077541, likes: 38447, url: "https://www.youtube.com/watch?v=3wvnQcm3SZE" },
    { title: "The Future", author: "Neil Hilborn", book: "THE FUTURE", views: 900, likes: 3, url: "https://www.youtube.com/watch?v=x" },
  ];
  const all = browserHarness({ videos });
  all.auth.currentUser = user;
  await all.getAuthCallback()(user);
  assert.equal(all.elements["youtube-panel"].hidden, false);
  assert.match(all.elements["yt-list"].innerHTML, /Almosts[\s\S]*1,077,541[\s\S]*The Future/);
  assert.match(all.elements["yt-count"].textContent, /^2 videos/);
  assert.equal(all.elements.workspace.hidden, false);

  const scoped = browserHarness({ videos, search: "?ytBook=THE%20FUTURE" });
  scoped.auth.currentUser = user;
  await scoped.getAuthCallback()(user);
  assert.doesNotMatch(scoped.elements["yt-list"].innerHTML, /Almosts/);
  assert.match(scoped.elements["yt-count"].textContent, /^1 of 2 videos/);
});
