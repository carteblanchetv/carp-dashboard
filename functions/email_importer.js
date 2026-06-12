const admin = require('firebase-admin');
const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
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

const imapConfig = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    tls: process.env.IMAP_TLS !== 'false',
    authTimeout: 10000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

/**
 * Parses the body of a DStv Tip-Off notification email.
 * Recognizes fields like Name, Email, Phone, Location, and Story details.
 */
function parseDstvTipOff(textBody, subject) {
  const isDstv = subject.toLowerCase().includes('tip us off') || 
                 subject.toLowerCase().includes('tip-us-off') ||
                 textBody.toLowerCase().includes('tip us off') ||
                 textBody.toLowerCase().includes('dstv');
                 
  if (!isDstv) return null;

  const extract = (labels, text) => {
    const allLabels = [
      'first name', 'last name', 'surname', 'name', 
      'email address', 'email', 
      'contact number', 'phone number', 'phone', 'cell', 'contact',
      'location', 'city', 'province', 'area', 
      'story title', 'title of story', 'title of your story', 'title', 'subject',
      'your tip', 'story idea', 'message', 'comments', 'description'
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
    name:       extract(['first name', 'name', 'full name'], textBody),
    lastName:   extract(['last name', 'surname'], textBody),
    email:      extract(['email address', 'email'], textBody),
    phone:      extract(['contact number', 'phone number', 'phone', 'contact'], textBody),
    location:   extract(['location', 'city', 'province'], textBody),
    storyTitle: extract(['story title', 'title of story', 'title of your story', 'title', 'subject'], textBody),
    story:      extract(['your tip', 'story idea', 'comments', 'message', 'description'], textBody),
  };
}

async function uploadAttachment(attachment, folderName) {
  const filename = `${Date.now()}_${attachment.filename.replace(/[^a-zA-Z0-9_\-\.]/g, '')}`;
  const storagePath = `submissions/${folderName}/${filename}`;
  const file = bucket.file(storagePath);

  console.log(`Uploading attachment to Storage: ${storagePath}`);
  await file.save(attachment.content, {
    contentType: attachment.contentType || 'application/octet-stream'
  });

  return storagePath;
}

async function runImporter() {
  const dryRun = process.env.DRY_RUN === 'true';
  console.log(`Starting Email Importer... Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);

  if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    console.error('CRITICAL: IMAP_USER and IMAP_PASSWORD must be configured in environment variables.');
    process.exit(1);
  }

  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);
    await connection.openBox('INBOX');

    // Search for unseen/unread emails
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false // We will mark seen manually after processing if not dry run
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Found ${messages.length} unread email(s) to process.`);

    for (const message of messages) {
      // Find full message body part
      const allParts = message.parts.find(part => part.which === '');
      if (!allParts || !allParts.body) {
        console.warn('Skipping message: could not retrieve full body parts.');
        continue;
      }

      // Parse with mailparser
      const parsedEmail = await simpleParser(allParts.body);
      const subject = parsedEmail.subject || '(No Subject)';
      const fromEmail = parsedEmail.from && parsedEmail.from.value && parsedEmail.from.value[0] 
        ? parsedEmail.from.value[0].address 
        : 'unknown@sender.com';
      const fromName = parsedEmail.from && parsedEmail.from.value && parsedEmail.from.value[0] 
        ? parsedEmail.from.value[0].name 
        : 'Unknown Sender';
      const date = parsedEmail.date || new Date();
      
      // Skip quarantine/e-purifier spam emails at backend ingestion time
      const lowerFromEmail = fromEmail.toLowerCase();
      const lowerFromName = fromName.toLowerCase();
      if (lowerFromEmail === 'quarantine@e-purifier.com' || lowerFromEmail.includes('e-purifier.com') || lowerFromName.includes('e-purifier support')) {
        console.log(`Skipping backend spam/quarantine email: "${subject}" from ${fromName} <${fromEmail}>`);
        if (!dryRun) {
          await connection.addFlags(message.attributes.uid, 'Seen');
        }
        continue;
      }

      let bodyText = parsedEmail.text || '';
      if (!bodyText && parsedEmail.html) {
        bodyText = parsedEmail.html.replace(/<[^>]*>/g, ' ');
      }
      
      console.log(`\nProcessing: "${subject}" from ${fromName} <${fromEmail}>`);

      // 1. Detect if DStv Tip-Off or general email submission
      const dstvData = parseDstvTipOff(bodyText, subject);
      const formType = dstvData ? 'dstv_tipoff' : 'email_submission';

      console.log(`Identified formType: ${formType}`);

      // 2. Handle attachments
      const uploadedAttachments = [];
      if (parsedEmail.attachments && parsedEmail.attachments.length > 0) {
        console.log(`Email contains ${parsedEmail.attachments.length} attachment(s).`);
        for (const attachment of parsedEmail.attachments) {
          try {
            const storagePath = await uploadAttachment(attachment, formType);
            uploadedAttachments.push({
              filename: attachment.filename,
              contentType: attachment.contentType,
              storagePath: storagePath
            });
          } catch (uploadError) {
            console.error(`Failed to upload attachment ${attachment.filename}:`, uploadError);
          }
        }
      }

      // 3. Construct submission document
      const submissionDoc = {
        formType,
        submittedAt: admin.firestore.Timestamp.fromDate(date),
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedByEmail: fromEmail,
        submittedByName: fromName,
        subject: (formType === 'dstv_tipoff' && dstvData && dstvData.storyTitle) ? dstvData.storyTitle : subject,
        body: bodyText,
        attachments: uploadedAttachments,
        isEmailImport: true
      };

      if (formType === 'dstv_tipoff' && dstvData) {
        submissionDoc.tipoffDetails = dstvData;
      }

      if (dryRun) {
        console.log('[DRY-RUN] Would save to Firestore collection "submissions":', JSON.stringify(submissionDoc, null, 2));
      } else {
        const docRef = await db.collection('submissions').add(submissionDoc);
        console.log(`Saved submission successfully to Firestore: submissions/${docRef.id}`);

        // Mark as SEEN in the mailbox
        await connection.addFlags(message.attributes.uid, 'Seen');
        console.log('Marked email as read.');
      }
    }

    console.log('\nEmail import cycle completed successfully.');
  } catch (error) {
    console.error('Error during email import execution:', error);
  } finally {
    if (connection) {
      connection.end();
    }
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
