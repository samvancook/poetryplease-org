# Weaver → Poetry Please video pilot — 29 October 2026

## Completed and verified

Kenneth Something — “I Didn’t Read The Love Poem,” BPL Charm City 2026, completed one normal Weaver send and PP durable copy. The new **Refresh PP receipt** control was exercised in the live Weaver scoreboard and persisted the verified result on the same accepted gate. This supersedes earlier claims that no large-file pilot was verified or that Weaver PR #48 remained unmerged.

| Evidence | Verified value |
| --- | --- |
| Existing gate | `d3695a740092c2a86c24d1c43c4f56ea` |
| Accepted attempt, unchanged by refresh | `33b5a83a31bd4102bc98cac9978e7080` |
| Stable source record | `weaver:video:1ACB8b-Zpaq-nk2X_K5j3sRTXMbucsMTB` |
| Existing canonical PP video | `WEAVER-VV-A90F6431AB19C180EA2D3544` |
| Final Drive asset | `1NIcMg5qd669NxQN1kfL9LG6DLlhFk40s` |
| PP ledger | `IDSbgruMxPYoeoWNwEFj`, completed |
| Stored reviews / selected excerpt links | **11 / 8** |
| Durable copy | **verified**, **1,447,300,329 bytes** |
| Verified checksum | `5n+UT+wRpRDTqFLJMHjQPw==` |
| Publication state | **reviewOnly: true** |
| Weaver receipt refresh | `2026-10-29T16:38:47Z` |

Exact earlier sent gate receipts establish the original review-source identity through the intermediate and current FV files. This was not a title-only match. The nine 720p review rows are a subset: two additional reviews on intermediate assets bring the live total to eleven.

Independent PP before/after snapshots confirmed the same canonical/source/event identity, every original review ID, each review's excerpt links, and all eight selected links. Rachel's existing PP document and its related PP vote were unchanged. Exact source-ID queries found one original Kenneth canonical and no duplicate under either current FV-derived source ID. The final hosted URL saved in Weaver equals PP's protected receipt URL. The refresh retained the gate decision, source fields, accepted status, attempt ID and original received counts; it did not resend the video.

## Landed changes and release evidence

- PP [#303](https://github.com/samvancook/poetryplease-org/pull/303): preserve existing reviews and selected links during resends; distinguish received counts from stored totals; use conditional writes. Production run [40907020703](https://github.com/samvancook/poetryplease-org/actions/runs/40907020703) succeeded.
- PP [#304](https://github.com/samvancook/poetryplease-org/pull/304): retain verified book/author/title/link metadata when incoming values are blank. Production run [40912671967](https://github.com/samvancook/poetryplease-org/actions/runs/40912671967) succeeded, including authenticated smoke checks. Final code commit `43806e4999e55da93e831d1369fe6836ac52585f`; live health returned `ok: true`.
- Weaver [#48](https://github.com/samvancook/weaver/pull/48), [#49](https://github.com/samvancook/weaver/pull/49), [#50](https://github.com/samvancook/weaver/pull/50), [#51](https://github.com/samvancook/weaver/pull/51): attempt finalization, preserved excerpt selections, canonical source resolution, and an authenticated receipt-refresh control. Final main `5412c1d49b05db152c9f5a599b65bc7eaa3c0e33`. Existing `deploy-cloud-run.sh` completed; service status and live health independently confirmed `weaver-00507-tsn` at 100% traffic. The deployment log's older revision label is superseded by that service readback and the successful live control.
- Focused verification: **112 PP intake tests, 10 PP Explorer tests, 22 Weaver JS tests and 6 Weaver Python tests passed**; server/client syntax and diff checks passed. This is a bounded transfer verification, not a retest of every application feature.

Both releases used their existing named deployment paths. No workflow, authentication scope, handoff identity or publication permission was added.

## Remaining work: owner and next action

- **Weaver — Rachel:** gate `38a0dbe85b75eeb36c0a6aa21503b25b` remains blocked and untouched. Its proven original source is `weaver:video:1mK6dYIXRsQ3AwoEjmI_YgufEfLEW6WKA`, canonical `WEAVER-VV-5CB44FCA7A79136EF4EB4226`, current final `13iiSt9DITDFFGRsHZ69qjKDEGqDXWpSO` (1,152,135,227 bytes). Use an explicitly selected normal single-gate reconciliation/retry; preserve PP's verified Pink Elephant book metadata. Expected live context is eleven reviews/seven selected links, compared with PP's existing ten/six. Do not bulk replay.
- **Weaver — five MPMU transfers:** remain held. Review each saved gate's eligibility and event/source identity, then use the same normal send → protected receipt → refresh sequence when authorized. This pilot did not send or publish them.
- **Weaver + PP — Black Chakra:** the 8 GiB durable route and Kenneth pilot resolve the former large-file capability blocker. Reconcile Black Chakra's own saved gate and exact PP receipt before deciding whether a retry is needed; Kenneth's success does not prove Black Chakra's state.
- **PP — catalog/publication follow-up:** catalog gaps and approval for public exposure are separate from a verified transfer. This run enabled neither publication nor new excerpt approval.

Private snapshots, receipts, source-chain evidence and UI proof are retained in `/tmp/pp-video-followup-20261029/` and the shared Codex Drive completion receipt. They include private hosted media URLs and reviewer details; do not paste the raw payloads into public GitHub issues.
