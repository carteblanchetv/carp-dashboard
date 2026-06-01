const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'cb-deliverables'
    });
}

const db = admin.firestore();

async function updateImportedProposals() {
    console.log("Querying imported proposals...");
    const snapshot = await db.collection('proposals')
        .where('isImported', '==', true)
        .get();

    if (snapshot.empty) {
        console.log("No imported proposals found.");
        return;
    }

    console.log(`Found ${snapshot.size} imported proposals to update.`);
    const batchSize = 100;
    let updatedCount = 0;
    
    // Process in batches
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const updateData = {
            status: 'paid'
        };

        // If paidAt doesn't exist, set it from acceptedAt, submittedAt, or serverTimestamp
        if (!data.paidAt) {
            updateData.paidAt = data.acceptedAt || data.submittedAt || admin.firestore.FieldValue.serverTimestamp();
        }

        batch.update(doc.ref, updateData);
        count++;

        if (count >= batchSize) {
            await batch.commit();
            updatedCount += count;
            console.log(`Updated ${updatedCount}/${snapshot.size}...`);
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        updatedCount += count;
        console.log(`Updated ${updatedCount}/${snapshot.size}...`);
    }

    console.log("\n✅ All imported proposals have been successfully marked as Delivered (paid)!");
}

updateImportedProposals().catch(console.error);
