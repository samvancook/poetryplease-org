// Top and viral social posts for Explorer, copied once a day from the Button
// Social Warehouse (BigQuery project button-social-warehouse, read-only).
// Pure helpers live here; index.js runs the query and stores the snapshot.

export const WAREHOUSE = "button-social-warehouse.social_warehouse";
export const SOCIAL_TOP_POSTS_PATH = "explorer/social-top-posts.json";

const text = (value) => String(value == null ? "" : value).trim();
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// One row per post: canonical API posts with their latest metrics, plus the
// historical TikTok and Instagram exports for posts the API never saw. Book
// and poem come only from Catalog-approved post-to-poem links.
export function buildSocialTopPostsSql(warehouse = WAREHOUSE) {
  const t = (name) => "`" + warehouse + "." + name + "`";
  return `
WITH latest AS (
  SELECT platform, post_id,
    MAX(IF(metric_name = 'views', metric_value, NULL)) AS views,
    MAX(IF(metric_name = 'likes', metric_value, NULL)) AS likes,
    MAX(IF(metric_name = 'reactions', metric_value, NULL)) AS reactions,
    MAX(IF(metric_name = 'comments', metric_value, NULL)) AS comments,
    MAX(IF(metric_name = 'shares', metric_value, NULL)) AS shares,
    MAX(IF(metric_name = 'saves', metric_value, NULL)) AS saves,
    MAX(captured_at) AS metrics_as_of
  FROM ${t("latest_post_metrics")}
  WHERE metric_period = 'lifetime'
    AND metric_name IN ('views', 'likes', 'reactions', 'comments', 'shares', 'saves')
  GROUP BY platform, post_id
), week_ago AS (
  SELECT platform, post_id,
    ARRAY_AGG(metric_value ORDER BY captured_at DESC LIMIT 1)[OFFSET(0)] AS views_week_ago,
    ARRAY_AGG(captured_at ORDER BY captured_at DESC LIMIT 1)[OFFSET(0)] AS views_week_ago_at
  FROM ${t("post_metric_snapshots")}
  WHERE metric_name = 'views' AND metric_period = 'lifetime'
    AND captured_at BETWEEN TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 21 DAY)
                        AND TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  GROUP BY platform, post_id
), canonical AS (
  SELECT p.platform, p.post_id, p.account_id, a.account_name,
    p.published_at, p.content_type, SUBSTR(p.title_or_caption, 1, 240) AS caption, p.permalink,
    m.views, m.likes, m.reactions, m.comments, m.shares, m.saves, m.metrics_as_of,
    w.views_week_ago, w.views_week_ago_at, 'api' AS metric_source
  FROM ${t("posts")} p
  LEFT JOIN latest m USING (platform, post_id)
  LEFT JOIN week_ago w USING (platform, post_id)
  LEFT JOIN (SELECT platform, account_id, ANY_VALUE(account_name) AS account_name
             FROM ${t("accounts")} GROUP BY platform, account_id) a USING (platform, account_id)
), tiktok_export AS (
  SELECT 'tiktok' AS platform, item_id AS post_id, CAST(NULL AS STRING) AS account_id,
    'Button Poetry' AS account_name, SAFE.TIMESTAMP(posted_utc) AS published_at, 'video' AS content_type,
    SUBSTR(caption, 1, 240) AS caption, video_url AS permalink,
    CAST(views AS FLOAT64) AS views, CAST(likes AS FLOAT64) AS likes, CAST(NULL AS FLOAT64) AS reactions,
    CAST(comments AS FLOAT64) AS comments, CAST(shares AS FLOAT64) AS shares, CAST(saves AS FLOAT64) AS saves,
    imported_at AS metrics_as_of, CAST(NULL AS FLOAT64) AS views_week_ago,
    CAST(NULL AS TIMESTAMP) AS views_week_ago_at, 'tiktok_export' AS metric_source
  FROM ${t("current_tiktok_historical_posts_export")}
  WHERE item_id NOT IN (SELECT post_id FROM ${t("posts")} WHERE platform = 'tiktok')
), instagram_export AS (
  SELECT 'instagram' AS platform, media_id AS post_id, CAST(NULL AS STRING) AS account_id,
    'Button Poetry' AS account_name, SAFE.PARSE_TIMESTAMP('%m/%d/%Y %H:%M', published_time_pt, 'America/Los_Angeles') AS published_at,
    LOWER(media_type) AS content_type, SUBSTR(caption, 1, 240) AS caption, permalink,
    CAST(views AS FLOAT64) AS views, CAST(likes AS FLOAT64) AS likes, CAST(NULL AS FLOAT64) AS reactions,
    CAST(comments AS FLOAT64) AS comments, CAST(shares AS FLOAT64) AS shares, CAST(saves AS FLOAT64) AS saves,
    imported_at AS metrics_as_of, CAST(NULL AS FLOAT64) AS views_week_ago,
    CAST(NULL AS TIMESTAMP) AS views_week_ago_at, 'instagram_export' AS metric_source
  FROM ${t("current_manual_instagram_business_suite_posts")}
  WHERE account_username = 'buttonpoetry'
    AND media_id NOT IN (SELECT post_id FROM ${t("posts")} WHERE platform = 'instagram')
), links AS (
  SELECT l.platform, l.post_id, ANY_VALUE(l.poem_key) AS poem_key,
    ANY_VALUE(k.title) AS poem_title, ANY_VALUE(k.book_title) AS book_title
  FROM ${t("current_catalog_approved_post_poem_links")} l
  LEFT JOIN ${t("current_catalog_poem_keys")} k USING (poem_key)
  GROUP BY l.platform, l.post_id
)
SELECT c.*, l.poem_key, l.poem_title, l.book_title
FROM (SELECT * FROM canonical UNION ALL SELECT * FROM tiktok_export UNION ALL SELECT * FROM instagram_export) c
LEFT JOIN links l USING (platform, post_id)
`.trim();
}

