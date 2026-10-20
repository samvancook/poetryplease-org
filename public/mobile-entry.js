// Swipe is the default mobile feed. Existing links needing the single-item
// viewer retain their original query, including invitations and book lanes.
export function classicMobileTarget(pathname, search = '') {
  if (pathname.replace(/\/+$/, '') !== '/m') return '';
  const params = new URLSearchParams(search);
  const authorPreview = params.get('authorPreview') === '1' && !!params.get('author')?.trim();
  const swipeScope = new Set(authorPreview ? ['author', 'authorPreview', 'locked'] : []);
  const tracking = new Set(['fbclid', 'gclid', 'msclkid']);
  for (const key of params.keys()) {
    if ((key === 'view' && params.get(key) === 'mobile') || (key === 'mobile' && params.get(key) === '1')) continue;
    if (key.startsWith('utm_') || tracking.has(key) || swipeScope.has(key)) continue;
    return '/m-classic' + (search ? (search.startsWith('?') ? search : '?' + search) : '');
  }
  return '';
}

// An old /m document may still be in a browser cache. Its fresh app.js moves
// it to an uncached Swipe URL. Specific links already have the correct classic
// document, so leave them in place rather than interrupting an invite claim.
export function cachedMobileTarget(pathname, search = '') {
  if (pathname.replace(/\/+$/, '') !== '/m') return '';
  return classicMobileTarget(pathname, search) ? '' : '/posts-swipe' + search;
}
