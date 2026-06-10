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
        console.log("Checking proposals doc 5pQpVxxpXN5IazRrpywm...");
        const doc1 = await db.collection('proposals').doc('5pQpVxxpXN5IazRrpywm').get();
        if (doc1.exists) {
            const data = doc1.data();
            console.log('Doc 1 Keys:', Object.keys(data));
            console.log('Doc 1 story_title:', data.story_title);
            console.log('Doc 1 commissionNumber:', data.commissionNumber);
            console.log('Doc 1 status:', data.status);
            console.log('Doc 1 data:', JSON.stringify(data, null, 2));
        }

        console.log("\nChecking submissions doc mF5EglInklWKNCHSKbIo...");
        const doc2 = await db.collection('submissions').doc('mF5EglInklWKNCHSKbIo').get();
        if (doc2.exists) {
            const data = doc2.data();
            console.log('Doc 2 Keys:', Object.keys(data));
            console.log('Doc 2 story_title:', data.story_title);
            console.log('Doc 2 storyName:', data.storyName);
            console.log('Doc 2 commissionNumber:', data.commissionNumber);
            console.log('Doc 2 status:', data.status);
            console.log('Doc 2 data:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => process.exit(0));
