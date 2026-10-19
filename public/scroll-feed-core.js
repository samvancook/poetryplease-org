export function normalizeScrollItem(row) {
  if (!Array.isArray(row)) return null;
  const [author, title, book, id, mediaUrl, bookUrl, catalog, type, text] = row;
  if (!id) return null;
  return { author: String(author || ''), title: String(title || ''), book: String(book || ''),
    id: String(id), mediaUrl: safeMediaUrl(mediaUrl), bookUrl: safeMediaUrl(bookUrl),
    catalog: String(catalog || ''), type: String(type || '').toUpperCase(), text: String(text || '') };
}

export function safeMediaUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}

export function originalViewerUrl(item, filters = {}) {
  const params = new URLSearchParams({ item: item.id });
  for (const key of ['author', 'book', 'type', 'catalog', 'authorPreview', 'locked']) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return '/m?' + params.toString();
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
