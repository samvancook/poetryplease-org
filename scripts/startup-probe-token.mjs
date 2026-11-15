// Issues a one-hour sign-in token for the startup probe's test reader, and
// creates that reader on first use. Run only by the signed_in_probe job in the
// deploy workflow, with its keyless identity. The token is written to the file
// named by PP_PROBE_TOKEN_FILE and is never printed.
//
// The test reader has no roles, an unverified address that receives no mail,
// and never votes. Delete it in Firebase Authentication to remove it.
import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const PROBE_READER = {
  uid: "startup-probe-reader",
  email: "startup-probe-reader@poetryplease.org",
  displayName: "Startup probe (automated test reader)",
};

const serviceAccountId = process.env.PP_PROBE_SERVICE_ACCOUNT;
const tokenFile = process.env.PP_PROBE_TOKEN_FILE;
if (!serviceAccountId || !tokenFile) throw new Error("PP_PROBE_SERVICE_ACCOUNT and PP_PROBE_TOKEN_FILE are required");

initializeApp({ credential: applicationDefault(), projectId: "poetry-please", serviceAccountId });
const auth = getAuth();
let created = false;
try {
  await auth.getUser(PROBE_READER.uid);
} catch (error) {
  if (error?.code !== "auth/user-not-found") throw error;
  await auth.createUser({ ...PROBE_READER, emailVerified: false, disabled: false });
  created = true;
}
writeFileSync(tokenFile, await auth.createCustomToken(PROBE_READER.uid), { mode: 0o600 });
console.log(JSON.stringify({ event: "probe_reader_ready", uid: PROBE_READER.uid, created }));
