const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

admin.initializeApp({
  projectId: "cb-deliverables"
});

const db = admin.firestore();

async function resetCounter() {
    const counterRef = db.collection('metadata').doc('projectCounter');
    await counterRef.set({ nextCommissionNumber: 6904 });
    console.log("SUCCESS: Counter has been forcefully reset to 6904.");
}

resetCounter().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
