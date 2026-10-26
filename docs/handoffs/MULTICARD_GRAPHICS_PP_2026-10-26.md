# Multi-card graphics: Poetry Please contract

Implementation in progress; production proof will be recorded below after release.

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
