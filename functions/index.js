// functions/index.js

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

// Initialize the Admin SDK using your service account
// (if you’ve set GOOGLE_APPLICATION_CREDENTIALS, you don't need to pass anything here)
admin.initializeApp();

const db = admin.firestore();

// Helper: turn a graphics/doc into the array shape your client expects
const mapGraphic = o => [
  o.author,
  o.title,
  o.book,
  o.imageId,
  o.imageUrl,
  o.driveLink,
  o.releaseCatalog,
  o.imageType
];

// fetchData: same behavior as your GAS fetchData & fetchDataAnon
exports.fetchData = functions.https.onRequest(async (req, res) => {
  try {
    // client passes ?token=ID_TOKEN or ?anon=ANON_ID
    const { token, anon } = req.query;
    let userId;

    if (token) {
      // verify Firebase ID token and extract email
      const decoded = await admin.auth().verifyIdToken(token);
      userId = decoded.email;
    } else if (anon) {
      userId = anon;
    } else {
      return res.status(400).json({ error: 'Missing token or anon parameter' });
    }

    // 1) Fetch all graphics
    const allSnap = await db.collection('graphics').get();
    const allObjs = allSnap.docs.map(d => d.data());

    // 2) Fetch this user’s votes
    const voteSnap = await db.collection('votes')
                             .where('userId', '==', userId)
                             .get();
    const votedIds = voteSnap.docs.map(d => d.data().imageId);

    // 3) Compute new vs. voted
    const newObjs = allObjs.filter(o => !votedIds.includes(o.imageId));

    // 4) Build catalog/type lists
    const releaseCatalogs = Array.from(
      new Set(allObjs.map(o => o.releaseCatalog))
    ).sort();
    const imageTypes = Array.from(
      new Set(allObjs.map(o => o.imageType))
    ).sort();

    // 5) Send exactly the same payload shape you had in GAS
    res.json({
      allGraphics:         allObjs.map(mapGraphic),
      newGraphics:         newObjs.map(mapGraphic),
      totalImages:         allObjs.length,
      votedImagesCount:    votedIds.length,
      remainingImagesCount:newObjs.length,
      releaseCatalogs,
      imageTypes
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// submitVote: replace your REST POST to /votes
exports.submitVote = functions.https.onRequest(async (req, res) => {
  try {
    const { imageId, voteType, userId } = req.body;
    if (!imageId || !voteType || !userId) {
      return res.status(400).json({ error: 'Missing imageId, voteType or userId' });
    }
    await db.collection('votes').add({
      imageId,
      voteType,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// storeEmailInAppsScript → storeEmail
exports.storeEmail = functions.https.onRequest(async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail) {
      return res.status(400).json({ error: 'Missing userEmail' });
    }
    await db.collection('users').add({
      email:     userEmail,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// fetchReleaseCatalogs
exports.fetchReleaseCatalogs = functions.https.onRequest(async (req, res) => {
  try {
    const allSnap = await db.collection('graphics').get();
    const catalogs = Array.from(
      new Set(allSnap.docs.map(d => d.data().releaseCatalog))
    ).sort();
    res.json({ releaseCatalogs: catalogs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// fetchImageTypes
exports.fetchImageTypes = functions.https.onRequest(async (req, res) => {
  try {
    const allSnap = await db.collection('graphics').get();
    const types = Array.from(
      new Set(allSnap.docs.map(d => d.data().imageType))
    ).sort();
    res.json({ imageTypes: types });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});
