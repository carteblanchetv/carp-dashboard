const admin = require('firebase-admin');
const fs = require('fs');

if (!admin.apps.length) {
    if (fs.existsSync('./serviceAccountKey.json')) {
        admin.initializeApp({
            credential: admin.credential.cert(require('./serviceAccountKey.json'))
        });
    } else {
        admin.initializeApp({ projectId: 'cb-deliverables' });
    }
}

const db = admin.firestore();

async function check() {
    const snapshot = await db.collection('proposals').get();
    const decommissionedCandidates = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.decommissionedAt || data.decommissionReason) {
            decommissionedCandidates.push({
                id: doc.id,
                title: data.story_title,
                status: data.status,
                decommissionedAt: data.decommissionedAt || null,
                decommissionReason: data.decommissionReason || null
            });
        }
    });
    
    console.log("Proposals with decommission metadata:", JSON.stringify(decommissionedCandidates, null, 2));
}

check().catch(console.error).finally(() => process.exit());
