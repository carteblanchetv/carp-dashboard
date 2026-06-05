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
    const counts = {};
    const decommissioned = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const status = data.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
        
        if (status === 'decommissioned') {
            decommissioned.push({
                id: doc.id,
                title: data.story_title,
                isImported: data.isImported || false
            });
        }
    });
    
    console.log("Proposal counts by status:", counts);
    console.log("Current decommissioned stories in Firestore:", decommissioned);
}

check().catch(console.error).finally(() => process.exit());
