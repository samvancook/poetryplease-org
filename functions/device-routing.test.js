import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const detect = readFileSync(new URL('../public/detect.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const parity = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').match(/\(function ensureMobileRouteParity\(\) \{[\s\S]*?\n\}\)\(\);/)[0];
const desktop = {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130 Safari/537.36',platform:'MacIntel',maxTouchPoints:0};
function route(script, {search='',hash='',width=1280,pinned='mobile',coarse=false,device=desktop} = {}, pathname='/detect.html') {
  let destination;
  const location={pathname,search,hash,replace:value=>{destination=value;}};
  const window={location,innerWidth:width,matchMedia:query=>({matches:query.includes('pointer')?coarse:width<=768})};
  vm.runInNewContext(script,{window,location,navigator:device,URLSearchParams,IS_EMBED_UI:false,
    localStorage:{getItem:()=>pinned,setItem:()=>{}},document:{getElementById:()=>({textContent:''})}});
  return destination;
}
test('automatic desktop visits ignore stale mobile preview, narrow windows and coarse pointers',()=>{
  for (const options of [{},{width:390},{coarse:true},{device:{...desktop,platform:'Win32',maxTouchPoints:10},coarse:true}]) {
    assert.equal(route(detect,options),'/app');
    assert.equal(route(parity,options,'/app'),undefined);
  }
});
test('actual phones, mobile client hints and iPadOS retain primary Swipe routing',()=>{
  for (const device of [
    {...desktop,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari'},
    {...desktop,userAgent:'Mozilla/5.0 (Linux; Android 15) Mobile Chrome'},
    {...desktop,userAgentData:{mobile:true}},
    {...desktop,maxTouchPoints:5},
  ]) {
    assert.equal(route(detect,{device,pinned:'desktop'}),'/m');
    assert.equal(route(parity,{device},'/app'),'/m?view=mobile');
  }
});
test('explicit desktop/mobile choices survive the detector and the app routing guard',()=>{
  const phone={...desktop,userAgent:'iPhone Mobile'};
  assert.equal(route(detect,{device:phone,search:'?view=desktop'}),'/app?view=desktop');
  assert.equal(route(parity,{device:phone,search:'?view=desktop'},'/app'),undefined);
  assert.equal(route(detect,{search:'?view=mobile'}),'/m?view=mobile');
  assert.equal(route(parity,{search:'?view=mobile'},'/app'),'/m?view=mobile');
  assert.equal(route(detect,{search:'?desktop=1'}),'/app?view=desktop');
  assert.equal(route(detect,{search:'?mobile=1'}),'/m?view=mobile');
});
test('item, invite and book parameters and fragments survive normal routing',()=>{
  const search='?item=FP%20one&authorInvite=token&book=Roads';
  const target=new URL(route(detect,{search,hash:'#part'}),'https://poetryplease.org');
  assert.equal(target.pathname,'/app');
  assert.deepEqual([...target.searchParams],[['item','FP one'],['authorInvite','token'],['book','Roads']]);
  assert.equal(target.hash,'#part');
  assert.equal(route(detect,{search:'?noredirect=1'}),undefined);
});
