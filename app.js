// Code.gs — Firestore REST Integration (working version + pagination)

const firebaseApiKey = 'AIzaSyDhDlg_3VjDTfamRvjcsguqMaiFS3DogT8';
const serviceAccount = JSON.parse(
  PropertiesService.getScriptProperties()
    .getProperty('SERVICE_ACCOUNT_JSON')
);
const projectId  = 'poetry-please';
const databaseId = 'poetrypleasedatabase';

function getFirestoreAccessToken_() {
  const url = 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: url,
    exp: now + 3600,
    iat: now
  };
  const jwtHeader      = Utilities.base64EncodeWebSafe(JSON.stringify(header));
  const jwtClaim       = Utilities.base64EncodeWebSafe(JSON.stringify(claims));
  const signatureInput = jwtHeader + '.' + jwtClaim;
  const signatureBytes = Utilities.computeRsaSha256Signature(
    signatureInput,
    serviceAccount.private_key
  );
  const signature      = Utilities.base64EncodeWebSafe(signatureBytes);
  const jwt            = signatureInput + '.' + signature;

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }
  });
  return JSON.parse(resp.getContentText()).access_token;
}

/**
 * Fetch ALL documents in a collection by following nextPageToken
 */
function firestoreGetAll_(collection) {
  const token = getFirestoreAccessToken_();
  let docs = [];
  let nextPageToken = null;

  do {
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}` +
              `/databases/${databaseId}/documents/${collection}`;
    if (nextPageToken) {
      url += `?pageToken=${encodeURIComponent(nextPageToken)}`;
    }
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });
    const json = JSON.parse(resp.getContentText());
    if (json.documents) {
      docs = docs.concat(json.documents);
    }
    nextPageToken = json.nextPageToken;
  } while (nextPageToken);

  return docs.map(parseFirestoreDocument_);
}

function firestoreQueryVotesByUser_(userId) {
  const token = getFirestoreAccessToken_();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}` +
              `/databases/${databaseId}/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'votes' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: userId }
        }
      }
    }
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(query),
    muteHttpExceptions: true
  });

  const out = [];
  resp.getContentText().trim().split('\n').forEach(line => {
    try {
      const obj = JSON.parse(line);
      if (obj.document) out.push(parseFirestoreDocument_(obj.document));
    } catch (e) {}
  });
  return out;
}

function parseFirestoreDocument_(doc) {
  const out = {};
  for (const key in doc.fields || {}) {
    out[key] = Object.values(doc.fields[key])[0];
  }
  return out;
}

function fetchData(idToken) {
  const email    = verifyFirebaseToken(idToken);
  const allObjs  = firestoreGetAll_('graphics');
  const votedIds = firestoreQueryVotesByUser_(email).map(v => v.imageId);
  const newObjs  = allObjs.filter(o => !votedIds.includes(o.imageId));

  const releaseCatalogs = [...new Set(allObjs.map(o => o.releaseCatalog))].sort();
  const imageTypes      = [...new Set(allObjs.map(o => o.imageType))].sort();

  const mapToArr = o => [
    o.author,
    o.title,
    o.book,
    o.imageId,
    o.imageUrl,
    o.driveLink,
    o.releaseCatalog,
    o.imageType
  ];
  return {
    allGraphics:      allObjs.map(mapToArr),
    newGraphics:      newObjs.map(mapToArr),
    totalImages:      allObjs.length,
    votedImagesCount: votedIds.length,
    remainingImagesCount: newObjs.length,
    releaseCatalogs,
    imageTypes
  };
}

function fetchDataAnon(anonId) {
  const allObjs  = firestoreGetAll_('graphics');
  const votedIds = firestoreQueryVotesByUser_(anonId).map(v => v.imageId);
  const newObjs  = allObjs.filter(o => !votedIds.includes(o.imageId));

  const releaseCatalogs = [...new Set(allObjs.map(o => o.releaseCatalog))].sort();
  const imageTypes      = [...new Set(allObjs.map(o => o.imageType))].sort();

  const mapToArr = o => [
    o.author,
    o.title,
    o.book,
    o.imageId,
    o.imageUrl,
    o.driveLink,
    o.releaseCatalog,
    o.imageType
  ];
  return {
    allGraphics:      allObjs.map(mapToArr),
    newGraphics:      newObjs.map(mapToArr),
    totalImages:      allObjs.length,
    votedImagesCount: votedIds.length,
    remainingImagesCount: newObjs.length,
    releaseCatalogs,
    imageTypes
  };
}

function submitVote(imageId, voteType, userId) {
  const token = getFirestoreAccessToken_();
  const url   = `https://firestore.googleapis.com/v1/projects/${projectId}` +
                `/databases/${databaseId}/documents/votes`;
  const payload = {
    fields: {
      imageId:   { stringValue: imageId },
      voteType:  { stringValue: voteType },
      userId:    { stringValue: userId },
      timestamp: { timestampValue: new Date().toISOString() }
    }
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(payload)
  });
}

