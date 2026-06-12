const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'cb-deliverables',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cb-deliverables.appspot.com'
  });
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
    for (const label of labels) {
      const regex = new RegExp(`(?:${label})\\s*[:\\-]\\s*(.+)`, 'i');
      const match = text.match(regex);
      if (match && match[1]) return match[1].trim();
    }
    return '';
  };

  return {
    name:     extract(['first name', 'full name', 'name'], bodyText),
    lastName: extract(['last name', 'surname'], bodyText),
    email:    extract(['email address', 'email'], bodyText),
    phone:    extract(['contact number', 'phone number', 'phone', 'cell'], bodyText),
    location: extract(['location', 'city', 'province', 'area'], bodyText),
    story:    extract(['your tip', 'tip', 'story idea', 'message', 'comments', 'description'], bodyText),
  };
}

async function runImporter() {
  const dryRun = process.env.DRY_RUN === 'true';
  console.log(`Starting Graph API Email Importer... Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);

  try {
    const accessToken = await getMicrosoftAccessToken();
    const mailbox = process.env.MICROSOFT_MAILBOX_EMAIL || 'story@combinedartists.co.za';

    // 1. Query unread emails
    // We get the messages that are unread
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages?$filter=isRead eq false&$select=id,subject,body,from,receivedDateTime,hasAttachments`;
    const response = await fetch(messagesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch unread messages: ${response.statusText} - ${errText}`);
    }

    const { value: messages } = await response.json();
    console.log(`Found ${messages.length} unread email(s) to process.`);

    for (const message of messages) {
      const subject = message.subject || '(No Subject)';
      const fromEmail = message.from && message.from.emailAddress ? message.from.emailAddress.address : 'unknown@sender.com';
      const fromName = message.from && message.from.emailAddress ? message.from.emailAddress.name : 'Unknown Sender';
      const date = message.receivedDateTime ? new Date(message.receivedDateTime) : new Date();
      const bodyText = message.body ? message.body.content || '' : '';

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
      const submissionDoc = {
        formType,
        submittedAt: admin.firestore.Timestamp.fromDate(date),
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedByEmail: fromEmail,
        submittedByName: fromName,
        subject: subject,
        body: bodyText,
        attachments: uploadedAttachments,
        isEmailImport: true,
        source: 'microsoft_graph'
      };

      if (formType === 'dstv_tipoff' && tipoffData) {
        submissionDoc.tipoffDetails = tipoffData;
      }

      if (dryRun) {
        console.log('[DRY-RUN] Would save to Firestore collection "submissions":', JSON.stringify(submissionDoc, null, 2));
      } else {
        const docRef = await db.collection('submissions').add(submissionDoc);
        console.log(`Saved submission successfully to Firestore: submissions/${docRef.id}`);

        // Mark as read in Microsoft Graph mailbox
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
