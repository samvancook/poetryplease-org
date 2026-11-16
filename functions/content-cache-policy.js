// The feed's content is held in memory and re-checked every 15 minutes. That
// check used to download and parse the whole content snapshot again, which the
// next visitor waited on for 3 to 4 seconds, even when the shared metadata
// still pointed at the very snapshot already in memory.
//
// True when the in-memory content came from the snapshot the metadata still
// names and that snapshot has not reached its own age limit, so a reload
// would only fetch the same bytes.
export function loadedSnapshotIsCurrent({ loadedPath, metaPath, snapshotBuiltAtMs, now, snapshotTtlMs }) {
  if (!loadedPath || !metaPath || loadedPath !== metaPath) return false;
  if (!Number.isFinite(snapshotBuiltAtMs) || snapshotBuiltAtMs <= 0) return false;
  return (now - snapshotBuiltAtMs) < snapshotTtlMs;
}
