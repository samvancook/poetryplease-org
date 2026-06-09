# Poetry Please Roadmap

## Active Focus
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

## Top Product Priorities
- Smooth the general user experience:
  - make logged-out and anonymous entry feel intentional instead of like a loading state
  - keep first content load fast and predictable
  - improve account creation options beyond Google/Gmail where useful
  - make login, continue-without-login, and account creation visually polished
  - add lightweight load/error timing so stuck sessions are easier to diagnose
- Get author accounts fully usable:
  - finish author claim/invite flow
  - give authors a simple dashboard of their own content
  - let authors flag or suggest corrections on their own content
  - show author-facing response summaries without exposing raw admin tooling
- Reduce development risk while continuing feature work:
  - use small scoped changes and checkpoint commits before risky edits
  - add a short smoke-test checklist for every deploy
  - add automated checks for logged-out load, logged-in load, filtered queue, scoreboard, and admin
  - avoid mixing data repair, UI work, and unrelated deploys in one pass when possible
  - keep lightweight deploy notes so we know what changed and why
  - retire stale Poetry Please entrypoints such as `buttonpoetry.com/poetryplease` so old builds cannot create false bug reports

## Near-Term Build Order
- Establish a low-friction safety rail before larger product changes:
  - create a one-command smoke test covering public load, logged-in feed API, filtered queue API, scoreboard API, and admin health
  - create a tiny deploy notes template/checklist so each deploy records what changed and what was verified
  - keep this process lightweight enough that it does not add meaningful manual work
- Then improve the public entry experience:
  - polish the first screen and login/anonymous choice
  - measure first content load timing
  - investigate non-Google account creation path after the entry flow is stable
- Continue the normal-user load-time stability pass:
  - keep the optimized fast path: small startup bootstrap, deferred ratings summary, moderate background hydration, and larger filtered review queues only where needed
  - monitor the remaining cold backend case: a fresh function instance can still take roughly 10 seconds while rebuilding the in-memory content cache from `20k+` Firestore records
  - trial `minInstances: 1` for the Firebase 2nd-gen `api` function so one container stays warm; confirm the reserved-instance estimate during deploy and watch real user timing for a few days
  - next stability project: create a compact persistent feed/content snapshot in Storage or Firestore so a fresh function instance can load one artifact instead of rescanning all content collections
  - rebuild or invalidate the persistent feed snapshot after imports, edits, deletes, moderation/flag changes, and other content mutations
  - preserve the current Firestore scan as a fallback when the persistent snapshot is absent or stale
  - decide whether to keep both `minInstances: 1` and the persistent snapshot after measuring the single-instance warm path
- Schedule the Firebase runtime maintenance separately from feature work:
  - upgrade the deprecated Node.js 20 Cloud Functions runtime before its October 31, 2026 decommission date
  - upgrade the outdated `firebase-functions` package carefully, with a dedicated smoke-test pass for breaking changes
- Use the existing Poetry Please admin/content-library area as the first-pass Weaver intake surface
- Reuse the current JSON-style preview/import flow for Weaver-fed `QI`
- Preserve per-item metadata even when Weaver groups requests upstream
- Resolve and visibly preview `releaseCatalog` during Weaver imports before commit
- Strengthen `bookLink` on handoff so imported assets carry a more complete catalog connection
- Reuse or port the Weaver excerpt/viewer module into Poetry Please so text previews behave consistently across tools
- Move Drive service-account-backed folder import automation earlier in the import-assistant roadmap because it should reduce repeated manual recovery/import work long-term
- Move from preview/import to direct ingest once the handoff contract is stable
- Expose Poetry Please ranked texts as a P.I.G.-friendly source feed with stable text identity and duplication guard rails
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
- Keep improving user submissions:
  - stronger admin review tools (filters, search, status visibility)
  - later convert approved submissions into regular Poetry Please content when that workflow is ready
- Keep improving author accounts:
  - better admin diagnostics for invites, claims, and linked profiles
  - clearer review of what authored content and submissions are tied to each profile
- Build the Author Account Command Center:
  - create an Admin dashboard for author onboarding, claimed accounts, associated work, feedback, and public profile readiness
  - show author profile statuses: `not invited`, `invited`, `claimed`, `profile incomplete`, `ready for review`, and `published`
  - add a per-author detail panel with invite status, claimed user, email mismatch warnings, associated content count, featured picks, unresolved author notes, and public/private state
  - send author invites directly from the tool, including email entry, message/template support, send status, resend, copy-link fallback, expiration, and claimed-state visibility
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
- Clean up post-import metadata for the new `WTF` and `DBAT` `INT` sets
- Build the author account system
- YouTube library lane (`YT`) import and curation
- Deep-link/share tools
- Full Poems reading polish for shorter and medium-length poems
- Scoreboard and admin diagnostics
- General desktop/mobile presentation cleanup
