const MANDRILL_SEND_URL = "https://mandrillapp.com/api/1.0/messages/send";

// Author mail comes from Sam; a reply goes to both Sam and the support inbox.
export const AUTHOR_MAIL_IDENTITY = Object.freeze({
  fromEmail: "sam@buttonpoetry.com",
  fromName: "Button Poetry",
  replyTo: "sam@buttonpoetry.com, support@buttonpoetry.com",
});

const AUTHOR_INVITE_TEST_COOLDOWN_MS = 60 * 1000;

// The Sam-only test invite can be re-sent, but not twice within a minute (double clicks, retries).
export function authorInviteTestCanResend(status, lastAttemptMs, nowMs) {
  if (!["sending", "sent", "uncertain"].includes(status)) return true;
  return nowMs - (Number(lastAttemptMs) || 0) >= AUTHOR_INVITE_TEST_COOLDOWN_MS;
}

// Today's vote button names. If the top button is renamed (Love vs Moved Me is undecided), change it here.
export const AUTHOR_VOTE_LABELS = Object.freeze({ top: "Moved Me", like: "Like", meh: "Meh", dislike: "Dislike" });

export function buildAuthorInviteMessage({ name, email, inviteUrl, expiresAt, bookTitle = "", helpUrl = "", testOnly = false, intendedFor = "" }) {
  if (!testOnly && (!bookTitle || !helpUrl)) throw new Error("author_invite_book_and_help_required");
  const labels = AUTHOR_VOTE_LABELS;
  const book = bookTitle || "your book";
  const subject = `${testOnly ? "[TEST] " : ""}Help choose how we share ${book}`;
  const text = [
    name ? `Hi ${name},` : "Hello,",
    "",
    ...(testOnly ? [
      `This is a test of the author invitation${intendedFor ? `, exactly as ${intendedFor} would get it` : ""}. Its link can't set up an author account.`,
      "",
    ] : []),
    `We've built a tool called Poetry Please. In it you can see the quote graphics, photos and excerpts our team has made from ${book}, and tell us which ones you want us to use. Your votes count more than anyone else's. They shape what we post, promote and make next.`,
    "",
    "It takes a few minutes, and you don't have to get through everything.",
    "",
    "Start with the quote images and interior photos. For each one, choose:",
    `- ${labels.top}: a favorite. We'll feature it more, in more places.`,
    `- ${labels.like}: you're happy for us to use it.`,
    `- ${labels.meh}: no strong feeling either way.`,
    `- ${labels.dislike}: please don't use it. Our team will see that.`,
    "",
    "Then, if you have time, do the same for excerpts from the book.",
    "",
    "Open your private invitation:",
    inviteUrl,
    "",
    `Sign in with this email address (${email}). If you're already signed in to Google with a different account, sign out first. The link works until ${expiresAt}. Please don't forward it.`,
    "",
    ...(helpUrl ? ["Your book's help page has a short walkthrough and a preview:", helpUrl, ""] : []),
    "Something look wrong, like an early draft of a poem or formatting you'd change? Reply with the title and a note, and we'll fix or remake it. Replies come to Sam and to our support team.",
    "",
    "Thank you,",
    "Sam",
    "Button Poetry",
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

export async function sendAuthorInviteWithMandrill({ apiKey, email, message, tag = "poetry-please-author-invite", fromEmail = AUTHOR_MAIL_IDENTITY.fromEmail, fromName = AUTHOR_MAIL_IDENTITY.fromName, replyTo = AUTHOR_MAIL_IDENTITY.replyTo, trackClicks = false, fetchImpl = fetch }) {
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
