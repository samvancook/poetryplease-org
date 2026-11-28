#!/usr/bin/env node
"use strict";

// Downloads public-domain poetry books from Project Gutenberg (via the
// GITenberg mirror on GitHub), pulls out the short poems and writes
//   imports/dispenser-pool/gutenberg-short.json
//   node scripts/dispenser-pool/fetch-gutenberg.js
//
// Every book here was published in or before 1930, so it is in the US public
// domain in 2026. `year` is the first publication year of that edition (or of
// the translation, for translated work), taken from the book's own title page
// on Gutenberg. `why` says how the book connects to what Sam asked for.

const fs = require("node:fs");
const path = require("node:path");
const { parseBook, parseTight, parseNumbered, tidy } = require("./gutenberg-parse.js");

const OUT = path.join(__dirname, "..", "..", "imports", "dispenser-pool", "gutenberg-short.json");
const MAX_LINES = 16;

const IMAGISTS = ["Richard Aldington", "H. D.", "John Gould Fletcher", "F. S. Flint", "D. H. Lawrence", "Amy Lowell"];

// layout: "book" (3+ blank lines between poems), "tight" (2), "numbered" (Stray Birds)
const BOOKS = [
  // Missing from the first pool
  { id: 12242, repo: "Poems-by-Emily-Dickinson-Three-Series-Complete_12242", author: "Emily Dickinson", book: "Poems, Series 1-3", year: 1896, why: "classic short lyrics" },
  { id: 63010, repo: "Verse_63010", author: "Adelaide Crapsey", book: "Verse", year: 1915, why: "cinquains for 5-line slips" },
  { id: 40786, repo: "The-Black-Riders-and-Other-Lines_40786", author: "Stephen Crane", book: "The Black Riders and Other Lines", year: 1895, why: "short free verse" },
  { id: 6524, repo: "Stray-Birds_6524", author: "Rabindranath Tagore", translator: "Rabindranath Tagore", book: "Stray Birds", year: 1916, layout: "numbered", why: "one- and two-line poems for slips" },
  { id: 19264, repo: "Japanese-LiteraturePoetry-and-Drama-of-Japan_19264", author: "Classical Japanese poets", translator: "various (1900 edition)", book: "Japanese Literature (Colonial Press)", year: 1900, why: "old public-domain translations of Japanese short poems" },
  // Poets Sam asked about (early women poets, poets of color)
  { id: 409, repo: "Poems-on-various-subjects-religious-and-moral_409", author: "Phillis Wheatley", book: "Poems on Various Subjects, Religious and Moral", year: 1773, why: "Sam's list" },
  { id: 679, repo: "Poems_679", author: "Frances E. W. Harper", book: "Poems", year: 1895, why: "Sam's list" },
  { id: 69248, repo: "Atlanta-offering-Poems_69248", author: "Frances E. W. Harper", book: "Atlanta Offering: Poems", year: 1895, why: "Sam's list" },
  { id: 18713, repo: "Violets-and-Other-Tales_18713", author: "Alice Dunbar-Nelson", book: "Violets and Other Tales", year: 1895, why: "Sam's list" },
  { id: 11986, repo: "The-Book-of-American-Negro-Poetry_11986", author: null, book: "The Book of American Negro Poetry (ed. James Weldon Johnson)", year: 1922, layout: "tight", authorsFromContents: true, why: "Sam's list: Georgia Douglas Johnson, Jessie Fauset, Anne Spencer, Alice Dunbar-Nelson and others" },
  { id: 5625, repo: "Flint-and-Feather--Collected-Verse_5625", author: "E. Pauline Johnson", book: "Flint and Feather", year: 1912, why: "Sam's list" },
  { id: 680, repo: "The-Golden-Threshold_680", author: "Sarojini Naidu", book: "The Golden Threshold", year: 1905, why: "Sam's list" },
  // Mary Oliver's stated favourites (Whitman, Emerson, Shelley, Keats, Rumi, Hafez) and Millay
  { id: 109, repo: "Renascence-and-Other-Poems_109", author: "Edna St. Vincent Millay", book: "Renascence and Other Poems", year: 1917, why: "Mary Oliver's early model; Oliver lived at Millay's home and ordered her papers" },
  { id: 1247, repo: "Second-April_1247", author: "Edna St. Vincent Millay", book: "Second April", year: 1921, why: "Millay (Mary Oliver influence)" },
  { id: 4399, repo: "A-Few-Figs-from-Thistles_4399", author: "Edna St. Vincent Millay", book: "A Few Figs from Thistles", year: 1922, why: "Millay (Mary Oliver influence)" },
  { id: 59474, repo: "The-harp-weaver-and-other-poems_59474", author: "Edna St. Vincent Millay", book: "The Harp-Weaver and Other Poems", year: 1923, why: "Millay (Mary Oliver influence)" },
  { id: 12843, repo: "PoemsHousehold-Edition_12843", author: "Ralph Waldo Emerson", book: "Poems (Household Edition)", year: 1904, why: "one of Mary Oliver's favourite poets" },
  { id: 45159, repo: "Jal-lu-d-d-n-R-m-The-Persian-Mystics_45159", author: "Rumi", translator: "R. A. Nicholson, E. H. Whinfield and others (selected by F. Hadland Davis)", book: "Jalálu'd-dín Rúmí (The Persian Mystics)", year: 1907, why: "one of Mary Oliver's favourite poets, in a public-domain translation" },
  { id: 74883, repo: "Poems-from-the-divan-of-Hafiz_74883", author: "Hafez", translator: "Gertrude Lowthian Bell", book: "Poems from the Divan of Hafiz", year: 1897, why: "one of Mary Oliver's favourite poets, in a public-domain translation" },
  // Their inspirations: Wordsworth (for Emerson, Keats, Shelley), the Imagists' nature lyrics
  { id: 9622, repo: "Lyrical-Ballads-With-a-Few-Other-Poems--1798-_9622", author: "William Wordsworth", book: "Lyrical Ballads", year: 1798, why: "inspired Emerson, Keats and Shelley" },
  // Short nature/love lyrics in Millay's line
  { id: 400, repo: "Helen-of-Troy-and-Other-Poems_400", author: "Sara Teasdale", book: "Helen of Troy and Other Poems", year: 1911, why: "short lyrics" },
  { id: 596, repo: "Rivers-to-the-Sea_596", author: "Sara Teasdale", book: "Rivers to the Sea", year: 1915, why: "short lyrics" },
  { id: 442, repo: "Love-Songs_442", author: "Sara Teasdale", book: "Love Songs", year: 1917, why: "short lyrics" },
  { id: 591, repo: "Flame-and-Shadow_591", author: "Sara Teasdale", book: "Flame and Shadow", year: 1920, why: "short lyrics" },
  { id: 30276, repo: "Some-Imagist-PoetsAn-Anthology_30276", author: null, authorNames: IMAGISTS, book: "Some Imagist Poets", year: 1915, layout: "tight", why: "short nature poems" },
  { id: 37469, repo: "Some-Imagist-Poets-1916An-Annual-Anthology_37469", author: null, authorNames: IMAGISTS, book: "Some Imagist Poets, 1916", year: 1916, layout: "tight", why: "short nature poems" },
];

