const BASE_URL = process.env.PP_BASE_URL || 'https://poetryplease.org';
const API_BASE = `${BASE_URL.replace(/\/$/, '')}/api`;

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_err) {}
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${text.slice(0, 240)}`);
  return json ?? text;
}

async function fetchText(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} failed ${res.status}: ${text.slice(0, 240)}`);
  return text;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkAppShell() {
  const html = await fetchText(`${BASE_URL.replace(/\/$/, '')}/app`);
  assert(/Poetry, Please|pp-loader|app\.js/.test(html), 'public app shell did not look like Poetry Please');
  return 'app shell loaded';
}

async function checkHealth() {
  const result = await fetchJson('/healthz', { method: 'GET' });
  assert(result?.ok === true, 'healthz response was unexpected');
  return 'api health responded';
}

async function checkBooks() {
  const books = await fetchJson('/books', { method: 'GET' });
  assert(Array.isArray(books), 'books response was not an array');
  assert(books.includes('Stunt Water'), 'books missing Stunt Water');
  assert(books.includes('A Choir of Honest Killers'), 'books missing A Choir of Honest Killers');
  return `books loaded (${books.length})`;
}

async function checkFilteredFeed(book, expectedMin) {
  const payload = await fetchJson('/fetchFiltered', {
    method: 'POST',
    body: JSON.stringify({
      anonId: `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'EXC',
      catalog: 'Spring 2026',
      book,
    }),
  });
  const count = Number(payload?.domainTotalImages || 0);
  assert(count >= expectedMin, `${book} EXC Spring 2026 count too low: ${count}`);
  return `${book} EXC Spring 2026 count ${count}`;
}

async function main() {
  const checks = [
    ['App shell', checkAppShell],
    ['Health', checkHealth],
    ['Books', checkBooks],
    ['Stunt Water EXC', () => checkFilteredFeed('Stunt Water', 70)],
    ['ACHK EXC', () => checkFilteredFeed('A Choir of Honest Killers', 20)],
  ];

  const results = [];
  for (const [label, fn] of checks) {
    try {
      const detail = await fn();
      results.push({ label, ok: true, detail });
      console.log(`PASS ${label}: ${detail}`);
    } catch (error) {
      results.push({ label, ok: false, detail: error.message });
      console.error(`FAIL ${label}: ${error.message}`);
    }
  }

  const failed = results.filter((row) => !row.ok);
  if (failed.length) {
    console.error(`\nSmoke test failed: ${failed.length}/${results.length} checks failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nSmoke test passed: ${results.length}/${results.length} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
