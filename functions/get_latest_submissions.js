const admin = require('firebase-admin');
const path = require('path');

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

async function run() {
  const snapshot = await admin.firestore().collection('submissions')
    .orderBy('submittedAt', 'desc')
    .limit(20)
    .get();
  
  console.log(`Found ${snapshot.size} latest submissions:`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log({
      id: doc.id,
      formType: data.formType,
      subject: data.subject,
      sender: data.submittedByEmail || data.sender,
      submittedAt: data.submittedAt ? (data.submittedAt._seconds ? new Date(data.submittedAt._seconds * 1000).toISOString() : data.submittedAt) : 'N/A',
      importedAt: data.importedAt ? (data.importedAt._seconds ? new Date(data.importedAt._seconds * 1000).toISOString() : data.importedAt) : 'N/A',
      source: data.source,
      useful: data.useful,
      resolved: data.resolved,
      reportedSpam: data.reportedSpam,
      recipient: data.recipient
    });
  });
}

run().catch(console.error).finally(() => process.exit());
