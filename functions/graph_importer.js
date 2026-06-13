const admin = require('firebase-admin');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });


// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  let serviceAccount = null;
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch (e) {
    // Ignore
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cb-deliverables.appspot.com'
    });
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'cb-deliverables',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cb-deliverables.appspot.com'
    });
  }
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : Buffer.alloc(32);
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function encryptBuffer(buffer) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  } catch (err) {
    console.error('[ENCRYPT] Buffer encryption failed:', err.message);
    return buffer;
  }
}

/**
 * Get Microsoft Graph API access token
 */
async function getMicrosoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Microsoft Graph API credentials in environment.');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  params.set('scope', 'https://graph.microsoft.com/.default');
  params.set('grant_type', 'client_credentials');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to obtain Microsoft Access Token: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Extracts structured fields from a DStv tip-off notification email body.
 */
function parseDstvTipOff(subject, bodyText) {
  const lowerSubject = (subject || '').toLowerCase();
  const lowerBody = (bodyText || '').toLowerCase();
  const isDstv =
    lowerSubject.includes('tip us off') ||
    lowerSubject.includes('tip-us-off') ||
    lowerBody.includes('tip us off') ||
    lowerBody.includes('dstv.com') ||
    lowerBody.includes('carte blanche tip');

  if (!isDstv) return null;

  const extract = (labels, text) => {
    const allLabels = [
      'first name', 'last name', 'surname', 'name', 
      'email address', 'email', 
      'contact number', 'phone number', 'phone', 'cell', 
      'location', 'city', 'province', 'area', 
      'story title', 'title of story', 'title of your story', 'title', 'subject',
      'your tip', 'tip', 'story idea', 'message', 'comments', 'description'
    ];
    
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
    story:      extract(['your tip', 'tip', 'story idea', 'message', 'comments', 'description'], bodyText),
  };
}

