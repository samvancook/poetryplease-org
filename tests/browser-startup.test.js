"use strict";

require("./browser-startup-runtime.test.js");

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Compile only: no Firebase initialization, browser globals, requests or writes.
async function inspectEntries() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const vm = await import("node:vm");
  const { root, overrides = {} } = JSON.parse(fs.readFileSync(0, "utf8"));
  const origin = "https://poetryplease.org";
  const modules = new Set();
  const compiled = [];
  const sourceAt = (url) => {
    const filename = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!filename.startsWith(root + path.sep)) throw new Error("Script outside public root");
    return Object.hasOwn(overrides, url.pathname) ? overrides[url.pathname] : fs.readFileSync(filename, "utf8");
  };
  function compile(source, mode, url, label) {
    if (mode === "classic") {
      new vm.Script(source, { filename: label });
    } else {
      if (modules.has(url.href)) return;
      modules.add(url.href);
      const module = new vm.SourceTextModule(source, { identifier: label });
      for (const specifier of module.dependencySpecifiers) visit(specifier, url);
    }
    compiled.push({ label, mode });
    // Swipe's initial controller is a literal dynamic import in its HTML.
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) visit(match[2], url);
  }
  function visit(specifier, base) {
    if (!/^(?:\.{1,2}\/|\/|https?:\/\/)/.test(specifier)) throw new Error("Unsupported browser import: " + specifier);
    const url = new URL(specifier, base);
    if (url.origin !== origin) return; // Remote SDK availability is a browser smoke check.
    compile(sourceAt(url), "module", url, url.pathname);
  }
  for (const shell of ["index.html", "mobile.html", "posts-swipe.html", "posts-swipe-outline.html"]) {
    const shellUrl = new URL("/" + shell, origin);
    const html = sourceAt(shellUrl).replace(/<!--[\s\S]*?-->/g, "");
    let count = 0;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attrs = {};
      for (const attr of match[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4];
      const type = (attrs.type || "").toLowerCase();
      if (type && !["module", "text/javascript", "application/javascript"].includes(type)) continue;
      const mode = type === "module" ? "module" : "classic";
      const url = attrs.src ? new URL(attrs.src, shellUrl) : new URL(shellUrl.href + "#script-" + count);
      if (url.origin !== origin) continue;
      if (url.pathname === "/app.js" && mode !== "classic") throw new Error(shell + " changed app.js script mode");
      const source = attrs.src ? sourceAt(url) : match[2];
      compile(source, mode, url, attrs.src ? url.pathname : shell + " inline " + count);
      count++;
    }
    if (!count) throw new Error("No executable local scripts in " + shell);
  }
  process.stdout.write(JSON.stringify(compiled));
}

function inspect(overrides = {}) {
  return spawnSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", `(${inspectEntries.toString()})().catch(error => { console.error(error.stack); process.exitCode = 1; });`], {
    input: JSON.stringify({ root: path.resolve(__dirname, "../public"), overrides }),
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
}

test("real desktop, classic mobile and Swipe shells compile in their declared browser modes", () => {
  const result = inspect();
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  const scripts = JSON.parse(result.stdout);
  assert.ok(scripts.some(script => script.label === "/app.js" && script.mode === "classic"));
  assert.ok(scripts.some(script => script.label === "/scroll.js" && script.mode === "module"));
  assert.ok(scripts.some(script => script.label === "/posts-swipe.js" && script.mode === "module"));
});

