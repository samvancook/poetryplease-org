# Catalog handoffs executed — 28 October 2026

Verified production data corrections are complete for the bounded, unambiguous set below. Existing IDs, graphics, votes, flags and repair histories were retained. This is not completion of every row in the historical 194-record exception snapshot.

## Applied and independently verified

| Slice | Result |
| --- | --- |
| Permanent keys | 45 assignments on existing FPs: 40 unique repeated-title matches, three explicit retitles and two original-edition Future records. The two Choir keys completed earlier today are separate. |
| Source/title corrections | 30 existing FPs adopted verified Catalog text and/or titles, including Mirrors' notes-only body and the two Choir retitles. |
| The Future | All 43 original-edition FPs now use TF, the original product URL and Spring 2018. Original keys and stable TFLE-prefixed document IDs retained. No Limited Edition records created. |
| DBAT | 65 existing contributor records mapped uniquely to complete canonical poems. Restored poem titles, retained the contributor's existing display name as author, adopted poem-only text and permanent keys. Book-level editor metadata is unchanged; prompts remain in the Catalog prompt manifest and private backups. |
| Non-poems | Seven verified front/back-matter records and DBAT BONUS PROMPTS retired reversibly. No physical deletion. |

The four content plans wrote 146 records. This count overlaps the 45 key assignments; do not add them as a count of distinct records. Each plan has update-time guards, a pre-write backup and a guarded undo receipt. DBAT used one canary followed by 64 records after verification.

Independent readback checked every planned field and every other field against the backups. All 48 directly related review records were unchanged. A wider check also verified all **131 votes and 25 flags** saved for the full handoff scope were unchanged. Nothing was reopened or resolved automatically.

Fresh authenticated previews:
- The Future: 43 existing / 43 source; zero planned text updates, missing poems, skipped records or errors.
- DBAT: 67 stored / 67 source; zero planned updates, two missing canonical poems and one skipped composite record; zero errors. The stored count includes the retired BONUS PROMPTS record. Do not create the two missing poems until the held composite is resolved.

## Remaining decisions and owners

| Hold | Owner | Next action |
| --- | --- | --- |
| DBAT-FP-SIAARA-FREEMAN contains two complete poems | Catalog, then PP | Confirm split/identity disposition for BPP-00384, Necromancy Explains the Author, and BPP-07569, The Author Explains Necromancy. Existing composite held intact; neither source poem was silently discarded or created as a second identity. |
| Two Pink Elephant author conflicts | Catalog | Confirm correction authority for stored Rachel Camacho versus canonical Rachel McKibbens on MY-DEAR-BROTHER and WORCESTER-MA-CHRISTMAS. API author guard blocked both key assignments; no writes. |
| Four repeated-title records collide on two keys | Catalog | Resolve the two Chicago High School Love Letters records for BPP-04593, and the two Once records for BPP-04494. No duplicate key ownership assigned. |
| 118 duplicate-copy classifications and remaining non-poem/partial/no-match rows | Poetry Please | Review canonical survivor and review-history disposition per record before any retirement. These rows were not bulk deleted or retired. |
| Trees | Catalog | Edition review found all 87 bodies and line order agree between 2021 EPUB and 2024 print, but 19 live Catalog poems still lack 33 source-indicated spacing gaps. Correct those upstream before PP refresh. Published Catalog edits should stand; PP refresh remains held. |
| DBAT contributor spelling variants | Catalog | Confirm Daniel Elias Galicia versus CSV GALACIA, and Junious Ward versus JUNIOUS ‘JAY’ WARD. Unique full-poem text establishes identity; PP retains its prior contributor display spelling. |

Catalog received the completed counts and exact held cases in “Catalog Canon and Roadmap.”

## Video handoff reconciliation — read only

Today's Weaver gates in `button-weaver-internal / weaverledger / videoCurationGates`:

| Gate | Source identity | PP readback |
| --- | --- | --- |
| 38a0dbe85b75eeb36c0a6aa21503b25b | weaver:video:13iiSt9DITDFFGRsHZ69qjKDEGqDXWpSO — Rachel Mckibbens, Weather’s Here, Wish You Were Beautiful | No sourceRecordId ledger; deterministic video WEAVER-VV-3C2FED694CFB004DFFE6AB05 absent. |
| d3695a740092c2a86c24d1c43c4f56ea | weaver:video:1NIcMg5qd669NxQN1kfL9LG6DLlhFk40s — Kenneth Something, I Didn’t Read The Love Poem | No sourceRecordId ledger; deterministic video WEAVER-VV-465DE380C86FC92D5851BE9A absent. |

Both gates show ready, empty poetryPleaseHandoff, and decision-only history. They do not contain a saved failed/sending attempt. This proves absence for those exact identities, not the cause or identity of the reported HTTP failure. Validation can reject before the PP ledger is created. No retry, resend, gate reset, upload or record creation occurred in this reconciliation.

Weaver owns tracing the actual endpoint/request/response and deploying its attempt-bound finalization fix (PR #48 was still draft at inspection). The existing PP receiver returns a machine-readable canonical ID, URL and received review/excerpt counts after success. Its configured video limit remains 600 MB; this pass does not claim the approximately 1.6 GB Black Chakra asset is supported. Preserve its separate existing gate and source identity. Exact readbacks were handed to “Review cleanup notes.”

## Release, evidence and recovery

- [PR #291: guarded key-only sync](https://github.com/samvancook/poetryplease-org/pull/291).
- [PR #293: existing backfill helper permits reviewed edition fields](https://github.com/samvancook/poetryplease-org/pull/293).
- [PR #294: existing backfill helper permits reviewed contributor attribution](https://github.com/samvancook/poetryplease-org/pull/294).
- Existing approved GitHub workflow succeeded on main [7caa140, run 40726314897](https://github.com/samvancook/poetryplease-org/actions/runs/40726314897). No workflow/authentication/startup/UI changes.
- Live `/api/healthz` and anonymous POST `/api/bootstrap` succeeded after release. The first smoke request used nonexistent `/api/health`; its 404 was a test-path mistake, not an app failure.
- [Private backups, source hashes, dry/apply receipts, guarded undo plans and independent readbacks](https://drive.google.com/file/d/1yqexPBFO7sl3iDCy_tD0YbTrC1lM4V7g/view). These include review data; sharing was not widened.
- Local working evidence: `/tmp/pp-handoff-execution-20261028/` (temporary; use the shared archive for durable recovery).
- `source-undo.json`, `future-undo.json`, `retire-undo.json`, `dbat-canary-undo.json`, and `dbat-remainder-undo.json` work with the existing helper's guarded `--undo ... --apply` route. Do not run undo or replay batches without inspecting current state; guards refuse intervening changes.
- Historical helper attribution is `updatedBy: catalog_handoff_2026-10-22`; this date is inherited from the existing helper, not the execution date. Dated receipts establish the October 28 run.
