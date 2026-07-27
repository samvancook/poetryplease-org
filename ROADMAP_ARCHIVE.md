# Poetry Please Roadmap Archive

Completed work moved out of `ROADMAP.md` so the active roadmap stays useful.

## Completed By July 2026

### Weaver And Firestore Stability

- Added durable import receipts with schema version, request status, counts, per-item outcomes, duration, and exact failure reason.
- Added an Admin reconciliation report for handed-off content IDs that no longer resolve in Poetry Please.
- Added explicit rejection of unsupported Weaver schema versions while preserving the current unversioned legacy contract.

### Feed And Load Stability

- Added a versioned persistent feed/content snapshot in Storage so fresh function instances can load one artifact instead of rescanning all content collections.
- Connected content mutation hooks to invalidate the persistent snapshot after imports, edits, deletes, and moderation changes.
- Preserved the Firestore scan as the automatic fallback when the persistent snapshot is absent, stale, invalidated, or unreadable.

### Production Deployment Protection

- Disabled default Firebase deployment from the stale `poetry-please-admin-moderation` and `poetry-please-upload-migration` workspaces.
- Declared the canonical `poetry-please` repository as the only authorized production deployment source.
- Added a guarded production deploy script that verifies repository path, Firebase project, runtime, memory, `minInstances`, public health, and anonymous bootstrap.
- Upgraded the production Cloud Function from Node.js 20 to Node.js 22.
- Upgraded `firebase-functions` to 7.3.0, `firebase-admin` to 14.2.0, and Express to 4.22.2 with module-load, deployment, endpoint, and smoke-test verification.

### Shared Coverage

- Combined `INT` and `FPI` into one Scoreboard coverage baseline of 10 items while preserving their separate counts.
- Added the protected machine-readable `INT_FPI` coverage lane for Weaver.
