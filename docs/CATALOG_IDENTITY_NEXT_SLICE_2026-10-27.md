# Catalog identity exceptions: next bounded slice

## Completed canary — 28 October 2026

Both reviewed keys below are now attached to their existing PP IDs: Stay-Okay → `BPP-00263`, then Bliss → `BPP-00221`. PR #291 added the guarded key-only mode to the existing sync route and deployed through [the existing workflow](https://github.com/samvancook/poetryplease-org/actions/runs/40718037476). All 68 focused tests passed. Two updated, zero created, zero errors. Independent before/after Firestore readback confirmed exact text, titles, assets and all four existing votes unchanged; no linked flags/repairs existed. Post-apply previews each plan zero writes with the original plan hash. This completes the two identity mappings only; it does not apply a whole-book text sync or resolve other Catalog exceptions. [Shared completion receipt](https://drive.google.com/file/d/1DF6iREO5GpydmJczXTG3lBmHiC5MHjGf/view) · [Private backup and verification archive](https://drive.google.com/file/d/1EGcbyaCuHxJT1KWNVZ2eHFJbWQsSRBNe/view). The original read-only assessment below is retained as evidence.

Read-only assessment, 27 October 2026. No production content, keys, titles, votes, flags or repairs changed. The 194-row exception CSV is the October 23 snapshot, not a fresh count of open exceptions.

## Recommended canary: two existing Choir records

| Existing PP ID | Current Catalog key/title | Evidence |
| --- | --- | --- |
| `ACHK-FP-THE-STAY-OKAY-BOX` | `BPP-00263` — A Stay-Okay Box | Current PP body equals current Catalog served text byte for byte. Both SHA-256: `a9e220db14b358929e23d47757ba1a52744478ecb92fcd02b4ce0683332c7302`. |
| `ACHK-FP-BLISS-A-CHRONICLE-OF-VOICE-IN-ORDER` | `BPP-00221` — Bliss: A Chronicle of The Voice, in Order | One whitespace-normalized body match within this book. PP SHA-256 `a250b84aceb421b2b2314c8c9738328535615ea4648d46c160ae6b90abeec62d`; source SHA-256 `04470369c5aac468083bf6b8fdef8d8b00fd95b951c5c5a3de7c09c48766ec2d`. Candidate identity mapping only; normalization is not permission to rewrite lineation. |

The saved October 23 dry run's two “missing” titles are exactly these two Catalog titles; its two unmatched IDs are the existing records above. Do not create another FP to satisfy those title differences. Current Catalog returns 58 Choir rows, versus 55 in that saved dry run, so the old book-wide plan cannot be replayed.

Owner: Poetry Please. Next implementation: support an explicitly reviewed, two-record ID → permanent-key manifest within the existing sync path. Require exact book/author, unchanged expected PP title/key/body hash, expected source key/title/body hash, no other active PP owner of either key, and a dry-run plan hash. First candidate is the byte-identical Stay-Okay record. Preserve both external IDs, stored text/title, asset links, flags, reviews and votes. A key-only mapping must not reopen votes. Independently read back the same record and reviews before the second candidate. Source/title/formatting adoption is separate; no whole-book sync or creation in this slice.

The existing planner is already key-first and edition-guarded, but has no explicit reviewed mapping input. It also skips an unchanged body before planning a missing-key attachment. Tests should cover the two-record scope, key-only updates with unchanged bodies, duplicate-key refusal, changed-source/target refusal, idempotent replay and unchanged votes. Reuse the existing route, authentication and GitHub Actions workflow.

## Keep Future editions held

Current Catalog: original 43 keys; Limited Edition 48 keys; no shared keys. Both unkeyed PP bodies match both editions exactly:

- Move-In Day: original `BPP-03982`, limited `BPP-01757`.
- Ode to The Gaslight Anthem, Ending in the End of Childhood: original `BPP-03986`, limited `BPP-01762`.

Text alone cannot choose their edition. The saved 43-record audit has original-edition keys alongside TFLE labels. Owner: Catalog; supply the explicit edition disposition. Do not relabel all 43, infer from the ID prefix, or assign either pair of keys automatically.

## DBAT and other exceptions

Exact-title Catalog GET for DON’T BE AFRAID TO BE BAD now returns HTTP 200 with 67 unique keys. That supersedes the assumption that every current source lookup is blocked. Owner: Poetry Please; run a fresh authenticated PP sync preview using its resolved book identity before closing the historical PP HTTP 409 blocker. No apply request is authorized by this assessment.

Several single-record exceptions are titled Foreword, Praise, Acknowledgments or Gratitude. These are classification candidates, not proven retirement instructions. Obtain authoritative dispositions before reversible retirement; never delete or classify by title alone.

## Receipts

- [Current Choir Catalog](https://button-poetry-catalog-350789123099.us-central1.run.app/books/A%20Choir%20of%20Honest%20Killers/poems?limit=1000)
- [Original Future Catalog](https://button-poetry-catalog-350789123099.us-central1.run.app/books/The%20Future/poems?limit=1000) and [Limited Edition](https://button-poetry-catalog-350789123099.us-central1.run.app/books/The%20Future%3A%20Limited%20Edition/poems?limit=1000)
- [Saved October 23 execution/exception receipt](https://drive.google.com/file/d/1JbrYeqJHcLSvIirjHCA8PLCgWV3h0W6B/view)
- Local current response snapshots and summaries: `/tmp/pp-identity-review-20261027/`. These are temporary evidence, not a durable shared attachment; hashes and exact identities above are recorded here.

Startup follow-up is closed for the initial parser slice: PR #289 merged, existing workflow run 40570336421 succeeded, live browser startup and public health passed, and anonymous POST bootstrap succeeded with the caller's required anonId context. No runtime change was made by that test-only slice. Automated browser/runtime checks remain planned.
