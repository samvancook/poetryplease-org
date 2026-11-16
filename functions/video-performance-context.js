const clean=v=>String(v??'').trim();
const invalid=()=>{throw Object.assign(new Error('invalid_video_performance_context'),{status:400});};
// A relationship is not media validation or authority to select a primary.
export function normalizeVideoPerformanceContext(value,sourceRecordId){
  if(!value||value.schemaVersion!==1||value.sourceRecordId!==sourceRecordId
    ||value.performanceId!=='weaver:performance:'+sourceRecordId.replace(/^weaver:video:/,'')
    ||!/^weaver:video:[\w-]{10,200}$/.test(sourceRecordId)
    ||!clean(value.poem?.author)||!clean(value.poem?.title)
    ||!Array.isArray(value.assets)||!value.assets.length||value.assets.length>100
    ||!Array.isArray(value.excerptRecordIds)||value.excerptRecordIds.length>500)invalid();
  const ids=new Set();const assets=value.assets.map(a=>{
    if(!/^[\w-]{10,200}$/.test(a.fileId)||ids.has(a.fileId)
      ||a.url!==`https://drive.google.com/file/d/${a.fileId}/view`
      ||a.relationship!=='same_performance'||a.timing!=='source_specific')invalid();
    ids.add(a.fileId);return{fileId:a.fileId,fileName:clean(a.fileName),url:a.url,
      relationship:a.relationship,timing:a.timing};
  }).sort((a,b)=>a.fileId.localeCompare(b.fileId));
  if(value.excerptRecordIds.some(id=>!clean(id)||typeof id!=='string'))invalid();
  return{schemaVersion:1,performanceId:value.performanceId,sourceRecordId,
    poem:{author:clean(value.poem.author),title:clean(value.poem.title)},assets,
    excerptRecordIds:[...new Set(value.excerptRecordIds)].sort()};
}
export function mergeVideoPerformanceContext(existing,incoming,sourceRecordId){
  const next=normalizeVideoPerformanceContext(incoming,sourceRecordId);if(!existing)return next;
  const prior=normalizeVideoPerformanceContext(existing,sourceRecordId);
  if(JSON.stringify(prior.poem)!==JSON.stringify(next.poem))throw Object.assign(new Error('video_performance_identity_conflict'),{status:409});
  const assets=new Map(prior.assets.map(a=>[a.fileId,a]));for(const a of next.assets)assets.set(a.fileId,a);
  return normalizeVideoPerformanceContext({...next,assets:[...assets.values()],
    excerptRecordIds:[...new Set([...prior.excerptRecordIds,...next.excerptRecordIds])]},sourceRecordId);
}
