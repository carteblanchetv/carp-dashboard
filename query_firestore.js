const admin = require('firebase-admin');
admin.initializeApp({
  storageBucket: "cb-deliverables.appspot.com"
});

async function run() {
  const snapshot = await admin.firestore().collection('submissions')
    .where('commissionNumber', '==', '6901')
    .get();

  if (snapshot.empty) {
    console.log('No submissions found for commissionNumber 6901');
    return;
  }

  snapshot.forEach(doc => {
    console.log('Doc ID:', doc.id);
    console.log('Data:', JSON.stringify(doc.data(), null, 2));
  });
}

run().catch(console.error).finally(() => process.exit());