async function runImporter() {
  const dryRun = process.env.DRY_RUN === 'true';
  console.log(`Starting Graph API Email Importer... Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);

  try {
    const accessToken = await getMicrosoftAccessToken();
    const mailbox = process.env.MICROSOFT_MAILBOX_EMAIL || 'story@combinedartists.co.za';

    // 1. Query emails since 1 May 2026 with pagination
    let messages = [];
    let messagesUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages?$filter=receivedDateTime ge 2026-05-01T00:00:00Z&$select=id,subject,body,from,receivedDateTime,hasAttachments,isRead&$top=50`;

    while (messagesUrl) {
      console.log(`Fetching messages from Microsoft Graph...`);
      const response = await fetch(messagesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'outlook.body-content-type="text"'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch messages: ${response.statusText} - ${errText}`);
      }

      const data = await response.json();
      if (data.value && data.value.length > 0) {
        messages = messages.concat(data.value);
      }
      messagesUrl = data['@odata.nextLink'] || null;
    }

    console.log(`Found ${messages.length} email(s) since 1 May 2026 to check.`);

    for (const message of messages) {
      const subject = message.subject || '(No Subject)';
      const fromEmail = message.from && message.from.emailAddress ? message.from.emailAddress.address : 'unknown@sender.com';
      const fromName = message.from && message.from.emailAddress ? message.from.emailAddress.name : 'Unknown Sender';

      // Skip quarantine/e-purifier spam emails at backend ingestion time
      const lowerFromEmail = fromEmail.toLowerCase();
      const lowerFromName = fromName.toLowerCase();
      const lowerSubject = subject.toLowerCase();
      if (
        lowerFromEmail === 'quarantine@e-purifier.com' || 
        lowerFromEmail.includes('e-purifier.com') || 
        lowerFromName.includes('e-purifier support') ||
        lowerSubject.includes('spam to recipient') ||
        lowerSubject.includes('quarantine@e-purifier.com') ||
        lowerSubject.includes('quarantine message notification')
      ) {
        console.log(`Skipping backend spam/quarantine email: "${subject}" from ${fromName} <${fromEmail}>`);
        continue;
      }

      const date = message.receivedDateTime ? new Date(message.receivedDateTime) : new Date();
      const bodyText = message.body ? message.body.content || '' : '';

      // Check for duplicate in Firestore before processing
      let isDuplicate = false;
      try {
        // Check messageId first
        const idQuery = await db.collection('submissions').where('messageId', '==', message.id).get();
        if (!idQuery.empty) {
          isDuplicate = true;
        } else {
          // Fallback check: query by sender email and check subject and date in-memory
          const emailQuery = await db.collection('submissions').where('submittedByEmail', '==', fromEmail).get();
          for (const doc of emailQuery.docs) {
            const data = doc.data();
            const subjectMatch = (data.subject || '').trim() === subject.trim();
            let dateMatch = false;
            if (data.submittedAt) {
              const docDate = data.submittedAt.toDate();
              const diffMs = Math.abs(docDate.getTime() - date.getTime());
              if (diffMs < 5000) { // 5-second tolerance
                dateMatch = true;
              }
            }
            if (subjectMatch && dateMatch) {
              isDuplicate = true;
              break;
            }
          }
        }
      } catch (checkErr) {
        console.error(`Error checking duplicate for message ${message.id}:`, checkErr);
      }

      if (isDuplicate) {
        console.log(`Skipping duplicate: "${subject}" from ${fromName} <${fromEmail}> (received: ${message.receivedDateTime})`);
        continue;
      }

      console.log(`\nProcessing: "${subject}" from ${fromName} <${fromEmail}>`);

      // 2. Classify submission type
      const tipoffData = parseDstvTipOff(subject, bodyText);
      const formType = tipoffData ? 'dstv_tipoff' : 'email_submission';
      console.log(`Identified formType: ${formType}`);

      // 3. Process attachments
      const uploadedAttachments = [];
      if (message.hasAttachments) {
        const attachmentsUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${message.id}/attachments`;
        const attRes = await fetch(attachmentsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (attRes.ok) {
          const { value: attachments } = await attRes.json();
          for (const att of attachments) {
            // Check if it's a file attachment containing base64 contentBytes
            if (att['@odata.type'] === '#microsoft.graph.fileAttachment' && att.contentBytes) {
              try {
                const buffer = Buffer.from(att.contentBytes, 'base64');
                const safeName = att.name.replace(/[^a-zA-Z0-9_\-.]/g, '');
                const storagePath = `submissions/${formType}/${Date.now()}_${safeName}`;
                
                if (!dryRun) {
                  // Encrypt the attachment buffer before saving
                  const encryptedBuf = encryptBuffer(buffer);
                  const file = bucket.file(storagePath);
                  await file.save(encryptedBuf, {
                    contentType: att.contentType || 'application/octet-stream'
                  });
                }
                
                uploadedAttachments.push({
                  filename: att.name,
                  contentType: att.contentType,
                  storagePath: storagePath
                });
                console.log(`Attachment metadata added: ${att.name} -> ${storagePath}`);
              } catch (uploadError) {
                console.error(`Failed to process attachment ${att.name}:`, uploadError);
              }
            }
          }
        } else {
          console.error(`Failed to fetch attachments for message ${message.id}:`, attRes.statusText);
        }
      }

      // 4. Construct submission document
      // 4. Construct submission document
      const submissionDoc = {
        formType,
        submittedAt: admin.firestore.Timestamp.fromDate(date),
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedByEmail: fromEmail,
        submittedByName: fromName,
        subject: (formType === 'dstv_tipoff' && tipoffData && tipoffData.storyTitle) ? tipoffData.storyTitle : subject,
        body: bodyText,
        attachments: uploadedAttachments,
        isEmailImport: true,
        source: 'microsoft_graph',
        messageId: message.id
      };

      if (formType === 'dstv_tipoff' && tipoffData) {
        submissionDoc.tipoffDetails = tipoffData;
      }

      if (dryRun) {
        console.log('[DRY-RUN] Would save to Firestore collection "submissions":', JSON.stringify(submissionDoc, null, 2));
      } else {
        const docRef = await db.collection('submissions').add(submissionDoc);
        console.log(`Saved submission successfully to Firestore: submissions/${docRef.id}`);

        // Mark as read in Microsoft Graph mailbox ONLY if it was unread
        if (!message.isRead) {
          const updateUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${message.id}`;
          const updateRes = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isRead: true })
          });
          if (updateRes.ok) {
            console.log('Marked email as read on Microsoft Graph.');
          } else {
            console.error(`Failed to mark email as read: ${updateRes.statusText}`);
          }
        } else {
          console.log('Email was already marked as read. Bypassed marking as read.');
        }
      }
    }

    console.log('\nMicrosoft Graph email import cycle completed successfully.');
  } catch (error) {
    console.error('Error during Graph email import execution:', error);
  }
}

// If run directly
if (require.main === module) {
  runImporter().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runImporter };
