import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorInviteMessage, sendAuthorInviteWithMandrill } from "./author-invite-mail.js";

test("controlled invite explains review actions and cannot be mistaken for a claimable invitation", () => {
  const message = buildAuthorInviteMessage({
    name: "Sam", email: "sam@buttonpoetry.com",
    inviteUrl: "https://poetryplease.org/app?authorInvite=private-test-token",
    expiresAt: "October 21, 2026", testOnly: true,
  });
  assert.match(message.subject, /^\[TEST\]/);
  assert.match(message.text, /QI and INT graphics/);
  assert.match(message.text, /early version of a piece/);
  assert.match(message.text, /poems and excerpts/);
  assert.match(message.text, /cannot claim an author account/);
  assert.match(message.text, /private-test-token/);
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
