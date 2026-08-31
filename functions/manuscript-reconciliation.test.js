import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
import{CATALOG_BASE,READ_ONLY_ACTIONS,available,boot,filterRows,isTeamProfile,mapCatalogPayload,normalizeWhitespace,preserveText}from"../public/manuscript-reconciliation.js";
const rows=[{identity:"Alpha",status:"auto_approved",buckets:["Auto-Approved"],warnings:[]},{identity:"Beta",status:"pending",buckets:["Unclassified"],warnings:["Visual review required"]}];
test("team access accepts only established roles-array conventions",()=>{assert.equal(isTeamProfile({roles:["team"]}),true);assert.equal(isTeamProfile({roles:["admin"]}),true);assert.equal(isTeamProfile({roles:["user"]}),false);assert.equal(isTeamProfile({role:"admin"}),false);assert.equal(isTeamProfile(null),false)});
test("bucket, status, and search filters work without inference",()=>{assert.equal(filterRows(rows,{bucket:"Auto-Approved"}).length,1);assert.equal(filterRows(rows,{status:"pending"}).length,1);assert.equal(filterRows(rows,{search:"visual"}).length,1);assert.equal(filterRows(rows,{search:"missing"}).length,0)});
test("missing data is explicit and stanza blank lines survive",()=>{assert.equal(available(null),"Unavailable");assert.equal(preserveText("one\r\n\r\ntwo"),"one\n\ntwo");assert.equal(normalizeWhitespace("one  \n\n  two"),"one\n\n two")});
test("Catalog mapping rejects incomplete contracts and leaves unmapped rows unclassified",()=>{assert.throws(()=>mapCatalogPayload({},[]),/authoritative totals/);assert.deepEqual(mapCatalogPayload({totals:{resolutionRows:1}},[{status:"pending"}]).rows[0].buckets,["Unclassified"]);assert.deepEqual(mapCatalogPayload({totals:{resolutionRows:1}},[{buckets:["Added"]}]).rows[0].buckets,["Added"])});
test("public assets contain no reconciliation fixture and every demo path follows authorization",()=>{const app=fs.readFileSync(new URL("../public/manuscript-reconciliation.js",import.meta.url),"utf8");assert.doesNotMatch(app,/manuscript-reconciliation-fixture|LABC_FIXTURE|fixture=1/);assert.equal(fs.existsSync(new URL("../public/manuscript-reconciliation-fixture.js",import.meta.url)),false);const authIndex=app.indexOf("await authorizeTeam()");const paramsIndex=app.indexOf("new URLSearchParams(location.search)");assert.ok(authIndex>=0);assert.ok(paramsIndex>authIndex);assert.match(app,/Array\.isArray\(profile\?\.roles\)/)});
test("Phase 1 exposes no mutation actions and the shell is desktop-first",()=>{assert.deepEqual(READ_ONLY_ACTIONS,[]);const html=fs.readFileSync(new URL("../public/manuscript-reconciliation.html",import.meta.url),"utf8");const app=fs.readFileSync(new URL("../public/manuscript-reconciliation.js",import.meta.url),"utf8");assert.match(html,/Checking authenticated team access/);assert.match(app,/Desktop-first review workspace/);assert.doesNotMatch(app,/method:"(?:POST|PUT|PATCH|DELETE)/)});

function installClientGlobals({user,profile}){
  const previous={document:globalThis.document,firebase:globalThis.firebase,fetch:globalThis.fetch,location:globalThis.location};
  const calls=[];
  const root={innerHTML:"Checking authenticated team access",querySelector:()=>null,querySelectorAll:()=>[]};
  globalThis.document={querySelector:()=>root};
  globalThis.location={search:""};
  globalThis.firebase={apps:[],initializeApp:()=>({}),auth:()=>({onAuthStateChanged:resolve=>resolve(user)})};
  globalThis.fetch=async url=>{
    calls.push(url);
    if(url==="/api/me")return{ok:true,json:async()=>profile};
    if(url===CATALOG_BASE+"/reconciliations/2")return{ok:true,json:async()=>({id:2,bookTitle:"Synthetic Book",author:"Synthetic Author",totals:{resolutionRows:1,autoApproved:0,pending:1}})};
    if(url===CATALOG_BASE+"/reconciliations/2/resolutions")return{ok:true,json:async()=>[{resolutionId:1,identity:"Synthetic row",status:"pending",buckets:["Unclassified"],prior:{text:"prior"},candidate:{text:"candidate"},warnings:[]}]};
    throw Error("Unexpected request: "+url);
  };
  return{root,calls,restore(){for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value}};
}
test("client renders no reconciliation data and makes no request before auth resolves",async()=>{
  const previous={document:globalThis.document,firebase:globalThis.firebase,fetch:globalThis.fetch,location:globalThis.location};
  const calls=[];const root={innerHTML:"Checking authenticated team access",querySelector:()=>null,querySelectorAll:()=>[]};let resolveAuth;
  globalThis.document={querySelector:()=>root};globalThis.location={search:""};
  globalThis.firebase={apps:[],initializeApp:()=>({}),auth:()=>({onAuthStateChanged:resolve=>{resolveAuth=resolve}})};
  globalThis.fetch=async url=>{calls.push(url);throw Error("Request before authorization: "+url)};
  try{const pending=boot();await Promise.resolve();assert.equal(root.innerHTML,"Checking authenticated team access");assert.deepEqual(calls,[]);resolveAuth(null);await pending;assert.match(root.innerHTML,/Team access required/);assert.doesNotMatch(root.innerHTML,/Authenticated team access|Synthetic Book/)}
  finally{for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value}
});
test("client denies a synthetic non-team profile before Catalog reads",async()=>{
  const env=installClientGlobals({user:{getIdToken:async()=>"synthetic-user-token"},profile:{roles:["user"]}});
  try{await boot();assert.deepEqual(env.calls,["/api/me"]);assert.match(env.root.innerHTML,/Team access required/);assert.doesNotMatch(env.root.innerHTML,/Authenticated team access|Synthetic Book/)}finally{env.restore()}
});
test("client starts Catalog reads only after synthetic team or admin authorization",async()=>{
  for(const role of["team","admin"]){const env=installClientGlobals({user:{getIdToken:async()=>`synthetic-${role}-token`},profile:{roles:[role]}});
    try{await boot();assert.deepEqual(env.calls,["/api/me",CATALOG_BASE+"/reconciliations/2",CATALOG_BASE+"/reconciliations/2/resolutions"]);assert.match(env.root.innerHTML,/Authenticated team access/);assert.match(env.root.innerHTML,/Synthetic Book/)}finally{env.restore()}}
});
