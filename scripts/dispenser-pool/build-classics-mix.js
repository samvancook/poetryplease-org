#!/usr/bin/env node
"use strict";

// Writes public/classics-mix.json, the poems the Swipe test mix shows
// (public/scroll-feed-core.js, only with ?classics=1).
//   node scripts/dispenser-pool/build-classics-mix.js
//
// Source: imports/dispenser-pool/classics-sample-2026-11-28.json, the 36
// poems shown to Sam on 28 Nov 2026. Each poet's death year or the book's
// printing year was checked against the source linked in `checkedUrl`.

const fs = require("node:fs");
const path = require("node:path");

const SAMPLE = path.join(__dirname, "..", "..", "imports", "dispenser-pool", "classics-sample-2026-11-28.json");
const OUT = path.join(__dirname, "..", "..", "public", "classics-mix.json");

function exportMix(sample) {
  return {
    note: "Test mix only. Public-domain classics; see imports/dispenser-pool/README.md.",
    poems: sample.map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      lines: p.lines,
      source: `${p.checked} · public domain`,
      checkedUrl: p.checkedUrl,
    })),
  };
}

if (require.main === module) {
  const sample = JSON.parse(fs.readFileSync(SAMPLE, "utf8"));
  fs.writeFileSync(OUT, JSON.stringify(exportMix(sample)) + "\n");
  console.log(`wrote ${sample.length} poems to ${path.relative(process.cwd(), OUT)}`);
}

module.exports = { exportMix, SAMPLE, OUT };
