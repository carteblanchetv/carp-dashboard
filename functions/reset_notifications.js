const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // I'll check if this exists or use default

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function resetNotifications() {
    console.log("Fetching all users...");
    const snapshot = await db.collection('users').get();
    
    const batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
            notifications: {
                insert_footage: false,
                episode_footage: false,
                control_sheet: false,
                proposal: false
            }
        });
        count++;
    });
    
    if (count > 0) {
        await batch.commit();
        console.log(`Successfully reset notifications for ${count} users.`);
    } else {
        console.log("No users found.");
    }
}

resetNotifications().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
