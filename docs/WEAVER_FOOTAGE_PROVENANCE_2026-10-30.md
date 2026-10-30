# Weaver footage references — 30 October 2026

The existing authenticated `POST /api/internal/weaverVideoImport` accepts optional `footageContextVersion: 1` and `footageConnections`. Each reference carries inventory event ID/name, source spreadsheet ID and response row, asset family ID, and separate OM, FV and curation Drive file IDs. OM/FV is a workflow role; it is independent of orientation. Nullable file references remain unknown rather than being inferred from a title.

Poetry Please stores these in private `weaverFootageConnections` on the existing video. It does not create a second video or poem identity, change the selected video file, publish content, or assign a calendar row. Admin Content Library exposes a collapsed **Footage sources** section with links to inventory, OM and FV.

Repeats deduplicate by inventory event + source spreadsheet + response row. An omitted/empty list retains existing references. A conflicting nonempty file/family identity returns 409 rather than overwriting the earlier association. Ordinary video metadata edits also retain recorded references.

Import results acknowledge the exact submitted references as `receivedFootageConnections`, with received/stored counts. `GET /api/internal/weaverVideoReceipt?sourceRecordId=...` returns `footage: {schemaVersion: 1, connections: [...]}` through the existing API-key protection. Weaver should verify the exact references before treating the send as acknowledged, and retain them when refreshing later receipts. Older senders that omit the optional fields retain their previous behavior.

## Identity boundary for calendars

| Reference | Meaning |
| --- | --- |
| inventory event + response row | Source intake and OM/FV relationship |
| Weaver priority set + reviewed source ID | Curation/review history |
| PP canonical video ID | The received video in Poetry Please |
| Catalog poem key | Underlying text, attached only from an explicit authoritative mapping |
| Approved asset/version ID | The particular cut/rendition selected for a platform |
| Calendar Post Record ID | A calendar placement, not a video or poem identity |

Calendar Command Center's current `docs/video-profiles.md` distinguishes those identities and treats approved-asset integration as a separate contract. An eventual calendar consumer can follow the PP canonical video to its private footage references; it must still use the approved asset and an actual calendar row reference. No calendar writes are part of this change.

## Verification limits

Local tests exercise intake → content payload mapping → retry merge → private receipt, exact acknowledgement, conflict rejection, unchanged canonical video identity/primary media/review context, and escaped collapsed admin rendering. PAGES has no approved video handoff yet; these tests do not claim that a PAGES video was imported or scheduled. Deployment must use the repository's existing Firebase workflow, followed by health and anonymous bootstrap checks.
