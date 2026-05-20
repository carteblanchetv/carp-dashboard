
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // I hope this exists locally if I'm on user's system

// Wait, I don't have the service account key.
// But I am running in the workspace.
// Firebase admin usually finds credentials if logged in via CLI.
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'cb-deliverables'
});

const db = admin.firestore();

async function check() {
    const id = 'Uackto32PS1M6n83g67a';
    const doc = await db.collection('proposals').doc(id).get();
    if (doc.exists) {
        console.log('Exists in proposals');
    } else {
        const sDoc = await db.collection('submissions').doc(id).get();
        if (sDoc.exists) {
            console.log('Exists in submissions');
        } else {
            console.log('Not found');
        }
    }
    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
