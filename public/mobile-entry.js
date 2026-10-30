// Swipe handles direct item links as well as the normal mobile feed. Existing
// invitation and book-lane workflows retain their original query and route.
export function classicMobileTarget(pathname, search = '') {
  if (pathname.replace(/\/+$/, '') !== '/m') return '';
  const params = new URLSearchParams(search);
  const authorPreview = params.get('authorPreview') === '1' && !!params.get('author')?.trim();
  const contestReading = params.get('catalog') === 'Contest' && params.get('type')?.toUpperCase() === 'QI'
    && !!params.get('event')?.trim() && params.get('locked') === '1' && params.get('reading') === '1';
  const chapbookReview = params.get('bookGroup') === 'chapbook-winners';
  const swipeScope = new Set(chapbookReview ? ['bookGroup', 'contestYear', 'type', 'book'] : authorPreview ? ['author', 'authorPreview', 'locked']
    : contestReading ? ['catalog', 'event', 'type', 'locked', 'reading', 'browse'] : []);
  if (params.get('item')?.trim()) swipeScope.add('item');
  const tracking = new Set(['fbclid', 'gclid', 'msclkid']);
  for (const key of params.keys()) {
    if ((key === 'view' && params.get(key) === 'mobile') || (key === 'mobile' && params.get(key) === '1')) continue;
    if (key.startsWith('utm_') || tracking.has(key) || swipeScope.has(key)) continue;
    return '/m-classic' + (search ? (search.startsWith('?') ? search : '?' + search) : '');
  }
  return '';
}

// A linked FP/video is one explicitly requested canonical item. Do not add it
// to, rank it in, or page it into the ordinary review feed.
export async function linkedItemPage(id, fetchItem) {
  const result = await fetchItem(id);
  if (!Array.isArray(result?.item) || !result.item[3]) throw new Error('This linked item is not available.');
  return { newGraphics: [result.item], hasMore: false, nextCursor: null };
}

// An old /m document may still be in a browser cache. Its fresh app.js moves
// it to an uncached Swipe URL. Specific links already have the correct classic
// document, so leave them in place rather than interrupting an invite claim.
export function cachedMobileTarget(pathname, search = '') {
  if (pathname.replace(/\/+$/, '') !== '/m') return '';
  return classicMobileTarget(pathname, search) ? '' : '/posts-swipe' + search;
}

// Explicit winner links can be public; an author's owned review scope stays intact.
export function chapbookLaneFilters(search, { staff = false, authorOnly = false } = {}) {
  const params = new URLSearchParams(search);
  if (authorOnly || params.get('bookGroup') !== 'chapbook-winners') return null;
  return { type: params.get('type') || (staff ? 'FP' : 'QI'), bookGroup: 'chapbook-winners',
    contestYear: params.get('contestYear') || '', book: params.get('book') || '', author: '' };
}
