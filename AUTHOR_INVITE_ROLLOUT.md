# Author invitation rollout — week of September 28, 2026

Goal: prepare a one-time, personalized invitation batch for the four Fall 2026 authors who have not yet claimed Poetry Please accounts. This is preparation; no invites or emails have been created or sent for that batch.

## Existing path and limits

- Admin can generate an email-specific, expiring secure author invite. For this one-time batch, the connected Gmail account can send each unique link from `sam@buttonpoetry.com` with `Reply-To: sam@buttonpoetry.com`; this is not a new in-app mail service. The link must go only to its intended recipient.
- The invite is intended to be claimed while signed in with the invited email. Do not promise that another address will work.
- Sam confirmed on September 28 that `support@buttonpoetry.com` is monitored. Use it as the author-facing help address; the individual staff member managing that inbox need not be named in the invitation.
- Sam confirmed that PAGES Matam and Kyle Tran Mhyre have logged in, set up accounts, and reviewed content. Ollie Schminkey may have done so, but is not yet confirmed. These are evidence that the author experience is usable, not proof that this week's invite email and claim-link delivery have been tested.
- Do not describe invitation generation as automatic email delivery or claim that Poetry Please tracks Gmail delivery. Check each Gmail send result and the Sent folder; do not resend to an author with a claimed or active invite.
- Do not add a new mail provider, auth scope, or deployment workflow for this week's pilot.

## Send gate

1. Confirmed: `support@buttonpoetry.com` is monitored. For this batch, Sam is the intended Reply-To and will personally answer replies; support remains the backup help route.
2. Confirm the exact four-person Fall 2026 roster and each current address from direct correspondence; exclude PAGES Matam because that invite is claimed. Do not put addresses or secure invite links in this repository.
3. Generate one unique link per approved recipient, verify the intended email and expiration, and send one personalized message at a time from Sam's connected Gmail account with Sam as Reply-To. Log Gmail send IDs privately and stop on any failure instead of blindly continuing.
4. Check the first message's delivery and reply path before sending the other three. PAGES Matam and Kyle Tran Myhre have already used their author accounts to review content; do not make them repeat onboarding solely for this check.
5. Verify author claim and support follow-through after sending. The dashboard currently shows no invite for the four candidate authors; recheck immediately before each send to avoid duplicates.

## Invitation copy (personalize before sending)

**Subject:** Your invitation to Poetry Please

Hi [first name],

This is an automated invitation from me to Poetry Please, Button Poetry’s space for discovering and sharing poetry. We’ve gathered work associated with you and would love you to look it over, help us correct anything that’s off, and shape how your author page appears.

To get started, open your personal invitation: [unique secure invite link]

Please sign in with **[invited email address]**. This link is for that address and expires on **[date]**. If any work is missing or incorrectly attributed, you can tell us after signing in—we’ll review corrections before changing the public catalog.

Just reply to this email with any questions. Replies come directly to me, and I’ll personally get back to you. You can also reach our team at **support@buttonpoetry.com**.

Thanks,
Sam Van Cook
Button Poetry

## Short follow-up after a successful pilot

**Subject:** A quick reminder about your Poetry Please invitation

Hi [first name],

Just a reminder that your Poetry Please invitation expires on [date]: [same still-valid personal link]. Please use [invited email address] to sign in. If you have a question or spot an issue with your work, email support@buttonpoetry.com and we’ll help.

Thanks,
[named sender]

## Decisions still needed

- Sam is the proposed sender and reply recipient; confirm the four-person roster and message before creating links or sending.
- Decide whether to send all four in one controlled run or stage the first message as a delivery/reply check.
- Sender identity, exact expiration, and whether the email should mention any profile features beyond review/corrections after the end-to-end test.
