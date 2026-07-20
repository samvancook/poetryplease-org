# Poetry Please Workspace Rules

## Production Deployment

- This repository is the only authorized local source for Poetry Please production deployments:
  `/Users/buttonpublishingone/Desktop/CODEX/Poetry Please/poetry-please`
- Never deploy Poetry Please from migration copies, generated workspaces, temporary worktrees, or unrelated projects.
- Use `./scripts/deploy-production.sh` for production deploys. Do not call `firebase deploy` directly.
- The production Firebase project must be `poetry-please` and the HTTPS function must remain public.
- After every deployment, confirm `/api/healthz` and anonymous `/api/bootstrap` succeed.

