import { createHash } from 'node:crypto';

// Typewriter mode of Swipe (Sam, Nov 27 2026): after the typewriter intro, each
// page leads with typewriter-style quote images, then the regular Swipe mix.
// The ids come from functions/typewriter-qi-ids.json.

const keyOf = value => String(value || '').trim().toLowerCase();
const order = (seed, item) => createHash('sha256').update(String(seed).slice(0, 80) + '|' + keyOf(item.imageId)).digest('hex');

export const TYPEWRITER_PER_PAGE = 2;

// `pool` is the reader's unreviewed items, `page` the regular mobile page built
// from it. Typewriter items not yet served go first (two per page), then the
// regular page fills the rest. Regular items left out are not marked served, so
// they come back on a later page.
export function preferTypewriter(page, pool, { typewriterIds, servedIds = [], limit = 3, seed = '' } = {}) {
  const size = Math.max(1, Math.min(24, Math.floor(Number(limit)) || 3));
  const served = new Set((Array.isArray(servedIds) ? servedIds : []).filter(id => typeof id === 'string').map(keyOf));
  const waiting = pool.filter(item => typewriterIds.has(keyOf(item.imageId)) && !served.has(keyOf(item.imageId)))
    .sort((a, b) => order(seed, a).localeCompare(order(seed, b)));
  const lead = waiting.slice(0, Math.min(TYPEWRITER_PER_PAGE, size));
  if (!lead.length) return page;
  const ids = new Set(lead.map(item => keyOf(item.imageId)));
  const rest = (page.items || []).filter(item => !ids.has(keyOf(item.imageId)));
  const items = [...lead, ...rest].slice(0, size);
  const hasMore = Boolean(page.hasMore) || waiting.length > lead.length || rest.length > items.length - lead.length;
  return { ...page, items, hasMore, nextCursor: hasMore ? 'mobile:' + keyOf(items.at(-1).imageId) : null };
}

export function typewriterIdSet(json) {
  return new Set((json?.ids || []).map(keyOf).filter(Boolean));
}
