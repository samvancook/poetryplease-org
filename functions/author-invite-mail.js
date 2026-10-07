const MANDRILL_SEND_URL = "https://mandrillapp.com/api/1.0/messages/send";

export function buildAuthorInviteMessage({ name, email, inviteUrl, expiresAt, testOnly = false }) {
  const greeting = name ? `Hi ${name},` : "Hello,";
  const subject = `${testOnly ? "[TEST] " : ""}Your Poetry Please author invitation`;
  const text = [
    greeting,
    "",
    ...(testOnly ? ["This is a controlled test of the author invitation email. This link cannot claim an author account.", ""] : []),
    "We'd love to hear what you think of the work connected to your books. The easiest place to start is the QI and INT graphics: tell us which you love, feel neutral about, or would rather we not use. Your choices guide what we feature and what we leave out.",
    "",
    "If a graphic uses an early version of a piece or its formatting needs adjustment, you can leave a specific note in the editor. You can also vote for the poems and excerpts you'd most like us to use when promoting your book.",
    "",
    "Open your private Poetry Please invitation:",
    inviteUrl,
    "",
    `Sign in with the same email address that received this message (${email}). This link expires ${expiresAt}.`,
    "",
    "Questions or feedback? Reply to this email, or write to support@buttonpoetry.com.",
    "",
    "Button Poetry",
  ].join("\n");
  return { subject, text };
}

export async function sendAuthorInviteWithMandrill({ apiKey, email, message, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("mandrill_key_missing");
  const response = await fetchImpl(MANDRILL_SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      message: {
        from_email: "sam@buttonpoetry.com",
        from_name: "Button Poetry",
        headers: { "Reply-To": "sam@buttonpoetry.com" },
        to: [{ email, type: "to" }],
        subject: message.subject,
        text: message.text,
        track_opens: false,
        track_clicks: false,
        tags: ["poetry-please-author-invite-test"],
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  const delivery = Array.isArray(result) ? result.find((item) => item.email === email) : null;
  if (!response.ok || !delivery || !["sent", "queued"].includes(delivery.status)) {
    throw new Error("mandrill_send_failed");
  }
  return { status: delivery.status, messageId: delivery._id || "" };
}
