const admin = require('firebase-admin');
const { cleanSubject, extractOriginalStory } = require('./graph_importer.js');

if (admin.apps.length === 0) {
  let serviceAccount = null;
  try { serviceAccount = require('./serviceAccountKey.json'); } catch(e){}
  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({ projectId: 'cb-deliverables' });
  }
}

const db = admin.firestore();

async function run() {
  console.log('Fetching all submissions from Firestore...');
  const snapshot = await db.collection('submissions').get();
  
  let processedCount = 0;
  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const originalSubject = data.subject || '';
    const originalBody = data.body || '';

    const lowerSubject = originalSubject.toLowerCase();
    const isNDR = lowerSubject.includes('undeliver') || 
                  lowerSubject.includes('returned mail') || 
                  lowerSubject.includes('failure notice') || 
                  originalBody.includes('postmaster@') || 
                  originalBody.includes('MicrosoftExchange');

    if (isNDR) {
      processedCount++;
      const cleanedSubject = cleanSubject(originalSubject);
      const extractedBody = extractOriginalStory(originalSubject, originalBody);

      const updates = {};
      if (cleanedSubject !== originalSubject) {
        updates.subject = cleanedSubject;
      }
      if (extractedBody !== originalBody) {
        updates.body = extractedBody;
      }

      if (Object.keys(updates).length > 0) {
        console.log(`\nUpdating doc ID: ${doc.id}`);
        if (updates.subject) {
          console.log(`  Subject: "${originalSubject}" -> "${cleanedSubject}"`);
        }
        if (updates.body) {
          console.log(`  Body length: ${originalBody.length} -> ${extractedBody.length}`);
          console.log(`  Body Snippet: "${extractedBody.substring(0, 150).replace(/\n/g, ' ')}..."`);
        }
        
        await db.collection('submissions').doc(doc.id).update(updates);
        updatedCount++;
      }
    }
  }

  console.log(`\nMigration completed.`);
  console.log(`Processed ${processedCount} NDR submissions.`);
  console.log(`Updated ${updatedCount} submissions in Firestore.`);
}

run().catch(console.error);
