// Pure rules for the Swipe intro test, kept separate so tests can run them.
export const INTRO_VARIANTS = ['dispenser', 'claw', 'none']; // the live test groups
export const INTRO_ART_VARIANTS = ['dispenser', 'claw', 'typewriter', 'press']; // every drawn intro
const PREVIEW_VARIANTS = [...INTRO_ART_VARIANTS, 'random', 'none'];
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

// ?intro=dispenser|claw|typewriter|press forces that intro on this visit,
// ?intro=random plays any one of them every time, and ?intro=none hides it.
export function forcedVariant(search) {
  const value = new URLSearchParams(search).get('intro');
  return PREVIEW_VARIANTS.includes(value) ? value : null;
}

export function pickArt(variant, random) {
  if (variant !== 'random') return variant;
  return INTRO_ART_VARIANTS[Math.min(INTRO_ART_VARIANTS.length - 1, Math.floor(random * INTRO_ART_VARIANTS.length))];
}

export function shouldPlay({ variant, signedIn, lastShown, now, reducedMotion, cardAlreadyShown, forced }) {
  if (forced) return variant !== 'none';
  if (variant === 'none' || !INTRO_VARIANTS.includes(variant)) return false;
  if (signedIn || reducedMotion || cardAlreadyShown) return false;
  return !(lastShown && now - lastShown < INTRO_GAP_MS);
}
