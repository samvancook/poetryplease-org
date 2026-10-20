import test from 'node:test';
import assert from 'node:assert/strict';
import { samePoem, relatedExcerptIds, resolvePoemRelations } from './poem-relations.js';
const base = { author:'Matt Mason', book:'Roads', title:'Poem', poemKey:'BPP-00001' };
const source = { ...base, id:'qi-doc', imageId:'QI-1', imageType:'QI' };
const fp = { ...base, id:'fp-doc', imageId:'FP-1', imageType:'FP', excerpt:'First line\nSecond line' };
const excerpt = { ...base, id:'exc-doc', imageId:'EXC-1', imageType:'EXC' };
const video = { author:'Matt Mason', title:'Video title differs', id:'video-doc', imageId:'VV-1', imageType:'VV', videoUrl:'https://example.org/video.mp4' };
test('permanent poem IDs match renamed content and reject conflicting IDs', () => {
  assert.equal(samePoem(source, {...fp,title:'Changed title'}), true);
  assert.equal(samePoem(source, {...fp,poemKey:'BPP-00002'}), false);
});
test('legacy fallback requires exact author, book and title, with no fuzzy or bookless inference', () => {
  assert.equal(samePoem({...source,poemKey:''}, {...fp,title:'“Poem”'}), true);
  assert.equal(samePoem({...source,book:'',poemKey:''}, {...fp,book:'',poemKey:''}), false);
  assert.equal(samePoem({...source,poemKey:''}, {...fp,author:'Someone else'}), false);
});
test('graphic links to full text and explicit excerpt video occurrence without inventing metadata', () => {
  const occurrences=[{canonicalExcerptId:'exc-doc',canonicalVideoId:'video-doc'}];
  assert.deepEqual(relatedExcerptIds(source,[source,fp,excerpt,video]), ['exc-doc']);
  const result=resolvePoemRelations(source,[source,fp,excerpt,video],occurrences);
  assert.equal(result.fullPoem.imageId,'FP-1');
  assert.deepEqual(result.videos.map(row=>row.imageId),['VV-1']);
});
test('video follows saved occurrence to full text and does not link to itself', () => {
  const result=resolvePoemRelations(video,[source,fp,excerpt,video],[{canonicalExcerptId:'exc-doc',canonicalVideoId:'video-doc'}]);
  assert.equal(result.fullPoem.imageId,'FP-1');
  assert.deepEqual(result.videos,[]);
});
test('full poem links to its video but not to itself; missing or ambiguous full texts stay absent', () => {
  const keyedVideo={...video,...base};
  assert.equal(resolvePoemRelations(fp,[fp,keyedVideo]).fullPoem,null);
  assert.equal(resolvePoemRelations(fp,[fp,keyedVideo]).videos.length,1);
  assert.equal(resolvePoemRelations(source,[source]).fullPoem,null);
  assert.equal(resolvePoemRelations(source,[source,fp,{...fp,imageId:'FP-2'}]).fullPoem,null);
});
