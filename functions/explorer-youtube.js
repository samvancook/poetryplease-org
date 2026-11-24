// Shapes the cached YouTube (YT) records for Explorer's "Top YouTube videos"
// panel. Pure: the route passes in the cached content list, so the panel adds
// no Firestore reads of its own.

const text = (value) => String(value == null ? "" : value).trim();

// Most YT records carry socialViews from the YouTube export import. A few
// older ones only kept the numbers in `misc` ("... views=1077541 · likes=...").
function metricFromMisc(misc, name) {
  const match = text(misc).match(new RegExp("(?:^|[\\s·|])" + name + "=([0-9][0-9,]*)", "i"));
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function metric(item, field, miscName) {
  const stored = Number(item?.[field]);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const parsed = metricFromMisc(item?.misc, miscName);
  return Number.isFinite(parsed) ? parsed : (Number.isFinite(stored) ? stored : 0);
}

export function youtubeIdFor(item = {}) {
  const explicit = text(item.youtubeId);
  if (explicit) return explicit;
  const id = text(item.imageId || item.contentId);
  return /^YT-/i.test(id) ? id.slice(3) : "";
}

export function isYoutubeItem(item = {}) {
  return text(item.imageType).toUpperCase() === "YT";
}

export function buildExplorerYoutubeVideos(items = [], { flaggedIds = new Set(), resolveBook = (item) => item.book } = {}) {
  const seen = new Set();
  const videos = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!isYoutubeItem(item) || item.syntheticTest === true || item.catalogRetired === true) continue;
    const imageId = text(item.imageId || item.contentId || item.id);
    const key = imageId.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const youtubeId = youtubeIdFor(item);
    videos.push({
      imageId,
      youtubeId,
      title: text(item.title),
      author: text(item.author),
      book: text(resolveBook(item) || item.book),
      bookShortener: text(item.bookShortener),
      releaseCatalog: text(item.releaseCatalog),
      url: text(item.youtubeUrl || item.url) || (youtubeId ? "https://www.youtube.com/watch?v=" + youtubeId : ""),
      thumbnailUrl: text(item.thumbnailUrl) || (youtubeId ? "https://i.ytimg.com/vi/" + youtubeId + "/mqdefault.jpg" : ""),
      uploadTime: text(item.uploadTime),
      views: metric(item, "socialViews", "views"),
      likes: metric(item, "socialLikes", "likes"),
      comments: metric(item, "socialComments", "comments"),
      socialLastSyncedAt: item.socialLastSyncedAt || null,
      reviewOnly: item.reviewOnly === true,
      flagged: flaggedIds.has(key),
    });
  }
  videos.sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
  return videos;
}
