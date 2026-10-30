const clean = value => String(value ?? '').trim();
const driveId = value => /^[-\w]{15,}$/.test(value);
const identity = ref => JSON.stringify([ref.inventoryEventId,ref.sourceSpreadsheetId,ref.sourceRow]);
const identifiers = ['familyId','originalMediaFileId','finishedVideoFileId','curationFileId'];
function invalid(message, status = 400) { const error=new Error(message);error.status=status;throw error; }

// Optional private provenance; these references never establish a poem ID,
// change the primary video or authorize publication/calendar placement.
export function normalizeFootageConnections(values) {
  if (!Array.isArray(values) || values.length > 500) invalid('invalid_footage_connections');
  const rows=new Map();
  for (const value of values) {
    if (!value || typeof value!=='object') invalid('invalid_footage_connection');
    const ref={inventoryEventId:clean(value.inventoryEventId),inventoryEventName:clean(value.inventoryEventName),
      sourceSpreadsheetId:clean(value.sourceSpreadsheetId),sourceRow:value.sourceRow,
      familyId:clean(value.familyId),originalMediaFileId:clean(value.originalMediaFileId)||null,
      finishedVideoFileId:clean(value.finishedVideoFileId)||null,curationFileId:clean(value.curationFileId)||null};
    if (!/^inventory-[a-f0-9]{32}$/.test(ref.inventoryEventId) || !driveId(ref.sourceSpreadsheetId)
      || !Number.isSafeInteger(ref.sourceRow) || ref.sourceRow<2 || !/^footage-family-[a-f0-9]{32}$/.test(ref.familyId)
      || [ref.originalMediaFileId,ref.finishedVideoFileId,ref.curationFileId].some(id=>id && !driveId(id))) invalid('invalid_footage_connection');
    const key=identity(ref),old=rows.get(key);
    if (old && identifiers.some(field=>old[field]!==ref[field])) invalid('footage_connection_identity_conflict',409);
    rows.set(key,ref);
  }
  return [...rows.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,ref])=>ref);
}

export function mergeFootageConnections(existing, incoming) {
  const rows=new Map(normalizeFootageConnections(existing).map(ref=>[identity(ref),ref]));
  for (const ref of normalizeFootageConnections(incoming)) {
    const key=identity(ref),old=rows.get(key);
    if (old && identifiers.some(field=>old[field] && ref[field] && old[field]!==ref[field])) invalid('footage_connection_identity_conflict',409);
    rows.set(key,old?{...ref,...Object.fromEntries(identifiers.map(field=>[field,ref[field]||old[field]])),inventoryEventName:ref.inventoryEventName||old.inventoryEventName}:ref);
  }
  return normalizeFootageConnections([...rows.values()]);
}

export function receivedFootageConnections(stored, submitted) {
  const rows=new Map(normalizeFootageConnections(stored).map(ref=>[identity(ref),ref]));
  return normalizeFootageConnections(submitted).filter(ref=>{
    const saved=rows.get(identity(ref));
    return saved && identifiers.every(field=>!ref[field] || saved[field]===ref[field]);
  });
}
