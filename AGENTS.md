# Poetry Please Workspace Rules

## Production Deployment

- This repository is the only authorized local source for Poetry Please production deployments:
  `/Users/buttonpublishingone/Desktop/CODEX/Poetry Please/poetry-please`
- Never deploy Poetry Please from migration copies, generated workspaces, temporary worktrees, or unrelated projects.
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

Do not use terminal or shell workflows for this workspace. Use confirmed connectors, skills, and app controls instead.
