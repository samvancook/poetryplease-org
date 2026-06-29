# Poetry Please Migration Manifest

Last updated: 2026-06-29

## Shared Drive Location

Canonical shared folder:

- Poetry Please: https://drive.google.com/drive/folders/1n7HW4jnjNHeP5cEuwcPoYX5o3uE0sGjS
- Docs: https://drive.google.com/drive/folders/1am0QrmoUVlCWh-AQ2bWfGQrvO9J_hsF_
- Exports: https://drive.google.com/drive/folders/127iDFr3pUi1fV4BAsfIBtD7hfEaSlfxE

## Ownership Model

- GitHub remains canonical for app code, Firebase functions, hosting files, and deployable source.
- Shared Drive is canonical for team-facing handoff files, import/export artifacts, production seed files, operating notes, and non-code workflow documentation.
- Local CODEX folders are working space for scratch scripts, temporary exports, experiments, generated files, and in-progress cleanup.

## Migrated Files

| Local source | Drive destination | Drive role | Notes |
| --- | --- | --- | --- |
| `ROADMAP.md` | Docs / `ROADMAP.md` | Snapshot | GitHub copy remains canonical. Refresh Drive after meaningful roadmap changes. |
| `TROUBLESHOOTING.md` | Docs / `TROUBLESHOOTING.md` | Snapshot | Local file may be in-progress; Drive copy is team-readable reference. |
| `/Users/buttonpublishingone/Desktop/CODEX/Social Media Dev/poetry_catalog/exports/tgit-full-poems-fp-import.json` | Exports / `tgit-full-poems-fp-import.json` | Handoff artifact | Current catalog-backed TGIT FP import file. Replaced the earlier 14-row scaffold export. |
| `/Users/buttonpublishingone/Desktop/CODEX/Excerpt Management/data/exports/poetry_please_fp_seed/manifest.json` | Exports / `tooth_gaps_fp_seed_manifest.json` | Historical context | Kept for audit trail of the earlier scaffold seed. |

## Do Not Bulk Migrate

- Whole local repositories
- `.git` directories
- `node_modules`
- Firebase build output
- caches
- one-off screenshots unless attached to a bug report or handoff
- generated media folders without a naming/storage plan
- abandoned experimental folders

## Pending Decisions

- Should Markdown docs stay as raw `.md` files in Drive, or should key docs become Google Docs?
- Should production imports preserve every version forever, or keep latest-plus-manifest with older versions moved to `Deprecated / Do Not Use`?
- Should Drive organization stay project-first (`Poetry Please`, `PIG`, `Excerpt Database System`) or add workflow-level cross-project folders?
- Which artifacts should be team-editable versus team-readable?
- Should large source/data folders from `Social Media Dev` be split into code, source catalog data, exports, and generated media before migration?

## Next Migration Batch

- `SCORING_REFERENCE.md`
- `APP_FUNCTION.md`
- `LINK_GUIDE.md`
- import/export templates
- production import JSON/CSV files not yet mirrored in Drive
- full-poem source/export files as they become canonical
- deploy notes and smoke-test checklists once they are stabilized
