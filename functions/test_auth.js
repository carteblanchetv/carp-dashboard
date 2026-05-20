const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'cb-deliverables'
});

const db = admin.firestore();

console.log("Querying users...");
db.collection('users').limit(1).get()
  .then(snapshot => {
    console.log("SUCCESS! Firestore connection verified. Found docs: " + snapshot.docs.length);
    process.exit(0);
  })
  .catch(err => {
    console.error("CONNECTION FAILED: ", err.message);
    process.exit(1);
  });
