import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isTeamProfile } from "../public/manuscript-reconciliation.js";

const PROJECT_ID="demo-poetry-please";
const AUTH_HOST=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_HOST=process.env.FIRESTORE_EMULATOR_HOST;
const FUNCTION_URL=`http://127.0.0.1:5001/${PROJECT_ID}/us-central1/api/api/me`;

function assertDemoIsolation(){
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT_ID);
  assert.match(String(process.env.FIREBASE_CONFIG||""),/demo-poetry-please/);
  assert.match(String(AUTH_HOST||""),/(?:127\.0\.0\.1|localhost):9099/);
  assert.match(String(FIRESTORE_HOST||""),/(?:127\.0\.0\.1|localhost):8080/);
}

async function createSyntheticUser(db,label,roles){
  const email=`${label}@example.test`;
  const response=await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email,password:"Synthetic-only-123!",returnSecureToken:true})
  });
  assert.equal(response.ok,true,await response.text());
  const identity=await response.json();
  await db.collection("users").doc(identity.localId).set({email,displayName:`Synthetic ${label}`,roles,status:"active",automaticTeamAccess:false});
  return identity;
}

async function getMe(idToken){
  return fetch(FUNCTION_URL,{headers:idToken?{authorization:`Bearer ${idToken}`}:{}});
}

test("isolated emulator verifies the Firebase Auth to /api/me roles-array contract",async t=>{
  assertDemoIsolation();
  const app=initializeApp({projectId:PROJECT_ID},"manuscript-reconciliation-emulator-test");
  const db=getFirestore(app);
  try{
    await t.test("signed-out requests are denied",async()=>{
      const response=await getMe();
      assert.equal(response.status,401);
      assert.deepEqual(await response.json(),{error:"auth"});
    });
    const identities={};
    for(const [label,roles] of [["viewer",["user"]],["team",["team"]],["admin",["admin"]]])identities[label]=await createSyntheticUser(db,label,roles);
    await t.test("synthetic non-team roles do not satisfy reconciliation authorization",async()=>{
      const response=await getMe(identities.viewer.idToken);
      assert.equal(response.status,200);
      const profile=await response.json();
      assert.ok(Array.isArray(profile.roles));
      assert.equal(isTeamProfile(profile),false);
    });
    for(const role of["team","admin"])await t.test(`synthetic ${role} passes the existing roles-array contract`,async()=>{
      const response=await getMe(identities[role].idToken);
      assert.equal(response.status,200);
      const profile=await response.json();
      assert.ok(Array.isArray(profile.roles));
      assert.ok(profile.roles.includes(role));
      assert.equal(isTeamProfile(profile),true);
    });
  }finally{await deleteApp(app)}
});
