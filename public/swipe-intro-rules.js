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

// The words on the intro: a headline under the machine and three lines on the slip.
// One is picked at random each time an intro plays (Sam, Nov 28 2026: keep all seven).
// Echoes the first Apps Script version, a page called "Poetry Dispenser" with a
// "Poetry please" button. Keep slip lines to 24 characters so they fit every machine.
export const INTRO_COPY = [
  { headline: 'A poetry dispenser.', lines: ['Swipe up for a poem.', 'Tap a reaction to tell', 'us how it landed.'] },
  { headline: 'A poetry discovery toy.', lines: ['One turn, one poem.', 'Swipe up for the next.', 'Keep what lands.'] },
  { headline: 'Poetry, please.', lines: ['You asked nicely.', "Here's your first poem.", 'Swipe up for more.'] },
  { headline: 'A poetry dispenser.', lines: ['Out comes a poem.', 'Swipe up for another.', 'Tell us how it landed.'] },
  { headline: 'A poetry discovery toy.', lines: ['Every swipe, a new poem.', 'Find one you love,', 'then find the book.'] },
  { headline: 'Insert curiosity.', lines: ['No coins needed.', 'Swipe up for a poem.', 'Tell us how it landed.'] },
  { headline: 'Poetry, please.', lines: ['Found a poet you like?', "There's more where", 'that came from.'] },
];

// ?copy=1..7 shows a given version (for review links); otherwise random.
export function pickCopy(search, random) {
  const n = Number(new URLSearchParams(search).get('copy'));
  const index = Number.isInteger(n) && n >= 1 && n <= INTRO_COPY.length
    ? n - 1 : Math.min(INTRO_COPY.length - 1, Math.floor(random * INTRO_COPY.length));
  return { number: index + 1, ...INTRO_COPY[index] };
}
