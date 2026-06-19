const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  let serviceAccount = null;
  try { serviceAccount = require('./serviceAccountKey.json'); } catch(e){}
  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({ projectId: 'cb-deliverables' });
  }
}

const db = admin.firestore();

async function run() {
  console.log('Searching for any submissions with Undeliverable in the subject...');
  const snapshot = await db.collection('submissions').get();
  const matches = snapshot.docs.filter(d => (d.data().subject || '').toLowerCase().includes('undeliver'));
  
  console.log(`Found ${matches.length} matches:`);
  for (const doc of matches) {
    const data = doc.data();
    console.log(`\n--- Document ID: ${doc.id} ---`);
    console.log('Subject:', data.subject);
    console.log('From Email:', data.submittedByEmail);
    console.log('From Name:', data.submittedByName);
    console.log('Body snippet (first 1000 chars):');
    console.log((data.body || '').substring(0, 1000));
  }
}

run().catch(console.error);
