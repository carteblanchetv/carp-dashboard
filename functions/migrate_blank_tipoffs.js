const admin = require('firebase-admin');

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

// Import the parser from graph_importer or duplicate it here for self-containment
function parseDstvTipOff(subject, bodyText) {
  const extract = (labels, text) => {
    const allLabels = [
      'first name', 'last name', 'surname', 'name', 
      'email address', 'email', 
      'contact number', 'phone number', 'phone', 'cell', 
      'location', 'city', 'province', 'area', 
      'story title', 'title of story', 'title of your story', 'title', 'subject',
      'your tip', 'tip', 'story idea', 'message', 'comments', 'description', 'story summary'
    ];

    if (text.includes('<h4') || text.includes('<p')) {
      for (const label of labels) {
        const escapedLabel = label.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const htmlRegex = new RegExp(`<h4[^>]*>\\s*${escapedLabel}\\s*<\/h4>\\s*<p[^>]*>([\\s\\S]*?)(?:<br\\s*\\/?>)?\\s*<\/p>`, 'i');
        const match = text.match(htmlRegex);
        if (match && match[1]) {
          return match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
    }
    
    for (const label of labels) {
      const escapedLabel = label.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const stopPatterns = allLabels
        .filter(l => l !== label)
        .map(l => l.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
        .join('|');
      
      const regex = new RegExp(`(?:${escapedLabel})\\s*[:\\-]\\s*([\\s\\S]*?)(?=(?:${stopPatterns})\\s*[:\\-]|$)`, 'i');
      const match = text.match(regex);
      if (match && match[1]) return match[1].trim();
    }
    return '';
  };

  return {
    name:       extract(['first name', 'full name', 'name'], bodyText),
    lastName:   extract(['last name', 'surname'], bodyText),
    email:      extract(['email address', 'email'], bodyText),
    phone:      extract(['contact number', 'phone number', 'phone', 'cell'], bodyText),
    location:   extract(['location', 'city', 'province', 'area'], bodyText),
    storyTitle: extract(['story title', 'title of story', 'title of your story', 'title', 'subject'], bodyText),
    story:      extract(['your tip', 'tip', 'story idea', 'message', 'comments', 'description', 'story summary'], bodyText),
  };
}

async function run() {
  console.log('Fetching dstv_tipoff submissions to check for empty details...');
  const snapshot = await db.collection('submissions')
    .where('formType', '==', 'dstv_tipoff')
    .get();

  console.log(`Found ${snapshot.size} total DStv Tip Off submissions.`);
  
  let migratedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const needsMigration = !data.tipoffDetails || !data.tipoffDetails.email || data.tipoffDetails.email === '';
    
    if (needsMigration) {
      console.log(`Migrating empty submission doc ${doc.id}...`);
      const parsed = parseDstvTipOff(data.subject, data.body);
      
      const updates = {
        tipoffDetails: parsed
      };
      
      // Update subject if parsed title is available
      if (parsed.storyTitle) {
        updates.subject = parsed.storyTitle;
      }
      
      await doc.ref.update(updates);
      console.log(`Successfully migrated doc ${doc.id}!`);
      migratedCount++;
    }
  }
  
  console.log(`Migration complete. Successfully updated ${migratedCount} blank submissions.`);
}

run().catch(console.error);
