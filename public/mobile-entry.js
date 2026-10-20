// Swipe handles direct item links as well as the normal mobile feed. Existing
// invitation and book-lane workflows retain their original query and route.
export function classicMobileTarget(pathname, search = '') {
  if (pathname.replace(/\/+$/, '') !== '/m') return '';
  const params = new URLSearchParams(search);
  const authorPreview = params.get('authorPreview') === '1' && !!params.get('author')?.trim();
  const swipeScope = new Set(authorPreview ? ['author', 'authorPreview', 'locked'] : []);
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