function titleCaseName(s) {
  return s.toLowerCase().replace(/(^|[\s.\-'])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase());
}

function authorsFromContents(text) {
  const names = new Map();
  const ls = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < ls.length - 1; i++) {
    const a = ls[i].trim();
    if (/^[A-Z][A-Z .,'\-]{3,40}$/.test(a) && /^ {2}\S/.test(ls[i + 1])) {
      const key = a.replace(/[.,]$/, "");
      names.set(key, titleCaseName(key));
    }
  }
  return names;
}

async function download(repo, id) {
  for (const branch of ["master", "main"]) {
    for (const file of [`${id}-0.txt`, `${id}.txt`, `${id}-8.txt`]) {
      const url = `https://raw.githubusercontent.com/GITenberg/${repo}/${branch}/${file}`;
      const res = await fetch(url);
      if (res.ok) return { text: await res.text(), url };
    }
  }
  throw new Error(`could not download Gutenberg #${id}`);
}

function parse(cfg, text) {
  if (cfg.layout === "numbered") return parseNumbered(text);
  let authorNames = null;
  if (cfg.authorsFromContents) authorNames = authorsFromContents(text);
  if (cfg.authorNames) authorNames = new Map(cfg.authorNames.map((n) => [n.toUpperCase().replace(/[.,]$/, ""), n]));
  return cfg.layout === "tight" ? parseTight(text, { authorNames }) : parseBook(text, { authorNames });
}

async function main() {
  const poems = [];
  const books = [];
  for (const cfg of BOOKS) {
    const { text, url } = await download(cfg.repo, cfg.id);
    const parsed = parse(cfg, text).map(tidy);
    let kept = 0;
    for (const p of parsed) {
      const n = p.lines.filter((l) => l.trim()).length;
      if (n < 1 || n > MAX_LINES) continue;
      if (!p.title || (p.lines.join(" ").match(/[A-Za-z]/g) || []).length < 15) continue; // stray marks
      const author = p.author || cfg.author;
      if (!author) continue;
      if (/ISAIAH|PSALM|MATTHEW|\d+:\d+\.?$/.test(p.lines.join(" "))) continue; // epigraphs, not poems
      poems.push({
        title: p.title,
        author,
        translator: cfg.translator || null,
        lines: p.lines,
        book: { gutenbergId: cfg.id, title: cfg.book, year: cfg.year },
      });
      kept++;
    }
    books.push({ gutenbergId: cfg.id, title: cfg.book, author: cfg.author, translator: cfg.translator || null, year: cfg.year, why: cfg.why, source: `https://www.gutenberg.org/ebooks/${cfg.id}`, mirror: url, shortPoems: kept });
    console.log(`#${cfg.id} ${cfg.book}: ${kept} short poems`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), books, poems }, null, 1) + "\n");
  console.log(`wrote ${poems.length} poems to ${path.relative(process.cwd(), OUT)}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { BOOKS, parse };