test("startup check rejects the static-import regression even though the file is valid ESM", () => {
  const result = inspect({ "/app.js": "import { graphicCards } from './graphic-asset-set.js';" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /app\.js[\s\S]*Cannot use import statement outside a module/);
});

test("startup check follows Swipe module dependencies and rejects their syntax errors", () => {
  const result = inspect({ "/mobile-entry.js": "export function broken( {" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SyntaxError/);
});

test("startup check rejects missing local dependencies before browser navigation", () => {
  const result = inspect({ "/mobile-entry.js": "import './missing-startup-dependency.js';" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT.*missing-startup-dependency/);
});

// Approved startup baselines from loader extractions #340 and #342. startup-loader.js was
// re-baselined on Nov 15 2026 for the card outline loader Sam approved ("Card outline, no forced wait").
// Re-baselined Nov 19 2026 after Sam asked to fix the "misshaped white box" flashing on Desktop
// startup: Desktop shows a delayed plain "Loading…" line instead of the drawn card box.
// Re-baselined posts-swipe.html Nov 23 2026: Sam chose "Build it, I'll review first" for the
// Swipe intro test (10% dispenser, 10% claw, signed-out plain visits); adds the async
// swipe-intro.js module and bumps the pp-analytics.js cache key.
// Update a baseline only after Sam explicitly approves that startup change.
const startupBoundary = [
  { file: "startup-loader.js", scriptsOnly: false, sha256: "f46b2281ae18af0358dbeec65bf43cae86ab5ac98110af843f5897d9dfb650a7" },
  { file: "feed-startup.js", scriptsOnly: false, sha256: "df5cfcbd0c75e31ead6f0e2b5281f5626fbf728bd95f19bb6c6ef53d8134c120" },
  { file: "mobile-entry.js", scriptsOnly: false, sha256: "6b4d828f1dd386429d90f816cffdd75e51e3c02d0c1e5165fd2a3f5880fc94dc" },
  { file: "index.html", scriptsOnly: true, sha256: "feaf35c58da45846c257ac5fe8182aefc4aa83000bdd1b5bb62af4b2ea944b6b" },
  { file: "mobile.html", scriptsOnly: true, sha256: "1afbfd01782183be0fcdc40a90d8ae521ff232aba4a224a50f47c9c78935a3b8" },
  { file: "posts-swipe.html", scriptsOnly: true, sha256: "cf5c06bd7b0dda943405f77e58f2ea2c1ee65efad739a1a67393fb8ed3c1afbb" },
  { file: "posts-swipe-outline.html", scriptsOnly: true, sha256: "c1ebbd8a76bd625f3e732ef8bd2b308a87b2bc3a79dcc7f730c7a01cc52d0009" },
];

function checkStartupBoundary(overrides = {}) {
  const fs = require("node:fs");
  const { createHash } = require("node:crypto");
  for (const { file, scriptsOnly, sha256 } of startupBoundary) {
    const original = Object.hasOwn(overrides, file)
      ? overrides[file] : fs.readFileSync(path.join(__dirname, "../public", file), "utf8");
    const normalized = original.replace(/\r\n/g, "\n");
    const protectedSource = scriptsOnly
      ? [...normalized.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(match => match[0]).join("\n")
      : normalized;
    const actual = createHash("sha256").update(protectedSource).digest("hex");
    assert.equal(actual, sha256,
      file + " changed protected startup code. Obtain Sam's explicit approval before updating its baseline.");
  }
}

// Swipe announces its scripts up front (modulepreload) so they download together. A script
// that is imported but not announced goes back to loading one step at a time, and one that
// is announced under a different address is downloaded twice.
test("Swipe shells announce exactly the scripts their startup imports", () => {
  const fs = require("node:fs");
  const origin = "https://poetryplease.org";
  const read = url => fs.readFileSync(path.join(__dirname, "../public", decodeURIComponent(url.pathname)), "utf8");
  for (const shell of ["posts-swipe.html", "posts-swipe-outline.html"]) {
    const shellUrl = new URL("/" + shell, origin);
    const html = read(shellUrl).replace(/<!--[\s\S]*?-->/g, "");
    const announced = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(match => new URL(match[1], shellUrl).href);
    const reached = new Set();
    const follow = (source, base) => {
      for (const match of source.matchAll(/(?:^\s*import\s[^'"\n]*?|\bimport\s*\(\s*)(['"])(\.{0,2}\/[^'"]+)\1/gm)) {
        const url = new URL(match[2], base);
        if (url.origin !== origin || reached.has(url.href)) continue;
        reached.add(url.href);
        follow(read(url), url);
      }
    };
    // The entry is the inline module that picks Swipe or the single-item view.
    const entry = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n");
    assert.ok(entry.includes("/scroll.js"), shell + " has no inline Swipe entry");
    follow(entry, shellUrl);
    assert.deepEqual([...announced].sort(), [...reached].sort(), shell + " announces different scripts than Swipe imports");
    assert.equal(new Set(announced).size, announced.length, shell + " announces a script twice");
  }
});

test("protected startup modules and entry scripts match their approved baselines", () => {
  checkStartupBoundary();
});

test("startup boundary catches module changes and script order changes", () => {
  const fs = require("node:fs");
  const read = file => fs.readFileSync(path.join(__dirname, "../public", file), "utf8");
  assert.throws(() => checkStartupBoundary({ "feed-startup.js": read("feed-startup.js") + "\n// changed" }),
    /feed-startup.js changed protected startup code/);
  assert.throws(() => checkStartupBoundary({ "index.html": read("index.html").replace(
    '<script src="/startup-loader.js?v=20261106-desktop-loader"></script>',
    '<script src="/app.js?v=20261106-desktop-loader"></script>') }),
    /index.html changed protected startup code/);
  assert.doesNotThrow(() => checkStartupBoundary({ "index.html": read("index.html").replace(
    "<title>", "<!-- unrelated presentation edit -->\n<title>") }));
});
