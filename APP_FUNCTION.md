# Poetry Please App Function

Poetry Please is a content review, scoring, and curation tool for Button Poetry marketing content.

## Core Job

The app serves pieces of content to reviewers, records reactions, and turns those reactions into useful ranking and coverage signals.

Primary content types include:
- `QI` quote images
- `INT` interior/book-page images
- `EXC` excerpts
- `FP` full poems
- `YT` YouTube/video items
- other marketing asset types as added

## Storage Model

Poetry Please uses three different storage/reference layers. They should not be confused.

`Google Drive`
Source location for many original files and folders. Drive links are provenance/reference metadata.

`Cloud Storage bucket`
Hosted asset storage for displayable media used by Poetry Please. Imported images and other displayable files should be copied into a Poetry Please Cloud Storage bucket, and the app should display from the bucket-backed URL.

`Firestore`
Database metadata for each content item. Firestore stores fields such as author, title, book, catalog, type, score data, source links, and hosted asset URLs. Firestore does not store the actual image file.

Expected flow:

`Drive/source file -> Cloud Storage hosted copy -> Firestore record points to hosted copy and preserves source link when available`

## Important Rule

A bucket URL is not suspicious by itself. Bucket-backed URLs are expected for imported/displayable Poetry Please assets.

A healthy imported graphic record should normally have:
- `imageUrl` or equivalent hosted media URL pointing to Cloud Storage
- `driveLink` or equivalent source link when the source came from Drive
- enough metadata to trace the item back to its source folder/file when available

## Import Reliability Goal

Future import tools should enforce this model:
- never rely on Drive thumbnails as the primary display URL
- copy actual media into the Poetry Please bucket before or during import
- keep source Drive metadata for traceability
- make missing hosted asset URLs visible before import is finalized
- flag duplicate or broken source records instead of silently creating weak records
