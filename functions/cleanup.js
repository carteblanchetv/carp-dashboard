// cleanup.js
// Standalone script to purge all submissions from Firestore and Storage

const admin = require('firebase-admin');

// Initialize with project ID (ADC will work in local environment if logged in)
admin.initializeApp({
    projectId: 'cb-deliverables',
    storageBucket: 'cb-deliverables.firebasestorage.app' // Updated bucket name for newer projects
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function purge() {
    console.log('--- STARTING CLEANUP ---');

    try {
        // 1. Purge Firestore 'submissions' collection
        console.log('Deleting Firestore documents in "submissions"...');
        const snapshot = await db.collection('submissions').get();
        if (snapshot.empty) {
            console.log('No documents found in "submissions".');
        } else {
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                console.log(`- Queued for deletion: ${doc.id}`);
            });
            await batch.commit();
            console.log(`Successfully deleted ${snapshot.size} documents.`);
        }

        // 2. Purge Firestore 'proposals' collection
        console.log('Deleting Firestore documents in "proposals"...');
        const propSnapshot = await db.collection('proposals').get();
        if (propSnapshot.empty) {
            console.log('No documents found in "proposals".');
        } else {
            const batch = db.batch();
            propSnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                console.log(`- Queued for deletion: ${doc.id}`);
            });
            await batch.commit();
            console.log(`Successfully deleted ${propSnapshot.size} proposals.`);
        }

        // 3. Reset Commission Counter
        console.log('Resetting "metadata/projectCounter" to 6890...');
        await db.collection('metadata').doc('projectCounter').set({ nextCommissionNumber: 6890 });
        console.log('Successfully reset common counter.');

        // 4. Purge Storage 'submissions/' folder
        console.log('Deleting files in Storage "submissions/"...');
        // We use deleteFiles ({ prefix: 'submissions/' })
        await bucket.deleteFiles({ prefix: 'submissions/' });
        console.log('Successfully cleared "submissions/" folder in Storage.');

        console.log('--- CLEANUP COMPLETE ---');
    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        process.exit(0);
    }
}

purge();
