# Poetry Please Roadmap

Completed work is recorded in `ROADMAP_ARCHIVE.md`.

## Current status and blocker register — 27 October 2026

This section supersedes conflicting status and next-step claims in older entries below. Dated release notes are historical evidence, not current operating instructions. The only approved production route is branch → PR with passing checks → merge → existing `.github/workflows/firebase.yml` on main. Do not use the retired `scripts/deploy-production.sh`, create another workflow, request new scopes, or switch methods after failure.

### Completed releases
- **Startup hotfix:** PR #284 removed the classic-script ESM import regression and reset-state UI; desktop and classic mobile opened with no script errors. Startup regression protection is next, not yet complete. [Incident and release receipt](https://drive.google.com/file/d/1UThGeQbTaEHr8fCLnNyxLBzodSZxpjHL/view).
- **Spring 2027:** WG has 52 and BBFR 26 imported FPs with permanent keys; 78 created, zero errors, no existing content changed. [Import/readback receipt](https://drive.google.com/file/d/1EmityTk1cHh8Gvf1oWK66ei4kqn_qLwc/view).
- **Catalog full text:** 510 existing FPs across 17 books updated; 135 backed-up votes retained. Cottonmouth's 39 updates are complete; its earlier spacing-only hold is superseded. [Execution and held-record receipt](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view).
- **Contest graphics:** the Contest owning task reports all nine winner graphics and the event-only embed live; the previous 8/1 CONFLUENCE hold is historical. [Current link guide](https://docs.google.com/document/d/1hiY1oB500Ly8FW9RY-m5GF_LVXcEfz0VOPGrMdXyE1I/edit). The proposed admin gallery remains unimplemented and must derive counts from current receipts, never hardcode 8/1.
- **Explorer product links:** owning task reports 107 products and 82 existing short links live, preserving editions. [Live Product links view](https://poetryplease.org/explorer/?view=products). Retain the old lookup until redirect checks and two metadata gaps are resolved.

### Remaining blockers: one accountable owner per item
| Blocker | Owner | Next action and evidence |
| --- | --- | --- |
| Startup regression coverage | Poetry Please | Add checks for scripts in the mode declared by real desktop, Swipe and classic HTML, then verify actual startup through the existing test/release path. Preserve startup, session, routing and wording. [Incident](https://drive.google.com/file/d/1UThGeQbTaEHr8fCLnNyxLBzodSZxpjHL/view). |
| Multi-card staff creation follow-up | P.I.G. coordinating task | Private repair canary is complete per the owning task's final readback: repair `zCuaPxBQ4O2qVE28ZmGL` accepted in PP and resolved in Weaver; only card 2 changed, cards 1/3 and canonical identity retained, syntheticTest still true. [PP targeting fix #287](https://github.com/samvancook/poetryplease-org/pull/287) · [Weaver return fix](https://github.com/samvancook/weaver/commit/defa378). Next: a staff-created real multi-page FPI to test creation/reorder/preview/export; do not rerun the completed synthetic repair. |
| 194 unmatched/ambiguous unkeyed FPs | Poetry Please | Use the saved per-record exception list to propose source-backed permanent-key mappings; preserve IDs/votes and hold ties. The count is the Oct 23 snapshot, not a fresh production recount. [Receipt](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view). |
| 43 TFLE-labeled records with original-edition identity | Catalog | Supply an explicit edition mapping before PP changes anything; 41 keys belong to the original edition and two are unkeyed. No blanket relabeling or inferred new records. [Receipt](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view). |
| DBAT lookup conflict | Catalog | Resolve the authoritative book identity behind HTTP 409, then PP reruns a read-only preview. [Receipt](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view). |
| Two missing Choir FPs and two unmatched entries | Poetry Please | Verify exact keys/source coverage and prepare an explicit disposition; do not create records from title guesses. [Receipt](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view). |
| Catalog book-list/status and consumer revision contract | Catalog | Define supported pagination, book/edition identity, revisions and retirement semantics; Weaver then replaces its wildcard-search workaround. Automatic Catalog → PP intake is not live. [Catalog blocker register](https://docs.google.com/document/d/1Yibvh-YYGQRKpwN8ZidpEtM-QxnHgnq-Ro29QKk6MrQ/edit). |
| Black Chakra video handoff | Weaver | Reconcile the existing gate/source identity and current PP state before retrying. Handoff requests an approximately 1.6 GB 4K final; PP code currently configures 600 MB. Verify the actual asset size and agree the supported import route; do not silently substitute/transcode or make another identity. [Oct 27 handoff](https://docs.google.com/document/d/1nr_wamTTUrLWmAAgFH3adO7yJ9f36e_ko8hZY75IewI/edit). |
| Old dirty PP checkout | Poetry Please | Preserve and reconcile local changes in `/Users/buttonpublishingone/Desktop/CODEX/Poetry Please/poetry-please`; it reports hundreds of commits behind. Do not reset, delete or deploy it. Canonical checkout: `poetryplease-org-roads112`. Evidence: Oct 27 read-only workspace audit; no preservation/reconciliation receipt exists yet. |
| Explorer retirement checks | Explorer | Verify existing short-link destinations and fill the two missing author/catalog fields before retiring the old lookup. [Live view](https://poetryplease.org/explorer/?view=products); release task: “Build Poetry Please Content Explorer…”. |
| Author invitation/help alignment | Poetry Please | Use the refreshed drafts below, QI/INT first then EXC, with Love / Meh / Like / Dislike. Verify claim/help links and controlled recipient before any authorized Mandrill send; broader sends still require approval. Public help/tour wording is not changed by this documentation edit. |

**Order:** reconcile documentation → startup regression protection → bounded Catalog identity exceptions. Keep the independently resumed P.I.G. canary under its one owner. Catalog's 76-book / 1,101-row spacing file is historical triage, not a current unfinished-work count; Roads, Stunt Water and Keep This To Yourself have later source-backed checks in the Catalog register.


## Active Focus
- **Hardening and module isolation (high priority; planned, 2026-10-27):** normal content-type updates should touch their own adapter/renderer and focused tests, with stable contracts protecting startup/loading, authentication/session/roles, routing/deep links, the shared viewer frame, feed ranking/pagination and vote submission/history.
  - **First slice — protect startup:** test scripts in the mode their real HTML declares (classic versus module), then open desktop, Swipe and preserved classic-mobile/special-link routes in a real browser. The October 27 outage was an ESM-only import added to the classic `app.js`; Node syntax checks and API health did not catch it. [Incident and verified hotfix](https://drive.google.com/file/d/1UThGeQbTaEHr8fCLnNyxLBzodSZxpjHL/view).
  - **Content boundaries:** separate text/excerpt, graphic/card-set and video renderers/adapters behind a small documented interface. Keep import validation, media storage and repair state transitions separate from presentation. Preserve canonical IDs, permanent poem keys, source IDs, votes and review history.
  - **Failure isolation:** optional type modules load after the core can start. A failed module/media request must affect its item, with a clear fallback/error, rather than leave the whole app loading. Do not introduce reset/sign-out controls as an incidental recovery measure.
  - **Explicit scope:** identify and agree any necessary change to protected core behavior before including it in content-type work. Do not silently change script mode, loaders, session state, navigation or approved wording.
  - **Delivery:** stabilize startup first, then extract one renderer/adapter at a time with behavior-parity checks; isolate viewer/feed/voting and backend import/repair responsibilities in subsequent small slices. Keep the existing approved deployment workflow and verify the actual app opens after each release. No broad rewrite is started by this roadmap entry.
  - **Acceptance:** a new content capability can ship without editing the protected core; a deliberately failing type module cannot block startup; anonymous/author/staff paths, existing content, IDs, votes and navigation remain correct. [Shared roadmap](https://docs.google.com/document/d/1J8EwXSR4SqVmeATQDHUjAbvTkrJ7RbzzODftEjk4Pps/edit). The synthetic repair canary has resumed under P.I.G.; see the current blocker register above.
- Catalog full-text sync (2026-10-23): **510 existing FPs updated across 17 books**, three books already current, 26 books held. All 510 source checks and ten public checks passed; 135 existing votes were unchanged. No new content, asset replacement or review reopening. [Execution, exceptions and safeguards](docs/CATALOG_FULLTEXT_SYNC_2026-10-23.md). Follow-up code uses permanent keys before titles, prevents keyed renames becoming creations, binds scope/review policy into the plan hash, stops ambiguous/missing-record books before writes, and separates Future edition requests with an explicit legacy-identity conflict. Existing IDs and stored titles remain unchanged. 58 focused tests pass. Remaining: map 194 unkeyed held FPs; resolve Catalog DBAT HTTP 409; resolve 43 mislabeled TFLE records (41 keys belong to original edition, none to Limited Edition); review the two missing Choir FPs. The previous 29-book spacing hold is superseded by this 46-book full-text pass. [Shared results](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view) · [Private backups](https://drive.google.com/file/d/1t0TIqhlbZcY9ldh_zoVfJyM0HOKbg9Zg/view).
- Newcomer Swipe showcase (2026-10-22; PRs #267 and #268 deployed): anonymous readers and signed-in users with fewer than eight saved reviewed item IDs receive proven QI (at least three community votes) first, ordered by the existing mobile vote-quality/confidence score, Love count and vote count, without jitter/discovery interleaving; aggregate score alone must not reward exposure when most responses are Meh. Other rated content follows if that pool runs out; voted, flagged, broken and author-excluded content stays excluded. Author ownership queues remain separate. Swipe requests three cards per page and refills near the end without requiring a vote; image requests start only for the active card and its next neighbor. Thirty-two focused tests cover this change, including positive response quality versus accumulated exposure. This reduces payload/image downloading, not the existing cached full-catalog/rating reads. Existing GitHub Actions deployment workflow retained; health and anonymous bootstrap pass. Live checks verified three cards per page, no ID overlap in the next batch, and only the first two graphic sources assigned initially. Final live readback matched the highest-ranked six among 560 eligible rated QI; two three-card batches had no overlap. Observe first-review conversion and bandwidth before changing the eight-review threshold or expanding the optimization.
- Catalog permanent-key update process (historical plan, superseded in part by the October 23 safeguards above): [implementation plan and Catalog handoff](docs/CATALOG_KEY_SYNC_PLAN_2026-10-22.md). Verified gaps: existing planner matches titles before keys; missing-FP detection counts titles; TFLE and TF lookup records both resolve to the base title. Next PP slice: exact-key/edition-scoped dry run with retitles and key-only changes, explicit review policy, no new records, and unchanged public IDs. Catalog must confirm TF/TFLE edition identities and key sets, adjudicate Cottonmouth's 24 non-spacing changes, and report existing revision/retirement delivery capabilities. Durable intake, replay protection and explicit retirement follow a verified canary; no automatic follower is live. This pass changed documentation only; handoff prepared, not sent to another thread.
- Catalog handoffs executed (2026-10-22): **123 verified spacing-only updates across four books**, preserving review state; three-book reconciliation applied to **400 distinct existing records**: 22 FP retitles, 39 source-text updates, 57 reversible retirements, 316 keys, 71 other title corrections, five markup fixes. Combined: 523 intended content changes, zero unexpected paths or deletions; graphic assets retained. Resolved 25 proven flags and one source-only repair; 14 author votes reopened with history retained. Keep design/epigraph/strikethrough notes open. See [execution record](docs/CATALOG_HANDOFF_2026-10-22.md) for held work, undo order and private receipt locations.
  - **Historical hold — superseded by the October 23 full-text pass:** 29 spacing books / 449 requested keys. Initial broad dry runs would update 1,017 FPs rather than only the 572 authorized keys. Cottonmouth also adds body text beyond blank lines; The Future: Limited Edition routes to the wrong book. Do not broaden this batch or choose ambiguous repeated titles.
  - **Human review:** 88 wording/image/unmatched rows remain; no automatic passage rewrite or graphic recreation. Missing FP coverage remains five LABC and 16 TGIT records; no new poems were added.
  - **Next bounded work:** automatic Catalog updates/retirements by key; legacy FP/FPI shared-ID audit; Themes beta UI after targeted file-scope approval (public themes only, filter on desktop, no filters in Swipe). Performance-only keys require verified performer/title matching and manual review of ties.
- Swipe / previous-mobile migration decisions (2026-10-20):
  - **Keep:** `/m` is primary Swipe; `/m-classic` stays an alternate. Black frame, in-frame graphic zoom, logical poem lineation, title/author attribution, book information, share, related canonical FP/video links, ranked unreviewed feed, and fixed **Love / Meh / Like / Dislike** controls remain the current direction. FP stays out of normal discovery but can be read publicly by direct/related link.
  - **Return navigation live (PR #259):** related links now temporarily show their canonical card while retaining the original DOM, loaded queue, ranking seed/cursor and scroll position. X, browser Back, or **Continue browsing** restores that exact feed without refetching. Nested FP/video links retain the first origin. Account changes discard retained content. Modified clicks keep ordinary shareable `/m?item=` navigation. Approved hosting deployment and health/bootstrap passed. Live Chrome at 390×844 verified X and Continue browsing restore all 12 original IDs and the exact 4,220px scroll position, with no console errors or test votes; 41 focused tests passed. Independently opened/deep-linked items have no invented origin; browser Forward after a closed visit reloads its canonical deep link.
  - **High-priority migration decisions:** previous mobile has role-gated graphic download and flag/correction entry points; Swipe Info currently has neither. Decide the smallest author/staff-only controls and reuse existing permissions/endpoints, rather than expose moderation to public viewers. Keep author corrections secondary to graphics/excerpt ranking.
  - **Author guidance:** the previous viewer's collapsible author guide links QI/INT first, then EXC, and asks about future poem review/landing pages. Swipe has author ownership/preview scoping but no equivalent guide. Review whether a brief role-only introduction is enough. The old guide says **Moved Me** while Swipe says **Love**; align help text with the approved labels when that guide is next edited. Do not restore profile editing or poem ranking as primary author tasks.
  - **Deliberately different:** no browsing filters in Swipe. Book/contest locked reading, invite/claim and other specialized query paths continue through the preserved classic route when required; audit those flows before migrating them, rather than silently dropping their scope. Lane counters remain a staff verification decision, not a public/author feature to port automatically.
  - **Continuity and navigation:** investigate anonymous-to-account vote exclusion without copying/deleting vote history by default; review cross-tab prefetched cards, repaired/superseded votes, and visually duplicate assets with different IDs when reproducing repeated content. A Loved-only account history and optional Loved resurfacing remain roadmap-only. Review the shared `/app?item=` share URL's mobile routing, role-aware staff navigation, and phone accessibility/landscape fit before further migration.
  - **Relationship coverage follow-up:** live `CIPO-EXC-SOFT-1` (Chelsea Guevara, Soft) returned no FP/video links, while `GLAN-EXC-WHEN-I-HEARD-OF-YOUR-DEATH-1` resolved its canonical FP and passed the return check. Verify permanent keys/source relationship coverage separately; do not invent a target or assume every excerpt has a video.
  - **Catalog boundary:** upstream owns extraction, stanza/line breaks, and authoritative source corrections. PP owns rendering and applying verified changes to existing IDs after a source handoff. Catalog's assessment is back (draft PR #63): 1,101 candidate rows across 76 books are triage candidates, not confirmed repairs. Do not repeat the completed 46-item PP sync or strip blank lines globally.
- Primary Swipe review controls (2026-10-20): promote the existing black-filled, color-edged review icons from the outline variant to /m. User-approved labels are **Love, Meh, Like, Dislike**; do not replace Meh with Neutral or add words. Stored vote types remain `moved me`, `meh`, `like`, `dislike`. A wording/icon contract test protects this requirement.
- Repeat-content investigation (2026-10-20): current /m Chrome session uses sam@buttonpoetry.com; its 12-card sample has no overlap with that account's 2,448 active voted IDs. Two sample IDs were reviewed under samvancook@gmail.com; Sam confirms normal reviewing is sam@, so this does not resolve the reported same-account repeats. Leave the bug open; do not merge account histories. Preserve exact-ID exclusions and session served-ID deduplication. Existing regression tests cover both. Anonymous-to-signed-in exclusion continuity also needs review; Swipe has no equivalent of desktop's anonymous-vote merge call. Do not change vote history based on that observation alone.
- Account review-history feed (roadmap only, 2026-10-20): add an account-accessible view of previously ranked items, starting with Loved-only as the main/possibly only view. Keep ordinary review feeds focused on unreviewed content. Consider a separate, explicit policy for relevant Loved items to resurface later; do not change resurfacing/ranking rules today.
- Related FP/video return navigation (2026-10-20): Sam requests an X back to the original card or continued scrolling from the linked poem/video. Recommendation: support both, preserving the original feed and position, with X as the clear immediate return. Continue should resume the original feed rather than rank FP into it or route to the retired mobile alternate. Implemented in the retained-feed return flow above; production verification is recorded with its release.
- William Evans/SINK formatting sync (2026-10-20, completed): after Sam's explicit approval, the existing catalogFullPoemSync updated 39 **Still Cant Do My Daughters Hair** FPs and the seven verified SINK mismatches. All 46 exact text/key checks passed; IDs and unrelated content fields stayed unchanged, all 9 linked vote records were retained, one eligible author vote reopened, and no flags or repair requests closed. Public readbacks independently matched the corrected source for **Anatomy of Dap (i)** and **Of All the Muscles**. Local backup/plan/receipts/verification: `/tmp/pp-fp-spacing-20261020-{backup,plan,receipts,verification}.json`. No new content identities, emails or broader source writes.
- Wider Catalog formatting assessment (2026-10-20): Sam suspects the spacing issue affects most books and requested a handoff to **Catalog Canon and Roadmap** (thread `01a08c12-6bd0-7f92-a233-7fb20eba8e00`). Assessment returned in Catalog draft PR #63; Catalog owns its source corrections. It must compare live/preferred/repository revisions, authoritative EPUB/manuscript structure, affected books and legitimate layout exceptions, then report verified source defects separately from PP records awaiting source refresh. **SINK / 10 Candles** remains an upstream example with extra blank lines in current Catalog text. Assessment/report only; no Catalog production write or blanket blank-line cleanup authorized. Shared roadmap contains the full evidence and scope.
- Swipe FP fallback styles (2026-10-20): a controlled missing-`scroll.css` check reproduced joined poem lines and an off-screen title. Essential post box sizing and logical-line display now live in `posts.css` too, refreshed through the existing stylesheet synchronizer. At 390×844 without the base stylesheet, the card now measures 844px rather than 1,024px and the title is within the visible frame. This verifies the failure class; it does not prove what failed to load on Sam's phone. No FP text, IDs, metadata, votes, controls or layout redesign.
- SINK exact-text audit (2026-10-20): 56 stored FPs all have titles; 54 contain actual newlines. 49 exactly match current Catalog text. Seven whitespace-only differences were subsequently corrected through the existing Catalog full-poem update route (see the completed 46-item batch above): **At Last**, **Grief Vignettes for Kaiya**, **Jemez Springs, New Mexico**, **Ode to My Strap-On Dildo and Ode for My Love on His Hands and Knees in Front of Me**, **Of All the Muscles**, **Talk // Talk // Talk**, and **Thighs Say**. Do not flatten whitespace to declare these repaired. The source itself still has 44 poems with a blank between every nonempty line under the audit heuristic; review manuscript/EPUB structure before changing that spacing. **Sink** (source classified prose poem) and **It Took My Mother 3 Days to Give Birth to Me** are single paragraphs in both PP and Catalog; do not invent lineation. No source writes during this audit. Also retain follow-up on four sampled SINK EXC links returning no related FP despite existing FPs; verify permanent keys/author normalization before changing relationships.
- Graphic loading recovery (2026-10-20): the shared post renderer keeps the image after a failed load, retries once automatically, then offers **Retry graphic**. Swipe hides zoom controls/instructions until the image is loaded and restores them after recovery. Same source URL and content identity; no catalog, text or vote writes. Covered by 13 focused tests and a Chrome fixture that fails two real image requests before a successful manual retry. The original phone request's failure cause remains unproven; Stretch Marks' public INT asset is valid and loads in Swipe.
- Full-poem formatting audit (2026-10-20): compare current Catalog `served_text` and exact PP FP records without flattening whitespace; distinguish actual missing/extra line breaks, literal escaped separators, and viewer wrapping/line spacing. Preserve stanza intent, IDs and votes. Initial current Roads sample **When You Put a Bench in the Woods by Your House** has identical line/stanza text in Catalog and PP; this is not a full-catalog verdict. Do not blanket-overwrite the known source-coverage exceptions below.
- DBAT anthology context (roadmap only, 2026-10-20): use the card's Info sheet to explain that the book is an anthology and link the associated prompt after verifying its source. Consider including the prompt directly as the lowest-lift extension; a sideways-swipe prompt view is an optional later idea. Keep the implementation small and specific to this one anthology.
- Emory's moderation and source-update issues (2026-10-15):
  - corrected the admin lazy-loader role precedence: staff with both `team` and `contest_admin` must load Flags/Recreation requests, while contest-only users remain excluded. Emory's saved roles confirm this exact combination. Added **Refresh flags and repairs**, retry after failure, and separate loading/error messages for the two subpanels; six role/collapse cases and failed-load retry are covered by regression tests.
  - Weaver repair book/count controls: `loadGraphicsBooks` uses general graphics summaries while repair rows come from `/api/repair-requests` without applying the selected book. Sent the verified code finding to the Weaver chat to compare with production and fix using repair-specific counts/filters or a clearly labeled all-repairs view. Do not use general graphics counts as repair counts. PP currently has 30 requests: 23 in progress, 5 returned, 2 resolved; preserve those request/job IDs.
    - Weaver reports the fix live in PR #18, revision `weaver-00469-kj2` at 100% traffic: **All repairs** replaces misleading book counts; a live load returned all 30 repair rows. No jobs, requests, or catalog metadata changed.
  - historical production verification for PP PR #216 (retired deployment method; use the current workflow above): deployed through `./scripts/deploy-production.sh hosting`; health and anonymous bootstrap passed. Sam's admin session loaded 1,165 flags including system quarantine and opened the existing LABC title/text editor. Emory's exact roles passed the regression test; her fresh browser session remains unobserved. No editorial correction or deletion was submitted during this check.
  - LABC removed/renamed poems: identify the exact cut poems and confirmed new titles against the updated manuscript; apply source corrections in Catalog, preserve the permanent poem identity on renames, retire removed works deliberately, then update existing PP content and prevent removed items from reappearing on import. Do not infer a deletion list. Current PP has 48 full poems; all 48 match current Catalog text after whitespace normalization, so a PP refresh alone cannot supply the editorial update.
    - existing pending flags identify **About living at Baggage Claim** (`6alYwM0lfrsxWauzmr5l`, incorrect title), **How to survive the apocalypse** (`fzGePyKb6BpkZG9Bnpi0`, asks to confirm whether cut), and **the boy remembers he is a dehu(e)manized God?** (`mfcX6tRviRWCy6nBB2UX`, conditional removal only if required strikethrough cannot be preserved). These are not three confirmed deletions. Killmonger's QI rename is already resolved on its existing repair; carry the verified new title through the source/full-poem relationship separately.
  - TGIT appended/floating text: current PP's 23 full poems all match current Catalog text after whitespace normalization. Repair source poem boundaries in Catalog first, then update those same PP IDs. Existing repair requests already identify Communal will from the last dry-born, John McPhee, Lazarus (fragments of persistent joy), Living Autopsy Report: New Orleans, Louisiana, Maybe You Should Write a Poem, Novel Ecosystem, Political Theatre, Out Past the Levee Districts, Records of Bienvenue, Tooth Gaps in the Archives, and Visiting Hours. Keep those requests; do not create duplicates or send plain-text source cleanup blindly through graphic recreation.
  - Roads update reconciliation: 67 PP full-poem records versus 65 current Catalog rows; 55 normalize identically, 9 have text differences, and 3 titles are unmatched. `ROADS-FP-WHEN-ASKED-WHAT-I-AM-THANKFUL-FOR-11-18-2020` appends **8 Beautiful Things (About This Last Year)** beyond the Catalog match. Conversely the Catalog response for **When Asked to Write a Poem on a Photo of a Border Fence** contains only a 65-character epigraph versus PP's 2,102-character normalized text: do not blanket-overwrite. Resolve exact source coverage, renamed/removed titles, and current reconciliation status before resuming the existing full-poem content update path. No stanza-break count difference was found among exact-title matches in this audit; this does not prove the latest manuscript is preferred.
  - Catalog disagreement across Weaver/PP: audit exact `sourceRecordId`/content IDs, book, release catalog, source revision and poem key; distinguish publication catalog from source/event labels, present conflicts, and fix only verified fields in place. PP currently labels the three audited books Fall 2026; Weaver comparison remains pending. The stuck Roads/LABC source updates need an explicit source -> preferred Catalog revision -> PP import receipt -> live item status trail, including the exact blocked step and existing run ID.
  - Comparison tool: https://poetryplease.org/manuscript-reconciliation.html (staff sign-in). Confirm the current run and its supported write actions before treating it as the repair route; the existence of the comparison UI does not establish that a manuscript update was applied.
- Shared Catalog poem keys (bounded rollout, 2026-10-15; PR #210):
  - first pass attached 7,770 keys; second pass (PR #215) added 4,584 and corrected 36 incorrect Both True seed mappings with passage proof. Total: 12,354 of 14,764 excerpts (83.7%). All 4,620 second-pass writes verified with zero non-key changes; 20 Catalog checks and three live PP API checks passed after the existing 15-minute memory-cache window.
  - new excerpt writes look up a unique Catalog book/title key; ambiguous, missing-source or unavailable lookups remain unkeyed for review, and existing matching keys are preserved
  - remaining: 2,410 unkeyed excerpts and 536 prior mappings needing source review. The first pass trusted the seed too much; the seed CLI now requires a matching poem title. Do not guess or change excerpt IDs, text, votes, visibility or ordering timestamps. Second-pass plan, review queue, rollback and verification: https://docs.google.com/document/d/1jY_WUycBYmDQQXzIAtL4ZMo6P4jbOxr6kVj7W-ZFYAs/edit
  - rollback backup: https://drive.google.com/file/d/1msBxfoSfayFdWe6coFqtYpkfMf02Zu62/view ; verification: https://drive.google.com/file/d/1hS_ECUNQA6PqfeuE2Q3I8hgMW4x9rl4l/view
  - undo with `node functions/backfill_excerpt_poem_keys.js --undo /path/to/downloaded-backup.json --apply`; this restores only the key metadata on unchanged mappings and refreshes the existing content feed
- Repair quote-source follow-up (2026-10-15): North Of Omaha request `j2haBi5yCultXa0hx881` and THEY// HE `hZOR8r64CQmEPeybelX0` now carry verified source excerpts; Weaver confirmed their existing jobs each actionable once in P.I.G. Piano `DKJzR2G3UiMYwYUQ1mDl` and GHOST STORY `quwNpxfPPtYR5XaN9Ywx` remain blocked pending authoritative quote selection from their original source rows. Do not infer text from images or poem titles, or create new requests.
- Contest program and judging workflow (live; initial pilot closed):
  - native Poetry Please intake is live with Google and email-link sign-in, My Submissions, required poem title, eligibility/terms checks, and an internal test program
  - three-reviewer Yes / Maybe / No adjudication and Admin totals are live; three synthetic entries reached three saved reviews, and the Admin totals display was repaired
  - a separate Contest Builder role is live for selected staff; the builder supports contest name, opening/closing times, submission enablement, entrant link, and banner upload with a recommended 1600 × 600 image
  - Emory verified that a test contest stayed closed until enabled and closed after its end time; the closed entrant page is intended to retain its banner and contest details
  - next: visually verify an uploaded dummy banner and its crop on the entrant page; collect staff feedback on the builder and reviewer flow
  - launch gate: confirm whether every verified @buttonpoetry.com address should have reviewer access, and verify reviewer/Admin denial with a non-Button contestant account
  - next: confirm the ranked shortlist, admin override, export, and content-featuring path before declaring the Google Form/response-sheet replacement complete; the completed pilot entries are sufficient for the initial review check
- Google Analytics tuning (tracking live since 2026-10-10; plan and audit notes in the project's `ga/` folder):
  - done 2026-10-15: event data retention set to 14 months on all four GA properties; `vote` and `sign_up` marked as key events on poetry-please; custom dimensions `vote_value`, `content_type`, `author` (event scope) and `view`, `user_type` (user scope) registered; `poetry-please.firebaseapp.com` added to unwanted referrals so the Google sign-in redirect no longer shows up as Referral traffic
  - decision pending (buttonpoetry.com - GA4 property): un-mark `first_visit` as a key event; it inflates that property's key-event rate to about 87%, but the property is linked to the "Button Poetry" Google Ads account, so first check Google Ads > Goals > Conversions for an imported GA4 `first_visit` action before un-marking
  - optional follow-on: set Firebase `authDomain` to `poetryplease.org` so sign-in redirects stay on the site, after adding `https://poetryplease.org/__/auth/handler` to the Google OAuth client's authorized redirect URIs; deploy only after that URI is in place or Google sign-in breaks
  - skipped, likely for good (Sam, 2026-10-15): neilhilborn.com sends no GA data because the site loads no GA tag (WordPress/WooCommerce; PixelYourSite is configured for Meta only). The Neil Hilborn - GA4 property (stream 5871924228) stays as is; only revisit if the site becomes a priority, by adding the tag through wp-admin
  - next: tag Mailchimp links with `utm_source=mailchimp&utm_medium=email&utm_campaign=…` (see `LINK_GUIDE.md`) and compare votes per session for Email vs Direct
- Shared staff navigation (planned, incremental):
  - replace scattered page-specific links with a consistent, persistent navigation shell across the main app, Admin, Contest Builder, Contest Review, and other staff tools
  - show only destinations each signed-in role can use; preserve the current page, selected contest/program, and useful deep links when moving between screens
  - make it clear on desktop and mobile where staff can build a contest, preview its entrant page, inspect submissions, and compare programs; roll it out page by page rather than requiring a one-shot redesign
- Content Explorer (live at https://poetryplease.org/explorer/):
  - staff can search and filter author, book, work, catalog, content type, coverage, relationship confidence, flags, and product-link presence; filters are shareable in the URL
  - canonical product links now flow through the full-poem response; image assets offer Poetry Please, Drive, download, and source actions when available, plus optional ranking sort and visible rank labels
  - next: observe 3–5 staff using Explorer for video-to-book and book-to-video discovery; record confusing controls separately from missing or uncertain source relationships
  - follow-on: use that feedback to prioritize compact results, mobile presentation, platform filtering, grouping, and a lightweight correction-report action; keep matching confidence visible
- Deployment integrity (top priority):
  - automate JavaScript/CSS asset versioning instead of hand-maintained date query strings
  - fail deployment when changed assets retain stale HTML references
  - expose the deployed commit/build revision in the UI and verify it after every production deployment

- Poem-centered Scoreboard:
  - keep four distinct views: Books for collection health, Poems for poem-centered ranking, Content for individual assets/export, and Coverage for production targets
  - preserve the Content table and Google Sheet export for calendar planning
  - show book-level canonical-title FP matching, missing poems, extra/unmatched imports, review coverage, no/low-signal poems, flags, average score, and top poem
  - let Books expand likely exact duplicates, repeated-title variants, and titles absent from the canonical catalog without deleting any item automatically
  - keep every poem score explainable as direct FP votes, author adjustment, connected-content bonus, diagnostic connected vote score, and direct links to contributing items
  - next: resolve extra FP review candidates as duplicate imports, legitimate repeated titles, or catalog classification gaps
  - next: add a poem-level export and a calendar-candidate workflow without hiding the underlying content rows
  - next: decide and document whether a fraction of connected-content vote scores should roll into the source poem score
  - next: add book-level ranking and signal-distribution comparisons once the per-book summaries have been validated
  - next: build a general unmatched-content audit that identifies assets lacking a reliable poem/book connection, explains which matching fields are missing or ambiguous, and offers a review path; prioritize `VV` and `YT` videos first
- Weaver/Firestore integration stability goal set:
  - research and repair missing line breaks in Matt Mason's *Roads* excerpts: on October 13, 2026, nine of his 165 currently disliked EXC records still had no explicit line breaks in Poetry Please, across **North Of Omaha, 2am** (`ROAD-EXC-NORTH-OF-OMAHA-2AM-2`, `-3`), **Ode to the Sehnert's Bieroc Café Apple Planter Sandwich** (base ID, `-5`), and **Line Up For Lightning** (base ID, `-2` through `-5`)
  - trace where the corrected lineation was entered, compare it with the canonical poem text and Weaver source rows, then update those same excerpt records in place; preserve IDs, votes, and review links, and verify each result in Firestore and the live viewer without guessing line-break positions
  - next: add a correct-and-retry workflow for failed ledger records instead of requiring payload reconstruction
  - next: expand reconciliation from resulting content IDs to source-record IDs and metadata/type mismatches
  - next: add a formal preflight/canary gate before bulk imports using a new content type or schema version
  - next: harden idempotency around `sourceSystem + sourceRecordId` across every supported content type and document duplicate-signal precedence
  - next: add import volume, latency, duplicate-rate, snapshot-age, and last-success trend diagnostics
- App polish and reliability
- Safer development and deploy workflow so new features do not destabilize existing app behavior
- Public/general-user onboarding polish, load-time improvements, and non-Google account options
- Mobile-specific UX cleanup
- Feed and scoreboard clarity
- Admin workflow improvements
- Author account framework and implementation
- Import and pipeline reliability into Poetry Please
- Maintain `APP_FUNCTION.md` as the canonical app/storage model reference
- Weaver -> Poetry Please graphics handoff (`QI` first)
- Catalog coverage diagnostics for low/missing marketing support by book
- Ranked texts endpoint for P.I.G. (`EXC` + `FP` first)
- Social performance signals ingestion for Poetry Please content
- Published social asset history ingestion tied back to Poetry Please items
- Catalog-consistent `INT` import workflow for new Drive folders so incoming assets match existing catalog metadata and conventions
- Shared Drive migration for durable Poetry Please handoff docs, imports, exports, and operating notes

## Top Product Priorities
- Complete the native contest replacement: finish Contest Builder banner testing, resolve the reviewer access policy and non-Button denial check, verify the ranked shortlist/export, then prepare the first real contest for launch.
- Validate the live Content Explorer with staff and use their feedback to improve the most common author/book/content discovery paths.
- Smooth the general user experience:
  - make logged-out and anonymous entry feel intentional instead of like a loading state
  - keep first content load fast and predictable
  - improve account creation options beyond Google/Gmail where useful
  - make login, continue-without-login, and account creation visually polished
  - add lightweight load/error timing so stuck sessions are easier to diagnose
- Get author accounts fully usable:
  - make the review queue the author starting point; keep the compact review guide collapsible and connect its QI, INT, EXC, and FP links to the relevant lanes
  - split the current author editor into three clearly explained surfaces: public profile, featured selections, and granular issue review, with links between them and the review queue
  - restrict featured selection to pieces this author voted Moved Me on; if none exist, show an empty state with a review queue link; add an author-scoped vote list to the editor API before changing the UI
  - add author voting for Full Poems in the editor or another author-scoped surface so poem rankings can guide marketing, while keeping Full Poems out of the author review queue and public view
  - restrict granular issue review to pieces this author flagged, voted Meh on, or voted Dislike on; expose those author-scoped states in the API and keep the review list separate from profile editing
  - later add a separate, non-pausing adjustment request for formatting or version changes, with clear status and a deliberate pull action for urgent concerns; for now the editor’s “Send note” uses `contentFlags` and pauses the piece during team review
  - measure author page load and list rendering, then lazy-fetch or paginate each module’s data so opening the profile does not load hundreds of content cards; verify desktop and mobile parity
  - finish author claim/invite flow
  - give authors a simple dashboard of their own content
  - let authors flag or suggest corrections on their own content
  - show author-facing response summaries without exposing raw admin tooling
  - harden admin Author View parity: render the preview through the same permissions and author-scoped data contract as the real account, keep admin-only switching controls outside the simulated author surface, and add regression tests proving admin/team controls never leak into the author view
- Reduce development risk while continuing feature work:
  - use small scoped changes and checkpoint commits before risky edits
  - add a short smoke-test checklist for every deploy
  - add automated checks for logged-out load, logged-in load, filtered queue, scoreboard, and admin
  - avoid mixing data repair, UI work, and unrelated deploys in one pass when possible
  - keep lightweight deploy notes so we know what changed and why
  - retire stale Poetry Please entrypoints such as `buttonpoetry.com/poetryplease` so old builds cannot create false bug reports

## Near-Term Build Order
- Finish Contest Builder testing with Emory’s dummy banner. Use the completed judging pilot as the initial review evidence; resolve the non-Button access gate and shortlist/export behavior before the first real contest.
- Run a short staff Explorer usability pass; prioritize fixes to common search, link, and asset-selection friction shown by that pass.
- Establish a low-friction safety rail before larger product changes:
  - create a one-command smoke test covering public load, logged-in feed API, filtered queue API, scoreboard API, and admin health
  - create a tiny deploy notes template/checklist so each deploy records what changed and what was verified
  - keep this process lightweight enough that it does not add meaningful manual work
- Then improve the public entry experience:
  - polish the first screen and login/anonymous choice
  - document and preserve the Short Form 2026 locked-lane share link: `https://poetryplease.org/app?catalog=Contest&book=Short%20Form%202026&locked=1`, ending with `Show me more poems!`
  - measure first content load timing
  - investigate non-Google account creation path after the entry flow is stable
- Continue the normal-user load-time stability pass:
  - keep the optimized fast path: small startup bootstrap, deferred ratings summary, moderate background hydration, and larger filtered review queues only where needed
  - monitor the remaining cold backend case: a fresh function instance can still take roughly 10 seconds while rebuilding the in-memory content cache from `20k+` Firestore records
  - trial `minInstances: 1` for the Firebase 2nd-gen `api` function so one container stays warm; confirm the reserved-instance estimate during deploy and watch real user timing for a few days
  - decide whether to keep both `minInstances: 1` and the persistent snapshot after measuring the single-instance warm path
- Build out the shared Drive migration:
  - maintain `MIGRATION_MANIFEST.md` as the local and Drive-facing map of what moved, where it lives, and whether Drive or GitHub is canonical
  - keep GitHub canonical for app code, functions, hosting assets, and deployable source
  - use Shared Drive for team-facing handoff files, import/export artifacts, production seed files, operating notes, and workflow documentation
  - migrate the next documentation batch: `SCORING_REFERENCE.md`, `APP_FUNCTION.md`, `LINK_GUIDE.md`, import/export templates, deploy notes, and smoke-test checklists
  - decide whether important Markdown files should remain raw `.md` snapshots or become Google Docs for easier team editing
  - decide how long to preserve older production import/export versions, and whether to add a `Deprecated / Do Not Use` folder
  - split large local workspaces such as `Social Media Dev` into code, source catalog data, exports, and generated media before moving anything bulky
  - avoid bulk-uploading whole repos, `.git`, `node_modules`, caches, generated build output, or unreviewed scratch folders
- Use the existing Poetry Please admin/content-library area as the first-pass Weaver intake surface
- Improve admin/content-library item inspection:
  - add thumbnails where content has an image/thumbnail URL so admins can visually identify records before editing
  - keep an `Open in Poetry Please` item link available for every row with a content id
  - mirror the thumbnail affordance in author mode so authors can recognize image-backed work without opening each item
- Reuse the current JSON-style preview/import flow for Weaver-fed `QI`
- Preserve per-item metadata even when Weaver groups requests upstream
- Resolve and visibly preview `releaseCatalog` during Weaver imports before commit
- Strengthen `bookLink` on handoff so imported assets carry a more complete catalog connection
- Reuse or port the Weaver excerpt/viewer module into Poetry Please so text previews behave consistently across tools
- Replace the separate `Title:` metadata row for text excerpts with a title displayed above or integrated into the poem text itself
- Move Drive service-account-backed folder import automation earlier in the import-assistant roadmap because it should reduce repeated manual recovery/import work long-term
- Move from preview/import to direct ingest once the handoff contract is stable
- Show a clear loading indicator in data-backed admin panels, starting with Flagged Content and its Recreation requests and Flags subpanels. Replace the initial empty-state text only after the request finishes, and distinguish loading, genuinely empty, and failed states.
- Build a durable Poetry Please -> Weaver -> P.I.G. repair loop for deleted or flawed graphics:
  - make Poetry Please Flagged Content the canonical moderation inbox: confirm the problem and choose `Re-approve`, `Correct source/text`, `Delete permanently`, or `Recreate`; show the consequence before confirmation
  - let Weaver own accepted cross-tool repair jobs and their lifecycle, while Poetry Please owns the flag, moderation decision, visibility, and final resolution
  - consolidate flag and recreate status into one future moderation command center instead of requiring staff to reconcile separate Poetry Please and Weaver panels
  - expose `Delete permanently` and `Recreate` as distinct admin actions from both Flags and Content Library
  - make permanent deletion remove the Poetry Please item from active content, preserve a compact deletion audit record, and send no new work downstream
  - make recreation hide the flawed item from review, create a stable repair request linked to the original content id, and send that request to Weaver
  - repair intake is live through Poetry Please PRs #206-#208 and Weaver PR #15: Recreate atomically reuses a flag's existing repair request; a retrying Firestore creation trigger sends its stable ID with the existing key, and Weaver fetches authoritative details and reuses one durable job. Poetry Please saves delivery only after validating a matching, unblocked, error-free receipt. A controlled re-delivery of Plantain request `SS1YeP4kTyNNx3DIrw86` returned the same job `weaver:repair:101ee5d4809632b71d44e7de98c83c21`; independent live readback confirmed one repair record and one actionable P.I.G. queue entry. Observe the next genuine new-request event through automatic delivery; the canary exercised the shared sender and live endpoint, not a newly created Firestore event. P.I.G.'s contract is unchanged.
  - have Weaver track the repair request as a separate lifecycle (`requested`, `accepted`, `in P.I.G.`, `returned`, `reviewed`, `completed`, or `failed`) instead of treating it as a fresh unrelated graphic
  - have P.I.G. receive the original image/source asset, editable metadata, problem note, and available creation history so staff can revise the existing work rather than start blind
  - return the replacement through Weaver into Poetry Please, preserving lineage between the original item, repair request, P.I.G. output, and replacement item
  - after a correction or accepted replacement is active, notify the author with a direct link to review that corrected item and cast a fresh vote; keep the earlier vote as superseded history rather than overwriting it, and use the fresh vote for the current version
  - show administrators a confirmation and status trail for both outcomes, including who acted, when, why, downstream status, and final replacement link
  - after accepting a returned repair, show an immediate success state tied to that request, then refresh the row with its resolved status, corrected title, replacement asset, and reopened author-vote count; avoid a temporary empty or stale panel that makes the result look uncertain
  - prevent deleted items from silently reappearing through later imports unless they belong to an explicit approved recreation request
  - prep first: define canonical cross-tool ids, deletion tombstones, repair-request schema, history fields safe to share with P.I.G., retry/idempotency rules, and service authentication for Poetry Please -> Weaver
  - prep first: inventory which P.I.G. source files and editable generation settings actually survive today; fall back to original image plus notes when an editable source is unavailable
  - begin with one QI canary and an admin-only manual action before extending the workflow to `INT`, `EXC`, `FPI`, or bulk repairs
  - finish the returned-repair acceptance loop:
    - Killmonger request `EXIQB20UoNj1vAWDqrL7` was accepted with the confirmed title `I grew my hair as a promise to the boy`; Poetry Please readback shows the same existing graphic ID, resolved request, and one reopened author vote. Confirm the corrected item is available for the author's fresh vote in the UI.
    - require Weaver to send structured `replacementAssetId` and `replacementAssetLink` fields instead of preserving them only in status notes/history
    - confirm Weaver mirrors Poetry Please `returnReviewStatus: accepted` or `status: resolved` into its repair ledger
    - test rejection end to end, including the required note and resuming the same job without creating another repair request
    - decide and implement the accepted-replacement activation rule: update the original item, create a linked replacement, or require one final admin action
    - resolve the source flag only after the accepted replacement is active, while preserving the complete lineage and moderation history
    - add reconciliation for missing replacement fields, inaccessible replacement assets, and Poetry Please/Weaver status disagreements
  - add an FP-specific decision path based on the pending-flag audit:
    - source exclusions (`not a poem`, epigraph-only, section break, front/back matter) should be removed from the canonical catalog export and tombstoned in Poetry Please so they do not return on the next import
    - repairable FP text (`bad lineation`, joined words, missing/incomplete poem, title typo) should return to the catalog/source layer, then idempotently update the same stable FP id while preserving votes and moderation history
    - visually dependent poems such as erasures/blackout poems should be routed toward an `FPI` asset rather than forced into damaged plain text
    - show source-repair status and the corrected record beside the original flag in Poetry Please
- Expose Poetry Please ranked texts as a P.I.G.-friendly source feed with stable text identity and duplication guard rails
- Wire the durable `FP`/`FPI` path across Poetry Please, Weaver, and P.I.G.:
  - keep `FP` as text-backed full poems from the local poetry catalog export
  - keep `FPI` as image-backed full poem photos/scans/screenshots that may need OCR or manual review
  - accept Weaver `FPI` imports into Poetry Please as graphics-backed review items with preserved book, author, title, catalog, page, Drive/image URL, OCR text, and review status metadata
  - keep `FP` and `FPI` distinct in filters, scoring, and downstream handoffs
  - expose Poetry Please scores for `FP` and `FPI` through an internal P.I.G.-friendly score feed so P.I.G. can isolate highly ranked poems/images for graphics generation
  - deploy and smoke-test `/api/internal/contentScores?type=FP` and `/api/internal/contentScores?type=FPI` with the Poetry Please API key
  - send Weaver the final import contract for `contentType: "FPI"` and confirm its payload shape
  - send P.I.G. the final score-consumer contract and confirm it can rank/select from Poetry Please scores
  - import a tiny FPI canary from Weaver before allowing bulk FPI imports
  - confirm `FPI` appears in Poetry Please image-type filters, scoreboard rows, voting, and score export
  - later decide whether reviewed `FPI` items should convert into canonical `FP`, link to an existing `FP`, or remain separate image evidence
- Add feed dedupe protection so sibling duplicate records do not re-serve after a recent vote
- Add a first-pass social ingest path for post metrics (views, likes, comments, saves, shares) tied to Poetry Please content ids
- Add published-post history so Poetry Please knows what assets have already gone out on social and where
- Take down or redirect the old Poetry Please version at `buttonpoetry.com/poetryplease` to the current app at `https://poetryplease.org/app`, and verify no team-facing docs or bookmarks still point at the stale build
- Follow up on the newly imported `INT` sets:
  - normalize `DBAT` title spelling/cleanup where the source filenames currently say things like `Promt`, `Statment`, `Assult`, and `Curce`
  - decide whether `WTF - INT - hi-05.jpg` and `WTF - INT - hi-06.jpg` should remain distinct variants
- Finish the large `QI` bucket repair cleanup:
  - resolve the remaining unrepaired records with missing source info:
    - `ETSA-QI-TOUCHING-V2`
    - `NABF-QI-ALTERNATE-UNIVERSE-IN-WHICH-I-AM-UNFAZED-BY-THE-MEN-WHO-DO-NOT-LOVE-ME-V4`
    - `NIO-QI-THE-OPPOSITE-OF-UP-V4`
    - `TF-QI-GET-UP-EARLY-GET-TO-THE-DOCK`
  - spot-check repaired `QI` records in the live app and confirm no lingering broken-image examples remain
  - make bucket-backed asset URLs the enforced default for future `QI` and `INT` imports so we do not regress to Drive thumbnails
- Expand Content Health into an audit-ready cleanup workflow:
  - show recent cleanup actions, including ID renames, metadata-only fixes, old ID -> new ID, book/catalog/shortener changes, actor, and timestamp
  - group remaining blockers by reason, such as missing title, duplicate graphic review, missing shortener, suffix exhausted, and unresolved catalog ambiguity
  - add a clear re-preview-after-cleanup state so admins can confirm counts dropped after applying fixes
- Build the next-generation import assistant:
  - centralize book/catalog metadata lookup
  - first pass: resolve filenames/rows against catalog metadata inside admin before import
  - add Drive service account support so the tool can enumerate shared folder contents without depending on an interactive browser session
  - add true folder import automation so a pasted Drive folder link can list candidate assets directly in admin
  - add Canva folder/subfolder inventory support for Poetry Please imports once the Canva connector is reauthenticated, including image/design separation, original-export needs, metadata preview, and blocked-row review before import
  - infer metadata from Drive folder hierarchy, filenames, EPUB/catalog context, and handle sheets
  - produce a ready-import file plus a follow-up review file instead of relying on one-off manual reshaping
- Surface YouTube social signal data more clearly in admin/content-library views, not only in Feed Signals
- Keep the content library count improvements generalized and trustworthy across all content types
- Make Scoreboard lighter and cheaper after first-pass pagination:
  - separate loaded rows from rendered rows throughout the table UI
  - consider server-side filtering/pagination for large scoreboard queries
  - make summary/progress views avoid loading/rendering the full item table
  - lazy-render expensive cells such as links and long IDs only for visible rows
  - make zero-vote inclusion an intentional heavier mode where useful
- Continue Team Progress as its own admin surface:
  - keep `/team-progress` backed by `/api/admin/teamProgress` instead of client-side full-scoreboard calculations
  - add Google Sheet export after the first-pass CSV export proves useful
  - add richer date presets if staff review cadence needs more than all time, today, 7 days, 30 days, and custom dates
  - add per-user remaining-work drilldown when admins need exact not-yet-reviewed item lists
  - decide whether Button team progress should eventually be visible to team leads or remain admin-only
- Expand full-poem scoring after the first derivative-content point pass:
  - evaluate whether all or some fraction of derivative content scores should roll back into the source `FP`
  - preserve direct `FP` vote score separately enough that we can explain whether a poem is winning because the poem itself works or because its excerpts/images/videos work
  - decide whether score-back should apply equally across `EXC`, `QI`, `INT`, `VV`, and `YT`, or use different weights by content type
- Continue refining the shared `INT`/`FPI` Scoreboard coverage lane:
  - preserve separate per-book `INT` and `FPI` counts while requiring at least 10 combined items
  - treat having both content types as desirable even though either type contributes equally to the shared baseline
  - consider whether future catalogs need a minimum of each type in addition to the combined target
- Finish full-poem import hardening:
  - preserve the catalog-backed `full-poems-all.json` export as the current FP source for P.I.G.
  - preserve `full-poems-all-review-needed.json` as the blocked/problem row review file
  - keep `Flee` excluded from normal poem-backed `FP` imports because it is fiction/chapter-backed
  - prevent repeated FP imports from creating suffixed sibling duplicates
  - add an admin cleanup/report for FP duplicate families if future imports regress
  - keep a short operational note for the July 2026 duplicate cleanup: 526 suffixed FP docs were deleted after the repeated bad import, leaving no suffixed FP docs with matching base IDs
  - add a preflight/import summary for FP JSON imports showing create/update/delete risk before execution
- Build mobile-first full-poem pagination as the successor/companion to auto-scroll:
  - split long `FP` text into stable reading pages that fit the Poetry Please viewing window on phones first, then desktop
  - preserve stanza breaks and avoid orphaning poem titles, single lines, or very short final pages
  - offer an explicit reading-mode toggle between paginated and auto-scroll views
  - remember a user's preferred reading mode without changing the poem's stored text
  - add previous/next page controls, page position, and accessible keyboard/touch navigation
  - test page boundaries across small phones, large phones, and desktop before making pagination the default
- Clarify excerpt presentation across viewers and generated graphics:
  - explore a stylized opening quotation mark at the top of excerpt graphics as an additional visual cue that the text is an excerpt
  - standardize whether excerpts include quotation marks across formats, including how marks interact with the new "Excerpt from" caption and poem punctuation
- Add visible book-disambiguation diagnostics to Scoreboard:
  - show possible duplicate book records caused by punctuation, case, spacing, or subtitle variants such as `The Willies` / `Thewillies`
  - flag subtitle-style splits where one canonical book is being counted as two scoreboard books
  - provide an admin review path before automated cleanup touches ambiguous book/catalog records
- Build a unified Poetry Please filter/menu system:
  - share the same catalog -> book filtering logic across the main app, Scoreboard, Admin, Import Assistant, Author review tools, and future lane-specific surfaces
  - when a catalog is selected, only show books available in that catalog
  - when a book is selected first, keep catalog choices consistent with that book where possible
  - use canonical book/catalog metadata instead of raw content values so subtitle, case, punctuation, and spacing variants do not leak into menus
  - expose reusable helpers for book, catalog, image type, queue mode, author, locked lane, and deep-link filters
  - keep existing deep links compatible with unified filter state, including contest, author, FP, and FPI lanes
  - add fallbacks for legacy URLs and content with missing catalog metadata
- Keep improving user submissions:
  - strengthen Admin review filters, search, and status visibility where staff testing shows friction
  - validate shortlist override and export before retiring the response-sheet workflow
  - later convert approved submissions into regular Poetry Please content when that workflow is ready
- Keep improving author accounts:
  - better admin diagnostics for invites, claims, and linked profiles
  - clearer review of what authored content and submissions are tied to each profile
  - add normal voting/ranking in author mode, or define a clear author-specific up/downrank workflow for content they are reviewing
  - make the author ranking workflow explicit in the UI so authors know whether they are judging quality, fit, priority, feature-worthiness, or correction needs
- Build the Author Account Command Center:
  - create an Admin dashboard for author onboarding, claimed accounts, associated work, feedback, and public profile readiness
  - show author profile statuses: `not invited`, `invited`, `claimed`, `profile incomplete`, `ready for review`, and `published`
  - add a per-author detail panel with invite status, claimed user, email mismatch warnings, associated content count, featured picks, unresolved author notes, and public/private state
  - interim: open author invitations in browser-based Gmail with recipient, subject, message, expiration note, and secure link prefilled; keep the link copied as a fallback
  - later: send author invites directly from Poetry Please through an approved transactional provider, including email entry, reusable templates, delivery status, resend, copy-link fallback, expiration, and claimed-state visibility
  - consolidate author feedback workflow: `not mine`, `typo`, `wrong book`, `don't feature`, and `missing work`, grouped by author with resolve buttons
  - add content association cleanup controls showing whether content is tied by author name, claimed ids, or manual association, with remove/add association actions
  - add a public profile readiness checklist covering bio, social links, featured work or fallback, profile published state, and review queue link readiness
- Clean up remaining ambiguous YouTube-derived book-title oddities:
  - investigate author-only labels where the author has multiple possible books, including `Ebonystewart`, `Neilhilborn`, `Rachelwiley`, and `Sierrademulder`
  - use item-level YouTube titles, authors, source URLs, and catalog metadata before assigning canonical book titles
  - keep these out of automated cleanup until the intended book can be confirmed

## Parked For Return
### Long Full Poems (`FP`)
Status: Paused intentionally for now.

When we come back to this thread, pick up here:
- Import the canary set:
  - `/Users/buttonpublishingone/Desktop/CODEX/Poetry Please/poetry-please/exports/full-poems-3000-plus-clean-test-15.json`
- Review long-poem behavior in the live app
- Decide whether the cleaned export is poem-like enough for a larger import
- Revisit whether prose-like pieces should be handled differently from poem-like `FP`
- Continue tuning auto-scroll only after the content-shape decision is clearer

Why this is parked:
- We proved the long-`FP` mechanic can work.
- The bigger open question is content classification: poem vs prose-poem vs prose.
- It makes sense to pause until we want to re-open that product decision.

## Next Good Threads
- Protect Poetry Please production deployment ownership:
  - [ ] make the full smoke test an enforced post-deploy requirement rather than a manual follow-up
  - [ ] move production deployment to a dedicated Poetry Please service account unavailable to unrelated projects and generated workspaces
  - [ ] add a deployment/configuration alert for unexpected runtime, memory, reserved-instance, or public-invoker changes
- Clean up post-import metadata for the new `WTF` and `DBAT` `INT` sets
- Build the author account system
- YouTube library lane (`YT`) import and curation
- Deep-link/share tools
- Full Poems reading polish for shorter and medium-length poems
- Scoreboard and admin diagnostics
- General desktop/mobile presentation cleanup

## Author email copy — draft, not sent

Updated 27 October 2026. These drafts replace the older three-part invitation copy; they do not change the live mail template or authorize a send. Preserve personal invitation and book-specific help resources, and verify their exact URLs and recipient before sending through Mandrill. Do not use Gmail drafts or sends. The September 29 staff walkthrough below is a historical sent-message record, not current author instructions.

### Revised invitation for future authors

**Subject:** Help shape how we share [Book Title]

Hi [First Name],

We'd love your help choosing how we share your work from **[Book Title]**.

The easiest place to start is your graphics: the quote images (QI) and interior photos (INT). Choose **Love**, **Meh**, **Like**, or **Dislike**. Love tells us which pieces you'd most like us to feature and use in more places. Meh means you don't have a strong preference; Like tells us you'd be happy for us to use it. Dislike tells our team you don't want that graphic used.

Then review the excerpts you'd most like us to share when promoting your book. Those choices help guide what we feature and which excerpts we make more graphics from. You don't need to review everything at once.

[Open your personal invitation]([Personal Invitation URL]) and sign in with the same email address that received this message. [Your book's help page]([Verified Book Help URL]) has a short explanation; the guided tour in Poetry Please can help you get started.

If you'd prefer different formatting or we're using an early version of a piece, reply with the title and your notes so we can adjust or recreate it. This is a chance to tell us your preferences, with room for more specific notes when you want to give them.

Would you be interested in reviewing or ranking full poems in the future? We'd like to hear what would be useful to you.

Questions or thoughts? Reply to this email.

Button Poetry

### Follow-up for previously invited authors

**Subject:** Your Poetry Please invitation for [Book Title]

Hi [First Name],

We'd love your thoughts on the graphics and excerpts we share from **[Book Title]**. Start with the quote images (QI) and interior photos (INT), using **Love**, **Meh**, **Like**, or **Dislike** to tell us which you'd most like us to use. Your favorites help guide what we feature; Dislike tells our team you don't want that graphic used.

Then, if you'd like, review the excerpts you'd most like us to share. A few reactions are useful—you don't have to work through everything.

[Open your personal invitation]([Personal Invitation URL]) using the email address that received this message. [Your book's help page]([Verified Book Help URL]) and the in-app tour explain how to get started.

If you'd prefer different formatting or we're using an early version, reply with the title and your notes so we can adjust or recreate it. We'd also like to know whether reviewing or ranking full poems would interest you in the future.

Thank you,
Button Poetry

**Recipient check before preparing a follow-up:** confirm the current invite/claim state and delivery evidence for each person. Use an existing invitation or an explicitly prepared replacement; do not infer that an unclaimed account means the earlier email was delivered. Bring the message, working links and recipient plan back for approval before any broader send.

## Eric and Madison author walkthrough — historical sent record, 2026-09-29

Sent from sam@buttonpoetry.com to Eric Tu and Madison Melby. Gmail message ID: `1a0ee7b2a6a6e1d7`. Both recipients and the desktop/mobile links were verified in Sent.

**To:** Eric Tu <eric61tu@buttonpoetry.com>, Madison Melby <mmelby@buttonpoetry.com>  
**Subject:** Timely: Please test Poetry Please on desktop and mobile today

Hi Eric and Madison,

Could you each do two separate passes through the author experience as if you were Matt Mason reviewing *Roads*: one on a desktop and one on a phone? Please reply to this email with your observations today if you can. We are testing whether the invitation, help page, tour, and app make the author’s choices clear.

We want authors to understand three things: they can tell us which graphics they like, feel neutral about, or do not want used; they can tell us when formatting or an earlier version needs adjustment or recreation; and they can vote up the poems and excerpts they most want us to use to market the book and inspire new graphics. We want the quickest first step to be reviewing QI quote images and INT interior photos.

**Desktop pass:** Read the exact invitation Matt received below. Then open the [Roads author help page](https://buttonpoetry.com/poetryplease/author-help/?book=Roads) and the [Matt Mason / Roads desktop author view](https://poetryplease.org/app?author=Matt%20Mason&book=Roads&locked=1&authorPreview=1). Use **Replay tour** if the guided tour does not appear. Explore the review guide, voting, and links to other sections.

**Mobile pass:** On a phone, read the same invitation and help page, then open the [Matt Mason / Roads mobile author view](https://poetryplease.org/m?author=Matt%20Mason&book=Roads&locked=1&authorPreview=1). Use **Replay tour** there too. Please note anything missing or harder to understand compared with desktop.

Please inspect the controls without casting votes, flagging or sending notes, or saving profile changes; these affect live content. If a link or author view is inaccessible, tell me where you got stuck.

Please reply by email under **Invitation**, **Help page**, **Desktop**, and **Mobile**. For each, tell me what you thought you were supposed to do, what was unclear, and the one change that would help most. Please call out where one part contradicts another.

**The exact invitation sent to Matt on September 28** (included here so you do not need access to his mailbox):

> Hi Matt Mason,
>
> This is an automated message from Button Poetry.
>
> We’re beginning to test a brand-new tool called **Poetry Please** with our authors, and we’d love for you to try it. The graphics, photos, and excerpts in the tool are pieces our team has already created or selected. What’s new is that Poetry Please gives us a way to share that work with you and makes it easy for you to tell us what you’d like to see more of, less of, or not at all.
>
> Please begin with your personalized author help page:
>
> **Review your Poetry Please instructions and example:**  
> https://buttonpoetry.com/poetryplease/author-help/?book=Roads
>
> The page includes additional instructions for signing in and using the tool. At the bottom of the page, you’ll find an example of Poetry Please in action.
>
> When you’re ready to enter the tool, go here:
>
> **Open Poetry Please:**  
> https://poetryplease.org/
>
> Please sign in or create an account using the same email address that received this message. Then review the materials connected to **Roads** and reply with your thoughts:
>
> - What you’re excited for us to share
> - What you’d prefer we feature less
> - Anything you think we’ve missed
> - Any errors in the information about you or your book
>
> This message was sent automatically, but you can reply directly to it. Sam will personally respond to your questions. You can also contact our monitored support address at support@buttonpoetry.com.
>
> This link is intended for you, so please don’t forward it.
>
> We’re excited to hear what you think.
>
> Best,  
> Button Poetry Team

Thanks,  
Sam

### Author help page copy proposed; WordPress login required to publish

The live page still has the older graphics-only introduction. Replace its introductory guidance and steps with this author-facing copy when WordPress editor access is available:

**Start with the graphics for your book.** In Poetry Please, select **My content**, then start with **QI Quote Images** and **INT Interior Photos**. These are the quickest pieces to review. Like a graphic you want us to share; use **Moved Me** for a favorite you want in prominent positions and more places; choose **Meh** if you do not care either way; and **Dislike** a graphic you do not want us to run again.

**Tell us what you would adjust.** If you do not like the formatting or we used an early version, reply to your invitation or email support@buttonpoetry.com with the title and your notes. We can adjust or recreate it. If a piece needs to be pulled while we review it, use Flag issue under Info.

**Shape what we make next.** After reviewing graphics, vote for the poems and excerpts you most want used to market your book. Your choices guide what we feature and which new graphics we make. You do not need to review everything at once.

### Short form contest handoff follow-up (2026-10-14)

After the short form contest is fully enacted, verify and complete the assignment route from Poetry Please to P.I.G., then Weaver, then back to Poetry Please. Confirm the return receipt and status are visible on the original contest assignment; preserve its identity across the handoff.
