// Pure rules for the Swipe intro test, kept separate so tests can run them.
export const INTRO_VARIANTS = ['dispenser', 'claw', 'none'];
export const INTRO_SHARE = 0.1; // each drawn intro; the remaining 80% are the comparison group
export const INTRO_GAP_MS = 24 * 60 * 60 * 1000; // at most one intro a day per device

const IGNORED_PARAMS = new Set(['intro', 'fbclid', 'gclid', 'ttclid', 'igshid', 'ref', 'source']);

// Only plain Swipe visits qualify. A link to a poem, contest, author or book
// should open on what it links to, so any other query parameter opts out.
export function isPlainVisit(search) {
  for (const key of new URLSearchParams(search).keys()) {
    if (!IGNORED_PARAMS.has(key) && !key.startsWith('utm_')) return false;
  }
  return true;
}

export function variantFor(random) {
  return random < INTRO_SHARE ? 'dispenser' : random < INTRO_SHARE * 2 ? 'claw' : 'none';
}

// ?intro=dispenser|claw forces that intro on this visit (for review), ?intro=none hides it.
export function forcedVariant(search) {
  const value = new URLSearchParams(search).get('intro');
  return INTRO_VARIANTS.includes(value) ? value : null;
}

export function shouldPlay({ variant, signedIn, lastShown, now, reducedMotion, cardAlreadyShown, forced }) {
  if (variant === 'none' || !INTRO_VARIANTS.includes(variant)) return false;
  if (forced) return true;
  if (signedIn || reducedMotion || cardAlreadyShown) return false;
  return !(lastShown && now - lastShown < INTRO_GAP_MS);
}
