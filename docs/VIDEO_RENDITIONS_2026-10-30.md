# Video rendition registration and resolver — 30 October 2026

This bounded attachment path uses existing `contentAssets` association fields `contentCollection` / `contentDocId`. It never calls video upsert or updates the video, its primary media, reviews, excerpt links or release state. No new video or poem identity.

## Contract

- `POST /api/internal/videoRenditions`: existing Poetry Please API-key authentication. Body `{videoId, rendition}`. Admin equivalent: `POST /api/admin/videoRenditions` with existing admin sign-in.
- `GET /api/internal/videoRenditions?videoId=...`: existing API key or existing team/admin sign-in. Admin UI uses `GET /api/admin/videoRenditions`.
- Optional resolver parameters `profileId`, `profileVersion`, `sourceVersionFileId`: exactly one match required. Missing/ambiguous matches fail closed. A platform choice must have verified bytes. No automatic publishing or scheduler selection.
- Receipt `schemaVersion: "1"`, `canonicalVideoId`, `sourceRecordId`, `poemKey`, unchanged `primaryMediaUrl`, `originalFinalFileId`, review/excerpt counts, `renditions` and optional `selected`.
- Each rendition stores its reviewed source file, source master file/revision and checksum if available, output file/revision/URL/SHA-256, profile ID/version, dimensions, duration, codecs, audio sample rate, frame rate, bytes and validation state. Calendar Post Record IDs are not inferred or assigned.
- Deterministic asset ID from canonical video + source file/revision + encoding profile/version. Exact repeats reuse that asset without downloading again. Conflicting output/metadata for that identity is a 409; a genuinely new encoding requires a new profile version. Other performances/cuts must not use this attachment path.

## Storage and verification

Initial storage policy is `drive_reference`, keeping each file alongside the primary asset rather than copying/replacing primary media. Platform derivatives up to the existing 600 MiB synchronous cap are streamed for actual MP4 signature, byte count and SHA-256 verification before any asset record is created. No large-master download/copy is started. Master metadata is explicitly `source_reported`; neither a supplied checksum nor a bounded range check is falsely labelled full-master byte verification. Publisher integration must retrieve the exact file and verify its saved hash/revision before ingestion; registration is not Meta acceptance.

Drive IDs are not immutable bytes: revision IDs are retained where available, and output hashes bind the verified derivative. A deleted/revised Drive reference needs reconciliation; this path does not silently restore it or change primary playback. Durable large-master ingestion remains a separate existing implementation.

## Version UI

Admin → Content Library → find the video → expand **Video versions**. Loads only on expansion. Displays unchanged primary playback, master/high-resolution and platform-ready/lower-resolution choices with dimensions, byte count and the precise validation state. Links open the retained files; no new public review controls or feed content.

## Click canary

Target `videos/WEAVER-VV-53325937727C351D9471C7FE`; reviewed source `1L9ighgQVutO_omi3MF8kQUUwSSizI48i`. Preflight: 12 Weaver reviews, 12 selected excerpt links, one existing `library_video` asset. Hosted primary still returns 206 QuickTime bytes despite its original final Drive file being trashed. Master `1U_asBkgfiGzHjc67v4FVrLd7SmCKOOsZ` and derivative `14hFbu2jE-UYzsutS7cJcaJn72-c-aLDZ` independently return 206 media bytes with expected lengths. Do not restore or replace original final file `12INXPROJ_74JsW3g9kLL84ZSR7-78oqa`.

Derivative expected SHA-256 `3097e55f6c3ef9c213268faafcf027b9ce972bd6c28cc2e64bd40998ccf13f26`, 85,549,562 bytes. Registration/readback/repeat results will be returned to the shared-drive handoff after production deployment. Unit tests verify repeat identity, source mismatch, byte/checksum failures and unchanged canonical video/review/link/primary data. Release via existing `.github/workflows/firebase.yml` only.
