/**
 * cleanup_duplicate_users.js
 * One-time script: deletes legacy email-keyed Firestore user docs
 * where a UID-keyed doc already exists for the same user.
 * Run from the functions/ directory with: node cleanup_duplicate_users.js
 */

const admin = require('firebase-admin');

// Use Application Default Credentials (same as the live function environment)
admin.initializeApp({ projectId: 'cb-deliverables' });
const db = admin.firestore();

function decrypt(val) {
  // Minimal check — if the doc.id contains @ it's an email-keyed legacy doc
  return val;
}

async function cleanupDuplicates() {
  console.log('Fetching all user documents...');
  const snapshot = await db.collection('users').get();
  const allDocs = snapshot.docs.map(doc => ({
    id: doc.id,
    isEmailKey: doc.id.includes('@'),
    data: doc.data()
  }));

  // UID-keyed docs (authoritative)
  const uidDocs = allDocs.filter(d => !d.isEmailKey);
  // Email-keyed docs (legacy)
  const emailDocs = allDocs.filter(d => d.isEmailKey);

  console.log(`Total docs: ${allDocs.length}`);
  console.log(`UID-keyed docs: ${uidDocs.length}`);
  console.log(`Email-keyed docs: ${emailDocs.length}`);

  // Build set of emails that have a UID doc
  const emailsWithUidDoc = new Set();
  for (const doc of uidDocs) {
    const emailField = doc.data.email;
    if (emailField) emailsWithUidDoc.add(emailField.toLowerCase());
    // Also add the UID itself isn't an email — the stored email field is the real one
  }

  // Find which email-keyed docs are safe to delete
  const toDelete = emailDocs.filter(d => emailsWithUidDoc.has(d.id.toLowerCase()));
  const toKeep   = emailDocs.filter(d => !emailsWithUidDoc.has(d.id.toLowerCase()));

  console.log(`\nDuplicates to delete: ${toDelete.length}`);
  toDelete.forEach(d => console.log(`  DELETE: ${d.id}`));
  console.log(`\nEmail-keyed docs with no UID counterpart (kept): ${toKeep.length}`);
  toKeep.forEach(d => console.log(`  KEEP:   ${d.id}`));

  if (toDelete.length === 0) {
    console.log('\nNo duplicates found. Nothing to do.');
    process.exit(0);
  }

  // Delete in batches
  const batch = db.batch();
  toDelete.forEach(d => batch.delete(db.collection('users').doc(d.id)));
  await batch.commit();

  console.log(`\n✅ Deleted ${toDelete.length} duplicate email-keyed user documents.`);
  process.exit(0);
}

cleanupDuplicates().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
