const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.fetchData = functions.https.onRequest(async (req, res) => {
  try {
    const { idToken, anonId } = req.method === 'POST' ? req.body : req.query;

    let userId = anonId;
    if (idToken) {
      const decoded = await admin.auth().verifyIdToken(idToken);
      userId = decoded.email;
    }
    if (!userId) {
      throw new Error("Missing idToken or anonId");
    }

    const graphicsSnap = await db.collection('graphics').get();
    const graphics = graphicsSnap.docs.map(doc => doc.data());

    const votesSnap = await db.collection('votes').where('userId', '==', userId).get();
    const votedIds = votesSnap.docs.map(doc => doc.data().imageId);

    const newGraphics = graphics.filter(g => !votedIds.includes(g.imageId));
    const releaseCatalogs = [...new Set(graphics.map(g => g.releaseCatalog))].sort();
    const imageTypes = [...new Set(graphics.map(g => g.imageType))].sort();

    const mapToArr = g => [
      g.author,
      g.title,
      g.book,
      g.imageId,
      g.imageUrl,
      g.driveLink,
      g.releaseCatalog,
      g.imageType
    ];

    res.json({
      allGraphics: graphics.map(mapToArr),
      newGraphics: newGraphics.map(mapToArr),
      totalImages: graphics.length,
      votedImagesCount: votedIds.length,
      remainingImagesCount: newGraphics.length,
      releaseCatalogs,
      imageTypes
    });

  } catch (err) {
    console.error("Error in fetchData:", err);
    res.status(500).json({ error: err.message });
  }
});
