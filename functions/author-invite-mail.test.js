import assert from "node:assert/strict";
import test from "node:test";
import { AUTHOR_MAIL_IDENTITY, authorInviteTestCanResend, buildAuthorInviteMessage, buildContestAssignmentMessage, sendAuthorInviteWithMandrill } from "./author-invite-mail.js";

test("controlled invite explains review actions and cannot be mistaken for a claimable invitation", () => {
  const message = buildAuthorInviteMessage({
    name: "Sam", email: "sam@buttonpoetry.com",
    inviteUrl: "https://poetryplease.org/app?authorInvite=private-test-token",
    expiresAt: "October 21, 2026", testOnly: true,
  });
  assert.match(message.subject, /^\[TEST\]/);
  assert.match(message.text, /quote images and interior photos/);
  assert.match(message.text, /Moved Me: a favorite/);
  assert.match(message.text, /Like: /);
  assert.match(message.text, /Meh: /);
  assert.match(message.text, /Dislike: please don't use it/);
  assert.match(message.text, /excerpts/);
  assert.match(message.text, /early draft of a poem/);
  assert.match(message.text, /sign out first/);
  assert.doesNotMatch(message.text, /\bQI\b|\bINT\b|\bEXC\b|Edit profile|My content/);
  assert.match(message.text, /can't set up an author account/);
  assert.match(message.text, /private-test-token/);
});

test("a test of one author's invite names who it is for and keeps their book", () => {
  const message = buildAuthorInviteMessage({
    name: "Matt", email: "sam@buttonpoetry.com", bookTitle: "Roads", intendedFor: "Matt Mason",
    helpUrl: "https://buttonpoetry.com/poetryplease/author-help/?book=Roads",
    inviteUrl: "https://poetryplease.org/app?authorInvite=private-test-token", expiresAt: "October 22, 2026", testOnly: true,
  });
  assert.equal(message.subject, "[TEST] Help choose how we share Roads");
  assert.match(message.text, /exactly as Matt Mason would get it/);
  assert.match(message.text, /^Hi Matt,/);
});

test("real author invite includes claim link and book-specific help", () => {
  const message = buildAuthorInviteMessage({
    name: "Matt", email: "matt@example.com", bookTitle: "Roads",
    helpUrl: "https://buttonpoetry.com/poetryplease/author-help/?book=Roads",
    inviteUrl: "https://poetryplease.org/app?authorInvite=private-token", expiresAt: "October 22, 2026",
  });
  assert.equal(message.subject, "Help choose how we share Roads");
  assert.match(message.text, /from Roads/);
  assert.match(message.text, /author-help\/\?book=Roads/);
  assert.match(message.text, /private-token/);
  assert.match(message.text, /matt@example\.com/);
  assert.doesNotMatch(message.text, /test of the author invitation/);
});

test("contest assignment notice links to its specific queue", () => {
  const message = buildContestAssignmentMessage({
    programName: "Poetry Contest", view: "spotcheck",
    reviewUrl: "https://poetryplease.org/contest-review.html?program=contest-1&view=spotcheck",
  });
  assert.match(message.subject, /spot check/);
  assert.match(message.text, /view=spotcheck/);
});

test("Mandrill send uses one recipient and disables invite-link click tracking", async () => {
  let sent;
  const delivery = await sendAuthorInviteWithMandrill({
    apiKey: "test-key", email: "sam@buttonpoetry.com", message: { subject: "Test", text: "Body" },
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => [{ email: "sam@buttonpoetry.com", status: "sent", _id: "message-1" }] };
    },
  });
  assert.deepEqual(sent.message.to, [{ email: "sam@buttonpoetry.com", type: "to" }]);
  assert.equal(sent.message.track_clicks, false);
  assert.equal(delivery.messageId, "message-1");
});

test("Mandrill rejection is not reported as sent", async () => {
  await assert.rejects(sendAuthorInviteWithMandrill({
    apiKey: "test-key", email: "sam@buttonpoetry.com", message: { subject: "Test", text: "Body" },
    fetchImpl: async () => ({ ok: true, json: async () => [{ email: "sam@buttonpoetry.com", status: "rejected" }] }),
  }), /mandrill_send_failed/);
});

test("contest mail passes the selected From name/address and Reply-To to Mandrill", async () => {
  let payload;
  await sendAuthorInviteWithMandrill({
    apiKey: "test-key", email: "reviewer@buttonpoetry.com", message: { subject: "Contest", text: "Review" },
    fromEmail: "no-reply@buttonpoetry.com", fromName: "Button Poetry Contests", replyTo: "support@buttonpoetry.com",
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => [{ email: "reviewer@buttonpoetry.com", status: "queued", _id: "fake-contest" }] };
    },
  });
  assert.equal(payload.message.from_email, "no-reply@buttonpoetry.com");
  assert.equal(payload.message.from_name, "Button Poetry Contests");
  assert.equal(payload.message.headers["Reply-To"], "support@buttonpoetry.com");
});

test("author mail comes from Sam and replies reach both Sam and support", async () => {
  let payload;
  await sendAuthorInviteWithMandrill({
    apiKey: "test-key", email: "author@example.com", message: { subject: "Invite", text: "Body" },
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => [{ email: "author@example.com", status: "sent", _id: "invite-1" }] };
    },
  });
  assert.equal(payload.message.from_email, "sam@buttonpoetry.com");
  assert.equal(payload.message.from_name, AUTHOR_MAIL_IDENTITY.fromName);
  assert.equal(payload.message.headers["Reply-To"], "sam@buttonpoetry.com, support@buttonpoetry.com");
});

test("the Sam-only test invite can be re-sent, but not twice within a minute", () => {
  const now = 1_000_000_000;
  assert.equal(authorInviteTestCanResend(undefined, 0, now), true);
  assert.equal(authorInviteTestCanResend("sent", now - 5_000, now), false);
  assert.equal(authorInviteTestCanResend("sending", now - 5_000, now), false);
  assert.equal(authorInviteTestCanResend("sent", now - 61_000, now), true);
  assert.equal(authorInviteTestCanResend("uncertain", now - 61_000, now), true);
});
