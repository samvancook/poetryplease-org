import test from 'node:test';import assert from 'node:assert/strict';
import{buildWeaverVideoContextPatch,buildWeaverVideoIntake}from'./weaver-video-intake.js';
const sourceRecordId='weaver:video:originalRecording12345',fileId='finishedVersion12345678';
const context={schemaVersion:1,performanceId:'weaver:performance:originalRecording12345',sourceRecordId,
 poem:{author:'Author',title:'Poem'},assets:[{fileId,fileName:'VV.mp4',url:`https://drive.google.com/file/d/${fileId}/view`,relationship:'same_performance',timing:'source_specific'}],excerptRecordIds:['excerpt-1']};
const existing={sourceSystem:'weaver',sourceRecordId,sourceEvent:'Event',driveLink:'original-primary',videoUrl:'original-hosted',
 weaverReviews:[{reviewId:'old-review',excerptRecordIds:['old-excerpt']}],weaverSelectedExcerptRecordIds:['old-excerpt']};
test('format context is additive, idempotent and cannot alter primary, ratings, rights or event',()=>{
 const body={sourceRecordId,sourceEvent:'Event',performanceContext:context,selectedExcerptRecordIds:['excerpt-1']};
 const first=buildWeaverVideoContextPatch(existing,body),saved={...existing,...first.patch};
 assert.deepEqual(saved.weaverSelectedExcerptRecordIds,['old-excerpt','excerpt-1']);
 assert.equal(saved.weaverPerformanceContext.assets.length,1);assert.equal(saved.weaverReviews[0].reviewId,'old-review');
 assert.equal(saved.videoUrl,existing.videoUrl);assert.equal(saved.driveLink,existing.driveLink);
 assert.deepEqual(buildWeaverVideoContextPatch(saved,body).patch,{});
 assert.throws(()=>buildWeaverVideoContextPatch(saved,{...body,performanceContext:{...context,poem:{author:'Wrong',title:'Poem'}}}),/identity_conflict/);
 assert.throws(()=>buildWeaverVideoContextPatch(saved,{...body,performanceContext:{...context,sourceRecordId:'wrong'}}),/invalid/);
});
test('later versions share excerpt references without copying excerpt records or discarding earlier versions',()=>{
 const base={...existing,...buildWeaverVideoContextPatch(existing,{sourceRecordId,sourceEvent:'Event',performanceContext:context}).patch};
 const other='horizontalVersion123456';const incoming={...context,assets:[{...context.assets[0],fileId:other,url:`https://drive.google.com/file/d/${other}/view`}],excerptRecordIds:['excerpt-2']};
 const r=buildWeaverVideoContextPatch(base,{sourceRecordId,sourceEvent:'Event',performanceContext:incoming});
 assert.equal(r.performanceContext.assets.length,2);assert.deepEqual(r.performanceContext.excerptRecordIds,['excerpt-1','excerpt-2']);
});
test('normal new-video intake carries the same performance contract and rejects malformed identities',()=>{
 const body={contentType:'VV',sourceSystem:'weaver',decision:'ready_for_poetry_please',sourceRecordId,sourceEvent:'Event',sourceEventLabel:'Event',finalAssetUrl:'https://example.com/final.mp4',performanceContext:context};
 assert.deepEqual(buildWeaverVideoIntake(body).item.weaverPerformanceContext,context);
 assert.equal(buildWeaverVideoIntake({...body,performanceContext:{...context,assets:[{...context.assets[0],url:'https://evil.example/file'}]}}).ok,false);
});
