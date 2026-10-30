import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareVideoRendition, verifyRenditionBytes, registerVideoRendition } from './video-renditions.js';
const bytes = Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypisom'),Buffer.alloc(20)]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const video = {sourceRecordId:'weaver:video:reviewed-file123',videoUrl:'https://example.test/primary.mov',driveLink:'https://drive.google.com/file/d/final-file123/view',poemKey:'BPP-12345',weaverReviews:[{reviewId:'one'}],weaverSelectedExcerptRecordIds:['excerpt-one'],reviewOnly:true};
const input = { reviewedSourceFileId:'reviewed-file123',sourceVersionFileId:'master-file123',outputFileId:'output-file123',role:'platform',profileId:'platform-1080p-h264-aac',profileVersion:'1',sha256,width:1080,height:1920,byteCount:bytes.length,durationSeconds:170.92,frameRate:29.97,videoCodec:'h264',audioCodec:'aac',audioSampleRate:48000,evidenceUrl:'https://docs.google.com/document/d/handoff/edit'};
async function* stream(value=bytes) { yield value.subarray(0,10); yield value.subarray(10); }
function store() {
 const documents = new Map([['videos/canonical',structuredClone(video)],['contentAssets/original',{assetType:'library_video',contentDocId:'canonical'}]]);
 const ref = path => ({id:path.split('/').at(-1),path,get:async()=>({exists:documents.has(path),data:()=>documents.get(path)})});
 const db = {collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,data)=>documents.set(r.path,data)})};
 return {db,documents};
}
test('renditions preserve reviewed source, master, output and profile identities separately', () => {
 const p = prepareVideoRendition('canonical',video,input);
 assert.equal(p.record.sourceRecordId,video.sourceRecordId);
 assert.equal(p.record.sourceVersionFileId,'master-file123');
 assert.equal(p.record.outputFileId,'output-file123');
 assert.equal(p.record.contentDocId,'canonical');
 assert.equal(p.record.sourceChecksum,null);
 assert.notEqual(prepareVideoRendition('canonical',video,{...input,profileVersion:'2'}).id,p.id);
 for(const change of [{reviewedSourceFileId:'other-file123'},{outputFileId:'https://attacker.test'},{role:'new-performance'},{sha256:'bad'},{byteCount:900000000},{evidenceUrl:'javascript:bad'}]) assert.throws(()=>prepareVideoRendition('canonical',video,{...input,...change}));
});
test('derivative verification checks actual MP4 bytes, length and SHA-256', async () => {
 assert.equal((await verifyRenditionBytes(stream(),input)).validationState,'verified_bytes');
 await assert.rejects(verifyRenditionBytes(stream(),{...input,byteCount:bytes.length+1}),/byte_count/);
 await assert.rejects(verifyRenditionBytes(stream(),{...input,byteCount:bytes.length-1}),/byte_count/);
 await assert.rejects(verifyRenditionBytes(stream(),{...input,sha256:'f'.repeat(64)}),/checksum/);
 await assert.rejects(verifyRenditionBytes(stream(Buffer.alloc(bytes.length)),input),/not_mp4/);
});
test('repeat registration reuses asset; master and derivative never mutate canonical video/reviews/links/primary', async () => {
 const {db,documents}=store(); let verifies=0;
 const register = rendition => registerVideoRendition({db,videoId:'canonical',input:rendition,timestamp:()=> 'now',verify:async record=>{verifies++;return verifyRenditionBytes(stream(),record);}});
 const before = structuredClone(documents.get('videos/canonical'));
 const one = await register(input), repeat = await register(input);
 assert.equal(one.created,true); assert.equal(repeat.created,false);assert.equal(one.id,repeat.id);assert.equal(verifies,1);
 await assert.rejects(register({...input,outputFileId:'different-file123'}),/profile_conflict/);
 const master = await register({...input,role:'master',profileId:'original-master',outputFileId:input.sourceVersionFileId,sha256:'',byteCount:1291954208,width:2160,height:3840});
 assert.equal(master.validationState,'source_reported');assert.equal(verifies,1);
 assert.deepEqual(documents.get('videos/canonical'),before);
 assert.equal(documents.size,4);assert.equal(documents.get('contentAssets/original').assetType,'library_video');
});
test('a bad checksum does not register a partial asset or alter the canonical video', async () => {
 const {db,documents}=store();
 await assert.rejects(registerVideoRendition({db,videoId:'canonical',input:{...input,sha256:'f'.repeat(64)},timestamp:()=> 'now',verify:r=>verifyRenditionBytes(stream(),r)}),/checksum/);
 assert.equal(documents.size,2);assert.deepEqual(documents.get('videos/canonical'),video);
});
