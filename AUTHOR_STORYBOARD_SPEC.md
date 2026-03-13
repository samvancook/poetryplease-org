# Author Storyboard Spec

This document defines the first version of the author account, claim, upload, and profile system for Poetry Please.

The goal is to let invited authors manage how their work appears in the product, while also allowing any registered user to submit content for review.

## Goals

- Support invite-based author onboarding.
- Let authors claim existing content associated with them.
- Let registered users upload new content through the product.
- Hold all new uploads for review at first.
- Give authors profile pages with links, bio, and featured content.
- Allow authors to hand-pick featured content.
- If an author has not hand-picked featured content, automatically fall back to top-rated content.
- Preserve the current anonymous browsing and voting experience.
- Avoid changing the old app unless explicitly approved.

## Non-Goals For Phase 1

- Open self-serve author applications.
- Immediate self-publishing by authors.
- Multi-author organizations or imprint accounts.
- Bulk CSV import tools.
- Complex permissions beyond `user`, `author`, and `admin`.

## Product Rules

### Accounts

- Any visitor can browse and vote anonymously.
- Any visitor can create a normal registered account.
- Invited creators can become author accounts.
- Admins and reviewers are managed internally.

### Author onboarding

- Authors are invited by special links.
- Each invite is tied to an email address.
- A valid invite upgrades a signed-in account to `author`.
- If the signed-in email does not match the invite email, the invite should fail with a clear message.

### Claiming content

- Authors can request claims on content that appears to belong to them.
- Claims should be reviewed unless the system can confidently auto-approve based on invite email and existing metadata rules that you trust.
- Claimed content links to the author profile.

### Uploads

- Any registered user can submit new content.
- Upload happens in a modal or pop-out workflow.
- All submitted content enters a review queue.
- No new content goes live until approved.

### Author profile

- Author profiles contain biographical and promotional metadata.
- Profiles can include external links and content highlights.
- Featured content is author-curated first.
- If there is no hand-picked featured content, the profile falls back to top-rated content by that author.

## Roles

### `user`

- Can register and log in.
- Can vote.
- Can upload content for review.
- Can manage their own basic account data.

### `author`

- Includes all `user` capabilities.
- Can manage an author profile.
- Can request claims on content.
- Can pick featured content from approved/claimed content.
- Can set preferred outbound links and social links for their profile.

### `admin`

- Can create invite links.
- Can approve or reject claims.
- Can approve or reject uploads.
- Can edit author profiles and content metadata.
- Can manage roles.

## Firestore Model

This spec keeps workflow data separate from live content as much as possible.

### `users/{uid}`

Purpose: primary account document

Suggested fields:

- `email`
- `displayName`
- `roles`: array of strings, example `["user"]` or `["user", "author"]`
- `createdAt`
- `lastLoginAt`
- `authorProfileId`: nullable string
- `status`: `active` | `disabled`

### `authorProfiles/{authorProfileId}`

Purpose: public and editable author profile

Suggested fields:

- `userId`
- `email`
- `displayName`
- `slug`
- `bio`
- `shortBio`
- `photoUrl`
- `websiteUrl`
- `instagramUrl`
- `tiktokUrl`
- `youtubeUrl`
- `newsletterUrl`
- `bookstoreUrl`
- `customLinks`: array of `{ label, url }`
- `featuredContentIds`: array of content IDs in display order
- `fallbackMode`: `"topRated"`
- `claimStatusSummary`
- `createdAt`
- `updatedAt`
- `published`: boolean

### `authorInvites/{inviteId}`

Purpose: invite-only author onboarding

Suggested fields:

- `email`
- `createdBy`
- `createdAt`
- `expiresAt`
- `claimedAt`
- `claimedByUserId`
- `status`: `active` | `claimed` | `expired` | `revoked`
- `tokenHash`

Notes:

- Do not store raw invite tokens.
- Email should be matched case-insensitively.

### `contentClaims/{claimId}`

Purpose: claim workflow for existing content

Suggested fields:

- `contentId`
- `contentCollection`: `graphics` | `excerpts` | `videos`
- `requestedByUserId`
- `requestedByEmail`
- `authorProfileId`
- `status`: `pending` | `approved` | `rejected`
- `reason`
- `reviewedBy`
- `reviewedAt`
- `createdAt`

### `contentSubmissions/{submissionId}`

Purpose: review queue for uploaded content

Suggested fields:

- `submittedByUserId`
- `submittedByEmail`
- `status`: `pending` | `approved` | `rejected`
- `contentType`
- `author`
- `title`
- `book`
- `bookLink`
- `releaseCatalog`
- `imageType`
- `excerpt`
- `mediaUploadUrl`
- `thumbnailUrl`
- `externalMediaUrl`
- `sourceNotes`
- `socialLinks`
- `reviewNotes`
- `reviewedBy`
- `reviewedAt`
- `approvedContentId`
- `approvedCollection`
- `createdAt`
- `updatedAt`

