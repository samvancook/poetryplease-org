#!/usr/bin/env node
"use strict";

// Imports the public-domain-poetry.com collection (GitHub copy
// facjure/public-domain-poetry, ~33,700 poems; the Hugging Face
// "DanFosing/public-domain-poetry" dataset was scraped from the same site).
//
//   git clone --depth 1 https://github.com/facjure/public-domain-poetry /tmp/pdp
//   node scripts/dispenser-pool/import-pdp.js /tmp/pdp [full-output.jsonl]
//
// Writes:
//   imports/dispenser-pool/pdp-short.json  short poems (<=16 lines) by cleared poets, for the pool
//   [full-output.jsonl]                    every poem, each marked cleared or not-cleared (optional)
//
// Licence: the collection's poems are offered "free for personal or commercial
// use, provided the Zenup BSD-style license is retained" (repo README).

const fs = require("node:fs");
const path = require("node:path");
const { rightsForCollectionAuthor } = require("./pdp-authors.js");

const OUT = path.join(__dirname, "..", "..", "imports", "dispenser-pool", "pdp-short.json");
const SOURCE = "public-domain-poetry.com via github.com/facjure/public-domain-poetry (Zenup BSD-style licence)";

function parseFile(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*?)\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  const lines = m[2].replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return { author: meta.author || "Unknown", title: meta.title || "", lines };
}

function main() {
  const [dir, fullOut] = process.argv.slice(2);
  if (!dir) throw new Error("usage: import-pdp.js <clone dir> [full-output.jsonl]");
  const files = fs.readdirSync(path.join(dir, "poems")).sort();
  const full = fullOut ? fs.createWriteStream(fullOut) : null;
  const short = [];
  const authors = new Map();
  for (const f of files) {
    const p = parseFile(fs.readFileSync(path.join(dir, "poems", f), "utf8"));
    if (!p || !p.lines.length) continue;
    const r = rightsForCollectionAuthor(p.author);
    const n = p.lines.filter((l) => l.trim()).length;
    const a = authors.get(p.author) || { name: p.author, poems: 0, status: r.status };
    a.poems++;
    authors.set(p.author, a);
    if (full) full.write(JSON.stringify({ file: f, author: r.author, collectionAuthor: p.author, title: p.title, lineCount: n, lines: p.lines, rights: { status: r.status, basis: r.basis, source: SOURCE } }) + "\n");
    if (r.status === "public-domain-us" && n >= 1 && n <= 16 && p.title) {
      short.push({ title: p.title, author: r.author, lines: p.lines, authorDied: r.authorDied, basis: r.basis, file: f });
    }
  }
  if (full) full.end();
  fs.writeFileSync(OUT, JSON.stringify({ source: SOURCE, poems: short }, null, 0) + "\n");
  const cleared = [...authors.values()].filter((a) => a.status === "public-domain-us");
  console.log(`${files.length} files, ${authors.size} poets (${cleared.length} cleared), ${short.length} short cleared poems -> ${path.relative(process.cwd(), OUT)}`);
  return authors;
}

if (require.main === module) {
  const authors = main();
  const csv = process.argv[4];
  if (csv) {
    const rows = [["poet", "poems", "status"], ...[...authors.values()].sort((a, b) => b.poems - a.poems).map((a) => [a.name, a.poems, a.status])];
    fs.writeFileSync(csv, rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
  }
}

module.exports = { parseFile };
