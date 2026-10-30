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

Derivative expected SHA-256 `3097e55f6c3ef9c213268faafcf027b9ce972bd6c28cc2e64bd40998ccf13f26`, 85,549,562 bytes. Registration/readback/repeat results are recorded in the production completion below. Unit tests verify repeat identity, source mismatch, byte/checksum failures and unchanged canonical video/review/link/primary data. Release via existing `.github/workflows/firebase.yml` only.

## Production completion

PR #309 merged and production workflow 41060868621 succeeded. Health and anonymous bootstrap pass. Click was registered through the deployed internal API; both exact repeat registrations returned created=false. Full canonical video readback was byte-for-byte equivalent as structured data: 12 Weaver reviews, 12 selected excerpt links, primary URL, release state and all other fields unchanged.

- master: `video-rendition-6f90637efb1f684fc557819961161c46`, profile `original-master` version `1`, 1,291,954,208 bytes, validation `source_reported`.
- platform: `video-rendition-a9dc8c35364ed0e5d94fb131c12b51c7`, profile `platform-1080p-h264-aac` version `1`, 85,549,562 bytes, validation `verified_bytes`.

The platform derivative’s actual SHA-256 matches the supplied 3097e55f6c3ef9c213268faafcf027b9ce972bd6c28cc2e64bd40998ccf13f26. Both source/output Drive revision IDs are retained. Master SHA-256 is unknown and stays null; master codec information was not independently measured. No restored Drive file, new video identity, calendar write, release change or publication.

Signed-in Admin Content Library was visually verified as sam@buttonpoetry.com: expanding Video versions shows unchanged primary, Master / high resolution, and Platform-ready / lower resolution together with precise dimensions/byte-count/validation labels. Primary, master and platform files all returned bounded 206 media bytes. Full-master playback/codec verification and Meta ingestion are not claimed.

Publisher resolver example (existing API-key header required):
GET /api/internal/videoRenditions?videoId=WEAVER-VV-53325937727C351D9471C7FE&profileId=platform-1080p-h264-aac&profileVersion=1&sourceVersionFileId=1U_asBkgfiGzHjc67v4FVrLd7SmCKOOsZ

The resolver selected the verified platform file 14hFbu2jE-UYzsutS7cJcaJn72-c-aLDZ. Publisher owns any later selection/ingestion/publication receipt; do not create another PP video or use the Drive /view page as an ingestable media URL.
