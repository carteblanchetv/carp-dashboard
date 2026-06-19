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

    // If the text contains HTML tags, try parsing using HTML tag patterns first
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
  const doc = await db.collection('submissions').doc('1kw9Sy73BnYSoJ92jWe2').get();
  const data = doc.data();
  const parsed = parseDstvTipOff(data.subject, data.body);
  console.log('Parsed Results:', JSON.stringify(parsed, null, 2));
}

run().catch(console.error);
