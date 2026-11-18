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
    "The easiest place to start is the QI quote images and INT interior photos. Tell us which you love, feel neutral about, or would rather we not use. Your choices guide what we feature more often and what we leave out. You don't need to review everything at once.",
    "",
    "Next, you can review the EXC excerpts and tell us which passages you'd most like to see used when promoting your book. The short guided tour in the app can help you get started.",
    "",
    "If a graphic uses an early version of a piece or you'd like its formatting adjusted, reply with the item and your notes so we can adjust or recreate it. These notes are optional.",
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

export function buildAuthorRepairMessage({ name, title, book, reviewUrl, hadEarlierVote = false }) {
  if (!reviewUrl?.startsWith("https://poetryplease.org/app?item=")) throw new Error("invalid_repair_review_url");
  return {
    subject: "Poetry Please: an updated graphic for your review",
    text: [
      name ? `Hi ${name},` : "Hello,", "",
      `We've updated ${title ? `“${title}”` : "a graphic"}${book ? ` from ${book}` : ""}.`, "",
      "If you'd like, take another look and tell us what you think of this version.",
      hadEarlierVote
        ? "Your earlier vote stays in the history. This updated version is open for a fresh vote."
        : "You can give the updated version a vote in Poetry Please.", "",
      "Review the updated item:", reviewUrl, "",
      "Sign in with the email address that received this message.", "",
      "If you'd like another adjustment, reply with the item and your notes. Sam will personally respond.", "",
      "Button Poetry Team",
    ].join("\n"),
  };
}

export function buildContestAssignmentMessage({ programName, view, reviewUrl, assignmentCount, addedCount, remainingCount, preliminaryCount, additionalCount }) {
  const label = {
    assigned: "review assignment",
    spotcheck: "spot check",
    finalist: "finalist pass",
  }[view];
  if (!label || !programName || !reviewUrl) throw new Error("invalid_contest_assignment_message");
  const instructions = [];
  if (view === "assigned") {
    if (preliminaryCount > 0) {
      instructions.push(`Initial reads — ${preliminaryCount} poems. Read each poem and vote Yes, Maybe, or No to help decide which pieces move forward.`);
    }
    if (additionalCount > 0) {
      instructions.push(`Additional reads — ${additionalCount} poems. These need another opinion after their first three reviews. Vote Yes, Maybe, or No. A poem becomes available once its first three reviews are finished.`);
    }
    if (!instructions.length) instructions.push("Read each poem and vote Yes, Maybe, or No. Your queue shows the poems available for your review.");
  }
  if (view === "spotcheck") {
    instructions.push("This is a random sample of poems that received three No votes. Give each a fresh read and vote Yes, Maybe, or No. Your responses help us check whether that group needs more attention before archiving.");
  }
  if (view === "finalist") {
    instructions.push("Help us find the winners’ circle. Read each poem and choose Champion for a favorite you want to champion, Possible for one worth keeping in consideration, or Pass. You can add a short note with your choice.");
  }
  return {
    subject: `Poetry Please: your ${label} for ${programName}`,
    text: [
      "Hi,",
      "",
      `Your ${label} for ${programName} is ready.`,
      ...(Number.isInteger(addedCount) ? ["", `${addedCount} new read${addedCount === 1 ? "" : "s"} added.`] : []),
      ...(Number.isInteger(remainingCount) ? ["", `You now have ${remainingCount} read${remainingCount === 1 ? "" : "s"} remaining. Completed reads are excluded. Open your queue below to review them.`] : []),
      "",
      ...instructions.flatMap((text) => [text, ""]),
      "Open your review queue:",
      reviewUrl,
      "",
      "Sign in with the Button Poetry email address that received this message. Add any notes before voting so they save with your choice.",
      "",
      "Questions? Reply to this email.",
      "",
      "Button Poetry",
    ].join("\n"),
  };
}

export async function sendAuthorInviteWithMandrill({ apiKey, email, message, tag = "poetry-please-author-invite", fromEmail = "sam@buttonpoetry.com", fromName = "Button Poetry", replyTo = "sam@buttonpoetry.com", trackClicks = false, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("mandrill_key_missing");
  const response = await fetchImpl(MANDRILL_SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      message: {
        from_email: fromEmail,
        from_name: fromName,
        headers: { "Reply-To": replyTo },
        to: [{ email, type: "to" }],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        track_opens: false,
        track_clicks: trackClicks,
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
