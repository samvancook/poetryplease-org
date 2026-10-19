import { createHash } from 'node:crypto';

// A stable session order and keyset cursor: voting/removing earlier cards must
// never shift an offset and skip unseen work. Existing feed routes opt in only.
export function paginateScrollFeed(items, { seed = '', after = '', limit = 12 } = {}) {
  const pageSize = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Math.floor(Number(limit)), 24)) : 12;
  const session = String(seed).slice(0, 80);
  const unique = new Map();
  for (const item of items) {
    const id = String(item?.imageId || '').trim().toLowerCase();
    if (!id || unique.has(id)) continue;
    const key = createHash('sha256').update(session + '|' + id).digest('hex') + ':' + id;
    unique.set(id, { item, key });
  }
  const ordered = [...unique.values()].filter(({ key }) => key > String(after))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const page = ordered.slice(0, pageSize);
  const hasMore = ordered.length > page.length;
  return { items: page.map(({ item }) => item), hasMore,
    nextCursor: hasMore ? page.at(-1).key : null };
}
