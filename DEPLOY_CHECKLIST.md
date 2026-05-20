# Poetry Please Deploy Checklist

Use this before/after deploying meaningful Poetry Please changes.

## Change Summary
- What changed:
- Files touched:
- Data repair involved? yes/no
- Hosting deploy needed? yes/no
- Functions deploy needed? yes/no

## Smoke Test
Run:

```sh
node scripts/smoke-test.mjs
```

Expected result:
- public app HTML loads
- API health endpoint responds
- anonymous filtered feed returns JSON
- ACHK/SW Spring 2026 EXC checks stay nonzero
- books endpoint includes known active books

## Deploy Notes
- Commit:
- Deployed at:
- Verified after deploy:
- Known risks/follow-up:
