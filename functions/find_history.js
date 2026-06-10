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
        console.log("Searching Firestore collections for references to '6894' or proposal ID...");
        const collections = await db.listCollections();
        for (const col of collections) {
            console.log(`Collection: ${col.id}`);
            const snapshot = await db.collection(col.id).get();
            snapshot.forEach(doc => {
                const data = doc.data();
                const str = JSON.stringify(data);
                if (str.includes('pGzVis9kO4qYLA61UU3d') || str.includes('6894')) {
                    console.log(`  Found reference in doc ${doc.id} (Collection: ${col.id})!`);
                    if (col.id === 'notifications' || col.id === 'emails' || col.id === 'logs') {
                        console.log('  Data:', JSON.stringify(data, null, 2));
                    }
                }
            });
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => process.exit(0));
