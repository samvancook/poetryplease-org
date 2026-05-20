import { execFileSync } from 'node:child_process';

const PROJECT_ID = process.env.PP_PROJECT_ID || 'poetry-please';
const DATABASE_ID = process.env.PP_DATABASE_ID || 'poetrypleasedatabase';
const CATALOG_DB = process.env.CATALOG_DB || '/Users/buttonpublishingone/Desktop/CODEX/Excerpt Management/data/formal_catalog.db';
const DEFAULT_BOOKS = ['Stunt Water', 'A Choir of Honest Killers'];
const books = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BOOKS;
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const runQueryUrl = `${base}:runQuery`;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function getToken() {
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
}

function getCatalogTitles(book) {
  const sql = `SELECT cp.title FROM catalog_poems cp JOIN catalog_books b ON b.id=cp.catalog_book_id JOIN canonical_books cb ON cb.id=b.canonical_book_id WHERE cb.title='${sqlEscape(book)}';`;
  return execFileSync('sqlite3', [CATALOG_DB, sql], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function firestoreQuery(token, body) {
  const res = await fetch(runQueryUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Firestore query failed ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function getPoetryPleaseExcerpts(token, book) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'excerpts' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'book' }, op: 'EQUAL', value: { stringValue: book } } },
            { fieldFilter: { field: { fieldPath: 'imageType' }, op: 'EQUAL', value: { stringValue: 'EXC' } } },
          ],
        },
      },
      limit: 1000,
    },
  };
  const rows = await firestoreQuery(token, body);
  return rows
    .map((row) => row.document)
    .filter(Boolean)
    .map((doc) => ({
      id: doc.name.split('/').pop(),
      title: doc.fields?.poem?.stringValue || doc.fields?.title?.stringValue || doc.fields?.poemTitle?.stringValue || '',
      book: doc.fields?.book?.stringValue || '',
    }));
}

async function main() {
  const token = getToken();
  let hasMismatch = false;
  const report = [];

  for (const book of books) {
    const catalogTitles = getCatalogTitles(book);
    const catalogSet = new Set(catalogTitles.map(normalize));
    const excerpts = await getPoetryPleaseExcerpts(token, book);
    const mismatches = excerpts.filter((item) => !catalogSet.has(normalize(item.title)));
    if (mismatches.length) hasMismatch = true;
    report.push({
      book,
      poetryPleaseExcerpts: excerpts.length,
      catalogTocTitles: catalogTitles.length,
      matched: excerpts.length - mismatches.length,
      mismatches,
    });
  }

  console.log(JSON.stringify(report, null, 2));
  if (hasMismatch) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
