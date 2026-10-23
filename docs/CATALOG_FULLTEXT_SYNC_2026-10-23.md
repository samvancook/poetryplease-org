# Poetry Please — Catalog full-text sync, October 23, 2026

## Result

Executed the verified portion of Claude’s 46-book handoff using the existing `POST /api/internal/catalogFullPoemSync` route. This data pass used the existing route; the subsequent code safeguards below use the existing GitHub Actions deployment workflow.

- **510 existing FPs updated across 17 books.** Every apply used `updateExisting:true`, `addMissing:false`, `preserveReviews:true` and its exact dry-run plan hash.
- **Three books already current:** Smudge; St. Trigger; When the Ghosts Come Ashore.
- **26 books held**, as the handoff requires when matching is uncertain, records are missing, or Catalog lookup fails.
- Each applied book’s post-run dry run returned zero updates, zero unmatched entries and zero missing FPs.
- Independent Firestore readback: all 510 texts and keys matched the saved live Catalog source; no unexpected content-field changes. All 135 backed-up vote records were unchanged. There were no linked flags or repair requests on these 510 records. No votes reopened, no flags/repairs closed, no content created/deleted, no graphic asset changes.
- Public readback: ten poems across ten books matched Catalog text and permanent keys.
- BLACK BOX FLIGHT RECORDER and Worm Girl are outside this batch and were not changed. What I Learned from the Trees remains excluded pending its edition decision.

Source handoff: https://docs.google.com/document/d/179vUGYnFkiMDg9EdMpbCZhG53PYT8UVSpWKlekIo00Q/edit

## Findings for Catalog / next PP work

1. **194 unmatched/ambiguous existing PP FPs are all unkeyed.** The attached CSV gives exact book, existing PP ID, title, stored book label and reason. These require source-backed mappings; switching the planner to key-first cannot resolve rows without keys. Do not infer by position or create replacement records. Pink Elephant accounts for 90 of these rows and an everyday occurrence for 36; repeated or legacy copies need explicit disposition.
2. **The Future edition problem is deeper than an alias.** PP has 43 FPs labeled with shortener TFLE but stored book `The Future`; 41 keys belong to the original Catalog edition and two are unkeyed. None of those 41 keys belongs to Limited Edition. Catalog’s original edition has 43 records; Limited Edition has 48, with no shared permanent keys. The Limited Edition manifest matches its live 48-key set. A blanket TFLE rename/repoint risks treating original text as another edition. Leave these records untouched until an explicit edition mapping is approved; no new poems were authorized.
3. **DON’T BE AFRAID TO BE BAD:** the current PP-resolved Catalog book request returns HTTP 409 (`catalog_poems_409`). Hold the book and resolve the authoritative lookup; do not guess an alias.
4. **A Choir of Honest Killers:** two missing existing FPs plus two unmatched entries. No creations made.
5. Cottonmouth’s current source passed the revised full-text scope. Its 39 planned existing-FP updates were applied and independently verified. This replaces the earlier spacing-only hold for that verified book.

A durable Catalog-to-PP change intake, key-first matching for future keyed retitles, explicit retirements, and author-review policy for future semantic updates remain separate planned work. This batch deliberately preserved reviews as directed. The targeted file scope was subsequently approved. The bounded safeguards below are implemented; the held records remain untouched.

## Book outcomes

