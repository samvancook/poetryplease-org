# Poetry Please Workspace Rules

## Production Deployment

- Canonical repository: https://github.com/samvancook/poetryplease-org. Do production work from a fresh clone or an up-to-date checkout tracking `main`, not from a stale local copy.
- Never deploy Poetry Please from an uncommitted, unmerged, or unpushed working tree. Land changes on `main` through a reviewed pull request first, then deploy from a checkout of `main` at the merged commit.
- Use `./scripts/deploy-production.sh` for production deploys. Do not call `firebase deploy` directly.
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

Standard git/GitHub workflow applies: clone, branch, commit, open a pull request, get it reviewed and merged, then deploy from `main`. Terminal and git tools are the normal way to do this.

2026-09-15 — Retooled during rehoming to Claude Code: the previous version of this document pinned deployment to one local machine path (`/Users/buttonpublishingone/Desktop/CODEX/Poetry Please/poetry-please`) and told the assistant to avoid terminal/shell workflows in favor of connectors and app controls, matching a different development environment. That mechanism no longer applies here. The intent behind it is preserved — one authoritative source of truth, deploy only through the sanctioned script, verify health after every deploy — only the mechanism changed, to match how the Catalog repository is now maintained.
