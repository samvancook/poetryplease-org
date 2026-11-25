#!/usr/bin/env node
"use strict";

// Exports the Playdate-sized, non-dark, cleared poems from pool.json into
// playdate/poetry-dispenser/source/poems.json (read by main.lua).
//   node scripts/dispenser-pool/build-playdate.js

const fs = require("node:fs");
const path = require("node:path");
const lib = require("./pool-lib.js");

const ROOT = path.join(__dirname, "..", "..");
const POOL = path.join(ROOT, "imports", "dispenser-pool", "pool.json");
const OUT = path.join(ROOT, "playdate", "poetry-dispenser", "source", "poems.json");
const MAX_POEMS = 150;
const MAX_PER_AUTHOR = 10; // keep the mix varied

// The Playdate system font covers ASCII; fold typographic characters.
function ascii(text) {
  return String(text)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "--")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

function exportPoems(pool) {
  const out = [];
  const perAuthor = new Map();
  for (const p of pool.poems) {
    if ((perAuthor.get(p.author) || 0) >= MAX_PER_AUTHOR) continue;
    if (p.rights.status !== "public-domain-us") continue;
    if (p.moodTags.includes("dark")) continue;
    if (p.readability < 0.5) continue;
    const lines = p.lines.map(ascii);
    if (lib.rowsAt(lines, lib.SIZES.playdate.cols) > lib.SIZES.playdate.rows) continue;
    perAuthor.set(p.author, (perAuthor.get(p.author) || 0) + 1);
    out.push({
      id: p.id,
      title: ascii(p.title),
      author: ascii(p.author),
      lines,
      moodTags: p.moodTags,
      prior: p.prior,
    });
    if (out.length >= MAX_POEMS) break;
  }
  return { from: "imports/dispenser-pool/pool.json", cols: lib.SIZES.playdate.cols, rows: lib.SIZES.playdate.rows, poems: out };
}

if (require.main === module) {
  const pool = JSON.parse(fs.readFileSync(POOL, "utf8"));
  const data = exportPoems(pool);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote ${data.poems.length} poems to ${path.relative(ROOT, OUT)}`);
}

module.exports = { exportPoems, ascii, OUT };
