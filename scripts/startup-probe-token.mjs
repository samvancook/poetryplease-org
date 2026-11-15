// Issues a one-hour sign-in token for the startup probe's test reader, and
// creates that reader on first use. Run only by the signed_in_probe job in the
// deploy workflow, with its keyless identity. The token is written to the file
// named by PP_PROBE_TOKEN_FILE and is never printed.
//
// The test reader has an unverified address that receives no mail and never
// votes. PP_PROBE_READER_ROLE=author marks it as an author for that run, with
// no author profile, so the author startup path can be measured; any other
// value puts it back to a plain reader. Delete it in Firebase Authentication
// (and its users record) to remove it.
import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const PROBE_READER = {
  uid: "startup-probe-reader",
  email: "startup-probe-reader@poetryplease.org",
  displayName: "Startup probe (automated test reader)",
};

const serviceAccountId = process.env.PP_PROBE_SERVICE_ACCOUNT;
const tokenFile = process.env.PP_PROBE_TOKEN_FILE;
if (!serviceAccountId || !tokenFile) throw new Error("PP_PROBE_SERVICE_ACCOUNT and PP_PROBE_TOKEN_FILE are required");

const app = initializeApp({ credential: applicationDefault(), projectId: "poetry-please", serviceAccountId });
const auth = getAuth();
let created = false;
try {
  await auth.getUser(PROBE_READER.uid);
} catch (error) {
  if (error?.code !== "auth/user-not-found") throw error;
  await auth.createUser({ ...PROBE_READER, emailVerified: false, disabled: false });
  created = true;
}
// Only "user" and "author" are ever written here.
const roles = process.env.PP_PROBE_READER_ROLE === "author" ? ["user", "author"] : ["user"];
await getFirestore(app, "poetrypleasedatabase").collection("users").doc(PROBE_READER.uid)
  .set({ roles, email: PROBE_READER.email, displayName: PROBE_READER.displayName, automaticTeamAccess: false }, { merge: true });
writeFileSync(tokenFile, await auth.createCustomToken(PROBE_READER.uid), { mode: 0o600 });
console.log(JSON.stringify({ event: "probe_reader_ready", uid: PROBE_READER.uid, created, roles }));
