"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const publicRoot = path.resolve(__dirname, "../public");
const chrome = [
  process.env.PP_TEST_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find(candidate => candidate && fs.existsSync(candidate));

// slowCheck: the sign-in check answers late, as the real SDK does on a phone. It
// holds off until the first card is readable, or gives up after 80 polls. Each
// poll makes a blocking request so real time passes: the test browser's virtual
// clock would otherwise run every timer before the page's storage read returns.
const firebaseFixture = (signedIn, slowCheck = false) => `
(() => {
if (window.firebase) return;
// A real signed-in browser holds a saved sign-in record before the SDK loads.
${signedIn ? `localStorage.setItem("firebase:authUser:fixture:[DEFAULT]", "{}");` : ""}
const apps = [];
const fixtureUser = ${signedIn ? `{
  uid: "fixture-reader", email: "fixture-reader@example.test", displayName: "Fixture Reader",
  isAnonymous: false, providerData: [],
  // The account lookup made at sign-in is slow, slower than the classic mobile
  // failsafe. A page timer is used because the test browser's virtual clock
  // stands still while a network request is pending.
  getIdToken: () => new Promise(resolve =>
    setTimeout(() => resolve("fixture-token"), Date.now() - fixtureLoadedAt < 600 ? 1500 : 0))
}` : "null"};
const fixtureLoadedAt = Date.now();
// As with the real SDK, nobody is signed in until the restored session is announced.
const authState = {
  currentUser: null,
  onAuthStateChanged(callback) {
    const ready = ${slowCheck ? `new Promise(resolve => {
      let polls = 0;
      const poll = setInterval(() => {
        const tick = new XMLHttpRequest();
        tick.open("GET", "/sign-in-check-tick", false);
        tick.send();
        if (++polls < 80 && !document.querySelector("#feed")?.textContent.includes("Startup fixture first line")) return;
        clearInterval(poll);
        resolve();
      }, 50);
    })` : "Promise.resolve()"};
    ready.then(() => setTimeout(() => {
      // Swipe: was the first card already readable when the sign-in check answered?
      document.documentElement.dataset.startupCardBeforeSignInCheck =
        String(!!document.querySelector("#feed")?.textContent.includes("Startup fixture first line"));
      authState.currentUser = fixtureUser; callback(fixtureUser);
    }, 0));
    return () => {};
  },
  getRedirectResult: () => Promise.resolve(null)
};
function auth() { return authState; }
auth.GoogleAuthProvider = class {};
window.firebase = { apps, initializeApp(config) { apps.push({ config }); }, auth };
})();
`;

function probeScript(mode, scenario) {
  return `<script>
  const startupErrors = [];
  addEventListener('error', event => {
    if (event.message) startupErrors.push(event.message);
  });
  addEventListener('unhandledrejection', event => startupErrors.push(String(event.reason)));
  // A slow connection: the first feed answer takes 2.5 s of page time.
  if (${JSON.stringify(scenario === "slow-card")}) {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => /bootstrap|fetchFiltered/.test(String(input?.url || input))
      ? new Promise(resolve => setTimeout(resolve, 2500)).then(() => realFetch(input, init))
      : realFetch(input, init);
  }
  const check = setInterval(() => {
    const retry = document.getElementById('load-more');
    if (${JSON.stringify(scenario === "retry")} && retry && !retry.hidden && retry.textContent === 'Retry loading') {
      document.documentElement.dataset.startupRetried = 'true';
      retry.click();
    }
    const root = document.querySelector(${JSON.stringify(mode === "swipe" ? "#feed" : "#media-wrap")});
    const rendered = root && [...root.querySelectorAll('*')].some(element =>
      element.textContent === 'Startup fixture first line' && element.getBoundingClientRect().height > 0);
    const loader = document.getElementById('pp-loader');
    const blocked = loader && getComputedStyle(loader).display !== 'none'
      && getComputedStyle(loader).visibility !== 'hidden' && !loader.classList.contains('is-hidden');
    if (document.getElementById('pp-welcome-choice')) {
      document.documentElement.dataset[rendered ? 'startupWelcomeAfterCard' : 'startupWelcomeBeforeCard'] = 'true';
    }
    if (rendered && !blocked) {
      document.documentElement.dataset.startupResult = 'ready';
      if (${JSON.stringify(scenario === "advance")}) {
        if (!document.documentElement.dataset.startupAdvanced) {
          document.documentElement.dataset.startupAdvanced = 'true';
          document.getElementById('load-button').click();
        }
      } else if (${JSON.stringify(scenario !== "mobile-low" && scenario !== "slow-card")}) clearInterval(check);
    }
    // Classic mobile: vote through cards until few are left, which should start the full feed.
    if (${JSON.stringify(scenario === "mobile-low")} && rendered && !blocked) {
      const sent = Number(document.documentElement.dataset.startupVotes || 0);
      if (sent < 3 && !document.documentElement.dataset.startupVoting) {
        document.documentElement.dataset.startupVoting = 'true';
        Promise.resolve(window.PP.vote('like')).finally(() => {
          document.documentElement.dataset.startupVotes = String(sent + 1);
          delete document.documentElement.dataset.startupVoting;
        });
      }
    }
    if (${JSON.stringify(scenario === "advance")} && root?.textContent.includes('Refill fixture readable')) {
      document.documentElement.dataset.startupRefilled = 'true';
      clearInterval(check);
    }
    document.documentElement.dataset.startupErrors = JSON.stringify(startupErrors);
  }, 50);
  </script>`;
}

function launch(url, profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--no-first-run", "--disable-background-networking", "--disable-extensions",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "--user-data-dir=" + profile, "--window-size=1280,900",
      "--virtual-time-budget=10000", "--dump-dom", url,
    ]);
    let output = "", errors = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Startup browser exceeded 30 seconds"));
    }, 30000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("Chrome failed: " + errors.slice(-1500)));
      else resolve(output);
    });
  });
}

