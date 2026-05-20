const admin = require('firebase-admin');

// Note: Ensure your local environment has the correct project ID or credentials
// For local execution against production, you might need a serviceAccountKey.json
// But usually, if the environment is set up, it might work.

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'cb-deliverables'
    });
}

const db = admin.firestore();

async function fix() {
    console.log("Searching for proposal #6855...");
    const snapshot = await db.collection('proposals')
        .where('commissionNumber', '==', '6855')
        .get();

    if (snapshot.empty) {
        console.log("No proposal found with commission number 6855.");
        return;
    }

    const doc = snapshot.docs[0];
    console.log(`Found proposal: ${doc.id} - ${doc.data().story_title}`);

    await doc.ref.update({
        status: 'pending',
        commissionNumber: admin.firestore.FieldValue.delete(),
        acceptanceDetails: admin.firestore.FieldValue.delete(),
        acceptedAt: admin.firestore.FieldValue.delete()
    });

    console.log("Successfully moved back to Pending!");
}

fix().catch(console.error);
