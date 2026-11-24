import { createHash } from 'node:crypto';

const keyOf = value => String(value || '').trim().toLowerCase();
// One shared collator orders ids exactly as String.prototype.localeCompare
// does with no arguments, without that call's per-comparison cost.
const compareIds = new Intl.Collator().compare;
const stableRandom = (seed, item) => parseInt(createHash('sha256').update(String(seed).slice(0, 80) + '|' + keyOf(item.imageId)).digest('hex').slice(0, 8), 16) / 0x100000000;

// The first k entries a full sort by `compare` would give, found in one pass.
// `compare` must never tie (callers end it on the unique id).
function firstOf(entries, k, compare) {
  if (entries.length <= k) return entries.slice().sort(compare);
  const best = [];
  for (const entry of entries) {
    if (best.length === k && compare(entry, best[k - 1]) >= 0) continue;
    let at = best.length;
    while (at > 0 && compare(entry, best[at - 1]) < 0) at -= 1;
    best.splice(at, 0, entry);
    if (best.length > k) best.pop();
  }
  return best;
}

// Same scoring, buckets and interleaving as app.js. The parity test checks the
// existing mobile protocol; only its jitter is seeded for a stable session.
export function mobilePreference(items, ratingsSummary = {}, options = {}) {
  const ratingMetaOf = g => ratingsSummary[keyOf(g.imageId)] || ratingsSummary[g.imageId] || {};
  const random = options.random || (item => stableRandom(options.seed, item));
function computeExternalSignalScore(g) {
  const views = Number(g?.socialViews || g?.raw?.socialViews || 0) || 0;
  const likes = Number(g?.socialLikes || g?.raw?.socialLikes || 0) || 0;
  const comments = Number(g?.socialComments || g?.raw?.socialComments || 0) || 0;
  const dislikes = Number(g?.socialDislikes || g?.raw?.socialDislikes || 0) || 0;
  const engagementRate = (likes + (comments * 2) - (dislikes * 0.5)) / Math.max(views, 1);
  const reachScore = Math.log10(Math.max(views, 1));
  return {
    views,
    likes,
    comments,
    dislikes,
    engagementRate,
    reachScore,
    externalSignalScore: (engagementRate * 1000) + reachScore,
  };
}

function getFeedSignals(g) {
  const meta = ratingMetaOf(g);
  const likes = Number(meta.likes || 0);
  const dislikes = Number(meta.dislikes || 0);
  const meh = Number(meta.meh || 0);
  const movedMe = Number(meta.movedMe || 0);
  const totalVotes = Number(meta.total || (likes + dislikes + meh + movedMe) || 0);
  const rawScore = likes + (movedMe * 2) - dislikes;
  const scorePerVote = totalVotes ? rawScore / totalVotes : 0;
  const movedMeRate = totalVotes ? movedMe / totalVotes : 0;
  const mehRate = totalVotes ? meh / totalVotes : 0;
  const dislikeRate = totalVotes ? dislikes / totalVotes : 0;
  const confidence = Math.min(1, totalVotes / 10);
  const needsConfirmation = totalVotes === 1 && movedMe === 1;
  const feedScore = (
    (scorePerVote * 0.9) +
    (movedMeRate * 1.2) -
    (mehRate * 0.3) -
    (dislikeRate * 0.85)
  ) * (0.35 + (0.65 * confidence));
  const externalSignals = computeExternalSignalScore(g);
  const lowVoteYouTube = String(g?.imageType || '').toUpperCase() === 'YT' && totalVotes < 3;
  const externalBoost = lowVoteYouTube
    ? Math.max(0, Math.min(0.35, Math.sqrt(Math.max(0, externalSignals.externalSignalScore)) * 0.03))
    : 0;

  let bucket = 'standard';
  if (needsConfirmation) bucket = 'confirmation';
  else if (totalVotes >= 2 && (feedScore >= 0.65 || movedMeRate >= 0.22)) bucket = 'boosted';
  else if (totalVotes >= 3 && (feedScore <= 0.15 || mehRate >= 0.45 || dislikeRate >= 0.28)) bucket = 'muted';

  return {
    likes,
    dislikes,
    meh,
    movedMe,
    totalVotes,
    rawScore,
    scorePerVote,
    movedMeRate,
    mehRate,
    dislikeRate,
    confidence,
    needsConfirmation,
    feedScore,
    externalSignalScore: externalSignals.externalSignalScore,
    externalBoost,
    socialViews: externalSignals.views,
    socialLikes: externalSignals.likes,
    socialComments: externalSignals.comments,
    socialDislikes: externalSignals.dislikes,
    engagementRate: externalSignals.engagementRate,
    bucket,
  };
}
function communityAffinityOf(g) {
  const signals = getFeedSignals(g);
  return signals.feedScore + signals.externalBoost;
}
function orderByCommunityPreference(list, options = {}) {
  const includeMuted = options.includeMuted !== false;
  const confirmation = [];
  const boosted = [];
  const standard = [];
  const muted = [];

  list.forEach((item) => {
    item.__feedSignals = getFeedSignals(item);
    if (item.__feedSignals.bucket === 'confirmation') confirmation.push(item);
    else if (item.__feedSignals.bucket === 'muted') muted.push(item);
    else if (item.__feedSignals.bucket === 'boosted') boosted.push(item);
    else standard.push(item);
  });

  const sortWithin = (items) => items
    .map((item) => ({
      item,
      score: communityAffinityOf(item)
        + (options.preferVisual && ['QI', 'INT'].includes(String(item.imageType || '').toUpperCase()) ? 0.8 : 0)
        + ((random(item) - 0.5) * 0.22),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  const confirmationQ = sortWithin(confirmation);
  const boostedQ = sortWithin(boosted);
  const standardQ = sortWithin(standard);
  const mutedQ = includeMuted ? sortWithin(muted) : [];
  const ordered = [];
  let cycle = 0;
  let position = 0;
  const pushWithPlacement = (item, slotType) => {
    if (!item) return;
    item.__feedSignals = item.__feedSignals || getFeedSignals(item);
    item.__feedSignals.interleaveSlot = slotType;
    item.__feedSignals.interleaveCycle = cycle + 1;
    item.__feedSignals.position = position + 1;
    item.__feedSignals.interleaveNote =
      slotType === 'confirmation-review' ? 'Confirmation slot for a single moved-me vote that needs another review.' :
      slotType === 'boosted-primary' ? 'Primary boost slot.' :
      slotType === 'boosted-secondary' ? 'Secondary boost slot in alternating cycles.' :
      slotType === 'standard-primary' ? 'Core discovery slot.' :
      slotType === 'standard-secondary' ? 'Secondary standard slot.' :
      slotType === 'muted-exploration' ? 'Exploration slot for muted content.' :
      'Default placement.';
    ordered.push(item);
    position += 1;
  };

  while (confirmationQ.length || boostedQ.length || standardQ.length || mutedQ.length) {
    if (boostedQ.length) pushWithPlacement(boostedQ.shift(), 'boosted-primary');
    if (confirmationQ.length) pushWithPlacement(confirmationQ.shift(), 'confirmation-review');
    if (standardQ.length) pushWithPlacement(standardQ.shift(), 'standard-primary');
    if (boostedQ.length && cycle % 2 === 0) pushWithPlacement(boostedQ.shift(), 'boosted-secondary');
    if (standardQ.length) pushWithPlacement(standardQ.shift(), 'standard-secondary');
    if (mutedQ.length && cycle % 4 === 3) pushWithPlacement(mutedQ.shift(), 'muted-exploration');
    cycle += 1;
  }

  return ordered;
}


  // A page needs only its first few cards. With options.first, the same cards
  // come back in the same order as the full ordering's first entries, without
  // copying and sorting the whole library. Ids must be unique (paginateMobileFeed
  // guarantees it). options.counted receives how many items the full ordering holds.
  if (options.first) {
    const first = options.first;
    const withSignals = (entry) => ({ ...entry.item, __feedSignals: entry.signals });
    if (options.welcomeOrder) {
      // Welcome showcase: proven QI, then other rated work, then by score.
      const entries = items.map((item) => {
        const rating = ratingMetaOf(item);
        const total = Number(rating.total || 0);
        const signals = getFeedSignals(item);
        return { item, signals, key: keyOf(item.imageId), total, movedMe: Number(rating.movedMe || 0),
          proven: Number(String(item.imageType).toUpperCase() === 'QI' && total >= 3), rated: Number(total >= 3) };
      });
      if (options.counted) options.counted(entries.length);
      return firstOf(entries, first, (a, b) => b.proven - a.proven
        || b.rated - a.rated
        || b.signals.feedScore - a.signals.feedScore
        || b.movedMe - a.movedMe
        || b.total - a.total
        || compareIds(a.key, b.key)).map(withSignals);
    }
    const includeMuted = options.includeMuted !== false;
    const buckets = { confirmation: [], boosted: [], standard: [], muted: [] };
    for (const item of items) {
      const signals = getFeedSignals(item);
      if (signals.bucket === 'muted' && !includeMuted) continue;
      buckets[signals.bucket].push({ item, signals, key: keyOf(item.imageId),
        score: (signals.feedScore + signals.externalBoost)
          + (options.preferVisual && ['QI', 'INT'].includes(String(item.imageType || '').toUpperCase()) ? 0.8 : 0)
          + ((random(item) - 0.5) * 0.22) });
    }
    if (options.counted) options.counted(buckets.confirmation.length + buckets.boosted.length + buckets.standard.length + buckets.muted.length);
    const byScore = (a, b) => b.score - a.score || compareIds(a.key, b.key);
    const queues = Object.fromEntries(Object.entries(buckets).map(([name, entries]) => [name, firstOf(entries, first, byScore)]));
    const remaining = { ...Object.fromEntries(Object.entries(buckets).map(([name, entries]) => [name, entries.length])) };
    const at = { confirmation: 0, boosted: 0, standard: 0, muted: 0 };
    const ordered = [];
    let cycle = 0;
    const notes = {
      'confirmation-review': 'Confirmation slot for a single moved-me vote that needs another review.',
      'boosted-primary': 'Primary boost slot.',
      'boosted-secondary': 'Secondary boost slot in alternating cycles.',
      'standard-primary': 'Core discovery slot.',
      'standard-secondary': 'Secondary standard slot.',
      'muted-exploration': 'Exploration slot for muted content.',
    };
    // A queue holds the first `first` of its bucket; the page ends before any
    // queue could run past that, so `remaining` only says whether a bucket is empty.
    const take = (name, slotType) => {
      if (ordered.length >= first || !remaining[name]) return;
      const entry = queues[name][at[name]];
      at[name] += 1; remaining[name] -= 1;
      Object.assign(entry.signals, { interleaveSlot: slotType, interleaveCycle: cycle + 1,
        position: ordered.length + 1, interleaveNote: notes[slotType] });
      ordered.push(withSignals(entry));
    };
    while (ordered.length < first && (remaining.confirmation || remaining.boosted || remaining.standard || remaining.muted)) {
      take('boosted', 'boosted-primary');
      take('confirmation', 'confirmation-review');
      take('standard', 'standard-primary');
      if (cycle % 2 === 0) take('boosted', 'boosted-secondary');
      take('standard', 'standard-secondary');
      if (cycle % 4 === 3) take('muted', 'muted-exploration');
      cycle += 1;
    }
    return ordered;
  }

  // Ids are normalized once, not on every comparison of the sort.
  const stable = items.map(item => ({ key: keyOf(item.imageId), item: { ...item } }))
    .sort((a, b) => compareIds(a.key, b.key))
    .map(entry => entry.item);
  return orderByCommunityPreference(stable, options);
}

// Each page chooses from all eligible, not-yet-served IDs. Live score changes
// and votes on earlier cards cannot shift an offset and skip unseen content.
export function paginateMobileFeed(items, { ratingsSummary = {}, servedIds = [], limit = 12, seed = '', welcomeItems = [], newcomer = false, authorReview = false, preferVisual = false, includeMuted = false, demoteStaffNegatives = false } = {}) {
  const seen = new Set((Array.isArray(servedIds) ? servedIds : []).filter(id => typeof id === 'string').map(keyOf));
  const unique = new Map();
  for (const item of items) {
    const id = keyOf(item.imageId);
    const rating = ratingsSummary[id] || ratingsSummary[item.imageId] || {};
    if (!id || seen.has(id) || unique.has(id) || (!authorReview && rating.authorExcluded)) continue;
    unique.set(id, item);
  }
  if (demoteStaffNegatives && !authorReview) {
    const preferred = [];
    const demoted = [];
    for (const [id, item] of unique) {
      const rating = ratingsSummary[id] || ratingsSummary[item.imageId] || {};
      (rating.staffDiscoveryDemoted === true ? demoted : preferred).push(item);
    }
    if (demoted.length) {
      const size = Math.max(1, Math.min(24, Math.floor(Number(limit)) || 12));
      const options = { ratingsSummary, limit: size, seed, welcomeItems, newcomer, preferVisual, includeMuted };
      const primary = paginateMobileFeed(preferred, options);
      if (primary.hasMore) return primary;
      const available = size - primary.items.length;
      const tail = paginateMobileFeed(demoted, { ...options, limit: available || 1, welcomeItems: [] });
      if (!tail.items.length) return primary;
      const items = available ? [...primary.items, ...tail.items] : primary.items;
      const hasMore = !available || tail.hasMore;
      return { items, hasMore, feedMode: primary.feedMode,
        nextCursor: hasMore ? 'mobile:' + keyOf(items.at(-1).imageId) : null };
    }
  }
  const size = Math.max(1, Math.min(24, Math.floor(Number(limit)) || 12));
  let ordered;
  let feedMode;
  // How many cards the full ordering would hold, which decides hasMore.
  let total = unique.size;
  const counted = (count) => { total = count; };
  if (authorReview) {
    const visualRank = item => ['QI', 'INT'].includes(String(item.imageType).toUpperCase()) ? 0 : 1;
    ordered = [...unique.values()].sort((a, b) => visualRank(a) - visualRank(b) || stableRandom(seed, a) - stableRandom(seed, b));
    feedMode = 'author-review';
  } else if (newcomer) {
    // Welcome browsing is a showcase, without discovery slots or random jitter.
    // Exhaust proven QI first, then other rated work, then unrated fallbacks.
    ordered = mobilePreference([...unique.values()], ratingsSummary, { seed, random: () => .5, first: size, welcomeOrder: true, counted });
    feedMode = 'mobile-welcome';
  } else {
    const welcome = [...new Map(welcomeItems.filter(item => unique.has(keyOf(item.imageId))).map(item => [keyOf(item.imageId), item])).values()];
    const leads = welcome.length >= 8;
    // Welcome items lead the page; enough of the ordering is taken to fill the rest.
    ordered = mobilePreference([...unique.values()], ratingsSummary, { seed, preferVisual, includeMuted, first: size + (leads ? welcome.length : 0), counted });
    if (leads) {
      const leading = new Set(welcome.map(item => keyOf(item.imageId)));
      ordered = [...welcome, ...ordered.filter(item => !leading.has(keyOf(item.imageId)))];
      // Welcome items left out of the ordering (muted while muted cards are held back) still lead.
      let inOrdering = welcome.length;
      if (!includeMuted) mobilePreference(welcome, ratingsSummary, { seed, includeMuted, first: 1, counted: (count) => { inOrdering = count; } });
      total += welcome.length - inOrdering;
      feedMode = 'mobile-welcome';
    } else feedMode = 'mobile-community';
  }
  const page = ordered.slice(0, size);
  const hasMore = total > page.length;
  return { items: page, hasMore, feedMode, nextCursor: hasMore ? 'mobile:' + keyOf(page.at(-1).imageId) : null };
}
