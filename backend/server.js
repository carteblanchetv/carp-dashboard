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

  const publicFormRoutes = [
    '/api/send-participant-release',
    '/api/send-minor-release',
    '/api/send-location-agreement',
    '/api/send-music-agreement',
    '/api/send-travel-booking'
  ];

  const isPublicFormRoute = publicFormRoutes.some(route => req.path.startsWith(route) || req.url.startsWith(route));

  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const rawToken = req.headers.authorization.split('Bearer ')[1];
    if (rawToken && rawToken !== 'null' && rawToken !== 'undefined') {
      idToken = rawToken;
    }
  } else if (req.query && req.query.token && req.query.token !== 'null' && req.query.token !== 'undefined') {
    idToken = req.query.token;
  }

  if (!idToken && isPublicFormRoute) {
    // Guest participant access allowed without login
    return next();
  }

  if (!idToken) {
    console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
    res.status(403).json({ success: false, error: 'Unauthorized: No token provided.' });
    return;
  }

  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedIdToken;
    return next();
  } catch (error) {
    if (isPublicFormRoute) {
      console.warn('[LOCAL AUTH] Optional token verify failed on public form, continuing as guest:', error.message);
      return next();
    }
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

const { formatDisplayDate } = require('./utils');

// Helper to route form submissions to designated recipients + submitter + producer
function getFormRecipients(formType, submitterEmail, extraEmail) {
  const recipients = new Set();
  if (formType === 'travel_booking') {
    recipients.add('carteb@embassytravel.co.za');
    recipients.add('nombuson@combinedartists.co.za');
  } else {
    // Participant Release, Minor Release, Location Agreement, Footage Agreement, Music Agreement, Insert Sheet, Insert Footage
    recipients.add('release@carteblanche.co.za');
  }
  [submitterEmail, extraEmail].forEach(email => {
    if (email && typeof email === 'string' && email.includes('@')) {
      recipients.add(email.toLowerCase().trim());
    }
  });
  return Array.from(recipients).join(', ');
}

function getProducerName(req, fields) {
  if (fields && (fields.producerName || fields.producer)) {
    return (fields.producerName || fields.producer).trim();
  }
  if (req && req.user) {
    const fullName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
    if (fullName) return fullName;
    if (req.user.name) return req.user.name;
    if (req.user.email) return req.user.email;
  }
  if (fields && (fields.submittedByName || fields.submittedByEmail)) {
    return (fields.submittedByName || fields.submittedByEmail).trim();
  }
  return 'Producer';
}

function getFormEmoji(formTitle = '') {
  const lower = formTitle.toLowerCase();
  if (lower.includes('travel')) return '✈️';
  if (lower.includes('minor')) return '🧒';
  if (lower.includes('participant')) return '👤';
  if (lower.includes('location')) return '📍';
  if (lower.includes('footage')) return '🎞️';
  if (lower.includes('music')) return '🎵';
  if (lower.includes('insert')) return '📝';
  return '📋';
}

// Build PDF filename: [CommissionNumber]-[StoryTitle]-[FormTitle]-[YYYY-MM-DD].pdf
function buildPdfFilename(commissionNumber, storyTitle, formTitle) {
  const today = new Date().toISOString().slice(0, 10);
  const safe = str => (str || 'Unknown').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${safe(commissionNumber)}-${safe(storyTitle)}-${safe(formTitle)}-${today}.pdf`;
}

// Build sender display name: [Form Short Name] - Carte Blanche
function buildFromName(formTitle) {
  return `"${formTitle} - Carte Blanche" <${process.env.EMAIL_USER}>`;
}

function buildFormEmailDetails({ formTitle, commissionNumber, storyTitle, producerName }) {
  const comm = commissionNumber || 'N/A';
  const story = storyTitle || 'N/A';
  const prod = producerName || 'N/A';
  const title = formTitle || 'Form Submission';
  const emoji = getFormEmoji(title);

  // Format: [Commission Number] - [Story Title] - [Form Title] - [Producer Name]
  const subject = `${comm} - ${story} - ${title} - ${prod}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px;">
      <h2 style="color: #008fbe; margin-top: 0; margin-bottom: 16px; font-size: 19px; font-weight: 700;">${emoji ? `${emoji} ` : ''}CARTE BLANCHE &bull; ${title.toUpperCase()}</h2>
      <ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 15px; line-height: 1.6; color: #1e293b;">
        <li style="margin-bottom: 6px;"><b>Commission Number:</b> ${comm}</li>
        <li style="margin-bottom: 6px;"><b>Story Title:</b> ${story}</li>
        <li style="margin-bottom: 6px;"><b>Producer:</b> ${prod}</li>
      </ul>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #1e293b;">Please find the completed ${title} attached to this email.</p>
    </div>
  `.trim();

  return { subject, html };
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
      submittedBy: req.user ? req.user.uid : 'guest_participant',
      submittedByEmail: (req.user && req.user.email) || metadata.email || 'guest_participant',
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
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || fields.email;
    const toRecipients = getFormRecipients('footage_agreement', submitterEmail);
    const pdfBuffer = file;
    const displayDate = formatDisplayDate(tx_date);
    console.log(`Received Episode Footage Declaration S${season}E${episode}. Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const commissionNumber = fields.commissionNumber || fields.commission_number || uid_number || 'N/A';
    const storyTitle = fields.storyTitle || fields.storyName || (season && episode ? `S${season} E${episode}` : 'Footage Agreement');
    const producerName = getProducerName(req, fields);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Footage Agreement',
      commissionNumber,
      storyTitle,
      producerName
    });

    const mailOptions = {
        from: buildFromName('Footage Agreement'),
        to: toRecipients,
        subject,
        html,
        attachments: [
            {
                filename: buildPdfFilename(commissionNumber, storyTitle, 'Footage Agreement'),
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Footage Declaration Email sent: ' + info.response);
    
    // Save to Firebase
    await saveSubmission(req, 'episode_footage', buildPdfFilename(commissionNumber, storyTitle, 'Footage Agreement'), pdfBuffer, {
      season,
      episode,
      txDate: tx_date,
      uid: uid_number,
      duration: total_duration,
      commissionNumber,
      storyTitle,
      producerName
    });

    res.status(200).json({ success: true, message: 'Footage declaration sent successfully!' });

  } catch (error) {
    console.error('Error sending footage declaration:', error);
    res.status(500).json({ success: false, error: 'Failed to send agreement due to an internal error.', details: error.message });
  }
});

