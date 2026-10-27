# Multi-card graphics: Poetry Please contract

Receiver released through PR #282; private synthetic visibility through PR #283; classic-script startup regression fixed through PR #284. P.I.G.'s final readback now reports the private import and repair-and-acceptance round trip complete.

## Current status — 27 October 2026

P.I.G.'s final readback reports the private synthetic canary complete: card-2 repair `zCuaPxBQ4O2qVE28ZmGL` was accepted in PP and resolved in Weaver on canonical item `pig-canary-completion-4144bc4eea79`. Only card 2 changed; cards 1 and 3 kept their original file IDs; canonical identity and `syntheticTest: true` remained intact. The missing-source-text and affected-card metadata blockers were fixed through PP PRs #286/#287 and Weaver's return fix. [PP #287](https://github.com/samvancook/poetryplease-org/pull/287) · [Weaver return fix](https://github.com/samvancook/weaver/commit/defa378). This documentation pass reviewed the owning task's result; it did not independently repeat the production canary. Do not create another flag or repair. Next owner: P.I.G., for a staff-created real multi-page FPI creation/reorder/preview/export test.

[Verified initial import and historical pause receipt](https://drive.google.com/file/d/17BShza7pZIB6RrkG8PisZDN37yuZA8yJ/view). Its zero-repair/paused state is superseded by the completed request and owning-task readback above.

Current production route: merge a PR with passing checks and use the existing `.github/workflows/firebase.yml` workflow on main. Older direct deployment-script instructions are historical and retired. [Startup incident and hotfix receipt](https://drive.google.com/file/d/1UThGeQbTaEHr8fCLnNyxLBzodSZxpjHL/view).

## Contract with Weaver / P.I.G.

No new item identity, endpoint, schemaVersion, or authentication. P.I.G. editable provenance (`pigProjectId`, `editableProjectFileId`, `editableProjectUrl`) and original source record/request/completion IDs are retained, including FPI. Continue POST /api/internal/weaverImport schemaVersion "1" and the existing card-1 aliases. On QI/FPI records add optional `assetSet`, an ordered array of 1–20 cards (multi-card 2–20). Each entry:

```json
{"index":1,"role":"content","assetUrl":"https://…","assetPreviewUrl":"https://…","assetFileId":"drive-file-id","fileName":"card-1.png"}
```

Index is an integer, 1-based, contiguous, in array order. assetUrl is required HTTPS; preview is optional HTTPS; no credentials in URLs. Roles/file names/IDs are metadata. Invalid sets fail closed. PP ingests every card through the existing remote-media validation/storage path, stores the complete set under the existing canonical ID, and retains source assetUrl/file ID with PP-hosted preview URLs. The first card remains the legacy imageUrl/driveLink alias. Import results include assetCount and assetSet when present. Re-imports use the existing item ID and reuse already-hosted unchanged cards.

## Repair round trip

Creating a recreation request accepts optional `affectedCardIndex` (1-based) and exports the complete original `assetSet`, also retained in originalContent. No index means whole-set repair. Weaver must pass this original set to P.I.G. as `previousAssetSet`, along with affectedCardIndex. For targeted repair P.I.G. must retain sibling entries unchanged, including their PP-hosted preview URLs; upload only the affected card. Missing baseline must fail closed rather than re-uploading siblings.

Weaver returns the **full** ordered new `assetSet` on the existing POST /api/internal/repairRequests/:id/status with status returned; affectedCardIndex, if supplied, must equal the saved request index. PP stores this as `replacementAssetSet`, leaving original assetSet intact. A multi-card return without a full set is rejected. Targeted repair cannot change count, order, or any unaffected entry. PP hosts the changed returned media, reusing sibling previews.

Staff preview the full original and returned sets before acceptance. Acceptance validates baseline is still current, activates the complete replacement set in the same canonical item, records previousAssetSet, closes the flag and uses existing author-vote reopening logic. No new poem/graphic identity. Legacy single-card return behavior remains supported. Single-file admin replacement is blocked for multi-card items; use repair.

## Display

Swipe and desktop provide previous/next card controls and Card N of M. Voting remains per canonical item, not per card. Swipe zoom resets on card change. Admin flag and repair previews show all cards in order. Existing feed row fields remain in place; optional assetSet is appended at row index 17.

## Boundaries

No real author/staff content is used as a canary. No email. The P.I.G. task coordinates the cross-system synthetic canary after each side is deployed. This PP change does not by itself prove Weaver's outgoing payload includes every card.

## Synthetic canary visibility — 27 October

For the one authorized live canary, Weaver must send `syntheticTest: true` on the outgoing QI/FPI record. PP persists it as a sticky marker: public discovery, book/catalog lists, related-content reads and `/api/contentById` exclude the item even after its repair is accepted. Admin content, flag and repair views retain the record and all cards; use those authenticated views and import receipts for test readback. An ordinary edit or repair does not clear the marker. Do not substitute a real item or rely on briefly flagging an otherwise public test graphic.
