# Poetry Please Roadmap

Completed work is recorded in `ROADMAP_ARCHIVE.md`.

## Active Focus
- Contest program and judging workflow (live; initial pilot closed):
  - native Poetry Please intake is live with Google and email-link sign-in, My Submissions, required poem title, eligibility/terms checks, and an internal test program
  - three-reviewer Yes / Maybe / No adjudication and Admin totals are live; three synthetic entries reached three saved reviews, and the Admin totals display was repaired
  - a separate Contest Builder role is live for selected staff; the builder supports contest name, opening/closing times, submission enablement, entrant link, and banner upload with a recommended 1600 × 600 image
  - Emory verified that a test contest stayed closed until enabled and closed after its end time; the closed entrant page is intended to retain its banner and contest details
  - next: visually verify an uploaded dummy banner and its crop on the entrant page; collect staff feedback on the builder and reviewer flow
  - launch gate: confirm whether every verified @buttonpoetry.com address should have reviewer access, and verify reviewer/Admin denial with a non-Button contestant account
  - next: confirm the ranked shortlist, admin override, export, and content-featuring path before declaring the Google Form/response-sheet replacement complete; the completed pilot entries are sufficient for the initial review check
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
  - TOP TIER: let authors download the original, high-resolution QI/INT graphics and photos tied to their books, individually and in a practical batch; clearly label file type/quality and keep private review access separate from shareable/public assets
  - TOP TIER: give authors a straightforward way to share approved assets to other platforms (download-first and copyable public links where appropriate), with mobile support, rights/approval safeguards, and no public exposure of private review links or unreleased work
  - make the review queue the author starting point; keep the compact review guide collapsible and connect its QI, INT, EXC, and FP links to the relevant lanes
  - split the current author editor into three clearly explained surfaces: public profile, featured selections, and granular issue review, with links between them and the review queue
  - restrict featured selection to pieces this author voted Moved Me on; if none exist, show an empty state with a review queue link; add an author-scoped vote list to the editor API before changing the UI
  - restrict granular issue review to pieces this author flagged, voted Meh on, or voted Dislike on; expose those author-scoped states in the API and keep the review list separate from profile editing
  - separate adjustment notes from the existing `contentFlags` action: the current editor’s “Send note” uses `contentFlags`, which pauses/pulls a piece; add a distinct adjustment request when the author only wants formatting or version changes, with clear status and a deliberate pull action for urgent concerns
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
- Build a durable Poetry Please -> Weaver -> P.I.G. repair loop for deleted or flawed graphics:
  - make Poetry Please Flagged Content the canonical moderation inbox: confirm the problem and choose `Re-approve`, `Correct source/text`, `Delete permanently`, or `Recreate`; show the consequence before confirmation
  - let Weaver own accepted cross-tool repair jobs and their lifecycle, while Poetry Please owns the flag, moderation decision, visibility, and final resolution
  - consolidate flag and recreate status into one future moderation command center instead of requiring staff to reconcile separate Poetry Please and Weaver panels
  - expose `Delete permanently` and `Recreate` as distinct admin actions from both Flags and Content Library
  - make permanent deletion remove the Poetry Please item from active content, preserve a compact deletion audit record, and send no new work downstream
  - make recreation hide the flawed item from review, create a stable repair request linked to the original content id, and send that request to Weaver
  - have Weaver track the repair request as a separate lifecycle (`requested`, `accepted`, `in P.I.G.`, `returned`, `reviewed`, `completed`, or `failed`) instead of treating it as a fresh unrelated graphic
  - have P.I.G. receive the original image/source asset, editable metadata, problem note, and available creation history so staff can revise the existing work rather than start blind
  - return the replacement through Weaver into Poetry Please, preserving lineage between the original item, repair request, P.I.G. output, and replacement item
  - show administrators a confirmation and status trail for both outcomes, including who acted, when, why, downstream status, and final replacement link
  - prevent deleted items from silently reappearing through later imports unless they belong to an explicit approved recreation request
  - prep first: define canonical cross-tool ids, deletion tombstones, repair-request schema, history fields safe to share with P.I.G., retry/idempotency rules, and service authentication for Poetry Please -> Weaver
  - prep first: inventory which P.I.G. source files and editable generation settings actually survive today; fall back to original image plus notes when an editable source is unavailable
  - begin with one QI canary and an admin-only manual action before extending the workflow to `INT`, `EXC`, `FPI`, or bulk repairs
  - finish the returned-repair acceptance loop:
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

Use the placeholders for each author and book. The personalized help page should point to that book’s `/poetryplease/author-help/?book=...` URL. These are copy drafts for review, not permission to send. The 2026-09-28 invitation has already been sent; the follow-up below is for those recipients.

### Revised invitation for future authors

**Subject:** Help shape how we share your work in Poetry Please

Hi [First Name],

We’re inviting you to try **Poetry Please**, a new way to review the graphics, photos, poems, and excerpts we may use to promote **[Book Title]**. Your choices help us make three decisions:

1. **Which graphics should we use?** Mark the ones you like, feel neutral about, or don’t want us to run. **Moved Me** marks a favorite for more prominent use; **Dislike** tells our team to stop using that piece in future posts.
2. **Would you change anything?** If the formatting feels off or we used an early version of a piece, reply with the title and your notes. We can adjust or recreate it. If a piece needs to be pulled while we review it, use Flag issue under Info in Poetry Please.
3. **What should we make more of?** Vote for the poems and excerpts you’d most like us to use in marketing your book. Those choices help us decide what to feature and what to make new graphics from.

Start with [your author help page]([Personalized Help URL]) for instructions and an example. Then [open Poetry Please](https://poetryplease.org/) and sign in or create an account with the email address that received this invitation.

There’s no need for a formal review. Your reactions and any corrections are exactly what we need. You can reply to this message with questions or ideas.

Best,  
Button Poetry Team

### Follow-up to authors who received the 2026-09-28 invitation

**Subject:** A quick follow-up on your Poetry Please review

Hi [First Name],

A quick follow-up to yesterday’s Poetry Please invitation: we’d love your help with three decisions about **[Book Title]**.

1. **Which graphics should we use?** Like the ones you’d share, mark favorites with **Moved Me**, choose **Meh** if you have no strong preference, and **Dislike** anything you don’t want us to run again. We treat Dislike as a stop signal for future posts.
2. **Would you change anything?** If you would prefer different formatting or we used an early version, reply with the title and a note. We can adjust or recreate it. Use Flag issue under Info if a piece needs to be pulled while we review it.
3. **What should we make more of?** Vote for the poems and excerpts you most want featured in your book’s marketing. Your choices guide what we feature and what we make new graphics from.

[Your author help page]([Personalized Help URL]) has the instructions and an example. You can [open Poetry Please here](https://poetryplease.org/) using the same email address that received your invitation. There’s no need to review everything at once.

Thank you for helping us get this right. You can reply directly with questions or ideas.

Best,  
Button Poetry Team

## Eric and Madison author walkthrough — sent 2026-09-29

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
