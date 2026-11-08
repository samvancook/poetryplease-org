import { paginateMobileFeed } from './swipe-feed.js';

const DAY_MS = 86400000;
const keyOf = value => String(value || '').trim().toLowerCase();

function observationGroup(row, capturedAt, publishedAt, metricSet) {
  const age = (Date.parse(capturedAt) - Date.parse(publishedAt)) / DAY_MS;
  if (!Number.isFinite(age) || age < 0) return null;
  const ageBand = age < 7 ? 'under 7 days' : age < 30 ? '7–29 days' : age < 180 ? '30–179 days' : '180+ days';
  return { ageBand, cohort: [row.platform, row.source, row.period, ageBand, metricSet].join('|') };
}

// Produce compact source-preserving profiles offline. Serving reads this output.
export function buildSocialTrialProfiles(evidence, now = Date.now()) {
  const observations = [];
  for (const item of evidence.videoEvidence || []) {
    const metrics = Object.fromEntries(item.metrics.map(row => [row.metric_name, row]));
    const views = metrics.views;
    const likes = metrics.likes;
    if (!views || !likes || views.metric_value == null || likes.metric_value == null
      || !Number.isFinite(Number(views.metric_value)) || !Number.isFinite(Number(likes.metric_value))
      || Number(views.metric_value) <= 0) continue;
    const comments = metrics.comments;
    const capturedAt = views.captured_at_iso;
    if (now - Date.parse(capturedAt) > 14 * DAY_MS) continue;
    const row = { platform: 'youtube', source: views.api_endpoint, period: views.metric_period };
    const values = { views: Number(views.metric_value), likes: Number(likes.metric_value) };
    if (comments?.metric_value != null && Number.isFinite(Number(comments.metric_value))) {
      values.comments = Number(comments.metric_value);
    }
    const group = observationGroup(row, capturedAt, views.published_at_iso, Object.keys(values).sort().join(','));
    if (!group) continue;
    observations.push({
      lane: 'YT', target: item.youtubeId, postId: item.youtubeId, ...row,
      capturedAt, publishedAt: views.published_at_iso, values,
      metricSourceRef: views.raw_response_ref, permalink: views.permalink || '',
      rawSignal: (values.likes + 2 * (values.comments || 0)) / values.views,
      ...group,
    });
  }
  for (const poem of evidence.poemEvidence || []) {
    if (poem.registryStatus !== 'active') continue;
    const posts = new Map();
    for (const metric of poem.metrics) {
      if (Number(metric.match_confidence) < 1) continue;
      const group = [metric.platform, metric.post_id, metric.metric_source, metric.metric_period].join('|');
      if (!posts.has(group)) posts.set(group, []);
      posts.get(group).push(metric);
    }
    for (const metrics of posts.values()) {
      const values = {};
      for (const metric of metrics) {
        if (metric.metric_value != null && Number.isFinite(Number(metric.metric_value))
          && ['likes', 'reactions', 'comments', 'shares', 'saves'].includes(metric.metric_name)) {
          values[metric.metric_name] = Number(metric.metric_value);
        }
      }
      if (!Object.keys(values).length) continue;
      const first = metrics[0];
      const capturedAt = metrics.map(row => row.captured_at_iso).sort()[0];
      if (now - Date.parse(capturedAt) > 180 * DAY_MS) continue;
      const row = { platform: first.platform, source: first.metric_source, period: first.metric_period };
      const group = observationGroup(row, capturedAt, first.published_at_iso, Object.keys(values).sort().join(','));
      if (!group) continue;
      observations.push({
        lane: 'QI', target: poem.poemKey, postId: first.post_id, ...row,
        capturedAt, publishedAt: first.published_at_iso, values,
        metricSourceRef: first.metric_source_ref, linkSourceRef: first.link_source_ref,
        matchMethod: first.match_method, permalink: first.permalink || '',
        rawSignal: (values.reactions ?? values.likes ?? 0) + (values.comments || 0)
          + (values.shares || 0) + (values.saves || 0),
        ...group,
      });
    }
  }

  const cohorts = new Map();
  for (const row of observations) {
    if (!cohorts.has(row.cohort)) cohorts.set(row.cohort, new Map());
    cohorts.get(row.cohort).set(row.postId, row.rawSignal);
  }
  const profiles = { generatedAt: new Date(now).toISOString(), youtube: {}, poems: {} };
  for (const row of observations) {
    const cohort = [...cohorts.get(row.cohort).values()];
    if (cohort.length < 5) continue;
    const lower = cohort.filter(value => value < row.rawSignal).length;
    const tied = cohort.filter(value => value === row.rawSignal).length;
    const score = (lower + (tied - 1) / 2) / (cohort.length - 1);
    const target = row.lane === 'YT' ? profiles.youtube : profiles.poems;
    if (target[row.target] && target[row.target].score >= score) continue;
    const { rawSignal, cohort: cohortKey, lane, target: targetKey, ...source } = row;
    target[row.target] = { ...source, score, cohortSize: cohort.length };
  }
  return profiles;
}

export function compareSocialServing(items, { profiles, ratingsSummary = {}, type, newcomer = true,
  seed = 'social-trial-v1', now = Date.now() } = {}) {
  const profileFor = item => type === 'YT' ? profiles.youtube[item.youtubeId] : profiles.poems[item.poemKey];
  const lane = items.filter(item => item.imageType === type);
  const covered = lane.filter(item => {
    const profile = profileFor(item);
    const age = now - Date.parse(profile?.capturedAt);
    return profile && Number.isFinite(age) && age >= 0 && age <= (type === 'YT' ? 14 : 180) * DAY_MS;
  });
  const baseline = paginateMobileFeed(covered, { ratingsSummary, newcomer, seed, limit: 24 }).items;
  const trial = baseline.slice();
  const groups = new Map();
  for (const [index, item] of baseline.entries()) {
    const signal = item.__feedSignals;
    const priority = [signal.bucket, signal.feedScore, signal.totalVotes, signal.movedMe].join('|');
    if (!groups.has(priority)) groups.set(priority, []);
    groups.get(priority).push(index);
  }
  for (const indices of groups.values()) {
    const ordered = indices.map(index => baseline[index]).sort((a, b) =>
      profileFor(b).score - profileFor(a).score);
    indices.forEach((index, offset) => { trial[index] = ordered[offset]; });
  }
  const baselineRank = new Map(baseline.map((item, index) => [keyOf(item.imageId), index + 1]));
  const describe = (item, index) => ({
    id: item.imageId || item.contentId || item.id,
    title: item.title || '', author: item.author || '', book: item.book || '',
    poemKey: item.poemKey || '', type: item.imageType,
    rank: index + 1, baselineRank: baselineRank.get(keyOf(item.imageId)),
    votes: item.__feedSignals.totalVotes, feedScore: item.__feedSignals.feedScore,
    evidence: profileFor(item),
  });
  return {
    type, generatedAt: profiles.generatedAt, model: newcomer ? 'new-visitor' : 'community',
    eligibleLaneItems: lane.length, coveredItems: covered.length,
    baseline: baseline.map(describe), trial: trial.map(describe),
    changedPositions: trial.filter((item, index) => item !== baseline[index]).length,
  };
}
