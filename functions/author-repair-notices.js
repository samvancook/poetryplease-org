import { createHash } from "node:crypto";
import { buildAuthorRepairMessage } from "./author-invite-mail.js";

const clean = (value) => String(value || "").normalize("NFKC").trim();
const key = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const timestamp = (value) => value?.toMillis?.() || (value?._seconds || value?.seconds || 0) * 1000
  || Date.parse(String(value || "")) || 0;

export function buildAuthorRepairNoticePlan({ requestId, request, content, profiles, users, votes }) {
  if (request.status !== "resolved" || request.returnReviewStatus !== "accepted" || !request.replacementActivated) {
    throw new Error("repair_not_accepted");
  }
  if (!['QI', 'INT', 'EXC'].includes(clean(content.imageType || request.contentType).toUpperCase())) {
    throw new Error("item_not_in_author_review");
  }
  const asset = clean(request.replacementAssetLink);
  if (!asset || content.activeRepairRequestId !== requestId || clean(content.imageUrl || content.driveLink) !== asset) {
    throw new Error("repair_replacement_superseded");
  }
  const acceptedAt = timestamp(request.authorVotingReopenedAt || request.replacementActivatedAt || request.returnReviewedAt);
  if (!acceptedAt) throw new Error("repair_acceptance_time_missing");
  const author = key(content.author || request.author);
  if (!author) throw new Error("author_recipient_not_verified");
  const recipients = users.filter((user) => (user.roles || []).includes("author") && user.status !== "disabled")
    .flatMap((user) => profiles.filter((profile) =>
      (profile.id === user.authorProfileId || profile.userId === user.id)
      && [profile.displayName, profile.name, ...(profile.authorNameVariants || [])].some((name) => key(name) === author)
      && (!profile.email || key(profile.email) === key(user.email))
    ).map((profile) => ({ userId: user.id, email: key(user.email), name: clean(profile.displayName || profile.name) })))
    .filter((recipient) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient.email));
  const unique = [...new Map(recipients.map((recipient) => [recipient.userId, recipient])).values()];
  if (unique.length !== 1) throw new Error(unique.length ? "author_recipient_ambiguous" : "author_recipient_not_verified");
  const recipient = unique[0];
  const ownVotes = votes.filter((vote) => [key(recipient.userId), recipient.email].includes(key(vote.userId)));
  if (ownVotes.some((vote) => !vote.supersededAt)) throw new Error("author_has_active_vote");
  const imageId = clean(request.imageId);
  if (!imageId) throw new Error("repair_content_id_missing");
  const revision = hash([requestId, imageId, asset, acceptedAt]);
  const reviewUrl = `https://poetryplease.org/app?item=${encodeURIComponent(imageId)}`;
  const message = buildAuthorRepairMessage({ name: recipient.name.split(/\s+/)[0],
    title: clean(content.title || request.acceptedCorrectedTitle || request.title),
    book: clean(content.book || request.book), reviewUrl,
    hadEarlierVote: ownVotes.some((vote) => vote.supersededByRepairRequestId === requestId),
  });
  return { revision, imageId, recipient, message, reviewUrl, previewHash: hash([revision, recipient, message]) };
}

export function repairNoticeDeliveryKey(plan, testOnly) {
  return hash([plan.revision, testOnly ? "test" : plan.recipient.email]).slice(0, 32);
}

export function repairNoticeCanReserve(delivery) {
  return !delivery || !["sending", "sent", "uncertain"].includes(delivery.status);
}
