"use strict";

// Pulls short poems out of Project Gutenberg plain-text books.
//
// Gutenberg poetry files mostly follow one layout: three or more blank lines
// between poems, two blank lines between a title and its first stanza, one
// blank line between stanzas. This parser leans on that layout, then drops
// anything that looks like prose (long wrapped lines), front matter or notes.

const SKIP_HEADINGS = /^(contents|preface|introduction|introductory|index|notes?|footnotes?|transcriber|bibliography|glossary|appendix|errata|dedication|acknowledg|by the same author|biographical|first lines|index of first lines|the end|finis|illustrations?|list of)/i;

function body(text) {
  const t = text.replace(/\r/g, "");
  const start = t.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = t.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  let b = t.slice(start >= 0 ? t.indexOf("\n", start) + 1 : 0, end >= 0 ? end : t.length);
  // Some files end with "End of the Project Gutenberg EBook..." before the marker.
  const endLine = b.search(/\nEnd of (the )?Project Gutenberg/i);
  if (endLine >= 0) b = b.slice(0, endLine);
  return b;
}

function dedent(lines) {
  const ind = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const min = ind.length ? Math.min(...ind) : 0;
  return lines.map((l) => l.slice(min).replace(/\s+$/, ""));
}

function cleanText(s) {
  if (/\*/.test(s) && /^[\s*.\u00a8]+$/.test(s)) return ""; // "* * * *" section marks
  return s
    .replace(/_([^_]+)_/g, "$1") // _italics_
    .replace(/\[(\d+|[A-Z])\]/g, "") // footnote markers
    .replace(/\s+--\s*$/, "--")
    .replace(/[ \t]+$/g, "");
}

const ROMAN = /^(?:[IVXLC]+|\d+)\.?$/;

function isHeadingLine(line) {
  const s = line.trim();
  if (!s || s.length > 70) return false;
  if (ROMAN.test(s)) return true;
  // ALL CAPS line, or a short line in a 1-3 line block (checked by caller).
  return s === s.toUpperCase() && /[A-Z]/.test(s);
}

function looksLikeProse(lines) {
  const text = lines.filter((l) => l.trim());
  if (!text.length) return true;
  if (text.some((l) => l.trim().length > 78)) return true;
  // Wrapped prose: most lines 58-76 chars and lines run on without punctuation.
  const long = text.filter((l) => l.trim().length >= 58).length;
  return text.length >= 3 && long / text.length > 0.6;
}

const FRONT = /gutenberg|produced by|https?:|www\.|@|copyright|all rights reserved|printed (in|by)|publishers?\b|^\s*by\s*$|^\s*\(?\d{4}\)?\s*$|transcriber|proofread|distributed/i;
function isFrontMatter(lines) {
  return lines.some((l) => FRONT.test(l));
}

