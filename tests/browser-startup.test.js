"use strict";

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