test("Desktop, classic mobile and Swipe render the first readable card from their real shells", { timeout: 165000 }, async () => {
  assert.ok(chrome, "Chrome is required. Set PP_TEST_CHROME to an installed Chrome executable.");
  const row = ["Fixture author", "Fixture title", "Fixture book", "startup-fixture",
    "", "", "", "EXC", "Startup fixture first line\nStartup fixture second line"];
  const feed = { newGraphics: [row], hasMore: false, domainTotalImages: 1, ratingsSummary: {} };
  const refill = { ...feed, newGraphics: [[...row.slice(0, 3), "refill-fixture", ...row.slice(4, 8), "Refill fixture readable"]] };
  const manyRows = Array.from({ length: 11 }, (_, i) => [...row.slice(0, 3), "startup-fixture-" + i, ...row.slice(4)]);
  const requests = [];
  let scenario = "ready";
  let failedFeed = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/firebase-fixture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(firebaseFixture(scenario.endsWith("signed-in"), scenario === "slow-sign-in-check"));
      return;
    }
    if (url.pathname === "/sign-in-check-tick") {
      setTimeout(() => response.end("ok"), 20);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      requests.push(url.pathname);
      if (scenario.endsWith("signed-in") && url.pathname === "/api/me") {
        // Background startup work must wait for the first card even after the account
        // lookup, and only one first feed may be requested while that lookup is pending.
        response.writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ roles: ["user"], email: "fixture-reader@example.test" }));
        return;
      }
      if (scenario === "retry" && url.pathname === "/api/fetchFiltered" && !failedFeed) {
        failedFeed = true;
        response.writeHead(503, { "Content-Type": "application/json" }).end("{}");
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(url.pathname === "/api/contentById" ? { item: row }
        : url.pathname === "/api/fetchDataAnon" ? refill
        : /bootstrap|fetchFiltered/.test(url.pathname) ? (scenario === "mobile-low" ? { ...feed, newGraphics: manyRows } : feed) : []));
      return;
    }
    const shells = { "/app": "index.html", "/mobile.html": "mobile.html", "/m": "posts-swipe.html" };
    const shell = shells[url.pathname];
    const filename = path.resolve(publicRoot, shell || "." + decodeURIComponent(url.pathname));
    if (!filename.startsWith(publicRoot + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      response.writeHead(404).end();
      return;
    }
    if (scenario === "crash" && url.pathname === "/scroll.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end("throw new Error('Injected startup failure');");
      return;
    }
    const extension = path.extname(filename);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
    response.setHeader("Content-Type", types[extension] || "application/octet-stream");
    if (shell) {
      const html = fs.readFileSync(filename, "utf8")
        .replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+/g, "/firebase-fixture.js");
      response.end(html.replace("<head>", "<head>" + probeScript(shell === "posts-swipe.html" ? "swipe" : "classic", scenario)));
    } else response.end(fs.readFileSync(filename));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const cases = [
      ["/app?desktop=1", "ready"],
      ["/app?desktop=1", "advance"],
      ["/app?desktop=1", "signed-in"],
      ["/mobile.html", "signed-in"],
      ["/mobile.html", "mobile-low"],
      ["/mobile.html", "ready"],
      ["/mobile.html", "slow-card"],
      ["/app?desktop=1", "slow-card"],
      ["/m", "ready"],
      ["/m", "slow-sign-in-check"],
      ["/m", "swipe-signed-in"],
      ["/m?item=startup-fixture", "linked"],
      ["/m", "retry"],
      ["/m", "crash"],
    ];
    for (const [route, nextScenario] of cases) {
      scenario = nextScenario;
      const requestStart = requests.length;
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pp-startup-browser-"));
      try {
        const output = await launch("http://127.0.0.1:" + server.address().port + route, profile);
        if (scenario === "crash") {
          assert.ok(!/data-startup-result="ready"/.test(output), "Runtime failure was falsely reported as ready");
          assert.ok(output.includes("Injected startup failure"), "Runtime failure was not captured");
          continue;
        }
        const fullFeedRequests = requests.slice(requestStart).filter(p => p === "/api/fetchDataAnon" || p === "/api/fetchData");
        if (route.startsWith("/app") && scenario === "ready") {
          assert.equal(fullFeedRequests.length, 0, "Desktop fetched the full feed before advancing");
        }
        if (route.startsWith("/mobile.html") && scenario !== "mobile-low") {
          assert.equal(fullFeedRequests.length, 0, "Classic mobile fetched the full feed before the reader advanced");
        }
        if (scenario === "mobile-low") {
          assert.equal(fullFeedRequests.length, 1, "Classic mobile did not fetch the full feed once when few cards were left");
        }
        if (scenario === "signed-in") {
          const seen = requests.slice(requestStart);
          const feedAt = seen.findIndex(p => p === "/api/bootstrap" || p === "/api/fetchFiltered");
          assert.ok(seen.includes("/api/me"), route + " did not look up the signed-in account");
          assert.ok(feedAt >= 0, route + " signed in but never requested its first feed");
          for (const background of ["/api/ratingsSummary", "/api/books", "/api/imageTypes", "/api/releaseCatalogs"]) {
            const at = seen.indexOf(background);
            assert.ok(at === -1 || at > feedAt, route + " requested " + background + " before the signed-in first feed");
          }
          assert.equal(seen.filter(p => p === "/api/bootstrap" || p === "/api/fetchFiltered").length, 1,
            route + " requested its first feed more than once while the account lookup was pending");
          assert.ok(seen.includes("/api/imageTypes"), route + " never loaded its filter lists after the first card");
        }
        const swipeFeeds = requests.slice(requestStart).filter(p => p === "/api/fetchFiltered").length;
        if (scenario === "slow-sign-in-check") {
          // A first-time visitor has no saved sign-in, so the feed must not wait for the check.
          assert.ok(/data-startup-card-before-sign-in-check="true"/.test(output), "Swipe waited for the sign-in check before showing a first-time visitor a card");
          assert.equal(swipeFeeds, 1, "Swipe asked for a first-time visitor's feed again after the sign-in check");
          assert.ok(!output.includes("Loading your queue"), "Swipe's status stayed on loading after the sign-in check");
          assert.ok(output.includes("Browsing without an account"), "Swipe's account menu did not update after the sign-in check");
        }
        if (scenario === "swipe-signed-in") {
          const seen = requests.slice(requestStart);
          assert.ok(seen.includes("/api/me"), "Swipe did not look up the signed-in account");
          assert.ok(seen.indexOf("/api/fetchFiltered") > seen.indexOf("/api/me"), "Swipe asked for a signed-in reader's feed before their account was known");
          assert.equal(swipeFeeds, 1, "Swipe asked for a signed-in reader's feed more than once");
        }
        if (route === "/m" && scenario === "ready") assert.equal(swipeFeeds, 1, "Swipe asked for its first feed more than once");
        if (scenario === "slow-card") {
          assert.ok(!/data-startup-welcome-before-card="true"/.test(output), route + " showed the welcome prompt over a card that was still loading");
          assert.ok(/data-startup-welcome-after-card="true"/.test(output), route + " never showed the welcome prompt after the slow first card");
        }
        if (scenario === "advance") {
          assert.equal(fullFeedRequests.length, 1, "Desktop did not request one full refill");
          assert.ok(/data-startup-refilled="true"/.test(output), "Desktop did not render the refilled card");
        }
        if (scenario === "linked") {
          const seen = requests.slice(requestStart);
          const linkedAt = seen.indexOf("/api/contentById");
          const feedAt = seen.indexOf("/api/fetchFiltered");
          assert.ok(linkedAt >= 0, "Linked item did not load directly");
          // The normal Swipe feed may follow the linked poem, but never before it.
          assert.ok(feedAt === -1 || feedAt > linkedAt, "Linked item asked for the mixed feed before its own poem");
        }
        if (scenario === "retry") assert.ok(/data-startup-retried="true"/.test(output), "Failed feed did not expose a usable retry");
        assert.ok(/data-startup-result="ready"/.test(output), route + " never rendered a readable card");
        assert.ok(/data-startup-errors="\[\]"/.test(output), route + " reported an uncaught startup error: " + output.match(/data-startup-errors="([^"]*)"/)?.[1]);
      } finally {
        fs.rmSync(profile, { recursive: true, force: true });
      }
    }
    assert.ok(requests.includes("/api/bootstrap"), "Desktop did not request bootstrap");
    assert.ok(requests.includes("/api/fetchFiltered"), "Swipe did not request its feed");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("feed startup ignores an earlier account failure after identity changes", async () => {
  const source = fs.readFileSync(path.join(publicRoot, "feed-startup.js"), "utf8");
  const { createFeedLoader } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const status = { textContent: "" };
  const loadMore = { addEventListener() {} };
  let onAuth;
  let rejectEarlier;
  let resetCount = 0;
  const earlier = new Promise((resolve, reject) => { rejectEarlier = reject; });
  const loader = createFeedLoader({ feed: {}, status, loadMore, onRetry() {}, endMessage() {} });
  loader.watchAuth({
    getRedirectResult: async () => null,
    onAuthStateChanged(callback) { onAuth = callback; },
  }, {
    identityFor: user => user.email,
    reset() { resetCount++; },
    prepare: user => user.email === "earlier" ? earlier : Promise.resolve(),
  });
  const pending = onAuth({ email: "earlier" });
  await onAuth({ email: "current" });
  status.textContent = "Current queue";
  rejectEarlier(new Error("Earlier account failed"));
  await pending;
  await onAuth({ email: "current" });
  assert.equal(status.textContent, "Current queue");
  assert.equal(loader.identity, "current");
  assert.equal(resetCount, 2);
});
