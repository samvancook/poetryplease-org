# Weaver video → Poetry Please: durable-copy receiver

## Superseded readiness status — 29 October 2026

The real Kenneth pilot is now verified in PP and its final receipt is saved in Weaver: same canonical video, 11 reviews / 8 excerpt links, 1,447,300,329 bytes, checksum verified, review-only. See the [completion receipt and remaining owners](WEAVER_VIDEO_PILOT_2026-10-29.md). The “no pilot” and readiness statements below describe the October 28 release only; Rachel and the five MPMU transfers remain held.

## Production status — 28 October 2026

Poetry Please receiver changes were merged to `main` in [PR #297](https://github.com/samvancook/poetryplease-org/pull/297), merge commit `ca0057d52bd4db79ff21b83f797d555dc6f9de1d`.

Observed after that merge:

- GitHub Actions run `40769889322` completed successfully. Its `test_functions` and `deploy` jobs both succeeded; the deploy job completed its authenticated internal smoke tests.
- `GET https://poetryplease.org/api/healthz` returned `{"ok":true}`.
- An anonymous `POST https://poetryplease.org/api/bootstrap` returned a successful bootstrap payload.
- A credential-free request to `GET /api/internal/weaverVideoReceipt?sourceRecordId=deployment-probe` returned `401 {"error":"invalid_api_key"}`. This confirms the deployed protected receipt route is reachable and rejects unauthenticated access.

Those observations prove the receiver code is deployed and serving. They do **not** prove that a real Weaver video has been copied, stored, or attached to a real event.

## Contract now deployed

- A Weaver VV payload requires a non-empty `sourceEvent`; the event is retained as first-class provenance and is never derived from author, book, or catalog.
- The final Drive media link is the only accepted source for the durable copy. A stale/raw versus final-link mismatch is rejected.
- New Weaver VV imports are `reviewOnly`, `storageMode: external`, and `durableCopyStatus: pending`; public discovery excludes review-only records.
- Poetry Please enqueues one deterministic durable-copy attempt for the source record and final Drive asset. The worker streams to Poetry Please storage with resumable upload, verifies byte count and checksum, then changes the item to a verified hosted video while retaining the same event and Weaver provenance.
- Duplicate imports of an already verified source/final pair preserve the hosted video rather than reverting to the external Drive URL.
- A changed final Drive asset creates a new attempt; a failed copy remains review-only and retryable by the durable task, never silently published.
- `/api/internal/weaverVideoReceipt` is the readback endpoint. It requires the existing internal API key and reports the canonical receiver record, event identity, review state, and durable-copy state.

## What remains outstanding

No production Weaver payload was sent as part of this release. The five held transfers must remain held until one **explicitly selected, eligible** pilot record is authorized. Do not bulk replay or retry historical records.

For that pilot, Weaver should submit its normal final payload, then read the Poetry Please receipt using the internal API key. Acceptance requires all of the following:

1. receipt identifies the intended source record and canonical item;
2. `sourceEvent` exactly matches the originating event;
3. item remains `reviewOnly` throughout copy processing;
4. durable status becomes `verified`, with a Poetry Please-hosted video URL and matching byte/checksum verification;
5. no public feed or catalog exposure is enabled by the pilot.

Only after this readback should the two teams decide whether to release the remaining held transfers. Catalog gaps (including BPL Charm City records with blank catalog fields) are a separate Poetry Please data concern; they do not change or substitute for event identity.

## Ownership

Poetry Please owns the receiver, durable copy, receipt, and review-only/publication gates. Weaver owns its event-bound source record and must not bypass the receipt check or send a raw/pre-final asset link.
