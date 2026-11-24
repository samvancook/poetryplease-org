import assert from "node:assert/strict";
import test from "node:test";
import { buildExplorerYoutubeVideos, youtubeIdFor } from "./explorer-youtube.js";

test("ranks only YouTube records by views, highest first", () => {
  const videos = buildExplorerYoutubeVideos([
    { imageType: "YT", imageId: "YT-a", title: "Low", author: "A", book: "Book 1", socialViews: 10 },
    { imageType: "VV", imageId: "VV-1", title: "Native video", socialViews: 999999 },
    { imageType: "YT", imageId: "YT-b", title: "High", author: "B", book: "Book 2", socialViews: 5000, socialLikes: 40 },
    { imageType: "YT", imageId: "YT-c", title: "Test", syntheticTest: true, socialViews: 1e9 },
    { imageType: "YT", imageId: "YT-d", title: "Retired", catalogRetired: true, socialViews: 1e9 },
  ]);
  assert.deepEqual(videos.map((video) => video.title), ["High", "Low"]);
  assert.equal(videos[0].likes, 40);
  assert.equal(videos[0].url, "https://www.youtube.com/watch?v=b");
});

test("falls back to the export numbers kept in misc", () => {
  const [video] = buildExplorerYoutubeVideos([{
    imageType: "YT", imageId: "YT-3wvnQcm3SZE", youtubeId: "3wvnQcm3SZE", socialViews: 0,
    misc: "Imported from YouTube export · privacy=Public · views=1077541 · likes=38447 · comments=390 · dislikes=103",
  }]);
  assert.equal(video.views, 1077541);
  assert.equal(video.likes, 38447);
  assert.equal(video.comments, 390);
  assert.equal(video.thumbnailUrl, "https://i.ytimg.com/vi/3wvnQcm3SZE/mqdefault.jpg");
});

test("marks flagged and review-only videos, de-duplicates ids, and resolves the book", () => {
  const videos = buildExplorerYoutubeVideos([
    { imageType: "YT", imageId: "YT-X", book: "crown noble", reviewOnly: true, socialViews: 2 },
    { imageType: "yt", imageId: "yt-x", book: "dup", socialViews: 1 },
    { imageType: "YT", imageId: "YT-Y", book: "", socialViews: 1 },
  ], { flaggedIds: new Set(["yt-y"]), resolveBook: (item) => item.book ? item.book.toUpperCase() : "" });
  assert.equal(videos.length, 2);
  assert.equal(videos[0].book, "CROWN NOBLE");
  assert.equal(videos[0].reviewOnly, true);
  assert.equal(videos[1].flagged, true);
});

test("derives the YouTube id from the record id when needed", () => {
  assert.equal(youtubeIdFor({ youtubeId: "abc" }), "abc");
  assert.equal(youtubeIdFor({ imageId: "YT-xyz" }), "xyz");
  assert.equal(youtubeIdFor({ imageId: "VV-1" }), "");
});
