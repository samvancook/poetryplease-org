# Poetry Please Roadmap

## Active Focus
- App polish and reliability
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

## Near-Term Build Order
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
  - infer metadata from Drive folder hierarchy, filenames, EPUB/catalog context, and handle sheets
  - produce a ready-import file plus a follow-up review file instead of relying on one-off manual reshaping
- Surface YouTube social signal data more clearly in admin/content-library views, not only in Feed Signals
- Keep the content library count improvements generalized and trustworthy across all content types
- Keep improving user submissions:
  - stronger admin review tools (filters, search, status visibility)
  - later convert approved submissions into regular Poetry Please content when that workflow is ready
- Keep improving author accounts:
  - better admin diagnostics for invites, claims, and linked profiles
  - clearer review of what authored content and submissions are tied to each profile

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
