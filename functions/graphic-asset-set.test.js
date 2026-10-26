import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGraphicAssetSet, validateAffectedCardIndex, repairAssetSetUpdate } from './graphic-asset-set.js';
const card = index => ({ index, role: 'content', assetUrl: `https://example.test/card-${index}.png`, assetPreviewUrl: `https://example.test/preview-${index}.png`, assetFileId: `file-${index}`, fileName: `${index}.png` });
test('ordered 2–20 cards and explicit one-card sets preserve identity; absent is legacy', () => {
  assert.equal(normalizeGraphicAssetSet(undefined), null);
  for (const count of [1, 2, 20]) {
    const set = Array.from({length:count}, (_, i) => card(i + 1));
    assert.deepEqual(normalizeGraphicAssetSet(set), set);
  }
});
test('invalid sets and unsafe URLs fail before ingestion', () => {
  for (const bad of [[], {}, Array.from({length:21}, (_,i)=>card(i+1)), [card(2),card(1)], [card(1),card(1)], [{...card(1),assetUrl:'javascript:alert(1)'}], [{...card(1),assetUrl:'https://user:password@example.test/x'}]]) assert.throws(()=>normalizeGraphicAssetSet(bad), /invalid_asset_set/);
  for (const index of [0,-1,3,1.5,'1']) assert.throws(()=>validateAffectedCardIndex(index,[card(1),card(2)]), /invalid_affected_card_index/);
});
test('synthetic three-card repair changes card 2 only and preserves ordered siblings', () => {
  const before=[card(1),card(2),card(3)];
  const after=before.map(c=>c.index===2?{...c,assetUrl:'https://example.test/repaired.png',assetPreviewUrl:'https://example.test/repaired-preview.png',assetFileId:'repaired'}:c);
  assert.deepEqual(repairAssetSetUpdate(before,after,2),after);
  assert.throws(()=>repairAssetSetUpdate(before,undefined,2), /replacement_asset_set_required/);
  assert.throws(()=>repairAssetSetUpdate(before,[after[0],after[1]],2), /unaffected_cards_changed/);
  assert.throws(()=>repairAssetSetUpdate(before,after.map(c=>({...c,assetFileId:'reuploaded'})),2), /unaffected_cards_changed/);
  assert.equal(repairAssetSetUpdate(undefined,undefined),null);
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeScrollItem} from '../public/scroll-feed-core.js';
const source=readFileSync(new URL('./index.js',import.meta.url),'utf8');
function definition(name) {
  const match=new RegExp(`(?:export )?(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, name);
  return source.slice(match.index,source.indexOf('\n}\n',match.index)+2).replace(/^export /,'');
}
test('actual QI and FPI import mapping, payload, storage and feed preserve all cards and one canonical identity', async()=>{
 for(const imageType of ['QI','FPI']) {
  const docs=new Map(); let uploads=0;
  const ref=id=>({id,get:async()=>({id,exists:docs.has(id),data:()=>docs.get(id)}),set:async value=>docs.set(id,{...(docs.get(id)||{}),...value})});
  const context={ normalizeGraphicAssetSet, normalizeText:v=>String(v||'').trim(), normalizeKey:v=>String(v||'').trim().toLowerCase(),
   canonicalizeAuthorName:v=>v, lookupCatalogBookMetadata:()=>null,
   sanitizeDocIdSegment:v=>String(v||'').replaceAll('/','-'), slugify:v=>v.toLowerCase().replaceAll(' ','-'),
   db:{collection:()=>({doc:ref})}, COLLECTIONS:{graphics:'graphics'},
   FieldValue:{serverTimestamp:()=> 'now'}, UPLOAD_RULES:{libraryGraphic:{}},
   isGoogleDriveFileUrl:()=>false, fetchRemoteMediaResponse:async()=>({extension:'png'}),
   streamRemoteMediaToStorage:async({sourceUrl})=>{uploads++;return {publicUrl:sourceUrl.replace('example.test','storage.example.test')};},
   mapAdminContentDoc:(_collection,snap)=>({id:snap.id,...snap.data()}), console,
  };
  const names=['firstNonEmpty','firstArray','normalizeWeaverGraphicsPayload','flattenWeaverGraphicsRecords','deriveWeaverGraphicsDocId','mapWeaverGraphicRecord','shouldImportWeaverGraphicRecord','buildWeaverGraphicsImportItems','deriveContentDocId','buildContentDocPayload','collectionForContentType','hostGraphicAssetSet','upsertContentLibraryItem','parseDoc','mapToArr'];
  const f=vm.runInNewContext(names.map(definition).join('\n')+'; ({buildWeaverGraphicsImportItems,upsertContentLibraryItem,parseDoc,mapToArr})',context);
  const record={docId:'SYNTHETIC-'+imageType,sourceRecordId:'synthetic:multi:'+imageType,sourceRequestId:'synthetic:request',sourceCompletionId:'synthetic:complete',author:'Synthetic Author',title:'Synthetic Three Cards',book:'',imageType,sourceSystem:'weaver',sourceCompletionId:'synthetic-complete',assetUrl:card(1).assetUrl,assetSet:[card(1),card(2),card(3)],pigProjectId:'synthetic-project',editableProjectFileId:'editable',editableProjectUrl:'https://example.test/edit'};
  const [mapped]=f.buildWeaverGraphicsImportItems([record],{defaultImageType:imageType});
  assert.equal(mapped.assetSet.length,3);
  const imported=await f.upsertContentLibraryItem('graphics',mapped,{uid:'synthetic'});
  assert.equal(imported.created,true);assert.equal(docs.size,1);assert.equal(uploads,3);
  assert.equal(imported.item.sourceRecordId,record.sourceRecordId);
  assert.equal(imported.item.pigProjectId,record.pigProjectId);
  const replay=await f.upsertContentLibraryItem('graphics',mapped,{uid:'synthetic'});
  assert.equal(replay.created,false);assert.equal(docs.size,1);assert.equal(uploads,3);
  const parsed=f.parseDoc({id:mapped.docId,data:()=>docs.get(mapped.docId)});
  const row=f.mapToArr(parsed); const visible=normalizeScrollItem(row);
  assert.equal(visible.assetSet.length,3);assert.equal(visible.assetSet[2].index,3);
  await assert.rejects(f.upsertContentLibraryItem('graphics',{...mapped,assetSet:undefined},{uid:'synthetic'}),/asset_set_required_for_existing_multicard/);
 }
});
