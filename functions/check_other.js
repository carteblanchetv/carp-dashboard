const admin = require('firebase-admin');
const fs = require('fs');

if (admin.apps.length === 0) {
    if (fs.existsSync('./serviceAccountKey.json')) {
        admin.initializeApp({
            credential: admin.credential.cert(require('./serviceAccountKey.json')),
            projectId: 'cb-deliverables'
        });
    } else {
        admin.initializeApp({
            projectId: 'cb-deliverables'
        });
    }
}

const db = admin.firestore();

async function check() {
    try {
        const snapshot = await db.collection('proposals').limit(5).get();
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id}`);
            console.log(`  story_title: ${JSON.stringify(data.story_title)}`);
            console.log(`  status: ${data.status}`);
            console.log(`  submittedByEmail: ${data.submittedByEmail}`);
            console.log(`  keys: ${Object.keys(data).join(', ')}`);
        });
    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => process.exit(0));