function toTitle(s) {
  const t = s.trim().replace(/[.:]$/, "").replace(/_/g, "").replace(/^(?:[IVXLC]+(?:-[IVXLC]+)?|\d+)\.?\s+(?=\S)/, "");
  if (t === t.toUpperCase()) {
    return t
      .toLowerCase()
      .replace(/(^|[\s"'(\-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(Of|The|And|In|On|To|A|An|At|For|With|From|By|Or)\b/g, (w, _x, i) => (i === 0 ? w : w.toLowerCase()));
  }
  return t;
}

// opts: { authorNames: Set<string> (upper-case) for anthologies, numbered: bool }
function parseBook(text, opts = {}) {
  const b = body(text);
  const sections = b.split(/\n[ \t]*\n[ \t]*\n[ \t]*\n+/); // 3+ blank lines
  const poems = [];
  let author = null;
  let skipping = false;

  for (const section of sections) {
    let blocks = section.split(/\n[ \t]*\n[ \t]*\n+/).map((x) => x.replace(/^\n+|\n+$/g, "")).filter((x) => x.trim()); // 2+ blank lines
    if (!blocks.length) continue;
    const titleParts = [];
    // Leading short blocks (1-3 short lines) are headings.
    while (blocks.length > 1) {
      const ls = blocks[0].split("\n").filter((l) => l.trim());
      if (ls.length <= 3 && ls.every((l) => l.trim().length <= 70)) {
        titleParts.push(...ls.map((l) => l.trim()));
        blocks = blocks.slice(1);
      } else break;
    }
    // Headings inside the first block: leading ALL CAPS / numeral lines.
    let first = blocks[0].split("\n");
    while (first.length > 1 && isHeadingLine(first[0]) && (first[1].trim() === "" || isHeadingLine(first[1]) || titleParts.length === 0)) {
      if (!first[0].trim()) break;
      titleParts.push(first[0].trim());
      first = first.slice(1);
      while (first.length && !first[0].trim()) first = first.slice(1);
    }
    blocks[0] = first.join("\n");

    // Author headings (anthologies) and skip sections.
    const plainTitles = [];
    for (const t of titleParts) {
      const up = t.replace(/[.,]$/, "").toUpperCase();
      if (opts.authorNames && opts.authorNames.has(up)) {
        author = opts.authorNames.get(up);
        skipping = false;
        continue;
      }
      if (SKIP_HEADINGS.test(t)) { skipping = true; continue; }
      plainTitles.push(t);
    }
    if (plainTitles.length) skipping = false;
    if (skipping) continue;

    const rawLines = blocks.join("\n\n").split("\n");
    if (rawLines.some((l) => /\.{4,}|\s{6,}\d+$/.test(l))) continue; // contents with page numbers
    const lines = dedent(rawLines).map(cleanText);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.some((l) => l.trim())) continue;
    if (looksLikeProse(lines)) continue;
    if (isFrontMatter(plainTitles.concat(lines))) continue;
    const textLines = lines.filter((l) => l.trim());
    if (textLines.length < 2) continue;
    if (textLines.every((l) => l === l.toUpperCase())) continue; // headings only

    // Title: prefer a word title over a bare numeral ("XII.").
    const words = plainTitles.filter((t) => !ROMAN.test(t) && !/^[\[(]/.test(t));
    const numeral = plainTitles.find((t) => ROMAN.test(t));
    let title = words.length ? toTitle(words[words.length - 1]) : null;
    let fromFirstLine = false;
    if (!title) {
      const firstLine = lines.find((l) => l.trim()).trim().replace(/[,;:.!?-]+$/, "");
      title = numeral ? `${numeral.replace(/\.$/, "")}. ${firstLine}` : firstLine;
      fromFirstLine = true;
    }
    poems.push({ title, author, lines, fromFirstLine });
  }
  return poems;
}

// "Tight" layout (anthologies like Some Imagist Poets and The Book of
// American Negro Poetry): two blank lines between poems, an ALL CAPS title
// on the poem's first line, one blank line under it. A section that is only
// a poet's name switches the author. A section headed by a bare numeral is
// the next part of the poem before it.
function parseTight(text, opts = {}) {
  const b = body(text);
  const sections = b.split(/\n[ \t]*\n[ \t]*\n+/).map((x) => x.replace(/^\n+|\n+$/g, "")).filter((x) => x.trim());
  const poems = [];
  let author = null;
  let skipping = false;
  for (const section of sections) {
    let ls = section.split("\n");
    const firstText = ls[0].trim();
    const up = firstText.replace(/[.,]$/, "").toUpperCase();
    if (opts.authorNames && opts.authorNames.has(up) && ls.filter((l) => l.trim()).length <= 2) {
      author = opts.authorNames.get(up);
      skipping = false;
      continue;
    }
    if (SKIP_HEADINGS.test(firstText)) { skipping = true; continue; }
    if (ROMAN.test(firstText) && poems.length && !skipping) {
      const prev = poems[poems.length - 1];
      prev.lines.push("", ...dedent(ls.slice(1)).map(cleanText).filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())));
      prev.multiPart = true;
      continue;
    }
    let title = null;
    if (isHeadingLine(ls[0]) && ls.length > 1) {
      title = toTitle(firstText);
      ls = ls.slice(1);
      skipping = false;
    }
    if (skipping || !title) continue;
    const lines = dedent(ls).map(cleanText);
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length || looksLikeProse(lines) || isFrontMatter([title].concat(lines))) continue;
    if (lines.filter((l) => l.trim()).length < 2) continue;
    poems.push({ title, author, lines });
  }
  // Drop the multi-part markers' sub-numerals that stayed in titles.
  return poems.map(({ multiPart, ...p }) => p);
}

// Drop a first line that just repeats the title, and a leading epigraph
// that is a scripture or attribution line.
function tidy(poem) {
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const { fromFirstLine, ...rest } = poem;
  const lines = poem.lines.slice();
  if (fromFirstLine) return { ...rest, lines };
  const i = lines.findIndex((l) => l.trim());
  if (i >= 0 && norm(lines[i]) === norm(poem.title)) {
    lines.splice(0, i + 1);
    while (lines.length && !lines[0].trim()) lines.shift();
  }
  return { ...rest, lines };
}

// Stray Birds style: numbered aphorisms, one per block, wrapped like prose.
function parseNumbered(text) {
  const b = body(text);
  const out = [];
  const re = /\n(\d{1,3})\n([\s\S]*?)(?=\n\n\d{1,3}\n|\n\n\n|$)/g;
  let m;
  while ((m = re.exec(b))) {
    const joined = m[2].split("\n").map((l) => l.trim()).filter(Boolean);
    // Rejoin wrapped lines, but keep a break after sentence-ending lines that
    // start the next sentence with a capital (the book's own line breaks).
    const lines = [];
    for (const l of joined) {
      if (lines.length && !/[.!?"']$/.test(lines[lines.length - 1])) lines[lines.length - 1] += " " + l;
      else lines.push(l);
    }
    if (!lines.length) continue;
    out.push({ title: `Stray Birds ${m[1]}`, author: null, lines: lines.map(cleanText) });
  }
  return out;
}

module.exports = { tidy, parseBook, parseTight, parseNumbered, body, looksLikeProse, toTitle };
