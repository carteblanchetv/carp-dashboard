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

function cleanSubject(subject) {
  if (!subject) return '(No Subject)';
  let cleaned = subject;
  const pattern = /^(?:re|fw|fwd|undeliverable|undelivered)\s*:\s*/i;
  while (pattern.test(cleaned)) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  const undeliveredMailsPattern = /^undelivered mails for\s*:\s*/i;
  while (undeliveredMailsPattern.test(cleaned)) {
    cleaned = cleaned.replace(undeliveredMailsPattern, '').trim();
  }
  return cleaned || '(No Subject)';
}

function stripHeaders(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let bodyStartIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') {
      bodyStartIndex = i + 1;
      continue;
    }
    
    // Check if line looks like a header, header continuation, signature or diagnostic
    const isHeader = 
      /^[a-zA-Z0-9\-]+\s*:/i.test(line) || 
      /^\s+/.test(line) || 
      /^--/.test(t) || 
      /^(?:b|d|s|h|bh|cv)\s*=/i.test(t) || 
      t.toLowerCase().includes('mailto:') ||
      t.toLowerCase().startsWith('resent-') ||
      t.toLowerCase().startsWith('auto-submitted') ||
      t.toLowerCase().startsWith('message-id') ||
      /^\d+\s+\d{1,2}\/\d{1,2}\/\d{4}/.test(t) || // Hop lines
      (t.toLowerCase().startsWith('hop') && t.toLowerCase().includes('time')) ||
      t.includes('spf=') ||
      t.includes('dkim=') ||
      t.includes('dmarc=');
                     
    if (isHeader) {
      bodyStartIndex = i + 1;
    } else {
      break;
    }
  }
  
  const cleanedText = lines.slice(bodyStartIndex).join('\n').trim();
  // If the extracted text consists entirely of header remnants, return empty
  if (cleanedText.split('\n').some(line => line.includes('DKIM-Signature') || line.includes('ARC-Seal'))) {
    return '';
  }
  return cleanedText;
}

function extractOriginalStory(subject, bodyText) {
  if (!bodyText) return '';
  const lowerSubject = (subject || '').toLowerCase();
  
  // Only process if it is a bounce/undeliverable
  const isNDR = lowerSubject.includes('undeliver') || 
                lowerSubject.includes('returned mail') || 
                lowerSubject.includes('failure notice') || 
                bodyText.includes('postmaster@') || 
                bodyText.includes('MicrosoftExchange');
                
  if (!isNDR) return bodyText;

  const forwardedMarkers = [
    /----------\s*Forwarded message\s*----------/gi,
    /----------\s*Forwarded message\s*---------/gi,
    /Original Message Details/gi,
    /Original Message/gi
  ];
  
  let indices = [];
  for (const marker of forwardedMarkers) {
    let match;
    while ((match = marker.exec(bodyText)) !== null) {
      indices.push(match.index);
    }
  }
  
  indices.sort((a, b) => a - b);
  
  if (indices.length > 0) {
    for (let i = indices.length - 1; i >= 0; i--) {
      const segment = bodyText.substring(indices[i]);
      
      const fromMatch = segment.match(/From\s*:\s*(.+)/i);
      const toMatch = segment.match(/To\s*:\s*(.+)/i);
      const subjectMatch = segment.match(/Subject\s*:\s*(.+)/i);
      
      if (fromMatch && toMatch && subjectMatch) {
        const subjectIndex = segment.search(/Subject\s*:\s*/i);
        if (subjectIndex !== -1) {
          const rest = segment.substring(subjectIndex);
          const lineEnd = rest.indexOf('\n');
          if (lineEnd !== -1) {
            let story = rest.substring(lineEnd).trim();
            story = stripHeaders(story);
            if (story.length > 0) {
              return story;
            }
          }
        }
      }
    }
  }

  // Fallback: look for standard email headers in the body
  const lastSubjectIdx = bodyText.lastIndexOf('Subject:');
  if (lastSubjectIdx !== -1) {
    const rest = bodyText.substring(lastSubjectIdx);
    const lineEnd = rest.indexOf('\n');
    if (lineEnd !== -1) {
      let story = rest.substring(lineEnd).trim();
      story = stripHeaders(story);
      if (story.length > 0) {
        return story;
      }
    }
  }

  return bodyText;
}

async function run() {
  const snapshot = await db.collection('submissions').get();
  const matches = snapshot.docs.filter(d => (d.data().subject || '').toLowerCase().includes('undeliver'));
  
  for (const doc of matches) {
    const data = doc.data();
    const cleanedSubj = cleanSubject(data.subject);
    const extractedStory = extractOriginalStory(data.subject, data.body);
    
    console.log(`\n=========================================`);
    console.log(`Doc ID: ${doc.id}`);
    console.log(`Original Subject: "${data.subject}"`);
    console.log(`Cleaned Subject:  "${cleanedSubj}"`);
    console.log(`Extracted Story Snippet (first 500 chars):`);
    console.log(extractedStory ? extractedStory.substring(0, 500) : '(Empty / No Story Content)');
    console.log(`=========================================`);
  }
}

run().catch(console.error);
