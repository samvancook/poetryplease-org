export function normalizeScrollItem(row) {
  if (!Array.isArray(row)) return null;
  const [author, title, book, id, mediaUrl, bookUrl, catalog, type, text] = row;
  if (!id) return null;
  const kind = String(type || '').toUpperCase();
  const assetSet = row[17] || null;
  // A lighter copy of a single graphic, when the server has one. The feed shows
  // it in place of the full-size original; opening the item still loads mediaUrl.
  const previewUrl = !assetSet && ['QI', 'INT', 'FPI'].includes(kind) ? safeMediaUrl(row[19]) : '';
  return { author: String(author || ''), title: String(title || ''), book: String(book || ''),
    id: String(id), mediaUrl: safeMediaUrl(mediaUrl), previewUrl, bookUrl: safeMediaUrl(bookUrl),
    catalog: String(catalog || ''), type: kind, text: String(text || ''), assetSet,
    bookRelation: String(row[20] || ''), focus: !assetSet && ['INT', 'FPI'].includes(kind) ? photoFocus(row[21]) : null };
}

// The part of a photo that holds the poem text, as fractions [left, top, right, bottom].
export function photoFocus(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const box = value.map(Number);
  const [left, top, right, bottom] = box;
  return box.every(Number.isFinite) && left >= 0 && top >= 0 && right <= 1 && bottom <= 1 && right > left && bottom > top ? box : null;
}

// How to name the book next to an item. Most items come from the book they list.
// "related": a performance piece that is not in that book; the book is another of the author's.
// "none": nothing to show. Returns { prefix, book } or null.
export function bookLine(item = {}) {
  const book = String(item.book || '').trim();
  const relation = String(item.bookRelation || '').toLowerCase();
  if (!book || relation === 'none') return null;
  if (relation === 'related') return { prefix: 'More from this poet', book, related: true };
  return { prefix: '', book, related: false };
}

export function safeMediaUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}

// Campaign tags (utm_*) from the link a visitor arrived on, kept for the visit
// so later in-app navigation does not lose them. app.js reads the same key.
const CAMPAIGN_KEY = 'pp_campaign_utm';
export function arrivalCampaign(search = globalThis.location?.search || '', storage) {
  const tags = {};
  for (const [key, value] of new URLSearchParams(search)) if (key.startsWith('utm_') && value) tags[key] = value;
  try {
    // Reading sessionStorage itself can throw (blocked storage, sandboxed embeds),
    // and this runs when the module loads, so it stays inside the try.
    if (storage === undefined) storage = globalThis.sessionStorage;
    if (Object.keys(tags).length) storage?.setItem(CAMPAIGN_KEY, JSON.stringify(tags));
    else return JSON.parse(storage?.getItem(CAMPAIGN_KEY) || '{}') || {};
  } catch { /* Storage unavailable: use this page's tags only. */ }
  return tags;
}

// A buttonpoetry.com book link that carries the visit's campaign tags, so a
// sale that starts from a text or email is credited to it in the store's
// analytics. Other hosts and links that already have utm_ tags are unchanged.
// Capture on first load, before the feed rewrites the address bar.
if (globalThis.location) arrivalCampaign();

export function campaignBookUrl(value, campaign = arrivalCampaign()) {
  const safe = safeMediaUrl(value);
  if (!safe || !Object.keys(campaign || {}).length) return safe;
  const url = new URL(safe);
  if (!/(^|\.)buttonpoetry\.com$/i.test(url.hostname)) return safe;
  if ([...url.searchParams.keys()].some((key) => key.startsWith('utm_'))) return safe;
  for (const [key, val] of Object.entries(campaign)) url.searchParams.set(key, val);
  return url.href;
}

export function originalViewerUrl(item, filters = {}) {
  const params = new URLSearchParams({ item: item.id });
  for (const key of ['author', 'book', 'type', 'catalog', 'authorPreview', 'locked']) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return '/m-classic?' + params.toString();
}

export class ScrollFeedPager {
  constructor({ fetchPage, append, changed, clear }) {
    Object.assign(this, { fetchPage, append, changed, clear });
    this.generation = 0;
    this.seen = new Set();
    this.loading = false;
    this.hasMore = true;
    this.cursor = null;
  }
  reset(context) {
    this.generation += 1;
    this.controller?.abort();
    this.context = context;
    this.seen = new Set();
    this.loading = false;
    this.hasMore = !!context;
    this.cursor = null;
    this.error = null;
    this.clear();
    this.changed(this);
    return this.loadMore();
  }
  async loadMore() {
    if (this.loading || !this.hasMore || !this.context) return;
    const generation = this.generation;
    this.loading = true;
    this.error = null;
    this.controller = new AbortController();
    this.changed(this);
    try {
      const page = await this.fetchPage({ ...this.context, cursor: this.cursor }, this.controller.signal);
      if (generation !== this.generation) return;
      if (!Array.isArray(page.newGraphics) || (page.hasMore && (!page.nextCursor || page.nextCursor === this.cursor))) {
        throw new Error('The next page could not be read. Please retry.');
      }
      const items = [];
      for (const row of page.newGraphics) {
        const item = normalizeScrollItem(row);
        const key = item?.id.trim().toLowerCase();
        if (!key || this.seen.has(key)) continue;
        this.seen.add(key);
        items.push(item);
      }
      this.cursor = page.nextCursor || null;
      this.hasMore = page.hasMore === true;
      this.append(items, page);
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = error;
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.changed(this);
      }
    }
  }
}
