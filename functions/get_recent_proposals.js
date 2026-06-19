const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
  serviceAccount = require('../serviceAccountKey.json');
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "cb-deliverables.appspot.com"
  });
}

const db = admin.firestore();

async function run() {
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  
  console.log("Checking proposals updated or submitted since:", fiveDaysAgo.toISOString());
  const snapshot = await db.collection('proposals')
    .where('submittedAt', '>=', fiveDaysAgo)
    .get();

  console.log(`Found ${snapshot.size} proposals submitted in the last 5 days:`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log({
      id: doc.id,
      story_title: data.story_title,
      status: data.status,
      commissionNumber: data.commissionNumber,
      submittedByEmail: data.submittedByEmail,
      submittedAt: data.submittedAt ? (data.submittedAt._seconds ? new Date(data.submittedAt._seconds * 1000).toISOString() : data.submittedAt) : 'N/A',
      acceptedAt: data.acceptedAt ? (data.acceptedAt._seconds ? new Date(data.acceptedAt._seconds * 1000).toISOString() : data.acceptedAt) : 'N/A',
    });
  });
}

run().catch(console.error).finally(() => process.exit());
