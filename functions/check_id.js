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
        const id = 'pGzVis9kO4qYLA61UU3d';
        const doc = await db.collection('proposals').doc(id).get();
        if (doc.exists) {
            fs.writeFileSync('proposal_dump.json', JSON.stringify(doc.data(), null, 2));
            console.log('Dumped proposal to proposal_dump.json');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => process.exit(0));
