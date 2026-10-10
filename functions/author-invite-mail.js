const MANDRILL_SEND_URL = "https://mandrillapp.com/api/1.0/messages/send";

export function buildAuthorInviteMessage({ name, email, inviteUrl, expiresAt, bookTitle = "", helpUrl = "", testOnly = false }) {
  if (!testOnly && (!bookTitle || !helpUrl)) throw new Error("author_invite_book_and_help_required");
  const greeting = name ? `Hi ${name},` : "Hello,";
  const subject = `${testOnly ? "[TEST] " : ""}We'd love your feedback on Poetry Please`;
  const text = [
    greeting,
    "",
    ...(testOnly ? ["This is a controlled test of the author invitation email. This link cannot claim an author account.", ""] : []),
    `We're beginning to share Poetry Please with our authors, and we'd love for you to try it${bookTitle ? ` with the work connected to ${bookTitle}` : ""}. The graphics, photos, and excerpts there are pieces our team has already created or selected. Your feedback helps us decide what to feature more, use less, or leave out.`,
    "",
    "The easiest place to start is the QI quote images and INT interior photos. Tell us which you love, feel neutral about, or would rather we not use. You don't need to review everything at once.",
    "",
    "If a graphic uses an early version of a piece or its formatting needs adjustment, you can leave a specific note in the editor. You can also vote for the poems and excerpts you'd most like us to use when promoting your book.",
    "",
    "Open your private Poetry Please invitation:",
    inviteUrl,
    "",
    ...(helpUrl ? ["Your book-specific help page includes instructions and a preview:", helpUrl, ""] : []),
    `Sign in with the same email address that received this message (${email}). This link expires ${expiresAt}.`,
    "",
    "This invitation is for you, so please don't forward it. Questions or feedback? Reply to this email and Sam will personally respond. You can also write to support@buttonpoetry.com.",
    "",
    "Button Poetry Team",
  ].join("\n");
  return { subject, text };
}

export function buildContestAssignmentMessage({ programName, view, reviewUrl }) {
  const label = {
    assigned: "assigned review batch",
    spotcheck: "spot check",
    finalist: "finalist pass",
  }[view];
  if (!label || !programName || !reviewUrl) throw new Error("invalid_contest_assignment_message");
  return {
    subject: `Poetry Please: your ${label} for ${programName}`,
    text: [
      "Hello,",
      "",
      `Your ${label} for ${programName} is ready in Poetry Please.`,
      "",
      "Open your assigned review queue:",
      reviewUrl,
      "",
      "Sign in with the Button Poetry email address that received this message. Use the linked queue to see your assigned work.",
      "",
      "Questions or an assignment that looks wrong? Reply to this email before reviewing it.",
      "",
      "Button Poetry Team",
    ].join("\n"),
  };
}

export async function sendAuthorInviteWithMandrill({ apiKey, email, message, tag = "poetry-please-author-invite", fetchImpl = fetch }) {
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
        tags: [tag],
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
