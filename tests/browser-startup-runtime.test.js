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

const firebaseFixture = `
(() => {
const authState = {
  currentUser: null,
  onAuthStateChanged(callback) {
    setTimeout(() => callback(null), 0);
    return () => {};
  },
  getRedirectResult: () => Promise.resolve(null)
};
function auth() { return authState; }
auth.GoogleAuthProvider = class {};
window.firebase = { initializeApp() {}, auth };
})();
`;

function probeScript(mode, retry) {
  return `<script>
  const startupErrors = [];
  addEventListener('error', event => {
    if (event.message) startupErrors.push(event.message);
  });
  addEventListener('unhandledrejection', event => startupErrors.push(String(event.reason)));
  const check = setInterval(() => {
    const retry = document.getElementById('load-more');
    if (${JSON.stringify(retry)} && retry && !retry.hidden && retry.textContent === 'Retry loading') {
      document.documentElement.dataset.startupRetried = 'true';
      retry.click();
    }
    const root = document.querySelector(${JSON.stringify(mode === "swipe" ? "#feed" : "#media-wrap")});
    const rendered = root && [...root.querySelectorAll('*')].some(element =>
      element.textContent === 'Startup fixture first line' && element.getBoundingClientRect().height > 0);
    const loader = document.getElementById('pp-loader');
    const blocked = loader && getComputedStyle(loader).display !== 'none'
      && getComputedStyle(loader).visibility !== 'hidden' && !loader.classList.contains('is-hidden');
    if (rendered && !blocked) {
      document.documentElement.dataset.startupResult = 'ready';
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

test("desktop and Swipe execute their real entry shells and render the first readable card", { timeout: 135000 }, async () => {
  assert.ok(chrome, "Chrome is required. Set PP_TEST_CHROME to an installed Chrome executable.");
  const row = ["Fixture author", "Fixture title", "Fixture book", "startup-fixture",
    "", "", "", "EXC", "Startup fixture first line\nStartup fixture second line"];
  const feed = { newGraphics: [row], hasMore: false, domainTotalImages: 1, ratingsSummary: {} };
  const requests = [];
  let scenario = "ready";
  let failedFeed = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/firebase-fixture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(firebaseFixture);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      requests.push(url.pathname);
      if (scenario === "retry" && url.pathname === "/api/fetchFiltered" && !failedFeed) {
        failedFeed = true;
        response.writeHead(503, { "Content-Type": "application/json" }).end("{}");
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(/bootstrap|fetchFiltered/.test(url.pathname) ? feed : []));
      return;
    }
    const shell = url.pathname === "/app" ? "index.html" : url.pathname === "/m" ? "posts-swipe.html" : null;
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
      response.end(html.replace("<head>", "<head>" + probeScript(shell === "index.html" ? "desktop" : "swipe", scenario === "retry")));
    } else response.end(fs.readFileSync(filename));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const [route, nextScenario] of [["/app?desktop=1", "ready"], ["/m", "ready"], ["/m", "retry"], ["/m", "crash"]]) {
      scenario = nextScenario;
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pp-startup-browser-"));
      try {
        const output = await launch("http://127.0.0.1:" + server.address().port + route, profile);
        if (scenario === "crash") {
          assert.ok(!/data-startup-result="ready"/.test(output), "Runtime failure was falsely reported as ready");
          assert.ok(output.includes("Injected startup failure"), "Runtime failure was not captured");
          continue;
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
