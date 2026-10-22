// Existing ADC / Firestore backup-and-invalidation path, matching the excerpt
// backfills. Input is the reviewed Catalog handoff exported to JSON.
// Snapshot: --rows rows.json --extra-fps dryruns.json --snapshot backup.json
// Dry run:  --rows rows.json --stage retitle|metadata|retire --plan plan.json
// Apply:    --apply-plan plan.json --backup undo.json
// Undo:     --undo undo.json --apply (refuses changed fields)
// Sync undo receipt: --make-sync-undo before.json --ids ids.json --backup undo.json
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? '' : process.argv[i + 1]; };
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
const encode = value => value instanceof Timestamp ? { __timestamp: [value.seconds, value.nanoseconds] }
  : Array.isArray(value) ? value.map(encode) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)])) : value;
const decode = value => value?.__timestamp ? new Timestamp(...value.__timestamp)
  : Array.isArray(value) ? value.map(decode) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,decode(v)])) : value;
const equal = (a,b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b));
const db = getFirestore(initializeApp({ projectId:'poetry-please' }), 'poetrypleasedatabase');
const allowed = new Set(['title','poem','poemKey','poemKeySource','poemKeyConfidence','excerpt','excerptFingerprint',
  'catalogRetired','catalogRetiredReason','catalogRetiredKey','catalogRetiredAt','updatedAt','updatedBy']);
const rows = arg('--rows') ? read(arg('--rows')) : [];
const report = { stage:arg('--stage') || (arg('--apply-plan') ? 'apply-plan' : arg('--undo') ? 'undo' : 'snapshot'), planned:0, written:0, held:[] };

