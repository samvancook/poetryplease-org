# Poetry Please Workspace Rules

## Production Deployment

- Canonical repository: https://github.com/samvancook/poetryplease-org. Land production changes on `main` through a pull request with passing checks. This is a solo-developer repository; an additional person's PR review is not required.
- The existing `.github/workflows/firebase.yml` workflow deploys production from `main` after a merge. Use that established GitHub Actions path; do not invent or switch deployment methods.
- The production Firebase project must be `poetry-please` and the HTTPS function must remain public.
- After every deployment, confirm `/api/healthz` and anonymous `/api/bootstrap` succeed.

## Capability Verification

- Treat listed skills as available capabilities, even if their underlying tools are not visible in an initial tool inventory.
- Never declare a capability unavailable based only on `ALL_TOOLS`, tool search, or missing obvious method names.
- When a relevant skill exists, attempt that skill's documented workflow once before reporting a blocker.
- If the user says an approach worked previously, treat that as evidence and reproduce it before proposing alternatives.
- Report the exact attempted action and exact failure. Do not replace evidence with inference.
- Do not switch approaches without explicit approval.

## Workflow

Standard git/GitHub workflow applies: branch, commit, open a pull request, check it, and merge it. The existing GitHub Actions workflow deploys merged `main` to production. Follow the current workspace's tool restrictions when carrying out these steps.

## Protected startup boundary

Sam's explicit approval is required before editing startup orchestration, entry routing, the bootstrap response contract, or work scheduled before the first readable card. Approval must identify the startup work being changed. Ordinary content-type, catalog, repair, and viewer work should use the existing interfaces.

Current protected areas include the startup portions of public/app.js and public/scroll.js, public/mobile-entry.js, the script/bootstrap declarations in public/index.html, public/mobile.html and public/posts-swipe*.html, and server bootstrap contracts. These shared files contain other behavior too. Changes to that unrelated behavior should preserve startup and run the startup checks.

The dedicated loader development thread owns public/startup-loader.js (Desktop and classic mobile), public/feed-startup.js (Swipe and related feed variants), and changes to the startup interface. Coordinate protected startup work through that owner and obtain Sam's explicit approval identifying the change.

tests/browser-startup.test.js fingerprints those two modules, public/mobile-entry.js, and the script declarations in public/index.html, public/mobile.html, public/posts-swipe.html and public/posts-swipe-outline.html. Ordinary content and presentation edits can use the existing interfaces. A protected edit fails the baseline check. Update only the affected baseline after Sam explicitly approves the startup change, and include that approval's scope in the PR description. The baseline is a guard against accidental edits; Sam's approval is the ownership policy. Do not update baselines simply to make an unrelated change pass.

Before changing startup, run the existing CI test entry, node --test tests/explorer.test.js. This includes the boundary checks and real local Chrome startup checks with synthetic account and feed responses. It does not measure production network or Firebase SDK availability.
