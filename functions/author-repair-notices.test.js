import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { buildAuthorRepairNoticePlan, repairNoticeDeliveryKey, repairNoticeCanReserve } from "./author-repair-notices.js";

const fixture = () => ({
  requestId: "same-repair", request: { status: "resolved", returnReviewStatus: "accepted", replacementActivated: true,
    imageId: "original-graphic", replacementAssetLink: "https://example.com/new.png", authorVotingReopenedAt: "2026-10-18T12:00:00Z" },
  content: { imageType: "QI", author: "Matt Mason", title: "A poem", book: "Roads",
    imageUrl: "https://example.com/new.png", activeRepairRequestId: "same-repair" },
  users: [{ id: "matt", email: "matt@example.com", roles: ["author"], status: "active", authorProfileId: "profile" },
    { id: "staff", email: "staff@example.com", roles: ["admin", "author"], authorProfileId: "staff-profile" }],
  profiles: [{ id: "profile", userId: "matt", displayName: "Matt Mason", email: "matt@example.com" },
    { id: "staff-profile", userId: "staff", displayName: "A staff reviewer" }],
  votes: [{ userId: "matt", supersededAt: "2026-10-18", supersededByRepairRequestId: "same-repair" },
    { userId: "staff" }],
});

test("repair notice selects the owning author, preserves identity and links to fresh review", () => {
  const plan = buildAuthorRepairNoticePlan(fixture());
  assert.equal(plan.recipient.email, "matt@example.com");
  assert.equal(plan.reviewUrl, "https://poetryplease.org/app?item=original-graphic");
  assert.match(plan.message.text, /earlier vote stays in the history/);
  assert.match(plan.message.text, /fresh vote/);
});

test("new author feedback, superseded repairs and unaccepted returns suppress notices", () => {
  const reviewed = fixture(); reviewed.votes.push({ userId: "matt@example.com" });
  assert.throws(() => buildAuthorRepairNoticePlan(reviewed), /active_vote/);
  const older = fixture(); older.content.imageUrl = "https://example.com/later.png";
  assert.throws(() => buildAuthorRepairNoticePlan(older), /superseded/);
  const returned = fixture(); returned.request.status = "returned";
  assert.throws(() => buildAuthorRepairNoticePlan(returned), /not_accepted/);
});

test("unverified, disabled, conflicting and ambiguous author accounts remain held", () => {
  for (const alter of [
    (input) => { input.profiles[0].displayName = "Someone else"; },
    (input) => { input.users[0].status = "disabled"; },
    (input) => { input.profiles[0].email = "different@example.com"; },
    (input) => { input.users.push({ ...input.users[0], id: "another" }); },
  ]) {
    const input = fixture(); alter(input);
    assert.throws(() => buildAuthorRepairNoticePlan(input), /recipient/);
  }
});

test("one delivery per accepted version; uncertain sends never automatically retry", () => {
  const first = buildAuthorRepairNoticePlan(fixture());
  const second = fixture(); second.request.authorVotingReopenedAt = "2026-10-19T12:00:00Z";
  const next = buildAuthorRepairNoticePlan(second);
  assert.notEqual(first.revision, next.revision);
  assert.notEqual(repairNoticeDeliveryKey(first, true), repairNoticeDeliveryKey(first, false));
  for (const status of ["sent", "sending", "uncertain"]) assert.equal(repairNoticeCanReserve({ status }), false);
  assert.equal(repairNoticeCanReserve(null), true);
  assert.notEqual(first.previewHash, next.previewHash);
});

test("successful controlled delivery immediately updates the displayed summary", async () => {
  const html = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
  const source = html.slice(html.indexOf("async function previewRepairNotice("), html.indexOf("function collectRepairReviewDetails("));
  const controls = Object.fromEntries(["test", "send"].map((name) => [name, {
    addEventListener(_event, handler) { this.handler = handler; },
  }]));
  const summary = {}, status = {};
  const container = { querySelectorAll: () => Object.values(controls), querySelector: (selector) => ({
    '[data-repair-notice-test]': controls.test, '[data-repair-notice-send]': controls.send,
    '[data-repair-notice-status]': status, '[data-repair-notice-summary]': summary,
  })[selector] };
  const calls = [];
  const context = { document: { querySelector: () => container }, CSS: { escape: String }, escapeHtml: String,
    api: async (path, options) => {
      calls.push({ path, options });
      return options.method === 'GET'
        ? { recipient: { email: 'author@example.com' }, message: { subject: 'Updated item', text: 'Review it' }, previewHash: 'verified-preview', canSend: false }
        : { email: 'sam@buttonpoetry.com', delivery: { status: 'sent', messageId: 'receipt-1' } };
    },
  };
  runInNewContext(`${source}; this.preview = previewRepairNotice;`, context);
  await context.preview('same-repair');
  await controls.test.handler();
  assert.match(summary.textContent, /Test delivery: sent\. Author delivery: not sent/);
  assert.match(status.textContent, /receipt-1/);
  assert.equal(calls[1].options.body.testOnly, true);
  assert.equal(calls[1].options.body.previewHash, 'verified-preview');
});
