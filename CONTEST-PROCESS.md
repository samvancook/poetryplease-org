# Contest process: how it works and why

Updated: November 18, 2026  
Status: working process document. Current behavior and future proposals are deliberately separated.  
Owner: contest administrators; product decisions belong to Sam.  
Development roadmap: [Contest workspace #360](https://github.com/samvancook/poetryplease-org/issues/360).

## Purpose

Run a fair, understandable contest that produces a small winners’ circle, usually five to ten pieces, with an optional single grand winner. Staff should be able to explain why a poem advanced, what remains to be read, and what each action changes. Review effort should help find excellent work rather than add reads without a purpose.

This document starts an end-to-end account of intake, judging, decisions, notifications, graphics, publication, and follow-up. It is a working reference, not evidence that every old feature or integration has just been tested. Keep the current process, intended policy, implementation gaps, and proposed changes distinct.

## Vocabulary

- **Prelims:** the first three independent Yes / Maybe / No responses.
- **Semis:** additional selection reads and quality checks after prelims.
- **Finals:** assigned Champion / Possible / Pass reads of qualifying poems.
- **Finalist:** a poem qualified directly by three preliminary Yes votes, explicitly advanced from Semis, or holding an existing finalist assignment.
- **Shortlist:** currently a saved editorial flag. It is not the same as being in the winners’ circle or being unarchived.
- **Selection candidates:** a current UI view whose membership overlaps the shortlist and qualifying finalist votes. Consolidation is on the roadmap.
- **Winners’ circle:** the final celebrated set. A winner is selected from this set.
- **Archive:** remove from active judging while preserving records and votes; Unarchive restores judging availability.
- **Supplemental read:** a separately preserved late preliminary response; it does not rewrite the first-three vote set.
- **Spot check:** a sample used to evaluate an excluded group and the reliability of the review process. It should not silently become a more generous qualification route.

## End-to-end operating flow

| Stage | Staff task and surface | Result and reason |
|---|---|---|
| Build | Contest Builder: title, opening/closing times, rules/description, banner, and public entrant link. Confirm the intended last day and timezone. | A clearly defined contest that staff can preview before opening. |
| Launch | Check the public form, dates, submission enablement, and banner. Verify the actual entrant experience. | Staff know the advertised rules and the form agree. |
| Intake | Entrants submit through the contest landing page and sign in through the supported account flows. | Their work and private entrant/contact information are saved separately from blinded judging. |
| Entrant access | My Submissions lets entrants find their own work. Contest workspace → Entrants provides staff search and CSV. | Submitters can verify receipt; authorized staff can resolve support questions without exposing identities to judges. |
| Close | End the submission window and confirm the form no longer accepts entries. Reconcile the actual contest total. | Fix the field before judging; do not mistake the generic pending submission status for a judgment outcome. |
| Prelims | Assign work and collect three independent Yes / Maybe / No responses per active poem. | A first screening with visible coverage and unfinished work. |
| Semis | Apply the contest’s recorded qualification and audit rules. | Extra reading has a defined purpose and a traceable next step. |
| Finals | Assign the qualifying set for Champion / Possible / Pass reads. | Fresh editorial judgments identify favorites rather than simply accumulating preliminary votes. |
| Decide | Compare poems and notes, narrow an editorial shortlist, choose the circle, then optionally one winner. | A deliberate final decision with clear distinctions between comparison, shortlist, circle, and winner. |
| Notify | Save templates, preview recipients, test where appropriate, and explicitly send outcomes. | Entrants receive the intended message with the right links and sender/reply settings. |
| Produce | Send selected work along the canonical Poetry Please → Weaver → P.I.G. → Weaver → Poetry Please route. | Graphics return to the correct existing contest/content records without creating an alternate pipeline. |
| Publish | Verify each returned graphic, the contest collection/lane, individual links, mobile/swipe, and embeds before sharing. | Every celebrated piece can actually be opened; a production receipt alone is insufficient. |
| Follow up | Share winner/collection links with authors and the audience; connect to future contests and account notification settings. | The contest leads to an ongoing Poetry Please experience rather than a dead-end email. |

Production details must follow the existing canonical Weaver/P.I.G. integration documentation; this document does not replace its contracts or authorize a new route.

## Roles and visibility

Contest Builder is for setup. Contest Admin/Admin manage contest records, assignments, decisions, and messages. Reviewer access is for judging. The exact permission matrix must remain documented alongside implementation; do not assume general Team or Builder access implies every administrative permission.

Judging is intended to hide entrant identity, contact information, and social metrics. Private records and exports belong in the authorized Entrants surface. A future audit-blinding decision must also address whether reviewers can see previous votes or infer the source cohort from a label or email.

## Current judging behavior — November 2026

### Prelims and assignments

Each active poem needs three preliminary responses. Assignments are advisory queues rather than reserved vote slots: an eligible staff reader can fill a slot before an assigned person reaches it. Coverage must distinguish unfinished reads from assignments made unavailable by other completed reads. Late responses may be retained as supplemental reads rather than changing the first-three results. A truly simultaneous vote collision remains a separate roadmap item.

An assignment preview shows the proposed count and reviewer split. Finalist assignments support one to three independent finalist readers per poem, filling the requested total coverage rather than giving every listed person the whole field. Previously participating readers are skipped; the preview identifies insufficient independent-reader coverage. Assignment emails are sent through the existing Mandrill flow with queue links and instructions, and now distinguish newly added reads from remaining work.

### Current qualification rules

- Three preliminary Yes votes qualify directly for Finals. A later extra No or Maybe must not undo that qualification.
- Exactly two preliminary Yes votes enter the full-group 2-Yes check. Eligible extra reads are divided among the listed reviewers.
- Three preliminary No votes may enter a distinct random 10% sample per listed reviewer, rounded up. The current sample plans avoid overlap and previously assigned/checked poems.
- In these Semis checks, one new Yes currently makes a poem ready to advance. A Maybe requests another eye; two Maybes call for an editor; a No closes the check.
- Ready-to-advance Semis poems join the saved shortlist when the administrator advances them.
- Other one-Yes and mixed no-Yes combinations do not have a complete, uniform second-chance process. This is a policy gap, not an implied rejection rule.

The user has explicitly rejected the current one-positive-read rescue policy as the durable design. Keep it documented as current behavior until a replacement is agreed and implemented; do not silently change this contest or reverse its saved decisions.

### Finals and outcome controls

Finalist reviewers choose Champion, Possible, or Pass and may save private notes with the choice. The admin chart exposes reviewer progress, finalist votes, and finalist-only filters. Open / Previous / Next / Back browses the filtered result set without casting votes.

The current 2+ Passes filter can include a pending read or a different third vote, including Champion. The stricter 3 Passes filter requires at least three completed finalist reads, all Pass, with no pending read. The existing three-Pass bulk archive protects winner/circle entries. Stronger action-time Champion protection and possible two-Pass bulk archiving are roadmap work.

Archive, remove from shortlist, remove from compare, and remove from circle are different actions today. Clearing the shortlist flag does not cancel assignments or delete votes, and independent candidate criteria can keep the poem visible. Finalist and Selection candidate panels overlap; their intended relationship and names need resolution.

Selecting/advancing poems and saving outcomes do not themselves send contestant emails. Keep decision actions separate from explicit notification sends.

## What happened in the previous contest

A read-only check of Fall 2026 records on November 18 found 72 poems with two or three preliminary Yes votes received finalist assignments, each with three completed Champion / Possible / Pass reads: 216 total. No one-Yes poems in that contest received finalist reads.

The present Finals source dropdown still exposes legacy groups, including exactly one initial Yes. Its existence does not establish that the option was used. Removing that dropdown in favor of the actual qualifying set is on the roadmap.

## Proposed flatter qualification system — latest discussion, not approved

### Binary qualification reads

The latest user proposal (November 18) gives stronger preliminary support more opportunities, rather than applying a uniform total-Yes threshold. Consider removing Maybe from **prelims and qualification reads**, leaving Yes / No. This is a discussion proposal; the live tool still offers Maybe.

| Preliminary Yes count (three readers) | Proposed opportunity | Route to Finals |
|---|---|---|
| 3 | No qualification reread | Direct qualification. |
| 2 | Up to two new independent readers | Either fresh Yes qualifies the poem. Stop once it qualifies; if the first fresh read is No, offer the second shot. Two fresh Nos close this route. |
| 1 | One new independent reader | A fresh Yes qualifies the poem. A fresh No closes this route. |
| 0 | Random quality-audit sample | First positive signal starts independent confirmation, not automatic qualification. Rescue threshold remains undecided. |

A one-Yes poem can qualify with two total Yes votes; a two-Yes poem needs at least three total Yes votes but gets two chances to find the extra support. This is intentional unequal opportunity based on preliminary strength, not an identical numerical support threshold. Review and explicitly approve that tradeoff before implementing it.

All poems already have three prelim reads. The fresh qualification reads above are fourth or later reads, not a missing third prelim read.

If the two-Yes route is assigned sequentially, stop after its first Yes to save work. Decide whether faster parallel assignment is worth a possibly unnecessary second read. Do not count the same person twice, disclose previous votes, or keep adding readers until a poem eventually qualifies.

### What dropping Maybe resolves

A binary first-stage question should be explicit: “Should this poem receive finalist consideration?” Yes does not mean winner or Champion. Removing Maybe gives four preliminary groups and definite qualification outcomes, rather than an expanding set of Maybe/Maybe/editor branches.

Keep **Possible in Finals** as a separate consideration: it can mean worth retaining, but not a personal Champion. Removing preliminary Maybe does not imply removing finalist Possible.

Decide what to do with existing Maybe records if a policy is ever changed mid-contest. Preferred rollout is the next contest with a versioned rule; never silently recode historical Maybe votes.

### No-Yes audits and confirmation

Under binary prelims, every one-Yes poem already has two Nos and receives its defined fresh read. A zero-Yes poem has three Nos and is sampled to test the screening process, not to give it a more generous advancement route.

If Maybe remains available, include mixed no-Yes groups too: three No, two No plus Maybe, one No plus two Maybe, and three Maybe. Track strata separately and define how they enter qualification. Do not keep auditing only unanimous Nos while overlooking uncertain exclusions.

A candidate rule for discussion is requiring **two fresh independent Yes votes** to rescue a sampled zero-Yes poem. The first Yes would request the confirmation read. This is not approved; compare it against the one-Yes route and expected reader workload before settling it. Earlier proposals allowing Yes/Maybe confirmations and a three-total-Yes threshold are alternatives, not additional rules to combine.

Audit reviewers should be independent of previous readers. Consider hiding previous decisions, reviewer names, scores, and cohort labels, with neutral assignment emails. Administrators retain cohort and audit visibility.

A positive audit signal measures screening disagreement; it is not automatically a finalist or evidence that reviewers behaved badly.

### Mandatory expansion triggers

Set thresholds before a contest opens. Record distinct sampled poems, completed sample reads, first positive signals, confirmed rescues, and the initial result stratum. Distinguish first signals from repeated reads of the same poem. If Maybe stays, report it separately from Yes.

When a declared positive-signal threshold is reached, require another fresh non-overlapping sample and independent readers before declaring the excluded field settled. If disagreement persists, escalate to a larger or full reread of the affected stratum and editorial review of the process. Decide actual counts/rates, minimum sample size, expansion steps, and stopping criteria with the user; none are approved yet.

Do not interpret a small clean sample as proof that every promising excluded poem was found. Compare the benefit of more reading against the time it takes.

## Proposed Finals reset and final selection

Once a poem qualifies, judge it afresh on the same Champion / Possible / Pass scale as the other finalists. Do not carry an accumulated prelim score into the primary finalist ranking.

The user wants preliminary support available as a visual tie-breaker. Suggested presentation: keep it collapsed or hidden during independent voting, then show the prelim pattern and qualification route during editorial comparison if needed. Confirm that visibility rule before building it.

Choose the finalist reader count, a shared rubric, and a consistent assignment policy. Surface Champion support clearly, including multiple Champions. Decide whether every finalist needs the same completed coverage before final comparison. A Champion-backed poem should not be swept into a Pass-based bulk archive; explicit action-time protection is on the roadmap.

Build the circle from the comparison, then pick a winner if desired. A chosen winner should remain in the circle. Keep graphics-ready publication metadata distinct from draft judging outcomes.

## Notification, production, and wrap-up checks

- Outcome emails: preview the real recipient set and saved template, verify sender and monitored reply address, test links, and show sent/failed/pending state. Decisions do not imply delivery.
- Rejections: a future template should link to the winners when that collection is ready; avoid a link that is not public yet.
- Winners: collect/verify display names, attribution, Instagram handles, and any production details needed without exposing them to blind judging.
- Graphics: use the existing canonical route and stable IDs. Reconcile every selected poem to its returned graphic and contest lane, not just a grand winner.
- Public experience: verify winner/circle links, downloads where offered, mobile/swipe, embeds, and a route into Poetry Please and the next contest.
- Closeout: reconcile final entrants, read coverage, saved decisions, notifications, graphic/public-link completeness, and unresolved support or delivery items. Retain decision and assignment history.

## Decisions still needed before the next redesign

1. Approve or revise the latest 3-Yes direct / 2-Yes two shots / 1-Yes one shot proposal.
2. Decide whether to remove Maybe from prelims and qualification reads while retaining finalist Possible.
3. Decide sequential versus parallel two-shot allocation, zero-Yes rescue support, and any editor-override/stopping rules.
4. Approve no-Yes audit strata, sample sizes, mandatory expansion triggers, and reviewer blinding.
5. Approve Finals coverage and when preliminary tie-break information becomes visible.
6. Resolve shortlist/candidate/finalist/archive states and consolidate overlapping panels.
7. Define action-time Champion protection and two-Pass archive eligibility.
8. Publish a short staff guide from the approved policy, with examples and one status diagram.

## Maintaining this document

For each substantive change, record: policy and rationale; affected contests; current versus proposed status; examples of who qualifies or stops; UI/actions and permissions; assignment/email behavior; verification evidence; and preservation/migration requirements.

Before coding, update the relevant rule here and get the product decision settled. After delivery, move that rule into Current behavior with its date. Preserve historical contest policies rather than silently applying a new rule retroactively.
