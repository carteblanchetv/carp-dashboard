const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "cb-deliverables",
  storageBucket: "cb-deliverables.appspot.com"
});

async function run() {
  const snapshot = await admin.firestore().collection('submissions').get();
  
  let found = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data).toLowerCase();
    if (str.includes("bubble boy")) {
      found++;
      console.log('Doc ID:', doc.id);
      console.log('Data:', JSON.stringify({
        formType: data.formType,
        storyName: data.storyName,
        story_name: data.story_name,
        story_title: data.story_title,
        commissionNumber: data.commissionNumber,
        submittedBy: data.submittedBy,
        submittedAt: data.submittedAt ? (data.submittedAt._seconds ? new Date(data.submittedAt._seconds * 1000) : data.submittedAt) : 'N/A',
        footageCount: data.footage ? data.footage.length : 0
      }, null, 2));
    }
  });
  console.log('Total found:', found);
}

run().catch(console.error).finally(() => process.exit());