### Live content collections

Existing:

- `graphics`
- `excerpts`
- `videos`

Suggested new optional fields on approved/live content:

- `authorProfileId`
- `claimedByUserId`
- `claimStatus`
- `preferredExternalUrl`
- `preferredSocialLinks`
- `featuredWeight`
- `submittedFromSubmissionId`

These should be added cautiously and only when needed for the live experience.

## Invite Link Flow

### Admin flow

1. Admin creates an invite for a target email.
2. System creates `authorInvites/{inviteId}` with a secure token hash.
3. System generates a special invite URL.
4. Admin sends the link manually.

### Author flow

1. Author opens invite link.
2. If not signed in, they are prompted to create an account or log in.
3. After sign-in, system verifies invite token and email match.
4. System adds the `author` role to the user.
5. System creates an `authorProfiles` document if one does not exist.
6. Invite is marked as claimed.

### Edge cases

- Expired invite
- Revoked invite
- Signed-in email mismatch
- Invite already claimed

## Claim Flow

### Author flow

1. Logged-in author views content.
2. They choose `Claim this content`.
3. System creates a `contentClaims` document.
4. Content remains unchanged until reviewed unless auto-approval rules apply.

### Admin flow

1. Admin sees pending claims in a review queue.
2. Admin approves or rejects.
3. On approval, content is linked to the relevant `authorProfileId`.

## Upload Flow

### User flow

1. Logged-in user opens upload modal.
2. User selects content type and uploads or links media.
3. User fills required metadata fields.
4. User submits.
5. System creates a `contentSubmissions` document with `pending` status.
6. User sees confirmation that the content is awaiting review.

### Admin review flow

1. Admin opens submissions queue.
2. Admin reviews metadata and media.
3. Admin can edit metadata before approval.
4. On approval, system writes a new record to the appropriate live collection.
5. Submission is marked approved and linked to the new content ID.

## Profile Page Rules

### Public profile route

Suggested route:

- `/author/:slug`

### Profile sections

- name
- photo
- short bio
- extended bio
- social links
- website / store / newsletter links
- featured content
- all claimed content

### Featured content logic

1. If `featuredContentIds` is non-empty, show those items in saved order.
2. If `featuredContentIds` is empty, compute fallback content:
   - use claimed/approved content for that author
   - sort by rating first
   - use vote total as a secondary tie-breaker

This matches the agreed product rule:

- hand-picked first
- top-rated fallback if nothing has been hand-picked

## UI Surfaces

### New account/profile surfaces

- author invite acceptance screen
- author profile editor
- author public profile page
- claim action on content
- upload modal
- submission confirmation state
- admin moderation queues for claims and uploads

### Existing app integration

- content associated with an author profile can show richer author info
- author links can route to the new author profile page
- existing "more from this author" behavior should remain compatible

## Permissions Model

Frontend should never be the source of truth for roles.

Suggested enforcement:

- role checks in Firestore security rules
- moderation actions verified server-side
- invite redemption handled server-side or in a callable/HTTP function

## First Build Order

### Phase 1

- user role model
- author invite links
- author profile document creation
- basic author profile editor

### Phase 2

- content claim requests
- admin claim review queue
- approved claim display on content/profile

### Phase 3

- upload modal for registered users
- submissions queue
- admin approval flow into live content collections

### Phase 4

- author profile public page
- hand-picked featured content editor
- top-rated fallback logic

## Recommended Technical Shape

- Keep current voting/content browsing intact.
- Add new functions/endpoints for invite redemption, profile updates, claims, and submissions.
- Add new UI routes/pages rather than overloading the current voting page too heavily.
- Reuse current rating summary logic for the profile fallback content ranking.

## Open Decisions To Confirm Before Build

1. Should invite links expire after a set number of days?
   Recommendation: yes.

2. Should authors be able to edit live metadata on claimed content directly, or should those edits also go through review?
   Recommendation: review first.

3. Should uploaded content support both direct file upload and external media links in phase 1?
   Recommendation: yes, if the UI can clearly distinguish them.

4. Should profile pages be public immediately once an author has a profile, or only after publish is toggled on?
   Recommendation: require publish toggle.

5. Should claims be limited to invited authors only in phase 1?
   Recommendation: yes.

## Summary

This system starts with controlled author onboarding, keeps moderation in place, allows broader content submission, and gives authors meaningful profile ownership without risking the integrity of the live catalog.

It is intentionally structured so that:

- invited authors can be rolled out carefully
- uploads can grow over time
- author profiles can become richer later
- featured content stays curator-led, with top-rated fallback
