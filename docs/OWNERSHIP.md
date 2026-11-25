# Poetry Please ownership map

Last updated: 21 November 2026. Owner of this file: Claude in the Poetry Please Claude project.

This is the single list of who runs each part of Poetry Please. Read it after `AGENTS.md` and before starting work. When a part changes hands, update its row here in the same PR, with the date and a link to the handoff.

## Who the owners are

- **Claude (this project).** Claude in the Poetry Please Claude project. Each workstream has its own thread there. Sam approved this project taking over Poetry Please as a whole on 21 November 2026.
- **Sam.** Owns product decisions, approves any protected startup change (see `AGENTS.md`), approves sends to people outside the team, and approves contest policy.
- **Adjacent systems.** Catalog, Weaver, P.I.G., Calendar/Social Publishing, Warehouse and Paper Submarine are separate systems with their own owners. Poetry Please owns its side of each contract (the receiver routes and records in this repo). It does not own their code or data.
- **Not yet confirmed.** Parts that earlier ChatGPT or Codex chats ran and that have no handoff to this project yet. These stay as they are until Sam confirms the old owner is retired. Do not change them on the strength of this file alone.

Status words used below:

- **Owned**: Claude owns it today and has a handoff on record.
- **Taking over**: approved and in progress.
- **Default owned**: covered by the 21 November whole-project takeover, but no separate handoff was written. Claude owns it. Check the history before large changes.
- **Not yet confirmed**: see above.
- **Manual**: Sam or staff do it by hand; nothing automated runs it.

## Production, deploy and guards

| Part | Where it lives | Owner | Status and notes |
| --- | --- | --- | --- |
| Production deploy | `.github/workflows/firebase.yml` (push to `main`; keyless sign-in) | Claude | Owned. Claude merges its own PRs once CI is green (Sam, 10 Nov). Only route to production. After every deploy, check `/api/healthz` and anonymous `/api/bootstrap`. |
| Manual jobs inside the deploy workflow | `firebase.yml` `preview_backfill` input (preview status/request/retry, restore/reattach/retitle plans, excerpt imports, signed-in startup probe) | Claude | Owned. These live in `firebase.yml` because Sam's Google Cloud identity rule only accepts that workflow. Other threads dispatch it too, so pick your own run by time and job name. |
| Anonymous startup probe | `.github/workflows/startup-probe.yml`, `scripts/startup-probe.mjs`, `scripts/startup-probe-token.mjs` | Claude | Owned. Read-only production observation. |
| Excerpt maintenance jobs | `.github/workflows/excerpt-maintenance.yml`, `functions/resolve_filled_excerpt_flags.js` | Claude | Default owned. Manual dispatch, dry run by default. |
| Old deploy script | `scripts/deploy-production.sh` | none | Retired since 28 Oct. Do not use. Kept for history. |
| Smoke test | `scripts/smoke-test.mjs`, `DEPLOY_CHECKLIST.md` | Claude | Default owned. Still a manual follow-up; making it a required post-deploy step is open on the roadmap. |
| Startup guard tests | `tests/browser-startup.test.js`, `tests/browser-startup-runtime.test.js`, `tests/explorer.test.js` | Claude (startup owner) | Owned. Baselines change only with Sam's approval of a named startup change. |
| Secrets in Firebase | `POETRY_PLEASE_API_KEY`, `PIG_POETRY_PLEASE_API_KEY`, `CATALOG_RECONCILIATION_API_KEY`, `MANDRILL_AUTHOR_INVITE_API_KEY` | Sam | Sam controls credentials. Claude uses them through the deployed functions only. |

## Backend functions (Firebase project `poetry-please`, `functions/index.js`)

| Function | Kind | Owner | Status and notes |
| --- | --- | --- | --- |
| `api` | HTTPS Express app, `minInstances: 1`, 2GiB memory, must stay public | Claude | Owned. Holds nearly every route below. |
| `contestscheduledemailsdispatch` | Schedule, every minute | Claude (contest thread) | Owned since 19 Nov (from Codex). Sends contest mail through Mandrill. Never use the Mailchimp website. |
| `staffreviewdailydigest` | Schedule, 8:00 AM Central | Claude | Default owned. Daily staff review digest email through Mandrill. No handoff on record. |
| `ratingssummaryrefresh` | Schedule, 3:00 AM Central | Claude (billing/feed) | Owned. Rebuilds the ratings snapshot and staff demotions. |
| `graphicdisplaypreview` | Firestore trigger | Claude (graphics thread) | Owned. Makes display previews for graphics. |
| `weaverrepairnotify` | Firestore trigger | Claude | Default owned. Tells Weaver about new repair requests. |
| `qilibraryyearworker` | Cloud Tasks worker | Claude | Default owned. QI library year import worker (code first built in the old `poetry-please` repo, Aug 2026, now ported here). |
| `weavervideodurablecopyworker` | Cloud Tasks worker | Claude (video thread) | Owned. Durable copies of large Weaver videos. |
| `manuscriptreconciliationpreview`, `manuscriptreconciliationphase2preview` | HTTPS, Catalog-backed | Claude, with Catalog | Default owned on the Poetry Please side. Talks to the Catalog Cloud Run service, which Catalog owns. |

