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

async function restore() {
    console.log("Querying proposals with decommissionedAt metadata...");
    const snapshot = await db.collection('proposals').get();
    
    let count = 0;
    const batch = db.batch();
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.decommissionedAt) {
            console.log(`Restoring "${data.story_title}" (${doc.id}) back to decommissioned status...`);
            batch.update(doc.ref, {
                status: 'decommissioned',
                paidAt: admin.firestore.FieldValue.delete() // remove paidAt if it was accidentally set
            });
            count++;
        }
    });
    
    if (count > 0) {
        await batch.commit();
        console.log(`\nSuccessfully restored ${count} stories to the Decommissioned list!`);
    } else {
        console.log("\nNo stories needed restoration.");
    }
}

restore().catch(console.error).finally(() => process.exit());
