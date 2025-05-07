const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.fetchData = functions.https.onRequest(async (req, res) => {
  res.json({ message: "Function connected correctly!" });
});
