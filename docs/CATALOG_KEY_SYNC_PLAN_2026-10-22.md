# Catalog → Poetry Please: matching exceptions and update plan

Historical plan and Catalog handoff, October 22, 2026. Its title-first/edition-routing gaps and Cottonmouth hold were superseded by the October 23 safeguards and verified full-text batch; the 29-book hold below is not the current queue. See [completed sync](CATALOG_FULLTEXT_SYNC_2026-10-23.md) and [October 27 identity assessment](CATALOG_IDENTITY_NEXT_SLICE_2026-10-27.md) for current next actions. Durable source-change delivery and explicit retirement/review policy remain proposals; no unattended follower is live. Preserve the following as historical reasoning, not instructions to repeat completed work.

## Verified implementation gaps

- `functions/index.js`, `planExistingCatalogFullPoemUpdates`: groups by normalized title first, requires one PP row and one source row, then checks key compatibility. A correct permanent key does not currently rescue a retitle or repeated-title match. An unchanged body also prevents this planner from attaching a missing key.
- The sync route resolves a book before fetching source poems and selecting PP records. Its missing-record calculation counts titles, not permanent keys. Keep `addMissing:false`; otherwise a retitle can be misclassified as missing.
- `functions/book-catalog-lookup.json`: TFLE (Spring 2024, limited-edition product URL) and TF (Spring 2018) both have `title: "The Future"`. TFLE accepts both limited-edition and base-title aliases. The resolver chooses the first matching bucket entry and fetches Catalog using that record's title. This loses edition identity; it is more than a misspelled alias.
- A legacy FP/FPI shared reading ID has a narrow, verified canonical-reading exception. That does not establish that all shared IDs are safe or fix their relationships elsewhere.
- Existing tests deliberately hold repeated/unmatched titles and conflicting keys. They cover review preservation, explicit flag selection and retired-record protection; they do not yet establish key-first retitles or edition-safe resolution.

## Catalog handoff — requested response

Please resolve these source questions without changing PP records or regenerating graphics:

1. **The Future editions:** return the exact authoritative Catalog identity and lookup for TF versus TFLE, edition/revision identifiers if available, and their ordered permanent-key sets. Explain whether their keys represent shared works or separate edition-specific text. The spacing handoff requested 42 TFLE keys but PP resolved the base book with 41; confirm the intended 42 rather than treating counts as proof of identity.
2. **Cottonmouth:** review the 39 requested keys, including the 24 replacements differing beyond blank lines. For each non-spacing change, return key, preferred source/revision, exact before/after text, and disposition: intentional correction, extraction artifact, or unresolved. In particular, confirm whether `2013` belongs in that poem's body. Do not classify these as whitespace-only without source proof.
3. **Ambiguous mappings:** return the exact source identities and permanent keys for unresolved repeated titles/renames. Say explicitly when two titles are the same work, distinct works, or edition variants. No positional matching.
4. **Change delivery:** confirm what revision/change metadata Catalog already exposes. Can it supply explicit retitles and retirements, stable change IDs, previous/current revision, and a resumable list or cursor? Report existing capabilities first; do not invent endpoints or a new authentication scheme.

Return a machine-readable manifest where possible: source change ID, permanent poem key, authoritative book/edition identity, previous/new title, source revision, action, exact text or existing source lookup, and source-review disposition. Explicitly identify unsupported fields. Retirement must be explicit; absence from a list is not a retirement signal.

Evidence: [completed execution and held work](CATALOG_HANDOFF_2026-10-22.md). Detailed key-level receipts are in the [private shared archive](https://drive.google.com/file/d/1zfyi7a9fn9wgyf-ZS7v20r6dSH7jKT9u/view). Do not publish raw votes or protected care flags in the response.

## PP implementation order

### 1. Exact-key, reviewed update plan

- Extend the existing sync path; do not introduce another deployment workflow.
- Scope input to explicit permanent keys and verified book/edition identity. Show requested and resolved identity in the dry run; reject ambiguous or mismatched editions.
- Match an existing keyed FP by permanent key within the verified source context. A key conflict, duplicate active FP or edition conflict is an exception, not permission to choose the first row.
- Only use unique verified book/author/title fallback for unkeyed legacy records. Record how each match was established. Shared FP/FPI IDs require collection-qualified record paths internally; retain all external content IDs.
- Plan retitles and key-only assignments even if body text is unchanged. Compare expected old title/key/text and source revision before applying. Treat cross-book moves or key reassignment as explicit review cases.
- Bind requested keys, source revision/identity, before/after values, action and review policy into the plan hash. No added records in this slice. Return updated, already-current, held, unmatched and failed outcomes per key and existing content path.

### 2. Review and retirement policy

- Separate key-only metadata, verified spacing-only, substantive text, retitle and retirement actions. Do not infer semantic equivalence by deleting all whitespace.
- Key-only and verified spacing-only updates preserve reviews. Substantive corrections reopen author review by superseding earlier votes with history retained. Decide title-only reopening explicitly in the reviewed plan; do not reset reviews merely because a key was attached.
- Resolve only flags demonstrated fixed by the change; unrelated design, attribution and epigraph issues remain open. Do not blanket-close source repairs solely because they lack a replacement asset: verify the request's issue was actually addressed.
- Retire reversibly on existing identities with reason and source revision. Preserve vote/repair history and asset URLs. Audit the key across import paths so a new external ID cannot silently resurrect a retired work; do not indiscriminately retire every subsidiary asset without reviewing the requested scope.

### 3. Durable following, after Catalog confirms its contract

- Persist an intake ledger keyed by stable source change ID plus target identity. Record source revision, planned/applied result, exception and retry status. Replaying an applied revision must be a no-op, including review reopening.
- Reject stale/out-of-order changes and concurrent PP edits. A failed item remains retryable under the same identity; receipt and content/review mutations must not leave an untracked applied change.
- Use existing authentication and the approved deployment workflow. Select delivery/polling only after checking Catalog's existing capability. No unattended writes until the reviewed canary and rollback are verified.
- Continue to update text/metadata in place. Baked-in graphic corrections stay on the existing repair route; source sync must not imply that a graphic was recreated.

## Verification gates and remaining holds

Focused cases: keyed retitle; two same-title poems with different keys; duplicate PP key; FP/FPI shared external ID; TF versus TFLE isolation; key-only/no body change; spacing review preservation; semantic author reopening; unrelated flag/repair retention; explicit retirement; stale revision; replay; concurrent edit; partial failure with an accurate receipt.

Rollout: dry-run exact manifest → review exceptions → backup → one existing-key canary → independently read content, votes, flags and receipt → bounded batch. Deploy code only through the existing GitHub Actions workflow; check health/bootstrap after deployment.

The 29 held books / 449 requested spacing keys remain held, with no implication that all 449 need changes. Cottonmouth awaits source review. TFLE awaits edition identity. The 88 human-review rows and 21 missing LABC/TGIT FPs are separate queues. No new FP creation, automatic source adoption, broader retirement or source-text rewrite is authorized by this planning document.
