# Shared video performance context

Format variants share a performance and poem/excerpt context, while retaining
individual file identities and the exact version each reviewer watched.

`performanceContext` is an optional version-1 field on Weaver video import and
context updates. It contains the existing canonical `sourceRecordId`, a stable
`performanceId`, poem author/title, explicit asset links and shared excerpt IDs.
No excerpt text is copied and no primary media, publication state, rights or
readiness field is modified by linking formats. Clip timings remain source-specific.

The context endpoint merges assets and excerpt references additively, records
before/after changed fields in `weaverVideoContextAudit`, and returns the stored
relationship. Retrying the same payload is a no-op. Different poem identity under
an established performance is rejected. Original reviews remain identified by
review ID; shared curation counts independent reviewers in Weaver.

Readback is available in the protected Weaver video receipt, admin Content Library
and internal/admin videoRenditions response for downstream consumers. Assets in
this relationship are references; this does not assert verified rendition bytes
or select a new Calendar publication asset.

Tests: `node --test functions/video-performance-context.test.js
functions/weaver-video-intake.test.js functions/video-renditions.test.js`.
