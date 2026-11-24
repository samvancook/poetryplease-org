import assert from "node:assert/strict";
import test from "node:test";
import { addLift, buildSocialTopPostsSnapshot, buildSocialTopPostsSql, engagementFor, rowsFromBigQuery } from "./social-top-posts.js";

test("warehouse query only reads, from the social_warehouse dataset", () => {
  const sql = buildSocialTopPostsSql();
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP)\b/i);
  assert.match(sql, /button-social-warehouse\.social_warehouse\.posts/);
  assert.match(sql, /current_catalog_approved_post_poem_links/);
});

test("BigQuery REST rows become typed objects", () => {
  const rows = rowsFromBigQuery({ fields: [
    { name: "platform", type: "STRING" }, { name: "views", type: "FLOAT" },
    { name: "published_at", type: "TIMESTAMP" }, { name: "book_title", type: "STRING" },
  ] }, [{ f: [{ v: "youtube" }, { v: "1.6649543E7" }, { v: "1.3742208E9" }, { v: null }] }]);
  assert.deepEqual(rows[0], { platform: "youtube", views: 16649543, published_at: "2013-07-19T08:00:00.000Z", book_title: null });
});

test("engagement follows the Calendar Performance Hub definition per platform", () => {
  assert.equal(engagementFor({ platform: "facebook", reactions: 10, comments: 2, shares: 3 }), 15);
  assert.equal(engagementFor({ platform: "instagram", likes: 10, comments: 2, shares: 3 }), 12);
  assert.equal(engagementFor({ platform: "tiktok", likes: 10, comments: 2, shares: 3 }), 15);
});

test("lift compares a post to its nearest posts on the same platform", () => {
  const posts = Array.from({ length: 40 }, (_, i) => ({
    platform: "instagram", publishedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), engagement: 99,
  }));
  posts[20].engagement = 999;
  addLift(posts);
  assert.equal(posts[20].lift, 2.3);
  assert.equal(posts[5].lift, 0);
});

test("snapshot keeps every book-linked post and adds Poetry Please books to YouTube videos", () => {
  const rows = [
    { platform: "youtube", post_id: "OCDid", views: 16649543, likes: 358377, comments: 10, published_at: "2013-07-19T00:00:00Z", views_week_ago: 16640000 },
    { platform: "instagram", post_id: "ig1", views: 5, likes: 1, comments: 0, book_title: "Helium", poem_key: "BPP-1", poem_title: "Complainers", published_at: "2026-01-01T00:00:00Z" },
    { platform: "facebook", post_id: "fb1", reactions: 3, comments: 1, shares: 0, published_at: "2026-01-02T00:00:00Z" },
  ];
  const snap = buildSocialTopPostsSnapshot(rows, {
    youtubeBooks: new Map([["OCDid", { book: "The Future", title: "OCD", author: "Neil Hilborn" }]]),
    perPlatformLimit: 1, generatedAt: "2026-11-24T00:00:00Z",
  });
  const byId = Object.fromEntries(snap.posts.map((post) => [post.postId, post]));
  assert.equal(snap.totalPosts, 3);
  assert.equal(byId.OCDid.book, "The Future");
  assert.equal(byId.OCDid.bookSource, "poetry_please");
  assert.equal(byId.OCDid.viewsGained7d, 9543);
  assert.equal(byId.OCDid.isVideo, true);
  assert.equal(byId.ig1.book, "Helium");
  assert.equal(byId.ig1.bookSource, "catalog");
  assert.equal(byId.fb1.likes, 3);
});
