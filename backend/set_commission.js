const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'cb-deliverables' });
const db = admin.firestore();

async function run() {
    try {
        const counterRef = db.collection('metadata').doc('projectCounter');
        await counterRef.set({ nextCommissionNumber: 6915 }, { merge: true });
        console.log("Successfully set nextCommissionNumber to 6915");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
run();
