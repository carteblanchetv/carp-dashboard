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

function stripHtml(html) {
  if (!html) return '';
  // Simple regex strip for node test
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function run() {
  const doc = await db.collection('submissions').doc('1kw9Sy73BnYSoJ92jWe2').get();
  const data = doc.data();
  console.log('--- HTML Body Raw ---');
  console.log(data.body);
  console.log('\n--- Stripped Text Body ---');
  console.log(stripHtml(data.body));
}

run().catch(console.error);
