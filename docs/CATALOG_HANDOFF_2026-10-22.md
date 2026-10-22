# Catalog handoff execution — October 22, 2026

## Completed data work

- **123 spacing-only FP updates**: A Socially Acceptable Breakdown (37), Afterwards (30), Keep This To Yourself (15), The Future (41). Each book's post-run dry run returned zero updates. The new hash-bound `preserveReviews` option retained every vote, flag and repair state.
- **Roads / Living at Baggage Claim / Tooth Gaps in the Archives**: 22 full-poem retitles; 39 text updates (37 LABC, two TGIT); 57 reversible retirements; 316 verified poem-key assignments; 71 other title corrections; five trailing-markup fixes. These actions overlap: they changed exactly **400 distinct existing records**.
- Together the two batches changed **523 content records**, exactly matching the reviewed plans. No content record was created or deleted. Graphic asset URLs and original content identities were retained.
- Resolved **25 specific flags**: 13 source-text flags and 12 proof-bound retirement, duplicate-title or trailing-markup flags. Closed one source-only TGIT repair, preserving its request identity. Fourteen prior author vote records were superseded for corrected semantic text; their history remains. Other votes were unchanged.
- Design/attribution notes, three Roads epigraph notes and LABC's unresolved strikethrough request remain pending. The 88 explicitly human-review rows (38 wording, 47 graphics, three unmatched) remain in the review queue. Metadata may have been corrected on those rows; their passages/assets were not automatically rewritten/recreated.

## Held spacing work — do not broaden the batch

The 33-book handoff lists 572 changed Catalog keys. The initial book-wide PP dry runs proposed **1,017 updates**, including **510 keys outside that list**, while 65 requested keys were not planned. These counts are diagnostics and overlap with other holds; they are not an approved expanded batch.

Only four books / 123 changes passed both exact-key and blank-line-only checks. **29 books / 449 requested keys remain held**, per the handoff's stop conditions. Details are in `spacing-execution-audit.json` in the private receipt bundle.

Important additional evidence:

- Cottonmouth's 39 keys matched, but 24 PP replacements differed beyond blank lines. For example, the Catalog replacement for *2013* adds `2013` to the poem body. Hold the whole book rather than silently treat this as spacing-only.
- Requesting *The Future: Limited Edition* resolves to *The Future* in PP's current book lookup. Its 42-key handoff must not be applied through that alias.
- Other books have extra planned text changes, unmatched titles or repeated-title ambiguity. Do not pick a duplicate by position, create missing poems, or globally remove blank lines.

## Existing route and safeguards

Use `POST /api/internal/catalogFullPoemSync` with `updateExisting:true`, `addMissing:false`, a fresh dry run and its exact `planHash`.

- `preserveReviews:true`: source spacing changes without changing review state.
- `resolveFlagIds:[...]`: close only selected source flags for semantic corrections. Author-review reopening and source-only repair closure retain their existing behavior.
- Review options are part of the plan hash. The default semantic correction policy remains available to existing callers.
- `catalogRetired:true` excludes retired items from feeds and canonical reading. The normal importer rejects writes to an existing retired identity, and source sync skips/rejects it. No record was deleted. A later, distinct-ID import and automatic Catalog retirement propagation still need a separate identity audit.
- TGIT key `BPP-00155` (*Political Theatre*) is a source-verified exception to Catalog's automatic essay classification. Other auto-classified essays remain excluded.
- A live reading check found a legacy FP/FPI shared `imageId`. Canonical text reading selects the single FP only when FP/FPI versions have the same nonempty poem key, author and book. Other conflicts remain ambiguous; no FPI asset or identity is removed. Broader legacy FP/FPI ID cleanup is deferred.

## Verification and rollback

Independent Firestore readback checked all 440 handoff rows and the saved baseline. Exactly 523 intended content records changed, with zero unexpected content paths and zero verification errors. All 3,032 backed-up vote records remained; only the 14 expected author-vote states changed. Protected flags stayed pending. Seventy-four focused tests cover source eligibility, review preservation, canonical read collision safety, ranking and pagination compatibility.

Local private receipts: `/tmp/pp-handoff-20261022/`. The initial snapshot contains 1,416 content and 3,137 related review records. The post-retitle semantic-sync snapshot contains 39 FPs and 319 related review records. The shared Product Roadmap records the private archive link and final live readback/deployment receipts. No raw vote history or care flags belong in the public repository.

Undo is deliberately explicit and guarded: `node functions/backfill_catalog_handoff.js --undo <file> --apply`. It refuses changed fields. Reverse stages in this order if rollback is authorized:

1. `flags-undo.json`
2. `metadata-undo.json`
3. `retire-undo.json`
4. `source-undo.json`
5. `retitle-undo.json`
6. `spacing-undo.json`

Do not run undo as a verification test. The helper refreshes content/scoreboard generations and invalidates ratings when restoring vote state.

## Remaining work

- **Missing existing FPs**: LABC has five Catalog poems without PP records; TGIT has 16. `addMissing:false` prevented creation. This pass does not fill those coverage gaps.
- **Automatic Catalog following by key**: plan the durable change/retirement intake and reviewed key-based matching. This one-time reconciliation is not an unattended follower.
- **Themes beta**: public Catalog contracts verified: 30 themes, provisional status, three ranked themes per keyed poem. No protected care-flag endpoint was requested and no themes were copied into PP records. UI/filter implementation awaits the targeted file-scope approval; desktop only for the filter, with Swipe staying filter-free. Performance-only key coverage remains a later bounded matching pass with ambiguous performer/title pairs held for review.

## Source handoffs

- [33-book spacing handoff](https://docs.google.com/document/d/1Gx5aNqKBbjUu4O1y7MQ-PHTpBCn4hiIeJ-DsIEzHqEg/edit)
- [Roads / LABC / TGIT handoff](https://docs.google.com/document/d/1RGKNd3Tx4ZfasQT944Ug-Q9OxhC1PHYxW5_N2m-8NAc/edit)
- [Themes beta handoff](https://docs.google.com/document/d/1ch-xpvk2Wb37jE4o51YE_5YDJupwZTBlQ3q2qPa5O9k/edit)
- Code: PP PRs #264 and #265; guarded undo completion, canonical reading fix and execution record follow in this release.
