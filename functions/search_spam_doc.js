const admin = require('firebase-admin');
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "cb-deliverables"
  });
}
const db = admin.firestore();

async function run() {
  const snapshot = await db.collection('submissions').get();
  console.log("Total submissions in database:", snapshot.size);
  
  let deletedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const subject = data.subject || '';
    const email = data.submittedByEmail || '';
    const name = data.submittedByName || '';
    
    if (
      subject.includes("Spam to Recipient") || 
      email.includes("quarantine") || 
      subject.includes("quarantine") || 
      name.includes("quarantine")
    ) {
      console.log(`Deleting Doc ID: ${doc.id} - Subject: "${subject}" - From: "${email}"`);
      await doc.ref.delete();
      deletedCount++;
    }
  }
  console.log(`Purged ${deletedCount} spam documents successfully.`);
}

run().catch(console.error).finally(() => process.exit());
