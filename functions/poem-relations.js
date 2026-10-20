import { normalizePoemLabel } from './excerpt-poem-keys.js';

const label = value => normalizePoemLabel(value).replace(/^"(.*)"$/, '$1');
const type = item => String(item.imageType || '').toUpperCase();
const identifier = item => String(item.imageId || item.contentId || item.id || '');
const videoTypes = new Set(['VV', 'YT', 'HV', 'VIDEO']);
const key = item => /^BPP-\d{5}$/.test(item.poemKey || '') ? item.poemKey : '';

export function samePoem(a, b) {
  const aKey = key(a), bKey = key(b);
  // Conflicting permanent IDs must never be overridden by matching labels.
  if (aKey && bKey) return aKey === bKey;
  return !!label(a.author) && !!label(a.book) && !!label(a.title)
    && label(a.author) === label(b.author) && label(a.book) === label(b.book)
    && label(a.title) === label(b.title);
}

export function relatedExcerptIds(source, all, occurrences = []) {
  const linkedIds = new Set(occurrences.map(row => row.canonicalExcerptId));
  return [...new Set(all.filter(item => type(item) === 'EXC'
    && (samePoem(source, item) || linkedIds.has(item.id) || linkedIds.has(item.contentId)
      || identifier(source) === identifier(item)))
    .flatMap(item => [item.id, item.contentId].filter(Boolean)))];
}

export function resolvePoemRelations(source, all, occurrences = []) {
  const sourceIds = new Set([source.id, source.contentId, identifier(source)].filter(Boolean));
  const linkedExcerptIds = new Set(occurrences
    .filter(row => sourceIds.has(row.canonicalVideoId))
    .map(row => row.canonicalExcerptId));
  const anchors = [source, ...all.filter(item => type(item) === 'EXC'
    && (linkedExcerptIds.has(item.id) || linkedExcerptIds.has(item.contentId)))];
  const matches = item => anchors.some(anchor => samePoem(anchor, item));
  const excerptIds = new Set(relatedExcerptIds(source, all, occurrences));
  const linkedVideoIds = new Set(occurrences.filter(row => excerptIds.has(row.canonicalExcerptId))
    .map(row => row.canonicalVideoId));
  const unique = items => [...new Map(items.map(item => [identifier(item), item])).values()];
  const poems = unique(all.filter(item => type(item) === 'FP' && matches(item) && item.excerpt?.trim()));
  const videos = unique(all.filter(item => videoTypes.has(type(item))
    && (matches(item) || linkedVideoIds.has(item.id) || linkedVideoIds.has(item.contentId))
    && (item.videoUrl || item.youtubeUrl || item.imageUrl)))
    .filter(item => !sourceIds.has(identifier(item)))
    .sort((a, b) => identifier(a).localeCompare(identifier(b)));
  return {
    // Multiple possible full texts require reconciliation, not a guessed link.
    fullPoem: poems.length === 1 && !sourceIds.has(identifier(poems[0])) ? poems[0] : null,
    videos,
  };
}
