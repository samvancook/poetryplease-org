import { createHash } from 'node:crypto';

const keyOf = value => String(value || '').trim().toLowerCase();
const stableRandom = (seed, item) => parseInt(createHash('sha256').update(String(seed).slice(0, 80) + '|' + keyOf(item.imageId)).digest('hex').slice(0, 8), 16) / 0x100000000;

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


  const stable = items.map(item => ({ ...item })).sort((a, b) => keyOf(a.imageId).localeCompare(keyOf(b.imageId)));
  return orderByCommunityPreference(stable, options);
}

// Each page chooses from all eligible, not-yet-served IDs. Live score changes
// and votes on earlier cards cannot shift an offset and skip unseen content.
export function paginateMobileFeed(items, { ratingsSummary = {}, servedIds = [], limit = 12, seed = '', welcomeItems = [], newcomer = false, authorReview = false, preferVisual = false, includeMuted = false } = {}) {
  const seen = new Set((Array.isArray(servedIds) ? servedIds : []).filter(id => typeof id === 'string').map(keyOf));
  const unique = new Map();
  for (const item of items) {
    const id = keyOf(item.imageId);
    const rating = ratingsSummary[id] || ratingsSummary[item.imageId] || {};
    if (!id || seen.has(id) || unique.has(id) || (!authorReview && rating.authorExcluded)) continue;
    unique.set(id, item);
  }
  let ordered;
  let feedMode;
  if (authorReview) {
    const visualRank = item => ['QI', 'INT'].includes(String(item.imageType).toUpperCase()) ? 0 : 1;
    ordered = [...unique.values()].sort((a, b) => visualRank(a) - visualRank(b) || stableRandom(seed, a) - stableRandom(seed, b));
    feedMode = 'author-review';
  } else if (newcomer) {
    const rating = item => ratingsSummary[keyOf(item.imageId)] || ratingsSummary[item.imageId] || {};
    const provenQI = item => String(item.imageType).toUpperCase() === 'QI' && Number(rating(item).total || 0) >= 3;
    // Welcome browsing is a showcase, without discovery slots or random jitter.
    // Exhaust proven QI first, then other rated work, then unrated fallbacks.
    ordered = [...unique.values()].sort((a, b) => {
      const ar = rating(a), br = rating(b);
      return Number(provenQI(b)) - Number(provenQI(a))
        || Number(Number(br.total || 0) >= 3) - Number(Number(ar.total || 0) >= 3)
        || Number(br.score || 0) - Number(ar.score || 0)
        || Number(br.movedMe || 0) - Number(ar.movedMe || 0)
        || Number(br.total || 0) - Number(ar.total || 0)
        || keyOf(a.imageId).localeCompare(keyOf(b.imageId));
    });
    feedMode = 'mobile-welcome';
  } else {
    ordered = mobilePreference([...unique.values()], ratingsSummary, { seed, preferVisual, includeMuted });
    const welcome = [...new Map(welcomeItems.filter(item => unique.has(keyOf(item.imageId))).map(item => [keyOf(item.imageId), item])).values()];
    if (welcome.length >= 8) {
      const leading = new Set(welcome.map(item => keyOf(item.imageId)));
      ordered = [...welcome, ...ordered.filter(item => !leading.has(keyOf(item.imageId)))];
      feedMode = 'mobile-welcome';
    } else feedMode = 'mobile-community';
  }
  const size = Math.max(1, Math.min(24, Math.floor(Number(limit)) || 12));
  const page = ordered.slice(0, size);
  const hasMore = ordered.length > page.length;
  return { items: page, hasMore, feedMode, nextCursor: hasMore ? 'mobile:' + keyOf(page.at(-1).imageId) : null };
}