| Book | Outcome | Applied updates / hold reason |
|---|---|---|
| BUTCHER | Updated | 27 |
| Born in a Second Language | Updated | 20 |
| Cottonmouth | Updated | 39 |
| Dear Azula, I Have A Crush on Danny Phantom | Updated | 12 |
| Depression and Other Magic Tricks | Updated | 37 |
| Fat Girl Finishing School | Updated | 42 |
| How to Maintain Eye Contact | Updated | 23 |
| I'd Rather Be Destroyed | Updated | 21 |
| If My Flowers Bloom | Updated | 22 |
| Lord of the Butterflies | Updated | 34 |
| NOT A LOT OF REASONS TO SING, BUT ENOUGH | Updated | 13 |
| Portrait of my Body as a Crime I'm Still Committing | Updated | 37 |
| Smudge | Already current | 0 |
| St. Trigger | Already current | 0 |
| The Only Worlds We Know | Updated | 35 |
| Toy Gun | Updated | 44 |
| Urbanshee | Updated | 68 |
| We, The Spirits | Updated | 10 |
| When the Ghosts Come Ashore | Already current | 0 |
| crown noble | Updated | 26 |
| A Choir of Honest Killers | Held | missing_existing_fps:2; unmatched_or_ambiguous:2 |
| A Love Song, A Death Rattle, A Battle Cry | Held | unmatched_or_ambiguous:1 |
| A Peculiar People | Held | unmatched_or_ambiguous:1 |
| Autopsy | Held | unmatched_or_ambiguous:1 |
| BIRTHRIGHT | Held | unmatched_or_ambiguous:7 |
| Blood Percussion | Held | unmatched_or_ambiguous:5 |
| BloodFresh | Held | unmatched_or_ambiguous:1 |
| Composition | Held | unmatched_or_ambiguous:2 |
| DON’T BE AFRAID TO BE BAD | Held | Sync failed DON’T BE AFRAID TO BE BAD: {"error":"catalog_poems_409"} |
| Excuse Me As I Kiss The Sky | Held | unmatched_or_ambiguous:7 |
| Hated for the Gods | Held | unmatched_or_ambiguous:8 |
| Nothing Is Okay | Held | unmatched_or_ambiguous:1 |
| Pink Elephant | Held | unmatched_or_ambiguous:90 |
| Please Come Off-Book | Held | unmatched_or_ambiguous:2 |
| Sadness Workshop | Held | unmatched_or_ambiguous:1 |
| Tartarus | Held | unmatched_or_ambiguous:5 |
| The Crown Ain't Worth Much | Held | unmatched_or_ambiguous:3 |
| The Future: Limited Edition | Held | edition_lookup_requires_fix |
| The Willies | Held | unmatched_or_ambiguous:8 |
| Transit | Held | unmatched_or_ambiguous:5 |
| We Were All Someone Else Yesterday | Held | unmatched_or_ambiguous:2 |
| Where I Dry the Flowers | Held | unmatched_or_ambiguous:2 |
| Wild/Hurt | Held | unmatched_or_ambiguous:1 |
| You Better Be Lightning | Held | unmatched_or_ambiguous:1 |
| an everyday occurrence | Held | unmatched_or_ambiguous:36 |
| ex traction | Held | unmatched_or_ambiguous:2 |

## Receipts and backups

The accompanying private ZIP contains the exact 1,886-key manifest, initial plans, source snapshots, 510-record before snapshot, 135 linked vote backups, per-book apply/post-run receipts, complete verification, public spot checks, held-record CSV, and Future edition evidence. The ZIP contains no API credentials. Existing identities and assets are retained. No rollback was run. The existing backup helper generated a 510-document guarded undo receipt, split into two parts (400 and 110) to respect its transaction cap. Restore refuses records whose applied fields have changed. Run part 2 then part 1 only after explicit rollback authorization; do not test by restoring live content.

Handoff back to Catalog is prepared here; no message was sent to another chat.

## Subsequent bounded code safeguards

- Existing-FP text matching now uses a unique permanent key first. Unique-title fallback remains only for unkeyed records. Duplicate keys, missing/conflicting keys, repeated ambiguous titles and attempts to attach an already-used key remain held.
- Keyed title changes no longer appear as missing creations. Text sync retains the existing PP title and external ID; it does not automatically retitle records or attach keys to unchanged text. Those actions need a separate reviewed metadata plan.
- Book identity, proposed missing records, skipped matches and review policy are bound into the opaque apply hash. An update-existing apply stops before all writes if matches require review or `addMissing:false` leaves missing records. Existing per-record concurrency guards remain.
- Source sync resolves The Future (TF) and The Future: Limited Edition (TFLE) separately, without changing the global legacy import lookup or relabeling public content. A Limited Edition request now returns `catalog_edition_identity_conflict` when TFLE-tagged records still belong to another stored book; it cannot cross-update the original edition. Resolving the data identity conflict remains necessary before importing any missing edition content.
- Fifty-eight focused uploader/sync tests pass, including key-based retitles, repeated titles with distinct keys, duplicate keys, preservation of reviews, hash policy, edition isolation and stopping before writes. CI and production verification are recorded in the shared Product Roadmap after release.
- This does not implement an unattended Catalog follower, retitle/retirement intake, new FP creation, graphic recreation or author notifications. The 194 unkeyed rows and source ambiguity need exact mappings. No Catalog chat was messaged in this pass.