if (arg('--make-sync-undo')) {
  const ids=new Set(read(arg('--ids')));
  const fieldsByCollection={fullPoems:['excerpt','poemKey','poemKeySource','poemKeyConfidence','updatedAt','updatedBy'],
    contentFlags:['status','resolution','repairStatus','currentExcerpt','reviewNote','reviewedBy','reviewedAt','moderationHistory'],
    votes:['supersededAt','supersededReason','supersededByCatalogPoemKey'],
    contentRepairRequests:['status','statusNote','resolvedAt','updatedAt','history']};
  const backup=[];
  for (const entry of read(arg('--make-sync-undo'))) {
    const collection=entry.path.split('/')[0], original=decode(entry.data);
    if (!(collection==='fullPoems'?ids.has(entry.path.slice(10)):ids.has(original.imageId))) continue;
    const doc=await db.doc(entry.path).get();
    if (!doc.exists) throw Error('missing_after_sync:'+entry.path);
    const after=doc.data(), before={}, applied={};
    for (const key of fieldsByCollection[collection] || []) {
      if (equal(original[key],after[key])) continue;
      if (!Object.hasOwn(after,key)) throw Error('unexpected_field_removed:'+entry.path);
      before[key]=Object.hasOwn(original,key)?{present:true,value:encode(original[key])}:{present:false};
      applied[key]=encode(after[key]);
    }
    if (Object.keys(before).length) backup.push({path:entry.path,before,applied});
  }
  write(arg('--backup'),backup);
  console.log(JSON.stringify({syncUndo:arg('--backup'),documents:backup.length}));
} else if (arg('--snapshot')) {
  const refs = new Map(rows.map(r => [r.collection+'/'+r.doc_id, db.collection(r.collection).doc(r.doc_id)]));
  if (arg('--extra-fps')) for (const book of read(arg('--extra-fps'))) for (const u of book.updates || []) refs.set('fullPoems/'+u.id,db.collection('fullPoems').doc(u.id));
  const docs = [];
  const list = [...refs.values()];
  for (let i=0;i<list.length;i+=200) docs.push(...await db.getAll(...list.slice(i,i+200)));
  const images = [...new Set(docs.filter(d=>d.exists).map(d=>d.data().imageId || d.data().imageID || d.id))];
  const related = new Map();
  for (const collection of ['contentFlags','votes','contentRepairRequests']) {
    for (let i=0;i<images.length;i+=30) {
      const snap = await db.collection(collection).where('imageId','in',images.slice(i,i+30)).get();
      for (const d of snap.docs) related.set(d.ref.path,d);
    }
  }
  const saved = [...docs,...related.values()].map(d=>({ path:d.ref.path, exists:d.exists,
    updateTime:encode(d.updateTime), data:encode(d.data() || {}) }));
  write(arg('--snapshot'),saved);
  console.log(JSON.stringify({ snapshot:arg('--snapshot'), content:docs.length, missing:docs.filter(d=>!d.exists).map(d=>d.ref.path), related:related.size }));
} else if (arg('--apply-plan') || arg('--undo')) {
  const undo = !!arg('--undo');
  if (undo && !process.argv.includes('--apply')) throw Error('undo_requires_apply');
  const plan = read(arg(undo?'--undo':'--apply-plan'));
  if (plan.length>400) throw Error('split_reviewed_plan_before_apply');
  const changes=[];
  for (const entry of plan) {
    const pathPattern=undo?/^(excerpts|graphics|fullPoems|contentFlags|votes|contentRepairRequests)\/[^/]+$/:/^(excerpts|graphics|fullPoems|contentFlags)\/[^/]+$/;
    if (!pathPattern.test(entry.path)) throw Error('invalid_content_path');
    const reviewFields=new Set(['status','resolution','repairStatus','currentExcerpt','reviewNote','reviewedBy','reviewedAt','moderationHistory','supersededAt','supersededReason','supersededByCatalogPoemKey','statusNote','resolvedAt','history']);
    const flagChange=!undo&&entry.path.startsWith('contentFlags/');
    if (Object.keys(entry.fields || entry.applied || {}).some(k=>!allowed.has(k) && !((undo||flagChange)&&reviewFields.has(k)))) throw Error('invalid_fields');
    const doc=await db.doc(entry.path).get();
    if (!doc.exists) throw Error('missing_content:'+entry.path);
    const current=doc.data();
    if (flagChange && (current.status!=='pending' || entry.fields.status!=='resolved' || !entry.proofs?.length)) throw Error('invalid_flag_resolution');
    if (undo) {
      if (Object.entries(entry.applied).some(([k,v])=>!equal(current[k],decode(v)))) throw Error('changed_since_apply:'+entry.path);
      changes.push({doc,fields:Object.fromEntries(Object.entries(entry.before).map(([k,v])=>[k,v.present?decode(v.value):FieldValue.delete()]))});
    } else {
      if (!equal(doc.updateTime,decode(entry.updateTime))) throw Error('changed_since_plan:'+entry.path);
      changes.push({doc,proofs:entry.proofs,fields:{...entry.fields,...(entry.fields.catalogRetired===true?{catalogRetiredAt:FieldValue.serverTimestamp()}:{}),
        ...(flagChange?{reviewedAt:FieldValue.serverTimestamp(),reviewedBy:'catalog_handoff_2026-10-22',
          moderationHistory:FieldValue.arrayUnion({action:'catalog_handoff_resolved',actor:'catalog_handoff_2026-10-22',note:entry.fields.reviewNote,at:new Date().toISOString()})}:{}),updatedAt:FieldValue.serverTimestamp(),updatedBy:'catalog_handoff_2026-10-22'}});
    }
  }
  if (!undo && !arg('--backup')) throw Error('backup_required');
  if (!undo) write(arg('--backup'),changes.map(({doc,fields})=>({ path:doc.ref.path,
    before:Object.fromEntries(Object.keys(fields).map(k=>[k,Object.hasOwn(doc.data(),k)?{present:true,value:encode(doc.data()[k])}:{present:false}])),
    applied:encode(fields) })));
  await db.runTransaction(async tx=>{
    for (const {doc,proofs} of changes) {
      const fresh=await tx.get(doc.ref);
      if (!equal(fresh.updateTime,doc.updateTime)) throw Error('changed_since_plan:'+doc.ref.path);
      for (const proof of proofs || []) {
        if (!/^(excerpts|graphics|fullPoems)\/[^/]+$/.test(proof.path)) throw Error('invalid_proof');
        const source=await tx.get(db.doc(proof.path));
        if (!source.exists || Object.entries(proof.fields).some(([k,v])=>!equal(source.data()[k],v))) throw Error('correction_proof_changed:'+proof.path);
      }
    }
    for (const {doc,fields} of changes) tx.update(doc.ref,fields);
  });
  report.written=changes.length;
  if (!undo) {
    const backup=read(arg('--backup'));
    for (const entry of backup) { const after=(await db.doc(entry.path).get()).data(); entry.applied=Object.fromEntries(Object.keys(entry.before).map(k=>[k,encode(after[k])])); }
    writeFileSync(arg('--backup'),JSON.stringify(backup,null,2),{mode:0o600});
  }
  if (changes.length) {
    await db.collection('systemState').doc('content-feed').set({generation:FieldValue.increment(1),invalidatedAt:FieldValue.serverTimestamp(),builtAt:null},{merge:true});
    await db.collection('systemState').doc('scoreboard').set({invalidatedAt:FieldValue.serverTimestamp(),builtAt:null},{merge:true});
    if (undo&&changes.some(({doc})=>doc.ref.path.startsWith('votes/'))) {
      await db.collection('systemState').doc('ratings-summary').set({invalidatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
  }
  console.log(JSON.stringify({...report,undo,planned:changes.length}));
} else {
  const plans=[];
  for (const row of rows) {
    const actions=row.action.split('+');
    const stage=arg('--stage');
    if (stage==='retire' ? !actions.includes('hide') : stage==='retitle' ? !(row.collection==='fullPoems'&&actions.includes('replace_title_and_text')) : actions.includes('hide')) continue;
    const doc=await db.collection(row.collection).doc(row.doc_id).get();
    if (!doc.exists) { report.held.push({path:doc.ref.path,reason:'missing_document'}); continue; }
    const data=doc.data(), fields={};
    const currentTitle=data.title || data.poem || '';
    if (currentTitle!==row.pp_title && currentTitle!==row.catalog_title) { report.held.push({path:doc.ref.path,reason:'title_changed_since_handoff'}); continue; }
    if (data.book!==row.book) { report.held.push({path:doc.ref.path,reason:'book_changed'}); continue; }
    if (stage==='retire') {
      Object.assign(fields,{catalogRetired:true,catalogRetiredReason:row.reason,catalogRetiredKey:row.reason.match(/BPP-\d{5}/)?.[0] || ''});
    } else {
      if (stage==='retitle' || actions.includes('update_title')) {
        if (!row.catalog_title) throw Error('missing_catalog_title');
        fields[row.collection==='excerpts'?'poem':'title']=row.catalog_title;
      }
      if (stage==='metadata' && actions.includes('set_poemKey')) {
        if (data.poemKey && data.poemKey!==row.poem_key) { report.held.push({path:doc.ref.path,reason:'existing_key_conflicts',existingKey:data.poemKey,expected:row.poem_key}); continue; }
        Object.assign(fields,{poemKey:row.poem_key,poemKeySource:'catalog_book_check_2026-10-19',poemKeyConfidence:1});
      }
      if (stage==='metadata' && actions.includes('strip_markup')) {
        if (/\*\*\s*$/.test(data.excerpt || '')) {
          fields.excerpt=data.excerpt.replace(/\*\*\s*$/,'');
          fields.excerptFingerprint=fields.excerpt.trim().normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
        }
      }
    }
    for (const key of Object.keys(fields)) if (equal(data[key],fields[key])) delete fields[key];
    if (Object.keys(fields).length) plans.push({path:doc.ref.path,updateTime:encode(doc.updateTime),fields});
  }
  write(arg('--plan'),plans);
  console.log(JSON.stringify({...report,planned:plans.length,fields:plans.reduce((a,p)=>{for(const k of Object.keys(p.fields))a[k]=(a[k]||0)+1;return a;},{})}));
}