## App modules

| Module | Main files | Owner | Status and notes |
| --- | --- | --- | --- |
| Startup and loader | `public/startup-loader.js`, `public/feed-startup.js`, `public/mobile-entry.js`, startup parts of `public/app.js` and `public/scroll.js`, script tags in `index.html`, `mobile.html`, `posts-swipe*.html`, bootstrap contract | Claude | Taking over. Ownership moved from the ChatGPT owner chat on 10 Nov. That thread runs it. Protected: Sam approves each change. Handoff: [START HERE — Loader and Startup](https://docs.google.com/document/d/1ox_GEvK057BFb-r9-EoqyJeG3GgALAMkMxICC2r92Bs/edit). |
| Firestore reads and billing | read paths in `functions/index.js`, `content-cache-policy.js`, voted-ID cache | Claude | Owned. A separate thread checks daily reads. |
| Feed cache and content snapshot | `functions/content-cache-policy.js`, snapshot code in `functions/index.js` | Claude | Owned (PR #427). |
| Feeds and viewers (Desktop, classic mobile, Swipe, posts variants, read) | `public/app.js`, `app-mobile.js`, `scroll*.js`, `swipe-*.js`, `posts-*.html/js/css`, `post-cards.js`, `read.html/js`, `functions/swipe-feed.js`, `scroll-feed.js` | Claude | Default owned. Was "Poetry please redux" in ChatGPT. Startup portions stay protected. |
| Graphics, previews and quote-image audit | `functions/display-preview.js`, `restore-graphic-original.js`, `graphic-retitle.js`, `graphic-asset-set.js`, `diagnose-display-previews.mjs`, `docs/handoffs/graphic-*.json` | Claude | Owned. |
| Excerpt import and excerpt data | `functions/excerpt-batch-import.mjs`, `excerpt-linebreaks.js`, `excerpt-poem-keys.js`, `backfill_excerpt_*.js`, `imports/` | Claude | Owned (excerpt import, 17 Nov). |
| Video intake, renditions and readiness receipts | `functions/weaver-video-intake.js`, `weaver-video-copy.js`, `video-renditions.js`, `video-performance-context.js`, `footage-provenance.js`, internal routes `weaverVideoReceipt`, `videoRenditions`, `weaverImportHealth` | Claude | Owned. Next action from Weaver (20 Nov): 31 more sources wait for Poetry Please readiness. |
| Contest module | `public/contest-review.html`, `contest-builder.html`, `contest-submit.html`, `my-submissions.html`, contest routes, `CONTEST-PROCESS.md` | Claude (contest thread) | Owned since 19 Nov (from Codex). Next-contest policy is a draft, not approved. |
| Admin, content library and import assistant | `public/admin.html`, `functions/import-jobs.js`, `uploader-helpers.js` (design notes: `DETERMINISTIC_QI_UPLOADER.md` on Drive) | Claude | Default owned. |
| Author suite: accounts, public pages, editor, command center, invites, claims, submissions, repair notices | `public/author.html`, `author-edit.html`, `author-command-center.html`, `my-submissions.html`, `functions/author-invite-mail.js`, `author-repair-notices.js`, `/authorProfiles`, `/authorInvites`, `/contentClaims`, `/authorAssets`, `/my/*` routes | Claude | Taking over (Sam, 23 Nov). A priority workstream; see "Author suite" at the top of `ROADMAP.md`. Was "Poetry Please author invites and sharing" in ChatGPT. Any real send to authors needs Sam's approval. |
| Staff review, scoreboard, team progress | `public/staff-review.html`, `scoreboard.html`, `team-progress.html`, `functions/book-review-groups.js`, `SCORING*.md` | Claude | Default owned. |
| Serving trials (staff-only) | `public/serving-trials.html`, `functions/serving-trials.js`, `serving-trial-profiles.json` | Claude | Default owned. Staff-only comparison; public rollout is a product decision. |
| Catalog identity and manuscript reconciliation | `functions/catalog-identity.js`, `poem-relations.js`, `manuscript-reconciliation*.js`, `public/manuscript-*.html/js` | Claude, with Catalog | Default owned on the Poetry Please side. Catalog owns source text and permanent keys. |
| Embeds and public links | `public/embed.html`, `poem-links.js`, `LINK_GUIDE.md` | Claude | Default owned. |
| Analytics | `public/pp-analytics.js` | Claude | Default owned. |
| Explorer (staff lookup) | `public/explorer/` | Claude | Default owned for upkeep. New Explorer features (commenting, post composition) belong to Paper Submarine ([closeout](https://drive.google.com/file/d/195noFm3uIUQHJuokSwlOpmAhSkiC-WDm/view)). |
| One-off backfills | `functions/backfill_*.js`, `migrate_weaver_excerpt_ids.js`, `flag_exc_photo_instruction_ellipsis.js`, `plan_excerpt_poem_key_second_pass.js`, `broken-qi-*.json` | Claude | Default owned. Historical; don't rerun a completed backfill. |

## Adjacent systems (Poetry Please owns only its side)

| System | Their repo or home | What Poetry Please owns | Open Poetry Please work they sent |
| --- | --- | --- | --- |
| Catalog | `samvancook/button-poetry-catalog`, Cloud Run | Reading Catalog, keeping permanent keys on records | Held Catalog exceptions in the roadmap blocker register |
| Weaver (video and excerpts) | `samvancook/weaver` | Receiver routes, receipts, readiness certificates | 31-source readiness cohort ([handoff](https://docs.google.com/document/d/18o6rl19r2Ra3_Au_HnWXIPI_DDuk1CQm1sNU_1SAlJA/edit)) |
| P.I.G. (graphics) | its own workstream | Receiving finished graphics, repair returns | Intern guide panel and example links ([handoff](https://docs.google.com/document/d/1EBZxnxDH-RIBmco-3UhjPuo1u7HcCyQWyvQ_jvhMgf4/edit)) |
| Calendar and Social Publishing Automation | Calendar workbooks, publishing workers | Nothing on their side; they link to bucket images | Fix 12 misspelled DON'T BE AFRAID TO BE BAD INT titles without breaking calendar image links ([handoff](https://drive.google.com/file/d/1Yv0-tTi9WssplHt4Dx98J3QL3d8ojzSE/view)) |
| Warehouse | BigQuery `button-social-warehouse` | Nothing | none |
| Paper Submarine | its own project | Nothing | Explorer integration (theirs) |
| Master Excerpt Database (planned) | Catalog's Cloud SQL (Sam chose it on 23 Nov), loaded from the SQLite master on the buttonpublishingone Mac | Excerpts become a display and review copy synced from the master by excerpt ID and `poem_key`; PP keeps its own votes, flags and repairs and sends text corrections back | Not yet. A separate PP handoff will follow the load ([plan](https://docs.google.com/document/d/1ar1HzWXFx7QvieJaQLdE6h55o5JwOOZtNUxu4V0JaQo/edit)). Until then PP's 15,015 excerpts stay as they are. |

## Manual work and things outside this repo

| Item | Where | Owner | Status |
| --- | --- | --- | --- |
| Drive handoffs and receipts | [Poetry Please Drive folder](https://drive.google.com/drive/folders/1n7HW4jnjNHeP5cEuwcPoYX5o3uE0sGjS), mostly its Docs subfolder | Claude | Owned. GitHub stays canonical for code and `ROADMAP.md`. Drive holds handoffs, receipts and import files (`MIGRATION_MANIFEST.md`). |
| Drive copy of `ROADMAP.md` | Drive Docs folder | Claude | Owned. A snapshot; refresh after big roadmap changes. |
| QI OCR and QI calendar builder scripts | Drive only: `qi-ocr.swift`, `qi-ocr-clean.mjs`, `qi-calendar-builder.mjs`, `QI_CALENDAR_BUILDER.md` (Aug 2026) | not yet confirmed | Not in any repo. Ask Sam whether these still run, and where. |
| Codex machine checkouts | `/Users/buttonpublishingone/Desktop/CODEX/...` (`poetry-please`, `Social Media Dev/poetryplease-org-roads112`) | not yet confirmed | Old checkouts on Codex's Mac. Codex reported on 23 Nov that `roads112` is clean at `c52f31a` with nothing unique. Codex's own audit of local files, schedules and access is waiting on Sam's file-scope approval ([handoff](https://docs.google.com/document/d/1N9UoWWipDmYA6EPilLQ76bl2Uw9tVOFrLHaVU6LxNJM/edit)). Retire once that audit is in. |
| Local checkout on Button-Video-Four | `~/Claude/poetryplease-org` | Claude | 291 commits behind `main`, on branch `feat/review-progress-indicator` with one unpushed commit ("Ignore personal Claude Code settings"). Safe to retire. |
| Contest operations (assigning readers, picking winners, sending results) | contest admin pages | Sam and contest admins, with Claude | Manual by design. Claude builds the tools; people decide and send. |
| Author outreach and invitation sends | Mandrill | Sam | Manual. Drafts in `ROADMAP.md`; sends need Sam's approval. |
| Stale open PRs | #76, #101, #102, #103, #104 (Sept–Oct) | Claude | Default owned. Need triage against current `main`; likely close most. |

## Takeover order

Safest first. Startup and loader last. Each step is one thread and one PR or a handoff note.

1. **Paperwork only (this PR).** This map, linked from `AGENTS.md`. No code.
2. **Retire the old `samvancook/poetry-please` repo.** Sam approved archiving it on 23 November 2026. Nothing in it is missing here. Its August QI uploader branch was ported into `functions/import-jobs.js` and `uploader-helpers.js`. Its TikTok callback is listed under "Might revisit" below.
3. **Close out stale PRs #76 and #101–#104.** Done 23 Nov for #101 (ported as #446) and #103 (ported as #448). #102 (event filter) and #104 (reviewer position) change code that runs before the first card, so they wait for Sam's startup approval. #76 (admin graphics CSV) is a product call; the read-only `catalog-export` job in `firebase.yml` covers most of it.
4. **Confirm the unconfirmed items above** with Sam (Drive-only QI scripts, Codex checkouts, any ChatGPT or Codex chats still running jobs), then mark them owned or retired.
5. **Default-owned backend jobs.** Code read 23 Nov; logs not yet checked. `staffreviewdailydigest` (PR #389, 16 Nov) sends one Mandrill email a day to Sam only, with the staff review lanes; it reads users, excerpts, video occurrences, full poems and staff votes once a day. `weaverrepairnotify` (PR #207, 14 Oct) tells Weaver about each new Recreate repair request and retries on failure. `qilibraryyearworker` (PR #7, 17 Aug) runs QI library year imports one at a time from Cloud Tasks; it only runs when an admin starts a year import.
6. **Open handoffs sent to Poetry Please.** The DBAT INT title fix (copy-then-relink, keep old objects until after 17 Dec), the 31-source video readiness cohort (Codex's 23 Nov packet; recount before acting, rollback is field-scoped only), and the intern guide panel. Coming later: syncing excerpts from the master Excerpt Database.
7. **Author suite (priority, added by Sam 23 Nov).** Accounts, public author pages, the editor, the command center, invites, claims and submissions as one workstream. Starting point and next steps are in the "Author suite" section at the top of `ROADMAP.md`. The signed-in startup wait on author data belongs to the startup owner.
8. **Other feature modules with no recent owner**: staff review, serving trials, Explorer upkeep, embeds. Take them as work comes up.
9. **Startup and loader, last.** Already approved and in progress in its own thread. Every protected change still needs Sam's approval of that specific change.

## Might revisit

Things that live outside this repo on purpose. Sam may want to bring them closer later. They need no work now.

| Item | Where it lives now | Why it might come back |
| --- | --- | --- |
| TikTok sign-in callback page | Its own Firebase Hosting site, `button-poetry-tiktok-auth.web.app`, deployed from the social scheduler's repo. First drafted as [poetry-please PR #6](https://github.com/samvancook/poetry-please/pull/6), closed unmerged on 8 Oct 2026. | When a TikTok account holder approves the Button Poetry publisher, TikTok sends them to this page with a one-time code (good for 10 minutes). The page shows the code to copy into the publisher setup. It saves nothing and calls nothing in Poetry Please. It was kept off poetryplease.org so it couldn't affect the live app. Revisit if Sam wants every Button Poetry web page under one deployment, or if the scheduler repo is retired. |

## Keeping this file current

- One row per part. Change the row, don't add a second one.
- When ChatGPT, Codex or another chat hands something over, set the row to Owned and link the handoff.
- Dated history goes in `ROADMAP.md` or Drive receipts, not here.