app.post('/api/send-participant-release', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF file provided.' });

    const { fullName, idNumber, phone, email, storyName } = fields;
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || email;
    const producerEmail = fields.producerEmail || fields.producer_email;
    const toRecipients = getFormRecipients('participant_release', submitterEmail, producerEmail);

    const commissionNumber = fields.commissionNumber || fields.commission_number || 'N/A';
    const storyTitle = storyName || fields.storyTitle || 'Story';
    const producerName = getProducerName(req, fields);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Participant Release Form',
      commissionNumber,
      storyTitle,
      producerName
    });

    const mailOptions = {
        from: buildFromName('Participant Release'),
        to: toRecipients,
        subject,
        html,
        attachments: [{ filename: buildPdfFilename(commissionNumber, storyTitle, 'Participant Release Form'), content: file, contentType: 'application/pdf' }]
    };

    await transporter.sendMail(mailOptions);
    await saveSubmission(req, 'participant_release', buildPdfFilename(commissionNumber, storyTitle, 'Participant Release Form'), file, { fullName, idNumber, phone, email, storyName, commissionNumber, producerName });
    res.status(200).json({ success: true, message: 'Participant release sent successfully!' });
  } catch (error) {
    console.error('Error sending participant release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-minor-release', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF file provided.' });

    const { guardianName, guardianId, phone, email, minorName, minorAge, storyName } = fields;
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || email;
    const producerEmail = fields.producerEmail || fields.producer_email;
    const toRecipients = getFormRecipients('minor_release', submitterEmail, producerEmail);

    const commissionNumber = fields.commissionNumber || fields.commission_number || 'N/A';
    const storyTitle = storyName || fields.storyTitle || 'Story';
    const producerName = getProducerName(req, fields);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Minor Release Form',
      commissionNumber,
      storyTitle,
      producerName
    });

    const mailOptions = {
        from: buildFromName('Minor Release'),
        to: toRecipients,
        subject,
        html,
        attachments: [{ filename: buildPdfFilename(commissionNumber, storyTitle, 'Minor Release Form'), content: file, contentType: 'application/pdf' }]
    };

    await transporter.sendMail(mailOptions);
    await saveSubmission(req, 'minor_release', buildPdfFilename(commissionNumber, storyTitle, 'Minor Release Form'), file, { guardianName, guardianId, phone, email, minorName, minorAge, storyName, commissionNumber, producerName });
    res.status(200).json({ success: true, message: 'Minor release sent successfully!' });
  } catch (error) {
    console.error('Error sending minor release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-location-agreement', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF file provided.' });

    const { ownerName, ownerId, phone, email, propertyAddress, filmingDate, storyName } = fields;
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || email;
    const producerEmail = fields.producerEmail || fields.producer_email;
    const toRecipients = getFormRecipients('location_agreement', submitterEmail, producerEmail);

    const commissionNumber = fields.commissionNumber || fields.commission_number || 'N/A';
    const storyTitle = storyName || fields.storyTitle || 'Story';
    const producerName = getProducerName(req, fields);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Location Agreement',
      commissionNumber,
      storyTitle,
      producerName
    });

    const mailOptions = {
        from: buildFromName('Location Agreement'),
        to: toRecipients,
        subject,
        html,
        attachments: [{ filename: buildPdfFilename(commissionNumber, storyTitle, 'Location Agreement'), content: file, contentType: 'application/pdf' }]
    };

    await transporter.sendMail(mailOptions);
    await saveSubmission(req, 'location_agreement', buildPdfFilename(commissionNumber, storyTitle, 'Location Agreement'), file, { ownerName, ownerId, phone, email, propertyAddress, filmingDate, storyName, commissionNumber, producerName });
    res.status(200).json({ success: true, message: 'Location agreement sent successfully!' });
  } catch (error) {
    console.error('Error sending location agreement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-music-agreement', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF file provided.' });

    const { artistName, publisherName, phone, email, trackTitle, trackDuration, storyName } = fields;
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || email;
    const producerEmail = fields.producerEmail || fields.producer_email;
    const toRecipients = getFormRecipients('music_agreement', submitterEmail, producerEmail);

    const commissionNumber = fields.commissionNumber || fields.commission_number || 'N/A';
    const storyTitle = storyName || fields.storyTitle || 'Story';
    const producerName = getProducerName(req, fields);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Music Agreement',
      commissionNumber,
      storyTitle,
      producerName
    });

    const mailOptions = {
        from: buildFromName('Music Agreement'),
        to: toRecipients,
        subject,
        html,
        attachments: [{ filename: buildPdfFilename(commissionNumber, storyTitle, 'Music Agreement'), content: file, contentType: 'application/pdf' }]
    };

    await transporter.sendMail(mailOptions);
    await saveSubmission(req, 'music_agreement', buildPdfFilename(commissionNumber, storyTitle, 'Music Agreement'), file, { artistName, publisherName, phone, email, trackTitle, trackDuration, storyName, commissionNumber, producerName });
    res.status(200).json({ success: true, message: 'Music agreement sent successfully!' });
  } catch (error) {
    console.error('Error sending music agreement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-travel-booking', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF file provided.' });

    const { travelerName, idNumber, phone, email, departureAirport, destinationAirport, departureDate, returnDate, storyName, accommodationRequired, carHireRequired, additionalNotes } = fields;
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || email;
    const producerEmail = fields.producerEmail || fields.producer_email;
    const toRecipients = getFormRecipients('travel_booking', submitterEmail, producerEmail);

    const commissionNumber = fields.commissionNumber || fields.commission_number || 'N/A';
    const storyTitle = storyName || fields.storyTitle || 'Story';
    const producerName = getProducerName(req, fields);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Travel Booking Form',
      commissionNumber,
      storyTitle,
      producerName
    });

    const mailOptions = {
        from: buildFromName('Travel Booking'),
        to: toRecipients,
        subject,
        html,
        attachments: [{ filename: buildPdfFilename(commissionNumber, storyTitle, 'Travel Booking Form'), content: file, contentType: 'application/pdf' }]
    };

    await transporter.sendMail(mailOptions);
    await saveSubmission(req, 'travel_booking', buildPdfFilename(commissionNumber, storyTitle, 'Travel Booking Form'), file, { travelerName, idNumber, phone, email, departureAirport, destinationAirport, departureDate, returnDate, storyName, accommodationRequired, carHireRequired, additionalNotes, commissionNumber, producerName });
    res.status(200).json({ success: true, message: 'Travel booking request sent successfully!' });
  } catch (error) {
    console.error('Error sending travel booking request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-insert-footage', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No PDF file provided.' });
    }

    const { commission_number, story_name, producer_name, delivery_date } = fields;
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || fields.email;
    const producerEmail = fields.producerEmail || fields.producer_email;
    const toRecipients = getFormRecipients('insert_footage', submitterEmail, producerEmail);
    const pdfBuffer = file;
    console.log(`Received Insert Footage for ${story_name}. Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Insert Sheet / Footage Declaration',
      commissionNumber: commission_number || 'N/A',
      storyTitle: story_name || 'Story',
      producerName: producer_name || getProducerName(req, fields)
    });

    const mailOptions = {
        from: `"Carte Blanche Deliverables" <${process.env.EMAIL_USER}>`,
        to: toRecipients,
        subject,
        html,
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

app.post('/api/send-insert-sheet', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF file provided.' });

    const storyName = fields.storyName || fields.story_name || fields.storyTitle || 'Story';
    const commissionNumber = fields.commissionNumber || fields.commission_number || 'N/A';
    const producerName = getProducerName(req, fields);
    const submitterEmail = (req.user && req.user.email) || fields.submittedByEmail || fields.email;
    const toRecipients = getFormRecipients('insert_sheet', submitterEmail);

    const { subject, html } = buildFormEmailDetails({
      formTitle: 'Insert Sheet',
      commissionNumber,
      storyTitle: storyName,
      producerName
    });

    const mailOptions = {
      from: buildFromName('Insert Sheet'),
      to: toRecipients,
      subject,
      html,
      attachments: [{ filename: buildPdfFilename(commissionNumber, storyName, 'Insert Sheet'), content: file, contentType: 'application/pdf' }]
    };

    await transporter.sendMail(mailOptions);
    await saveSubmission(req, 'insert_sheet', buildPdfFilename(commissionNumber, storyName, 'Insert Sheet'), file, {
      storyName,
      commissionNumber,
      producerName,
      ...fields
    });
    res.status(200).json({ success: true, message: 'Insert sheet sent successfully!' });
  } catch (error) {
    console.error('Error sending insert sheet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/insert-footage-stories', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    
    // 1. Fetch insert_footage submissions
    let subQuery = admin.firestore().collection('submissions')
      .where('formType', '==', 'insert_footage');
      
    if (!all) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      subQuery = subQuery.where('submittedAt', '>=', ninetyDaysAgo);
    }
    
    const subSnapshot = await subQuery.orderBy('submittedAt', 'desc').get();

    // 2. Fetch accepted and paid proposals (filter date in-memory to avoid composite index requirement)
    const propQuery = admin.firestore().collection('proposals')
      .where('status', 'in', ['accepted', 'paid']);

    const propSnapshot = await propQuery.get();

    // 3. Combine and deduplicate
    const uniqueMap = new Map();
    
    subSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const name = data.storyName || data.story_name || data.story_title || data.storyTitle || 'Unnamed Story';
      const key = `${name.toLowerCase().trim()}_${data.commissionNumber || ''}`;
      uniqueMap.set(key, {
        id: doc.id,
        storyName: name,
        submittedAt: data.submittedAt,
        footage: data.footage || []
      });
    });

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    propSnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // Filter by date in memory if not requesting all
      if (!all && data.submittedAt) {
        const submittedDate = data.submittedAt._seconds 
          ? new Date(data.submittedAt._seconds * 1000) 
          : new Date(data.submittedAt);
        if (submittedDate < ninetyDaysAgo) {
          return; // Skip
        }
      }

      const name = data.story_title || data.storyName || data.story_name || data.storyTitle || 'Unnamed Story';
      const key = `${name.toLowerCase().trim()}_${data.commissionNumber || ''}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          id: doc.id,
          storyName: name,
          submittedAt: data.submittedAt,
          footage: []
        });
      }
    });
    
    const stories = Array.from(uniqueMap.values());
    
    // Sort by submittedAt descending (newest first)
    stories.sort((a, b) => {
      const timeA = a.submittedAt ? (a.submittedAt._seconds ? a.submittedAt._seconds * 1000 : new Date(a.submittedAt).getTime()) : 0;
      const timeB = b.submittedAt ? (b.submittedAt._seconds ? b.submittedAt._seconds * 1000 : new Date(b.submittedAt).getTime()) : 0;
      return timeB - timeA;
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
