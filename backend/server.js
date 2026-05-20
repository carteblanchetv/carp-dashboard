const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const busboy = require('busboy');
require('dotenv').config();

admin.initializeApp({
  storageBucket: "cb-deliverables.appspot.com"
});

console.log('Local Backend starting... Env check:', {
  hasEmailUser: !!process.env.EMAIL_USER,
  hasTargetEmail: !!process.env.TARGET_EMAIL,
  nodeEnv: process.env.NODE_ENV,
  firebaseConfig: process.env.FIREBASE_CONFIG
});

const app = express();

// Important: allow all origins because this will be an API
app.use(cors({ origin: true }));

/**
 * Authentication Middleware
 */
async function validateFirebaseIdToken(req, res, next) {
  console.log(`[LOCAL AUTH] ${req.method} ${req.url}`);
  
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
    res.status(403).json({ success: false, error: 'Unauthorized: No token provided.' });
    return;
  }

  let idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedIdToken;
    next();
    return;
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    res.status(403).json({ success: false, error: 'Unauthorized: Invalid token.' });
    return;
  }
}

// Apply authentication to all routes
app.use(validateFirebaseIdToken);

/**
 * Helper to parse multipart form data using Busboy.
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    try {
      const bb = busboy({ headers: req.headers });
      const fields = {};
      let fileBuffer = null;
      let fileName = '';

      bb.on('file', (name, file, info) => {
        fileName = info.filename;
        const chunks = [];
        file.on('data', (data) => chunks.push(data));
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      bb.on('field', (name, val) => {
        if (fields[name]) {
          if (Array.isArray(fields[name])) {
            fields[name].push(val);
          } else {
            fields[name] = [fields[name], val];
          }
        } else {
          fields[name] = val;
        }
      });

      bb.on('finish', () => {
        resolve({ fields, file: fileBuffer, fileName });
      });

      bb.on('error', (err) => {
        reject(err);
      });

      // Local express doesn't pre-parse rawBody by default, so use req stream.
      if (req.rawBody) {
        bb.end(req.rawBody);
      } else {
        req.pipe(bb);
      }
    } catch (err) {
      reject(err);
    }
  });
}

// Nodemailer config
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'smtp',
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper to format TX date as YYYY-MM-DD → DD/MM/YYYY for display
function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Unknown Date';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// Helper to save submission to Storage and Firestore
async function saveSubmission(req, formType, filename, pdfBuffer, metadata) {
  // We try multiple possible default bucket names to resolve potential 404s
  const possibleBuckets = [
    'cb-deliverables.appspot.com',
    'cb-deliverables.firebasestorage.app'
  ];

  let savedToStorage = false;
  let finalStoragePath = '';

  for (const bucketName of possibleBuckets) {
    try {
      const bucket = admin.storage().bucket(bucketName);
      finalStoragePath = `submissions/${formType}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9_\-\.]/g, '')}`;
      const file = bucket.file(finalStoragePath);
      await file.save(pdfBuffer, { contentType: 'application/pdf' });
      savedToStorage = true;
      console.log(`Successfully saved to storage bucket: ${bucketName}`);
      break; 
    } catch (error) {
      console.warn(`Storage attempt failed for bucket ${bucketName}: ${error.message}`);
    }
  }

  if (!savedToStorage) {
    console.error('CRITICAL: Failed to save PDF to ANY storage bucket.');
    throw new Error('Storage failure: Could not save PDF to any known bucket.');
  }

  try {
    const docData = {
      formType,
      filename,
      storagePath: finalStoragePath,
      submittedBy: req.user ? req.user.uid : 'unknown',
      submittedByEmail: req.user ? req.user.email : 'unknown',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...metadata
    };
    await admin.firestore().collection('submissions').add(docData);
    console.log(`Saved submission ${formType} to Firestore.`);
  } catch (error) {
    console.error(`Error saving Firestore document:`, error);
    throw error;
  }
}

app.post('/api/send-control-sheet', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }

    const { txDate, season, episode, uid, duration } = fields;
    const pdfBuffer = file;
    const displayDate = formatDisplayDate(txDate);
    console.log(`Received Control Sheet S${season}E${episode}. Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const subject = `S${season || '?'}E${episode || '?'} FCC - Carte Blanche TX${displayDate}`;

    const htmlBody = `
      <h2>FINAL CONTROL SHEET</h2>
      <ul>
        <li><strong>TX Date:</strong> ${displayDate}</li>
        <li><strong>Season:</strong> ${season || 'N/A'}</li>
        <li><strong>Episode:</strong> ${episode || 'N/A'}</li>
        <li><strong>UID:</strong> ${uid || 'N/A'}</li>
        <li><strong>Total Episode Duration:</strong> ${duration || 'N/A'}</li>
      </ul>
      <p>Please find the Final Control Sheet PDF attached.</p>
    `;

    const mailOptions = {
        from: `"Carte Blanche Deliverables" <${process.env.EMAIL_USER}>`,
        to: process.env.TARGET_EMAIL,
        subject,
        html: htmlBody,
        attachments: [
            {
                filename: `S${season || '?'}E${episode || '?'}_FCC_TX${(txDate || 'Date').replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    // 1. Save to Firebase (Independent)
    let savedToFirebase = false;
    try {
      await saveSubmission(req, 'control_sheet', `S${season || '?'}E${episode || '?'}_FCC.pdf`, pdfBuffer, {
        season,
        episode,
        txDate,
        uid,
        duration
      });
      savedToFirebase = true;
    } catch (dbError) {
      console.error('Local DB save failed, continuing to email:', dbError);
    }
    
    // 2. Send email
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Local Email sent: ' + info.response);
      res.status(200).json({ 
        success: true, 
        message: savedToFirebase 
          ? 'Control sheet sent and saved successfully!' 
          : 'Control sheet sent, but could not be saved to local portal.' 
      });
    } catch (emailError) {
      console.error('Local Email failed:', emailError);
      if (savedToFirebase) {
         res.status(200).json({ 
           success: true, 
           message: 'Successfully saved to portal, but email notification failed.' 
         });
      } else {
         throw emailError;
      }
    }

  } catch (error) {
    console.error('Error processing local control sheet:', error);
    res.status(500).json({ success: false, error: 'Failed to process submission locally.', details: error.message });
  }
});

app.post('/api/send-footage-agreement', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }

    const { tx_date, season, episode, uid_number, total_duration } = fields;
    const pdfBuffer = file;
    const displayDate = formatDisplayDate(tx_date);
    console.log(`Received Episode Footage Declaration S${season}E${episode}. Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const subject = `S${season || '?'}E${episode || '?'} Episode Footage Declaration - Carte Blanche TX${displayDate}`;

    const htmlBody = `
      <h2>EPISODE FOOTAGE DECLARATION</h2>
      <ul>
        <li><strong>TX Date:</strong> ${displayDate}</li>
        <li><strong>Season:</strong> ${season || 'N/A'}</li>
        <li><strong>Episode:</strong> ${episode || 'N/A'}</li>
        <li><strong>UID:</strong> ${uid_number || 'N/A'}</li>
        <li><strong>Total Episode Duration:</strong> ${total_duration || 'N/A'}</li>
      </ul>
      <p>Please find the Episode Footage Declaration PDF attached.</p>
    `;

    const mailOptions = {
        from: `"Carte Blanche Deliverables" <${process.env.EMAIL_USER}>`,
        to: process.env.TARGET_EMAIL,
        subject,
        html: htmlBody,
        attachments: [
            {
                filename: `S${season || '?'}E${episode || '?'}_EpisodeFootageDeclaration_TX${(tx_date || 'Date').replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Footage Declaration Email sent: ' + info.response);
    
    // Save to Firebase
    await saveSubmission(req, 'episode_footage', `S${season || '?'}E${episode || '?'}_EpisodeFootageDeclaration.pdf`, pdfBuffer, {
      season,
      episode,
      txDate: tx_date,
      uid: uid_number,
      duration: total_duration
    });

    res.status(200).json({ success: true, message: 'Footage declaration sent successfully!' });

  } catch (error) {
    console.error('Error sending footage declaration:', error);
    res.status(500).json({ success: false, error: 'Failed to send agreement due to an internal error.', details: error.message });
  }
});

app.post('/api/send-music-cue-sheet', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }

    const { commission_number, story_name, producer_name, afm_operator, delivery_date } = fields;
    const pdfBuffer = file;
    console.log(`Received Music Cue Sheet for ${story_name}. Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const subject = `MCS #${commission_number || 'UNKNOWN'} ${story_name || 'UNKNOWN'} ${producer_name || 'UNKNOWN'} - Carte Blanche`;

    const htmlBody = `
      <h2>INSERT MUSIC CUE SHEET</h2>
      <ul>
        <li><strong>Commission Number:</strong> ${commission_number || 'N/A'}</li>
        <li><strong>Story Name:</strong> ${story_name || 'N/A'}</li>
        <li><strong>Producer:</strong> ${producer_name || 'N/A'}</li>
        <li><strong>AFM Operator:</strong> ${afm_operator || 'N/A'}</li>
        <li><strong>Delivery Date:</strong> ${formatDisplayDate(delivery_date)}</li>
      </ul>
      <p>Please find the Insert Music Cue Sheet PDF attached.</p>
    `;

    const mailOptions = {
        from: `"Carte Blanche Deliverables" <${process.env.EMAIL_USER}>`,
        to: process.env.TARGET_EMAIL,
        subject,
        html: htmlBody,
        attachments: [
            {
                filename: `MusicCueSheet_${(story_name || 'Story').replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Music Cue Sheet Email sent: ' + info.response);

    // Save to Firebase
    await saveSubmission(req, 'music_cue_sheet', `MusicCueSheet_${(story_name || 'Story').replace(/\s+/g, '_')}.pdf`, pdfBuffer, {
      commissionNumber: commission_number,
      storyName: story_name,
      producerName: producer_name,
      afmOperator: afm_operator,
      deliveryDate: delivery_date
    });

    res.status(200).json({ success: true, message: 'Music cue sheet sent successfully!' });

  } catch (error) {
    console.error('Error sending music cue sheet:', error);
    res.status(500).json({ success: false, error: 'Failed to send music cue sheet.', details: error.message });
  }
});

app.post('/api/send-insert-footage', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }

    const { commission_number, story_name, producer_name, delivery_date } = fields;
    const pdfBuffer = file;
    console.log(`Received Insert Footage for ${story_name}. Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const subject = `Insert Footage ${commission_number ? '#' + commission_number : ''} ${story_name || 'Unknown Story'} ${producer_name || ''} - Carte Blanche`.replace(/\s+/g, ' ');

    const htmlBody = `
      <h2>INSERT FOOTAGE DECLARATION</h2>
      <ul>
        <li><strong>Commission Number:</strong> ${commission_number || 'N/A'}</li>
        <li><strong>Story Name:</strong> ${story_name || 'N/A'}</li>
        <li><strong>Producer:</strong> ${producer_name || 'N/A'}</li>
        <li><strong>Delivery Date:</strong> ${formatDisplayDate(delivery_date)}</li>
      </ul>
      <p>Please find the Insert Footage Declaration PDF attached.</p>
    `;

    const mailOptions = {
        from: `"Carte Blanche Deliverables" <${process.env.EMAIL_USER}>`,
        to: process.env.TARGET_EMAIL,
        subject,
        html: htmlBody,
        attachments: [
            {
                filename: `InsertFootage_${(story_name || 'Story').replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Insert Footage Email sent: ' + info.response);

    // Construct the structured footage array
    const footage = [];
    const types = Array.isArray(fields['type[]']) ? fields['type[]'] : [fields['type[]']];
    const clipNames = Array.isArray(fields['clip_name[]']) ? fields['clip_name[]'] : [fields['clip_name[]']];
    const descriptions = Array.isArray(fields['description[]']) ? fields['description[]'] : [fields['description[]']];
    const sources = Array.isArray(fields['source[]']) ? fields['source[]'] : [fields['source[]']];
    const contacts = Array.isArray(fields['contact[]']) ? fields['contact[]'] : [fields['contact[]']];
    const agreements = Array.isArray(fields['agreement[]']) ? fields['agreement[]'] : [fields['agreement[]']];
    const tcInList = Array.isArray(fields['tc_in[]']) ? fields['tc_in[]'] : [fields['tc_in[]']];
    const tcOutList = Array.isArray(fields['tc_out[]']) ? fields['tc_out[]'] : [fields['tc_out[]']];
    const durations = Array.isArray(fields['duration[]']) ? fields['duration[]'] : [fields['duration[]']];
    const licenceReqList = Array.isArray(fields['licence_req[]']) ? fields['licence_req[]'] : [fields['licence_req[]']];
    const licencePeriodList = Array.isArray(fields['licence_period[]']) ? fields['licence_period[]'] : [fields['licence_period[]']];
    const resaleList = Array.isArray(fields['resale[]']) ? fields['resale[]'] : [fields['resale[]']];

    if (types && types.length > 0) {
      for (let i = 0; i < types.length; i++) {
        // Only add if there is at least a clip name or description
        if (clipNames[i] || descriptions[i]) {
          footage.push({
            type: types[i],
            clip_name: clipNames[i],
            description: descriptions[i],
            source: sources[i],
            contact: contacts[i],
            agreement: agreements[i],
            tc_in: tcInList[i],
            tc_out: tcOutList[i],
            duration: durations[i],
            licence_req: licenceReqList[i],
            licence_period: licencePeriodList[i],
            resale: resaleList[i]
          });
        }
      }
    }

    // Save to Firebase
    await saveSubmission(req, 'insert_footage', `InsertFootage_${(story_name || 'Story').replace(/\s+/g, '_')}.pdf`, pdfBuffer, {
      commissionNumber: commission_number,
      storyName: story_name,
      producerName: producer_name,
      deliveryDate: delivery_date,
      footage: footage
    });

    res.status(200).json({ success: true, message: 'Insert Footage Declaration sent successfully!' });

  } catch (error) {
    console.error('Error sending insert footage:', error);
    res.status(500).json({ success: false, error: 'Failed to send insert footage.', details: error.message });
  }
});

app.get('/api/insert-footage-stories', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // We fetch all insert_footage submissions from the last 30 days
    const snapshot = await admin.firestore().collection('submissions')
      .where('formType', '==', 'insert_footage')
      .where('submittedAt', '>=', thirtyDaysAgo)
      .orderBy('submittedAt', 'desc')
      .get();
      
    const stories = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        storyName: data.storyName,
        submittedAt: data.submittedAt,
        footage: data.footage || []
      };
    });
    
    res.json({ success: true, stories });
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/list-user-footage', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('submissions')
      .where('submittedBy', '==', req.user.uid)
      .where('formType', '==', 'insert_footage')
      .get();
      
    const mapping = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.commissionNumber) {
        mapping[data.commissionNumber] = doc.id;
      }
    });
    
    res.json({ success: true, mapping });
  } catch (error) {
    console.error('Error listing user footage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Global Error Handler for JSON responses
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    stack: err.stack
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