function getNextAnonymousId() {
  const props = PropertiesService.getScriptProperties();
  let count = Number(props.getProperty('anonymousCount')) || 0;
  count++;
  props.setProperty('anonymousCount', count);
  return 'poetrylover' + count;
}

function storeEmailInAppsScript(userEmail) {
  const token = getFirestoreAccessToken_();
  const url   = `https://firestore.googleapis.com/v1/projects/${projectId}` +
                `/databases/${databaseId}/documents/users`;
  const payload = {
    fields: {
      email:     { stringValue: userEmail },
      timestamp: { timestampValue: new Date().toISOString() }
    }
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(payload)
  });
}

function fetchReleaseCatalogs() {
  return [...new Set(firestoreGetAll_('graphics').map(g => g.releaseCatalog))].sort();
}

function fetchImageTypes() {
  return [...new Set(firestoreGetAll_('graphics').map(g => g.imageType))].sort();
}

function verifyFirebaseToken(idToken) {
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + firebaseApiKey;
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken })
  });
  const result = JSON.parse(resp.getContentText());
  if (!result.users || !result.users.length) throw new Error('Token verification failed');
  return result.users[0].email;
}

function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Returns an array of vote‐docs for a given userId
 */
function firestoreQueryVotesByUser_(userId) {
  const token = getFirestoreAccessToken_();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}` +
              `/databases/${databaseId}/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'votes' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: userId }
        }
      }
    }
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(query),
    muteHttpExceptions: true
  });

  const raw = resp.getContentText();
  Logger.log(`HTTP ${resp.getResponseCode()} runQuery raw length ${raw.length}`);

  let results;
  try {
    // Firestore returns a JSON array here
    results = JSON.parse(raw);
  } catch (e) {
    Logger.log(`JSON.parse failed: ${e}`);
    return [];
  }

  // Extract only entries with a document field
  const out = results
    .filter(obj => obj.document)
    .map(obj => parseFirestoreDocument_(obj.document));

  Logger.log(`→ parsed ${out.length} vote(s) for ${userId}`);
  return out;
}


/**
 * Quick test harness for checking vote reads.
 */
function testFetchVotes() {
  const testEmail = 'sam@buttonpoetry.com';  // ← change to your actual user email
  const docs      = firestoreQueryVotesByUser_(testEmail);
  Logger.log(`testFetchVotes → returned ${docs.length} docs: ${JSON.stringify(docs)}`);
}


/**
 * Quick test harness for fetchData (using anon flow)
 */
function testFetchData() {
  // Get or create an anonymous ID
  const anon = getNextAnonymousId();

  // Call the same server‐side logic you use in the client
  const data = fetchDataAnon(anon);

  // Log out all the key counts
  Logger.log(`testFetchData → anonId = ${anon}`);
  Logger.log(`  totalImages         = ${data.totalImages}`);
  Logger.log(`  allGraphics.length  = ${data.allGraphics.length}`);
  Logger.log(`  newGraphics.length  = ${data.newGraphics.length}`);
  Logger.log(`  votedImagesCount    = ${data.votedImagesCount}`);
  Logger.log(`  remainingImagesCount= ${data.remainingImagesCount}`);
}