// BigQuery REST rows ({f:[{v}]}) into plain objects using the result schema.
export function rowsFromBigQuery(schema, rows) {
  const fields = (schema?.fields || []).map((field) => ({ name: field.name, type: field.type }));
  return (rows || []).map((row) => {
    const out = {};
    fields.forEach((field, index) => {
      const raw = row?.f?.[index]?.v;
      if (raw === null || raw === undefined) out[field.name] = null;
      else if (field.type === "TIMESTAMP") out[field.name] = new Date(Number(raw) * 1000).toISOString();
      else if (["FLOAT", "FLOAT64", "INTEGER", "INT64", "NUMERIC"].includes(field.type)) out[field.name] = Number(raw);
      else out[field.name] = raw;
    });
    return out;
  });
}

// Same engagement definition as the Calendar Performance Hub: Facebook
// reactions + comments + shares; Instagram and YouTube likes + comments;
// TikTok likes + comments + shares. Missing parts count as nothing.
export function engagementFor(post) {
  const likes = num(post.likes) || 0;
  const reactions = num(post.reactions) || 0;
  const comments = num(post.comments) || 0;
  const shares = num(post.shares) || 0;
  if (post.platform === "facebook") return (reactions || likes) + comments + shares;
  if (post.platform === "tiktok") return likes + comments + shares;
  return likes + comments;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// lift = ln((engagement + 1) / (median engagement of the 30 nearest posts on
// that platform by publish time + 1)). 0 is typical, +0.69 double, +2.3 ten times.
export function addLift(posts, { neighbors = 30 } = {}) {
  const byPlatform = new Map();
  posts.forEach((post) => {
    if (!post.publishedAt) return;
    const list = byPlatform.get(post.platform) || [];
    list.push(post);
    byPlatform.set(post.platform, list);
  });
  for (const list of byPlatform.values()) {
    list.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    list.forEach((post, index) => {
      const nearby = [];
      let left = index - 1;
      let right = index + 1;
      const time = Date.parse(post.publishedAt);
      while (nearby.length < neighbors && (left >= 0 || right < list.length)) {
        const leftGap = left >= 0 ? time - Date.parse(list[left].publishedAt) : Infinity;
        const rightGap = right < list.length ? Date.parse(list[right].publishedAt) - time : Infinity;
        if (leftGap <= rightGap) nearby.push(list[left--].engagement);
        else nearby.push(list[right++].engagement);
      }
      if (nearby.length < 5) return;
      post.lift = Math.round(Math.log((post.engagement + 1) / (median(nearby) + 1)) * 100) / 100;
    });
  }
  return posts;
}

function shapePost(row) {
  const views = num(row.views);
  const weekAgo = num(row.views_week_ago);
  const post = {
    platform: text(row.platform),
    postId: text(row.post_id),
    account: text(row.account_name),
    publishedAt: row.published_at || null,
    contentType: text(row.content_type).toLowerCase(),
    caption: text(row.caption),
    url: text(row.permalink),
    views,
    likes: num(row.likes) ?? num(row.reactions),
    comments: num(row.comments),
    shares: num(row.shares),
    saves: num(row.saves),
    metricsAsOf: row.metrics_as_of || null,
    metricSource: text(row.metric_source),
    viewsGained7d: views !== null && weekAgo !== null ? Math.max(0, views - weekAgo) : null,
    poemKey: text(row.poem_key),
    poemTitle: text(row.poem_title),
    book: text(row.book_title),
    lift: null,
  };
  post.engagement = engagementFor({ ...row, platform: post.platform });
  return post;
}

function isVideo(post) {
  return post.platform === "youtube" || post.platform === "tiktok"
    || /video|reel|clip/.test(post.contentType);
}

// Keeps every post linked to a book (the per-book lookup needs them all) and
// the strongest unlinked posts per platform, so the file stays small.
export function buildSocialTopPostsSnapshot(rows, {
  youtubeBooks = new Map(), perPlatformLimit = 400, generatedAt = new Date().toISOString(),
} = {}) {
  const posts = (rows || []).map(shapePost).filter((post) => post.platform && post.postId);
  for (const post of posts) {
    if (!post.book && post.platform === "youtube" && youtubeBooks.has(post.postId)) {
      const match = youtubeBooks.get(post.postId);
      post.book = match.book || "";
      post.poemTitle = post.poemTitle || match.title || "";
      post.author = match.author || "";
      post.bookSource = "poetry_please";
    } else if (post.book) {
      post.bookSource = "catalog";
    }
    post.isVideo = isVideo(post);
  }
  addLift(posts);
  const keep = new Set();
  const byPlatform = new Map();
  posts.forEach((post) => {
    if (post.book) keep.add(post);
    const list = byPlatform.get(post.platform) || [];
    list.push(post);
    byPlatform.set(post.platform, list);
  });
  for (const list of byPlatform.values()) {
    const top = (key) => [...list].filter((post) => post[key] != null)
      .sort((a, b) => b[key] - a[key]).slice(0, perPlatformLimit);
    [...top("views"), ...top("engagement"), ...top("lift"), ...top("viewsGained7d")].forEach((post) => keep.add(post));
  }
  const kept = [...keep].map(({ engagement, ...post }) => ({ ...post, engagement }));
  const platforms = {};
  posts.forEach((post) => { platforms[post.platform] = (platforms[post.platform] || 0) + 1; });
  return {
    status: "ok",
    generatedAt,
    source: "BigQuery " + WAREHOUSE,
    totalPosts: posts.length,
    platforms,
    posts: kept,
  };
}
