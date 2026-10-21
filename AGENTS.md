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
