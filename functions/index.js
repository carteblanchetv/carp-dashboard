const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const busboy = require('busboy');
const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : Buffer.alloc(32); // Fallback prevents crash during deploy analysis — real key must be set in prod
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

const AUTHORIZED_ADMIN_ROLES = ['admin', 'super-admin', 'editorial-production'];
const AUTHORIZED_LOGGED_IN_ROLES = ['admin', 'super-admin', 'editorial-production', 'producer', 'freelancer'];

function hasAdminAccess(user) {
    if (!user) return false;
    // Allow access if the user's current role is admin OR if they are an admin masquerading
    return AUTHORIZED_ADMIN_ROLES.includes(user.role) || (user.adminRole && AUTHORIZED_ADMIN_ROLES.includes(user.adminRole));
}

function canEditProposal(proposalData, user) {
    if (hasAdminAccess(user)) return true;
    const ownerId = proposalData.submittedBy;
    return ownerId === user.uid || (user.email && ownerId === user.email.toLowerCase());
}

/**
 * Encryption Helpers
 */
function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    content: encrypted,
    tag: tag.toString('hex'),
    _encrypted: true // Flag to identify encrypted fields
  };
}

function decrypt(data) {
  if (!data || typeof data !== 'object' || !data._encrypted) return data;
  try {
    const iv = Buffer.from(data.iv, 'hex');
    const tag = Buffer.from(data.tag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(data.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[ENCRYPT] Decryption failed, returning raw data:', err.message);
    return data;
  }
}

/**
 * Buffer Encryption (for Storage)
 * Prepends IV and Tag to the ciphertext
 */
function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: [IV (16 bytes)][Tag (16 bytes)][Ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptBuffer(buffer) {
  try {
    const iv = buffer.slice(0, IV_LENGTH);
    const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.slice(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    console.error('[ENCRYPT] Buffer decryption failed:', err.message);
    return buffer;
  }
}

admin.initializeApp();
admin.firestore().settings({ ignoreUndefinedProperties: true });
const defaultBucket = admin.storage().bucket();

/**
 * Call Sheet Decryption Helper
 */
function decryptCallSheet(details) {
    if (!details || !details.callSheet) return details;
    const cs = details.callSheet;
    const sensitiveFields = [
        'producer_phone', 'producer_id',
        'presenter_phone', 'presenter_id',
        'dop_phone', 'dop_id',
        'cam_assistant_phone', 'cam_assistant_id',
        'security_phone',
        'add1_phone', 'add1_id',
        'add2_phone', 'add2_id'
    ];
    sensitiveFields.forEach(f => {
        if (cs[f] && cs[f]._encrypted) {
            cs[f] = decrypt(cs[f]);
        }
    });

    // Decrypt dynamic additional crew
    if (cs.additionalCrew && Array.isArray(cs.additionalCrew)) {
        cs.additionalCrew.forEach(member => {
            if (member.phone && member.phone._encrypted) member.phone = decrypt(member.phone);
            if (member.id && member.id._encrypted) member.id = decrypt(member.id);
        });
    }

    // Decrypt new crew list
    if (cs.crew && Array.isArray(cs.crew)) {
        cs.crew.forEach(member => {
            if (member.phone && member.phone._encrypted) member.phone = decrypt(member.phone);
        });
    }

    // Decrypt new security phone
    if (cs.security && cs.security.phone && cs.security.phone._encrypted) {
        cs.security.phone = decrypt(cs.security.phone);
    }

    return details;
}

// Nodemailer transporter — must be defined BEFORE notifyRelevantUsers
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'smtp',
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

/**
 * Get an access token for Microsoft Graph API using Client Credentials flow
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
 * Send an email using Microsoft Graph API
 */
async function sendEmailViaGraph(subject, html, recipientList, bccRecipientsList, attachments = []) {
  const accessToken = await getMicrosoftAccessToken();
  const mailbox = process.env.MICROSOFT_MAILBOX_EMAIL || 'story@combinedartists.co.za';

  const toRecipients = (recipientList || mailbox).split(',').map(email => ({
    emailAddress: { address: email.trim() }
  }));

  const bccRecipients = (bccRecipientsList || '').split(',').filter(Boolean).map(email => ({
    emailAddress: { address: email.trim() }
  }));

  const graphMessage = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: html
      },
      toRecipients
    },
    saveToSentItems: 'false'
  };

  if (bccRecipients.length > 0) {
    graphMessage.message.bccRecipients = bccRecipients;
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    graphMessage.message.attachments = attachments.map(att => {
      let contentBytes = '';
      if (Buffer.isBuffer(att.content)) {
        contentBytes = att.content.toString('base64');
      } else if (typeof att.content === 'string') {
        contentBytes = Buffer.from(att.content).toString('base64');
      } else if (att.path) {
        const fs = require('fs');
        contentBytes = fs.readFileSync(att.path).toString('base64');
      }
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        contentBytes
      };
    });
  }

  const sendUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/sendMail`;
  const response = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(graphMessage)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Graph API sendMail failed: ${response.statusText} - ${errText}`);
  }
}

/**
 * Helper to serialize attachments into base64 format for Firestore storage
 */
function serializeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map(att => {
    let base64Content = '';
    if (Buffer.isBuffer(att.content)) {
      base64Content = att.content.toString('base64');
    } else if (typeof att.content === 'string') {
      base64Content = Buffer.from(att.content).toString('base64');
    } else if (att.path) {
      try {
        const fs = require('fs');
        base64Content = fs.readFileSync(att.path).toString('base64');
      } catch (e) {
        console.error('[NOTIFY] Error reading attachment path for serialization:', e);
      }
    }
    return {
      filename: att.filename,
      contentType: att.contentType || 'application/octet-stream',
      base64Content
    };
  });
}

/**
 * Helper to deserialize base64 attachments back to Buffer formats
 */
function deserializeAttachments(serialized) {
  if (!Array.isArray(serialized)) return [];
  return serialized.map(att => ({
    filename: att.filename,
    contentType: att.contentType,
    content: Buffer.from(att.base64Content, 'base64')
  }));
}

/**
 * Sends a notification email utilizing the three-tier failover system
 */
async function sendNotificationEmail(fromName, subject, html, recipientList, attachments = []) {
    let lastError = null;
    let sentViaGraph = false;

    if (process.env.MICROSOFT_CLIENT_ID) {
        try {
            console.log(`[NOTIFY] Using Microsoft Graph API to send email to bcc: ${recipientList}`);
            const mailbox = process.env.MICROSOFT_MAILBOX_EMAIL || 'story@combinedartists.co.za';
            await sendEmailViaGraph(`[${fromName}] ${subject}`, html, mailbox, recipientList, attachments);
            console.log(`[NOTIFY] Graph API email sent successfully.`);
            sentViaGraph = true;
            return;
        } catch (graphErr) {
            lastError = graphErr;
            console.error(`[NOTIFY] Graph API send failed: ${graphErr.message}. Falling back to legacy SMTP...`);
        }
    }

    if (!sentViaGraph) {
        console.log(`[NOTIFY] Using legacy SMTP to send email to: ${recipientList}`);
        const mailOptions = {
            from: `"${fromName}" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            bcc: recipientList,
            subject: subject,
            html: html,
            attachments: attachments
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`[NOTIFY] SMTP email sent successfully.`);
            return;
        } catch (smtpErr) {
            lastError = smtpErr;
            console.error(`[NOTIFY] SMTP send failed: ${smtpErr.message}. Trying Office 365 SMTP...`);
            try {
                const o365Transporter = nodemailer.createTransport({
                    host: 'smtp.office365.com',
                    port: 587,
                    secure: false,
                    auth: {
                        user: process.env.IMAP_USER || 'story@combinedartists.co.za',
                        pass: process.env.IMAP_PASSWORD
                    }
                });
                const o365MailOptions = {
                    from: `"${fromName}" <${process.env.IMAP_USER || 'story@combinedartists.co.za'}>`,
                    to: process.env.IMAP_USER || 'story@combinedartists.co.za',
                    bcc: recipientList,
                    subject: subject,
                    html: html,
                    attachments: attachments
                };
                await o365Transporter.sendMail(o365MailOptions);
                console.log(`[NOTIFY] Office 365 SMTP email sent successfully.`);
                return;
            } catch (o365Err) {
                lastError = o365Err;
                console.error(`[NOTIFY] Office 365 SMTP send failed: ${o365Err.message}`);
            }
        }
    }

    throw lastError || new Error('All email send attempts failed.');
}

/**
 * Queue a failed notification in Firestore for automatic retries
 */
async function queueFailedEmail(type, subject, html, attachments, recipientList, errorMsg) {
  try {
    const serialized = serializeAttachments(attachments);
    const recipients = typeof recipientList === 'string'
      ? recipientList.split(',').map(r => r.trim()).filter(Boolean)
      : (Array.isArray(recipientList) ? recipientList : []);
    
    await admin.firestore().collection('failed_emails').add({
      type,
      subject,
      html,
      recipients,
      attachments: serialized,
      lastError: errorMsg || 'Unknown error',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      retryCount: 0,
      status: 'pending'
    });
    console.log(`[NOTIFY] Successfully queued failed email in Firestore 'failed_emails' collection.`);
  } catch (err) {
    console.error(`[NOTIFY] CRITICAL ERROR: Failed to queue email in Firestore: ${err.message}`);
  }
}

/**
 * Helper to send notifications to relevant admins/editorial/production
 */
async function notifyRelevantUsers(type, subject, html, attachments = [], extraRecipients = []) {
    try {
        console.log(`[NOTIFY] Resolving recipients for type: ${type}`);
        const recipients = new Set();
        
        // Always include Lezanne as a safety fallback/audit
        recipients.add('lezanne@carteblanche.co.za'.toLowerCase().trim());

        // 2. Query Firestore for users who have this notification enabled
        const userSnapshot = await admin.firestore().collection('users')
            .where('isEnabled', '==', true)
            .get();

        userSnapshot.forEach(doc => {
            const data = doc.data();
            const prefs = data.notifications || {};
            
            // Check if user has this specific notification enabled
            if (prefs[type] === true) {
                let rawEmail = decrypt(data.email);
                if (rawEmail && typeof rawEmail === 'object') {
                    rawEmail = doc.id.includes('@') ? doc.id : null;
                }
                if (!rawEmail) {
                    rawEmail = data.email && typeof data.email === 'string' ? data.email : (doc.id.includes('@') ? doc.id : null);
                }
                if (typeof rawEmail === 'string' && rawEmail.includes('@')) {
                    const normalized = rawEmail.toLowerCase().trim();
                    recipients.add(normalized);
                    console.log(`[NOTIFY] Added preference-based recipient: ${normalized}`);
                }
            }
        });
        
        // 3. Add any extra recipients requested
        if (Array.isArray(extraRecipients)) {
            extraRecipients.forEach(email => {
                if (email && email.includes('@')) {
                    recipients.add(email.toLowerCase().trim());
                }
            });
        }

        if (recipients.size === 0) {
            console.warn(`[NOTIFY] No recipients found for type '${type}'. Skipping.`);
            return;
        }

        const recipientList = Array.from(recipients).join(', ');
        const fromName = type === 'call_sheet' ? "Call Sheets" : (type === 'editorial_leave' ? "Editorial Leave Calendar" : "CARP Dashboard");

        try {
            await sendNotificationEmail(fromName, subject, html, recipientList, attachments);
        } catch (sendErr) {
            console.error(`[NOTIFY] All email attempts failed for type '${type}': ${sendErr.message}. Queuing in Firestore...`);
            await queueFailedEmail(type, subject, html, attachments, recipientList, sendErr.message);
        }
    } catch (err) {
        console.error(`[NOTIFY] FAILED for type '${type}': ${err.message}`);
    }
}


const app = express();
app.use(cors({ origin: true }));



/**
 * Editorial Leave Notification (Public Endpoint)
 */
app.post('/api/submit-editorial-leave', express.json(), async (req, res) => {
    try {
        const { name, start, end, requiresApproval } = req.body;
        console.log(`[LEAVE] New request from ${name}: ${start} to ${end} (Approval Required: ${requiresApproval})`);
        
        const subject = `New Editorial Leave Request: ${name}${requiresApproval ? ' [SUBJECT TO APPROVAL]' : ''}`;
        const approvalNote = requiresApproval 
            ? `<div style="background: #fff4f4; border: 1px solid #ffc1c1; color: #cc0000; padding: 10px; margin-bottom: 15px; border-radius: 4px;">
                 <b>⚠️ IMPORTANT:</b> This request includes a Monday or Friday and is <b>subject to approval</b>.
               </div>`
            : '';

        const html = `
            <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
                ${approvalNote}
                <p>A new <b>Editorial Leave Request</b> has been submitted:</p>
                <ul>
                    <li><b>Name:</b> ${name}</li>
                    <li><b>Leave Date:</b> ${start} to ${end}</li>
                    <li><b>Link to Add to LeavePro:</b> <a href="https://combined-artistic-productions.leavepro.co.za/login/?next=/">LeavePro Login</a></li>
                </ul>
                <p style="font-size: 0.8rem; color: #666;">This notification was generated by the Editorial Leave Overview system.</p>
            </div>
        `;
        
        await notifyRelevantUsers('editorial_leave', subject, html);
        
        // Save to Firestore for shared visibility
        await admin.firestore().collection('leaves').add({
            name,
            start,
            end,
            type: 'editorial',
            submittedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Notification sent and leave recorded' });
    } catch (error) {
        console.error('[LEAVE] Notification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get All Shared Leaves
 */
app.get('/api/get-editorial-leaves', async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection('leaves')
            .orderBy('start', 'asc')
            .get();
            
        const leaves = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json({ success: true, leaves });
    } catch (error) {
        console.error('[LEAVE] Fetch failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Delete Leave Entry
 */
app.delete('/api/delete-editorial-leave/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await admin.firestore().collection('leaves').doc(id).delete();
        res.json({ success: true, message: 'Leave entry deleted' });
    } catch (error) {
        console.error('[LEAVE] Delete failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Authentication Middleware
 */
async function validateFirebaseIdToken(req, res, next) {
  console.log(`[AUTH] Checking token for ${req.method} ${req.url}`);
  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else if (req.query.token) {
    idToken = req.query.token;
  } else {
    console.warn('[AUTH] Missing or malformed Authorization header');
    res.status(403).json({ success: false, error: 'Unauthorized: Missing token.' });
    return;
  }
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    
    // 1. Look up by UID (New Format)
    let userDoc = await admin.firestore().collection('users').doc(decodedIdToken.uid).get();
    let userData = userDoc.data();
    
    // 2. Fallback to Email (Old Format / Migration)
    if (!userData) {
      userDoc = await admin.firestore().collection('users').doc(decodedIdToken.email.toLowerCase()).get();
      userData = userDoc.data();
    }
    
    // Hardcoded Super Admin for bootstrapping
    const isLezanne = decodedIdToken.email.toLowerCase() === 'lezanne@carteblanche.co.za';
    
    if (!isLezanne && (!userData || !userData.isEnabled)) {
      console.warn(`[AUTH] Blocked login for disabled or non-whitelisted user: ${decodedIdToken.email}`);
      return res.status(403).json({ success: false, error: 'Account disabled. Contact administrator.' });
    }

    // Role Mapping & Lazy Migration
    let role = 'producer'; // Default
    if (isLezanne) {
      role = 'super-admin';
    } else if (userData) {
      role = userData.role || 'producer';
      
      // LAZY MIGRATION: If found by email fallback, create the UID-based record
      const isLegacy = !userDoc.id.includes(decodedIdToken.uid); // Simplified check
      if (isLegacy) {
        console.log(`[AUTH] Migrating legacy user to UID: ${decodedIdToken.email}`);
        const parts = (decodedIdToken.name || '').split(' ');
        const name = parts[0] || 'N/A';
        const surname = parts.slice(1).join(' ') || '';
        
        const migratedData = {
          name: encrypt(name),
          surname: encrypt(surname),
          email: encrypt(decodedIdToken.email.toLowerCase()),
          password: encrypt('MIGRATED_FROM_AUTH'), 
          role: role,
          isEnabled: userData.isEnabled !== undefined ? userData.isEnabled : true,
          addedAt: userData.addedAt || admin.firestore.FieldValue.serverTimestamp(),
          migratedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await admin.firestore().collection('users').doc(decodedIdToken.uid).set(migratedData);
        // We keep the old record for safety during the rollout
      }
    }

    req.user = {
      ...decodedIdToken,
      role: role,
      isEnabled: isLezanne ? true : (userData ? userData.isEnabled : false),
      firstName: isLezanne ? 'Lezanne' : (userData ? (decrypt(userData.name) || '') : ''),
      lastName: isLezanne ? 'Janse van Rensburg' : (userData ? (decrypt(userData.surname) || '') : '')
    };
    
    console.log('[AUTH] Token verified for:', req.user.email, 'Role:', req.user.role);

    // --- MASQUERADE LOGIC ---
    const masqueradeUid = req.headers['x-masquerade-uid'];
    const masqueradeEmail = req.headers['x-masquerade-user'];
    
    const canMasquerade = isLezanne || role === 'super-admin' || role === 'admin';
    if ((masqueradeUid || masqueradeEmail) && canMasquerade) {
        console.log(`[AUTH] Masquerade attempt by Super Admin. UID: ${masqueradeUid}, Email: ${masqueradeEmail}`);
        
        let targetDoc;
        if (masqueradeUid) {
            targetDoc = await admin.firestore().collection('users').doc(masqueradeUid).get();
        }
        
        // Fallback to searching by email if UID doc not found
        if ((!targetDoc || !targetDoc.exists) && masqueradeEmail) {
            targetDoc = await admin.firestore().collection('users').doc(masqueradeEmail.toLowerCase().trim()).get();
        }

        if (targetDoc && targetDoc.exists) {
            const targetData = targetDoc.data();
            const targetEmail = decrypt(targetData.email) || targetDoc.id;
            const originalRole = role;
            
            // Override user context for identity while preserving admin audit trail
            req.user = {
                uid: targetDoc.id,
                email: targetEmail,
                role: targetData.role || 'producer',
                adminRole: originalRole, 
                isEnabled: targetData.isEnabled,
                isMasquerading: true,
                adminEmail: decodedIdToken.email,
                firstName: decrypt(targetData.name) || '',
                lastName: decrypt(targetData.surname) || ''
            };
            console.log(`[AUTH] Masquerade SUCCESS: Acting as ${targetEmail} (${req.user.role}). Admin Role: ${req.user.adminRole}`);
        } else {
             console.warn(`[AUTH] Masquerade FAILED: Target identity not found (UID: ${masqueradeUid}, Email: ${masqueradeEmail}).`);
        }
    }

    next();
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error.message);
    res.status(403).json({ success: false, error: `Unauthorized: ${error.message}` });
  }
}

app.get('/api/temp-debug-search-sub', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('submissions').doc('CyRQKw2haW42KWShBdBP').get();
    res.json({ id: doc.id, data: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/temp-debug-search', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('proposals').doc('8mgGIrGliAnRgN0kLe0i').get();
    res.json({ id: doc.id, data: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/forgot-password', express.json(), async (req, res) => {
  try {
    const { email, destinationEmail } = req.body;
    if (!email || !destinationEmail) {
      return res.status(400).json({ success: false, error: 'Both account email and destination email are required.' });
    }

    const accountEmail = email.toLowerCase().trim();
    const destEmail = destinationEmail.toLowerCase().trim();

    // 1. Verify user exists in Firebase Auth
    try {
      await admin.auth().getUserByEmail(accountEmail);
    } catch (err) {
      console.warn(`[FORGOT_PASSWORD] User lookup failed for ${accountEmail}:`, err.message);
      return res.status(404).json({ success: false, error: 'Account email not found.' });
    }

    // 2. Generate password reset link
    const resetLink = await admin.auth().generatePasswordResetLink(accountEmail);

    // 3. Send email to the destination email address
    const mailOptions = {
      from: `"CARP Dashboard" <${process.env.EMAIL_USER}>`,
      to: destEmail,
      subject: 'Reset Password Link | Carte Blanche Deliverables',
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 2rem; background: #ffffff;">
          <h2 style="color: #008fbe; margin-top: 0;">Reset Your Password</h2>
          <p>You requested a password reset for your account (<b>${accountEmail}</b>) on Carte Blanche Deliverables.</p>
          <p>Please click the button below to reset your password:</p>
          <p style="margin: 2rem 0; text-align: center;">
            <a href="${resetLink}" style="background: #008fbe; color: #ffffff; text-decoration: none; padding: 0.8rem 2rem; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          </p>
          <p style="font-size: 0.85rem; color: #666;">Or copy and paste this link into your browser:</p>
          <p style="font-size: 0.8rem; word-break: break-all; color: #008fbe;"><a href="${resetLink}">${resetLink}</a></p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 2rem 0;" />
          <p style="font-size: 0.8rem; color: #666;">If you did not request this password reset, you can safely ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[FORGOT_PASSWORD] Sent reset link for ${accountEmail} to ${destEmail}`);
    res.json({ success: true, message: 'Reset email sent successfully.' });
  } catch (error) {
    console.error('[FORGOT_PASSWORD] Error generating/sending link:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Webhook for external submissions (e.g. Microsoft Power Automate)
 */
app.post('/api/submissions/external', express.json({ limit: '15mb' }), async (req, res) => {
  try {
    // 1. Verify API Key
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.MICROSOFT_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API Key.' });
    }

    const { senderEmail, senderName, subject, body, bodyHtml, attachments } = req.body;

    if (!senderEmail || !subject || !body) {
      return res.status(400).json({ success: false, error: 'senderEmail, subject, and body are required.' });
    }

    console.log(`[EXTERNAL_WEBHOOK] Received submission from ${senderEmail} - Subject: "${subject}"`);

    // 2. Classify submission type
    const tipoffData = parseDstvTipOff(subject, body);
    const formType = tipoffData ? 'dstv_tipoff' : 'email_submission';
    console.log(`[EXTERNAL_WEBHOOK] Classifying as ${formType}`);

    // 3. Process attachments
    const storedAttachments = [];
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        if (!att.filename || !att.contentType || !att.contentBytes) {
          console.warn('[EXTERNAL_WEBHOOK] Skipping invalid attachment object:', att);
          continue;
        }

        try {
          const buffer = Buffer.from(att.contentBytes, 'base64');
          const safeName = att.filename.replace(/[^a-zA-Z0-9_\-.]/g, '');
          const storagePath = `submissions/${formType}/${Date.now()}_${safeName}`;
          const encryptedBuf = encryptBuffer(buffer);

          await defaultBucket.file(storagePath).save(encryptedBuf, {
            contentType: att.contentType,
          });

          storedAttachments.push({
            filename: att.filename,
            contentType: att.contentType,
            storagePath
          });

          console.log(`[EXTERNAL_WEBHOOK] Uploaded and encrypted attachment: ${storagePath}`);
        } catch (uploadErr) {
          console.error(`[EXTERNAL_WEBHOOK] Failed to process attachment ${att.filename}:`, uploadErr);
        }
      }
    }

    // 4. Save to Firestore
    const fromName = senderName || senderEmail.split('@')[0];
    const submissionDoc = {
      formType,
      submittedAt: admin.firestore.Timestamp.fromDate(new Date()),
      importedAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedByEmail: senderEmail,
      submittedByName: fromName,
      subject,
      body,
      bodyHtml: bodyHtml || '',
      attachments: storedAttachments,
      isEmailImport: true,
      source: 'microsoft_webhook',
    };

    if (formType === 'dstv_tipoff' && tipoffData) {
      submissionDoc.tipoffDetails = tipoffData;
    }

    const docRef = await admin.firestore().collection('submissions').add(submissionDoc);
    console.log(`[EXTERNAL_WEBHOOK] Saved to Firestore: submissions/${docRef.id}`);

    // 5. Send alerts to relevant users
    try {
      const notifyType = formType === 'dstv_tipoff' ? 'dstv_tipoff' : 'email_submission';
      const notifySubject = formType === 'dstv_tipoff'
        ? `New DStv Tip-Off received from ${fromName}`
        : `New Email Submission: ${subject}`;
      const notifyHtml = `
        <div style="font-family:sans-serif;line-height:1.6;color:#333">
          <h2 style="color:#c00">📩 ${formType === 'dstv_tipoff' ? 'DStv Tip-Off' : 'Email Submission'}</h2>
          <ul>
            <li><b>From:</b> ${fromName} &lt;${senderEmail}&gt;</li>
            <li><b>Subject:</b> ${subject}</li>
            <li><b>Received:</b> ${new Date().toLocaleString('en-ZA')}</li>
            ${storedAttachments.length > 0 ? `<li><b>Attachments:</b> ${storedAttachments.map(a => a.filename).join(', ')}</li>` : ''}
          </ul>
          ${tipoffData ? `
          <h3>Tip Details</h3>
          <ul>
            <li><b>Name:</b> ${tipoffData.name} ${tipoffData.lastName}</li>
            <li><b>Email:</b> ${tipoffData.email}</li>
            <li><b>Phone:</b> ${tipoffData.phone}</li>
            <li><b>Location:</b> ${tipoffData.location}</li>
            <li><b>Story:</b> ${tipoffData.story}</li>
          </ul>` : `<blockquote style="background:#f4f4f4;padding:10px;border-left:4px solid #ccc">${body.substring(0, 800)}</blockquote>`}
          <p style="font-size:0.8rem;color:#999">View full submission in the CARP Dashboard.</p>
        </div>
      `;
      await notifyRelevantUsers(notifyType, notifySubject, notifyHtml);
    } catch (notifyErr) {
      console.error('[EXTERNAL_WEBHOOK] Notification error:', notifyErr);
    }

    res.status(200).json({ success: true, firestoreDocId: docRef.id });
  } catch (err) {
    console.error('[EXTERNAL_WEBHOOK] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use(validateFirebaseIdToken);

/**
 * Fetch viewer submissions (email submissions and DStv tip-offs)
 * Accessible by all logged-in users
 */
app.get('/api/viewer-submissions', async (req, res) => {
  try {
    const BATCH_SIZE = Math.min(parseInt(req.query.limit) || 200, 500);
    const afterDocId = req.query.after;

    let query = admin.firestore().collection('submissions')
      .where('formType', 'in', ['email_submission', 'dstv_tipoff'])
      .orderBy('submittedAt', 'desc')
      .limit(BATCH_SIZE);

    // Cursor-based pagination: start after the given document
    if (afterDocId) {
      const cursorDoc = await admin.firestore().collection('submissions').doc(afterDocId).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const submissions = snapshot.docs.map(doc => {
      const data = doc.data();
      const bodyPreview = data.body ? data.body.substring(0, 300) : '';
      delete data.body;
      delete data.attachments;
      return {
        id: doc.id,
        bodyPreview,
        ...data
      };
    });

    // Return the last doc's ID so the client can fetch the next page
    const nextCursor = snapshot.docs.length === BATCH_SIZE
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

    res.set('Cache-Control', 'private, max-age=30'); // allow 30s browser cache
    res.json({ success: true, submissions, nextCursor });
  } catch (error) {
    console.error('[API] fetch viewer-submissions failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get('/api/viewer-submissions/details', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'ID required' });
    const doc = await admin.firestore().collection('submissions').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    
    res.json({ success: true, submission: { id: doc.id, ...doc.data() } });
  } catch (error) {
    console.error('[API] fetch details failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper to send spam report email to SuperAdmin Lezanne
 */
async function sendSpamReportEmail(submission, reporterEmail) {
  const subject = `[Spam Report] Submission Reported as Spam: "${submission.subject || '(No Subject)'}"`;
  const html = `
    <p>A viewer submission has been reported as spam by user <strong>${reporterEmail}</strong>.</p>
    <p><strong>Submission Details:</strong></p>
    <ul>
      <li><strong>Sender Name:</strong> ${submission.submittedByName || 'Unknown'}</li>
      <li><strong>Sender Email:</strong> ${submission.submittedByEmail || 'No Email'}</li>
      <li><strong>Subject:</strong> ${submission.subject || '(No Subject)'}</li>
      <li><strong>Type:</strong> ${submission.formType || ''}</li>
      <li><strong>Date Received:</strong> ${submission.submittedAt ? (submission.submittedAt._seconds ? new Date(submission.submittedAt._seconds * 1000).toLocaleString() : new Date(submission.submittedAt).toLocaleString()) : '—'}</li>
    </ul>
    <p>Please block this sender address manually from making future submissions.</p>
  `;
  const targetEmail = 'lezanne@carteblanche.co.za';

  try {
    let sentViaGraph = false;
    if (process.env.MICROSOFT_CLIENT_ID) {
      try {
        await sendEmailViaGraph(subject, html, targetEmail, '');
        console.log(`[SPAM_REPORT] Notification sent via Graph API to ${targetEmail}`);
        sentViaGraph = true;
      } catch (graphErr) {
        console.error(`[SPAM_REPORT] Graph API send failed: ${graphErr.message}. Falling back to legacy SMTP...`);
      }
    }

    if (!sentViaGraph) {
      const mailOptions = {
        from: `"CARP Dashboard" <${process.env.EMAIL_USER}>`,
        to: targetEmail,
        subject: subject,
        html: html
      };
      try {
        await transporter.sendMail(mailOptions);
        console.log(`[SPAM_REPORT] Notification sent via SMTP to ${targetEmail}`);
      } catch (smtpErr) {
        console.error(`[SPAM_REPORT] SMTP send failed: ${smtpErr.message}. Trying Office 365 SMTP...`);
        const o365Transporter = nodemailer.createTransport({
          host: 'smtp.office365.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.IMAP_USER || 'story@combinedartists.co.za',
            pass: process.env.IMAP_PASSWORD
          }
        });
        const o365MailOptions = {
          from: `"CARP Dashboard" <${process.env.IMAP_USER || 'story@combinedartists.co.za'}>`,
          to: targetEmail,
          subject: subject,
          html: html
        };
        await o365Transporter.sendMail(o365MailOptions);
        console.log(`[SPAM_REPORT] Notification sent via Office 365 SMTP to ${targetEmail}`);
      }
    }
  } catch (err) {
    console.error('[SPAM_REPORT] Failed to send email notification:', err.message);
  }
}

/**
 * Mark a viewer submission as useful (Under Investigation)
 */
app.post('/api/viewer-submissions/mark-useful', express.json(), async (req, res) => {
  try {
    const { id, useful } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID is required' });

    const docRef = admin.firestore().collection('submissions').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Submission not found' });

    const updateData = {};
    if (useful) {
      const name = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
      updateData.useful = true;
      updateData.actionedBy = {
        name: name,
        email: req.user.email,
        at: new Date()
      };
    } else {
      updateData.useful = false;
      updateData.actionedBy = admin.firestore.FieldValue.delete();
    }

    await docRef.update(updateData);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] mark-useful failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Report a viewer submission as spam (Notifies Lezanne)
 */
app.post('/api/viewer-submissions/report-spam', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID is required' });

    const docRef = admin.firestore().collection('submissions').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Submission not found' });

    const submission = doc.data();
    await docRef.update({
      reportedSpam: true,
      status: 'spam'
    });

    await sendSpamReportEmail({ id, ...submission }, req.user.email);

    res.json({ success: true });
  } catch (error) {
    console.error('[API] report-spam failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post('/api/viewer-submissions/resolve', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID is required' });

    const docRef = admin.firestore().collection('submissions').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Submission not found' });

    const name = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
    await docRef.update({
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: {
        name: name,
        email: req.user.email
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[API] resolve submission failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Decryption Proxy for Submissions Storage Files (Accessible by all logged in users)
 */
app.get('/api/get-submission-file', async (req, res) => {
  try {
    const storagePath = req.query.path;
    if (!storagePath) return res.status(400).json({ success: false, error: 'Path required' });
    
    // Safety check: ensure paths are only within submissions directory
    if (!storagePath.startsWith('submissions/')) {
      return res.status(403).json({ success: false, error: 'Forbidden: Can only access submissions files.' });
    }

    console.log(`[STORAGE] Decrypting file for user: ${storagePath}`);
    const [fileBuffer] = await defaultBucket.file(storagePath).download();
    const decryptedBuffer = decryptBuffer(fileBuffer);

    // Set appropriate MIME type or fallback
    const ext = storagePath.split('.').pop().toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === 'pdf') mimeType = 'application/pdf';
    else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'txt') mimeType = 'text/plain';

    res.setHeader('Content-Type', mimeType);
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${storagePath.split('/').pop()}"`);
    res.send(decryptedBuffer);
  } catch (error) {
    console.error('File decryption failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * Helper to parse multipart form data
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    try {
      const bb = busboy({ headers: req.headers });
      const fields = {};
      const files = [];

      bb.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType } = info;
        const chunks = [];
        file.on('data', (data) => chunks.push(data));
        file.on('end', () => {
          files.push({
            fieldname,
            filename,
            buffer: Buffer.concat(chunks),
            mimeType
          });
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

      bb.on('finish', () => resolve({ fields, files, file: files[0] }));
      bb.on('error', (err) => reject(err));
      if (req.rawBody) bb.end(req.rawBody); else req.pipe(bb);
    } catch (err) { reject(err); }
  });
}


function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Date';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

/**
 * SHARED: Save to Storage and Firestore (Single File)
 */
async function processStorageAndFirestore(req, formType, subfolder, filename, file, metadata) {
  const timestamp = Date.now();
  const storagePath = `submissions/${subfolder}/${timestamp}_${filename}`;
  
  console.log(`[STORAGE] Encrypting ${filename} before upload...`);
  const encryptedBuffer = encryptBuffer(file.buffer);

  await defaultBucket.file(storagePath).save(encryptedBuffer, {
    contentType: file.mimeType || 'application/pdf',
    metadata: { firebaseStorageDownloadTokens: timestamp.toString() }
  });

  // Handle sensitive metadata
  const encryptedMetadata = { ...metadata };
  if (formType === 'proposal') {
    if (encryptedMetadata.caseStudies) encryptedMetadata.caseStudies = encrypt(JSON.stringify(encryptedMetadata.caseStudies));
    if (encryptedMetadata.experts) encryptedMetadata.experts = encrypt(JSON.stringify(encryptedMetadata.experts));
  }

  const docRef = await admin.firestore().collection('submissions').add({
    formType,
    filename,
    storagePath,
    submittedBy: req.user.uid,
    submittedByEmail: req.user.email,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...encryptedMetadata
  });
  return { firestoreDocId: docRef.id, storagePath };
}

/**
 * SHARED: Save multiple files to Storage and record in Firestore
 */
async function processMultiFileStorageAndFirestore(req, formType, subfolder, files, metadata) {
  const timestamp = Date.now();
  const submissionPath = `submissions/${subfolder}/${timestamp}`;
  const fileRecords = [];

  for (const file of files) {
    const storagePath = `${submissionPath}/${file.filename}`;
    
    // Encrypt the file buffer before saving
    console.log(`[STORAGE] Encrypting ${file.filename} before upload...`);
    const encryptedBuffer = encryptBuffer(file.buffer);

    await defaultBucket.file(storagePath).save(encryptedBuffer, {
      contentType: file.mimeType || 'application/pdf',
      metadata: { firebaseStorageDownloadTokens: timestamp.toString() }
    });
    fileRecords.push({
      filename: file.filename,
      storagePath: storagePath,
      fieldname: file.fieldname
    });
    console.log(`[STORAGE] Uploaded (Encrypted) ${file.filename} to ${storagePath}`);
  }

  // Encrypt sensitive metadata if applicable
  const encryptedMetadata = { ...metadata };
  if (formType === 'proposal') {
    if (encryptedMetadata.caseStudies) {
      encryptedMetadata.caseStudies = encrypt(JSON.stringify(encryptedMetadata.caseStudies));
    }
    if (encryptedMetadata.experts) {
      encryptedMetadata.experts = encrypt(JSON.stringify(encryptedMetadata.experts));
    }
  }

  // Save Metadata to Firestore
  const docRef = await admin.firestore().collection('submissions').add({
    formType,
    files: fileRecords,
    submissionPath,
    submittedBy: req.user.uid,
    submittedByEmail: req.user.email,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...encryptedMetadata
  });
  
  return { firestoreDocId: docRef.id, submissionPath, fileRecords };
}

// ------------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------------

app.post('/api/send-control-sheet', async (req, res) => {
  try {
    const { fields, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No PDF provided' });

    const { txDate, season, episode, uid, duration } = fields;
    const displayDate = formatDisplayDate(txDate);
    const filename = `Carte Blanche - FCC - ${uid}.pdf`;

    // 1 & 2. Run Database/Storage and Email notifications in PARALLEL
    const [dbResult] = await Promise.all([
      processStorageAndFirestore(
        req, 'control_sheet', 'control_sheet', filename, file, 
        { 
          season, episode, txDate, uid, duration, 
          stories: fields.stories || "[]",
          anchors: fields.anchors || "[]",
          segments: fields.segments || "[]"
        }
      ),
      notifyRelevantUsers(
        'control_sheet',
        `Carte Blanche - FCC - S${season} E${episode} - ${uid}`,
        `<p><b>CARTE BLANCHE</b><br><b>FINAL CONTROL SHEET</b></p>
         <ul>
           <li><b>Season:</b> ${season}</li>
           <li><b>Episode:</b> ${episode}</li>
           <li><b>TX Date:</b> ${displayDate}</li>
           <li><b>UID:</b> ${uid}</li>
           <li><b>Duration:</b> ${duration}</li>
         </ul>
         <p>The FCC sheet is attached to this email. Contact Nombuso Nkosi for any queries.</p>`,
        [{ filename, content: file.buffer, contentType: 'application/pdf' }]
      )
    ]);

    const { firestoreDocId, storagePath } = dbResult;

    res.status(200).json({ success: true, firestoreDocId, storagePath, message: 'Control sheet processed!' });
  } catch (error) {
    console.error('Submission failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-footage-agreement', async (req, res) => {
  try {
    const { fields, files } = await parseMultipart(req);
    if (files.length === 0) return res.status(400).json({ success: false, error: 'No files provided' });

    const { tx_date, season, episode, uid_number, total_duration } = fields;
    // 1 & 2. Run Database/Storage and Email notifications in PARALLEL
    const [dbResult] = await Promise.all([
      processMultiFileStorageAndFirestore(
        req, 'episode_footage', 'episode_footage', files,
        { season, episode, txDate: tx_date, uid: uid_number, duration: total_duration, stories: fields.stories || "[]" }
      ),
      notifyRelevantUsers(
        'episode_footage',
        `Carte Blanche - FDL - S${season} E${episode} - ${uid_number}`,
        `<p><b>CARTE BLANCHE</b><br><b>MASTER FOOTAGE DECLARATION (FDL)</b></p>
         <ul>
           <li><b>Season:</b> ${season}</li>
           <li><b>Episode:</b> ${episode}</li>
           <li><b>TX Date:</b> ${tx_date}</li>
           <li><b>UID:</b> ${uid_number}</li>
           <li><b>Duration:</b> ${total_duration}</li>
         </ul>
         <p>The Master Footage Declaration is attached to this email. Contact Nombuso Nkosi for any queries.</p>`,
        files.map(f => ({
          filename: f.filename,
          content: f.buffer,
          contentType: f.mimeType
        }))
      )
    ]);

    const { firestoreDocId, fileRecords } = dbResult;

    res.status(200).json({ success: true, firestoreDocId });
  } catch (error) {
    console.error('Submission failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/list-producers', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('users')
      .where('isEnabled', '==', true)
      .get();

    // Deduplicate: legacy docs use email as key, new docs use UID.
    // Prefer the UID-keyed doc (does not look like an email address).
    const seenEmails = new Map(); // email -> best doc entry
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      const email = decrypt(d.email) || '';
      const name = decrypt(d.name) || 'N/A';
      const surname = decrypt(d.surname) || '';
      const isLegacyKey = doc.id.includes('@'); // old format: doc ID was the email

      if (!seenEmails.has(email)) {
        seenEmails.set(email, { id: doc.id, name, surname, isLegacyKey });
      } else {
        // Prefer the non-legacy (UID-based) document
        const existing = seenEmails.get(email);
        if (existing.isLegacyKey && !isLegacyKey) {
          seenEmails.set(email, { id: doc.id, name, surname, isLegacyKey });
        }
      }
    });

    const producers = Array.from(seenEmails.values())
      .map(({ id, name, surname }) => ({ id, name, surname }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, producers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/insert-footage-stories', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const isAdmin = AUTHORIZED_ADMIN_ROLES.includes(req.user.role);
    
    // 1. Fetch insert_footage submissions
    let subQuery = admin.firestore().collection('submissions')
      .where('formType', '==', 'insert_footage');

    if (!all) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      subQuery = subQuery.where('submittedAt', '>=', ninetyDaysAgo);
    }

    if (!isAdmin) {
      subQuery = subQuery.where('submittedBy', '==', req.user.uid);
    }

    const subSnapshot = await subQuery.orderBy('submittedAt', 'desc').get();

    // 2. Fetch accepted and paid proposals (filter date in-memory to avoid composite index requirement)
    const propQuery = admin.firestore().collection('proposals')
      .where('status', 'in', ['accepted', 'paid']);

    const propSnapshot = await propQuery.get();

    // 3. Combine and deduplicate (prioritizing submissions with footage)
    const uniqueMap = new Map();
    
    subSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const name = data.storyName || data.story_name || data.story_title || data.storyTitle || 'Unnamed Story';
      const key = `${name.toLowerCase().trim()}_${data.commissionNumber || ''}`;
      uniqueMap.set(key, { 
        id: doc.id, 
        storyName: name,
        commissionNumber: data.commissionNumber || '',
        submittedAt: data.submittedAt,
        footage: data.footage || [],
        isProposal: false
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
          commissionNumber: data.commissionNumber || '',
          submittedAt: data.submittedAt,
          footage: [],
          isProposal: true
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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/submit-standalone-script', express.json(), async (req, res) => {
  try {
    const { story_title, commissionNumber, duration, finalScript } = req.body;
    
    const docData = {
      formType: 'final_script',
      story_title,
      commissionNumber,
      duration,
      details: {
        finalScript
      },
      submittedBy: req.user.uid,
      submittedByEmail: req.user.email,
      submittedByName: req.user.firstName || '',
      submittedBySurname: req.user.lastName || '',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending' // Standalone scripts are pending review/deliverable status
    };

    const docRef = await admin.firestore().collection('submissions').add(docData);
    
    await notifyRelevantUsers(
        'final_script',
        `Final Script: ${story_title} (#${commissionNumber})`,
        `<p>A new <b>Final Script</b> has been submitted for: <b>${story_title}</b>.</p>
         <p><b>Producer:</b> ${req.user.firstName} ${req.user.lastName}<br><b>Commission #:</b> ${commissionNumber}</p>
         <p>View details in the Dashboard.</p>`
    );

    res.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Standalone script submission failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-insert-footage', async (req, res) => {
  try {
    const { fields, files } = await parseMultipart(req);
    if (files.length === 0) return res.status(400).json({ success: false, error: 'No files provided' });

    const storyName = Array.isArray(fields.story_name) ? fields.story_name[0] : fields.story_name;
    const commissionNumber = Array.isArray(fields.commission_number) ? fields.commission_number[0] : fields.commission_number;
    const producerName = Array.isArray(fields.producer_name) ? fields.producer_name[0] : fields.producer_name;
    const deliveryDate = Array.isArray(fields.delivery_date) ? fields.delivery_date[0] : fields.delivery_date;
    const projectId = Array.isArray(fields.projectId) ? fields.projectId[0] : fields.projectId;

    // Construct structured footage array (already handles array fields)
    const footage = [];
    const types = Array.isArray(fields['type[]']) ? fields['type[]'] : [fields['type[]'] || 'Video'];
    const clipNames = Array.isArray(fields['clip_name[]']) ? fields['clip_name[]'] : [fields['clip_name[]'] || ''];
    const descriptions = Array.isArray(fields['description[]']) ? fields['description[]'] : [fields['description[]'] || ''];
    const sources = Array.isArray(fields['source[]']) ? fields['source[]'] : [fields['source[]'] || ''];
    const contacts = Array.isArray(fields['contact[]']) ? fields['contact[]'] : [fields['contact[]'] || ''];
    const agreements = Array.isArray(fields['agreement[]']) ? fields['agreement[]'] : [fields['agreement[]'] || 'No'];
    const tcInList = Array.isArray(fields['tc_in[]']) ? fields['tc_in[]'] : [fields['tc_in[]'] || ''];
    const tcOutList = Array.isArray(fields['tc_out[]']) ? fields['tc_out[]'] : [fields['tc_out[]'] || ''];
    const durations = Array.isArray(fields['duration[]']) ? fields['duration[]'] : [fields['duration[]'] || ''];
    const licenceReqList = Array.isArray(fields['licence_req[]']) ? fields['licence_req[]'] : [fields['licence_req[]'] || 'No'];
    const licencePeriodList = Array.isArray(fields['licence_period[]']) ? fields['licence_period[]'] : [fields['licence_period[]'] || ''];
    const resaleList = Array.isArray(fields['resale[]']) ? fields['resale[]'] : [fields['resale[]'] || 'No'];

    for (let i = 0; i < types.length; i++) {
        if (clipNames[i] || descriptions[i]) {
          footage.push({
            type: types[i],
            clip_name: clipNames[i],
            description: descriptions[i],
            source: sources[i],
            contact: encrypt(contacts[i]), // [ENCRYPTED]
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
    // Check for existing footage declaration
    let existingQuery = admin.firestore().collection('submissions')
        .where('formType', '==', 'insert_footage');
    
    if (projectId) {
        existingQuery = existingQuery.where('projectId', '==', projectId);
    } else if (commissionNumber && storyName) {
        existingQuery = existingQuery.where('commissionNumber', '==', commissionNumber)
                                     .where('storyName', '==', storyName);
    }

    const existingDocs = await existingQuery.limit(1).get();
    if (!existingDocs.empty) {
        return res.status(409).json({ 
            success: false, 
            error: 'A footage declaration already exists for this story. Please return to the proposal page and click Edit instead.' 
        });
    }

    const { firestoreDocId } = await processMultiFileStorageAndFirestore(
      req, 'insert_footage', 'insert_footage', files,
      { 
        storyName, 
        commissionNumber,
        producerName,
        deliveryDate,
        footage: footage,
        projectId: projectId || null
      }
    );

    // [NEW] Immediately link to proposal to avoid indexing delays
    if (projectId) {
        try {
            await admin.firestore().collection('proposals').doc(projectId).update({
                hasFootage: true,
                footageId: firestoreDocId,
                lastFootageUpdate: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[LINK] Linked footage ${firestoreDocId} to proposal ${projectId}`);
        } catch (linkErr) {
            console.error(`[LINK] Failed to link to proposal: ${linkErr.message}`);
        }
    }

    // [UPDATED] Send to relevant users based on preferences
    await notifyRelevantUsers(
        'insert_footage',
        `Insert Footage Declaration: ${storyName} (#${commissionNumber})`,
        `<p>A new <b>Footage Declaration</b> has been submitted for: <b>${storyName}</b>.</p>
         <p><b>Producer:</b> ${producerName}<br><b>Commission #:</b> ${commissionNumber}</p>
         <p>The PDF declaration is attached. Supporting documents are available in the Dashboard.</p>`,
        files.filter(f => f.fieldname === 'declaration').map(f => ({ filename: f.filename, content: f.buffer }))
    );

    res.status(200).json({ success: true, firestoreDocId });
  } catch (error) {
    console.error('Submission failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/get-submission/:id', async (req, res) => {
  try {
    let docRef = admin.firestore().collection('submissions').doc(req.params.id);
    let doc = await docRef.get();
    
    if (!doc.exists) {
      docRef = admin.firestore().collection('proposals').doc(req.params.id);
      doc = await docRef.get();
    }
    
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    
    const data = doc.data();

    // Decrypt details if present
    if (data.details) {
        data.details = decryptCallSheet(data.details);
    }

    const isAdmin = hasAdminAccess(req.user);
    const isOwner = data.submittedBy === req.user.uid || (req.user.email && data.submittedBy === req.user.email.toLowerCase());
    const isProducer = (req.user.role || '').toLowerCase() === 'producer';

    if (!isOwner && !isAdmin && !isProducer) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // --- REDACT SENSITIVE INFO FOR NON-OWNER PRODUCERS ---
    if (!isOwner && !isAdmin && isProducer) {
        data._isRestrictedView = true;
        
        // Fields to exclude:
        delete data.commissionNumber;
        delete data.locations;
        delete data.country;
        delete data.province;
        delete data.extra_budget;
        delete data.budgetItems;
        delete data.caseStudies;
        if (data.details && data.details.finalScript) {
            const fs = data.details.finalScript;
            delete data.details;
            data.details = { finalScript: fs };
        } else {
            delete data.details; // Production Details (contains phones/IDs and specific crew)
        }
        
        if (data.acceptanceDetails) {
            delete data.acceptanceDetails.deliveryDate;
        }
        
        // We keep: story_title, one_liner, summary, status, submittedAt, submittedByName, etc.
        console.log(`[AUTH] Restricted view served to ${req.user.email} for proposal ${req.params.id}`);
    }

    // --- FETCH SUBMITTER NAME ---
    if (data.submittedBy) {
        try {
            const userDoc = await admin.firestore().collection('users').doc(data.submittedBy).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                data.submittedByName = decrypt(userData.name);
                data.submittedBySurname = decrypt(userData.surname);
            }
        } catch (nameError) {
            console.warn(`[API] Failed to resolve submitter name: ${nameError.message}`);
        }
    }
    
    // Decrypt fields
    if (data.caseStudies && data.caseStudies._encrypted) {
      try { data.caseStudies = JSON.parse(decrypt(data.caseStudies)); } catch (e) {}
    }
    if (data.experts && data.experts._encrypted) {
      try { data.experts = JSON.parse(decrypt(data.experts)); } catch (e) {}
    }

    // Decrypt footage contacts
    if (data.footage && Array.isArray(data.footage)) {
      data.footage.forEach(f => {
        if (f.contact && f.contact._encrypted) {
          f.contact = decrypt(f.contact);
        }
      });
    }

    // --- FETCH LINKED ASSETS ---
    let linkedAssets = [];
    if (doc.ref.parent.id === 'proposals' || data.projectId) {
        const projectId = doc.ref.parent.id === 'proposals' ? doc.id : data.projectId;
        const assetsSnapshot = await admin.firestore().collection('submissions')
            .where('projectId', '==', projectId)
            .orderBy('submittedAt', 'desc')
            .get();
        linkedAssets = assetsSnapshot.docs.map(assetDoc => {
            const assetData = assetDoc.data();
            return {
                id: assetDoc.id,
                formType: assetData.formType,
                submittedAt: assetData.submittedAt,
                files: assetData.files || []
            };
        });
    }

    res.json({ 
        success: true, 
        submission: { id: doc.id, ...data },
        linkedAssets: linkedAssets
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/update-submission', async (req, res) => {
  try {
    const { fields, files } = await parseMultipart(req);
    const { id, formType } = fields;
    
    const docRef = admin.firestore().collection('submissions').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    
    const data = doc.data();
    const isAdmin = AUTHORIZED_ADMIN_ROLES.includes(req.user.role);
    if (data.submittedBy !== req.user.uid && !isAdmin) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const timestamp = Date.now();
    const submissionPath = data.submissionPath || `submissions/${formType}/${timestamp}`;
    let newFileRecords = [...(data.files || [])];

    // Upload any new files
    for (const file of files) {
      const storagePath = `${submissionPath}/${file.filename}`;
      
      console.log(`[STORAGE] Encrypting ${file.filename} before upload...`);
      const encryptedBuffer = encryptBuffer(file.buffer);

      await defaultBucket.file(storagePath).save(encryptedBuffer, {
        contentType: file.mimeType || 'application/pdf'
      });
      newFileRecords.push({
        filename: file.filename,
        storagePath: storagePath,
        fieldname: file.fieldname
      });
    }

    // Update Metadata
    const updateData = {
      files: newFileRecords,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Pass through updated fields
    if (formType === 'insert_footage') {
      const footage = [];
      const types = Array.isArray(fields['type[]']) ? fields['type[]'] : [fields['type[]'] || 'Video'];
      const clipNames = Array.isArray(fields['clip_name[]']) ? fields['clip_name[]'] : [fields['clip_name[]'] || ''];
      const descriptions = Array.isArray(fields['description[]']) ? fields['description[]'] : [fields['description[]'] || ''];
      const sources = Array.isArray(fields['source[]']) ? fields['source[]'] : [fields['source[]'] || ''];
      const contacts = Array.isArray(fields['contact[]']) ? fields['contact[]'] : [fields['contact[]'] || ''];
      const agreements = Array.isArray(fields['agreement[]']) ? fields['agreement[]'] : [fields['agreement[]'] || 'No'];
      const tcInList = Array.isArray(fields['tc_in[]']) ? fields['tc_in[]'] : [fields['tc_in[]'] || ''];
      const tcOutList = Array.isArray(fields['tc_out[]']) ? fields['tc_out[]'] : [fields['tc_out[]'] || ''];
      const durations = Array.isArray(fields['duration[]']) ? fields['duration[]'] : [fields['duration[]'] || ''];
      const licenceReqList = Array.isArray(fields['licence_req[]']) ? fields['licence_req[]'] : [fields['licence_req[]'] || 'No'];
      const licencePeriodList = Array.isArray(fields['licence_period[]']) ? fields['licence_period[]'] : [fields['licence_period[]'] || ''];
      const resaleList = Array.isArray(fields['resale[]']) ? fields['resale[]'] : [fields['resale[]'] || 'No'];

      // If a new declaration is uploaded, remove the old one from file records
      const hasNewDeclaration = files.some(f => f.fieldname === 'declaration');
      if (hasNewDeclaration) {
        newFileRecords = newFileRecords.filter(f => f.fieldname !== 'declaration');
        // Add new files from this upload (already happening in loop above, but we need to update records properly)
      }

      for (let i = 0; i < types.length; i++) {
          if (clipNames[i] || descriptions[i]) {
            footage.push({
              type: types[i],
              clip_name: clipNames[i],
              description: descriptions[i],
              source: sources[i],
              contact: encrypt(contacts[i]), // [ENCRYPTED]
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
      updateData.storyName = Array.isArray(fields.story_name) ? fields.story_name[0] : fields.story_name;
      updateData.commissionNumber = Array.isArray(fields.commission_number) ? fields.commission_number[0] : fields.commission_number;
      updateData.producerName = Array.isArray(fields.producer_name) ? fields.producer_name[0] : fields.producer_name;
      updateData.deliveryDate = Array.isArray(fields.delivery_date) ? fields.delivery_date[0] : fields.delivery_date;
      updateData.footage = footage;
      const projectId = Array.isArray(fields.projectId) ? fields.projectId[0] : fields.projectId;
      if (projectId) updateData.projectId = projectId;
    } else if (formType === 'episode_footage') {
      updateData.txDate = fields.tx_date;
      updateData.season = fields.season;
      updateData.episode = fields.episode;
      updateData.uid = fields.uid_number;
      updateData.duration = fields.total_duration;
    } else if (formType === 'control_sheet') {
      updateData.txDate = fields.txDate;
      updateData.season = fields.season;
      updateData.episode = fields.episode;
      updateData.uid = fields.uid;
      updateData.duration = fields.duration;
      updateData.stories = fields.stories || "[]";
      updateData.anchors = fields.anchors || "[]";
      updateData.segments = fields.segments || "[]";
    }

    await docRef.update(updateData);

    // Email logic (Just Insert Footage for now: only attach declaration)
    const isAdminUser = AUTHORIZED_ADMIN_ROLES.includes(req.user.role);
    if (formType !== 'insert_footage') {
        const mailOptions = {
          from: `"Carte Blanche Deliverables" <${process.env.EMAIL_USER}>`,
          to: process.env.TARGET_EMAIL,
          subject: `Update: S${updateData.season}E${updateData.episode} Episode Footage`,
          html: `<p>A submission has been updated.</p>`,
          attachments: files.filter(f => formType === 'episode_footage' || f.fieldname === 'pdf').map(f => ({ filename: f.filename, content: f.buffer }))
        };
        await transporter.sendMail(mailOptions);
    }

    res.json({ success: true, message: 'Updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
async function internalDeleteSubmission(id, user) {
  if (!id) throw new Error('ID required');

  // 1. Check submissions collection
  let docRef = admin.firestore().collection('submissions').doc(id);
  let doc = await docRef.get();
  let isProposal = false;

  if (!doc.exists) {
      // 2. Check proposals collection if not in submissions
      docRef = admin.firestore().collection('proposals').doc(id);
      doc = await docRef.get();
      isProposal = true;
  }
  
  if (!doc.exists) throw new Error('Record not found');
  
  const data = doc.data();
  const isAdminOrOwner = canEditProposal(data, user);
  if (!isAdminOrOwner) throw new Error('Unauthorized');

  // 3. Delete associated files from Storage (if any)
  const bucket = admin.storage().bucket();
  if (data.files && Array.isArray(data.files)) {
      for (const file of data.files) {
          if (file.storagePath) {
              try {
                  await bucket.file(file.storagePath).delete();
              } catch (err) {
                  console.warn(`[DELETE] Failed to delete file ${file.storagePath}:`, err.message);
              }
          }
      }
  } else if (data.storagePath) {
      try {
          await bucket.file(data.storagePath).delete();
      } catch (err) {
          console.warn(`[DELETE] Failed to delete file ${data.storagePath}:`, err.message);
      }
  }

  // Handle attachments in viewer submissions
  if (data.attachments && Array.isArray(data.attachments)) {
      for (const att of data.attachments) {
          if (att.storagePath) {
              try {
                  await bucket.file(att.storagePath).delete();
              } catch (err) {
                  console.warn(`[DELETE] Failed to delete attachment ${att.storagePath}:`, err.message);
              }
          }
      }
  }
  
  // 4. Delete from Firestore
  await docRef.delete();
  return isProposal;
}

app.post('/api/delete-submission', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    console.log(`[DELETE] Unified delete request for ID: ${id} by ${req.user.email}`);
    const isProposal = await internalDeleteSubmission(id, req.user);
    res.json({ success: true, message: `${isProposal ? 'Proposal' : 'Submission'} and associated files deleted successfully` });
  } catch (error) {
    console.error('[DELETE] Failed:', error);
    res.status(error.message === 'Unauthorized' ? 403 : (error.message === 'Record not found' ? 404 : 500))
       .json({ success: false, error: error.message });
  }
});

app.post('/api/delete-file', async (req, res) => {
  try {
    const { submissionId, storagePath } = req.body;
    const docRef = admin.firestore().collection('submissions').doc(submissionId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    
    const data = doc.data();
    const isAdmin = AUTHORIZED_ADMIN_ROLES.includes(req.user.role);
    if (data.submittedBy !== req.user.uid && !isAdmin) return res.status(403).json({ success: false, error: 'Unauthorized' });

    // 1. Delete from Storage
    try {
      await defaultBucket.file(storagePath).delete();
    } catch (err) { console.warn('File already gone from storage or error:', err.message); }

    // 2. Remove from Firestore array
    const newFiles = (data.files || []).filter(f => f.storagePath !== storagePath);
    await docRef.update({ files: newFiles });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/my-submissions', async (req, res) => {
  try {
    const isAdmin = AUTHORIZED_ADMIN_ROLES.includes(req.user.role);
    let query = admin.firestore().collection('submissions');
    
    if (!isAdmin) {
      query = query.where('submittedBy', '==', req.user.uid);
    }
    
    const snapshot = await query
      .orderBy('submittedAt', 'desc')
      .limit(isAdmin ? 100 : 20)
      .get();
    
    const subs = snapshot.docs.map(doc => {
      const data = doc.data();
      // Decrypt if present
      if (data.caseStudies && data.caseStudies._encrypted) {
        try { data.caseStudies = JSON.parse(decrypt(data.caseStudies)); } catch (e) {}
      }
      if (data.experts && data.experts._encrypted) {
        try { data.experts = JSON.parse(decrypt(data.experts)); } catch (e) {}
      }
      return { id: doc.id, ...data };
    });
    res.json({ success: true, submissions: subs });
  } catch (error) {
    console.error('[API] my-submissions failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * [NEW] List User Footage Declarations Mapping
 */
app.get('/api/list-user-footage', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('submissions')
      .where(admin.firestore.Filter.or(
        admin.firestore.Filter.where('submittedBy', '==', req.user.uid),
        admin.firestore.Filter.where('submittedBy', '==', req.user.email)
      ))
      .where('formType', '==', 'insert_footage')
      .get();

    const mapping = {};
    const projectMapping = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.commissionNumber) {
        mapping[data.commissionNumber] = doc.id;
      }
      if (data.projectId) {
        projectMapping[data.projectId] = doc.id;
      }
    });

    res.json({ success: true, mapping, projectMapping });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function canAccessFootage(footageDoc, user) {
    if (AUTHORIZED_ADMIN_ROLES.includes(user.role)) return true;
    if (footageDoc.submittedBy === user.uid) return true;
    
    // Fallback: check if user is the owner of the project (proposal) linked to this footage
    if (footageDoc.projectId) {
        try {
            const projectDoc = await admin.firestore().collection('proposals').doc(footageDoc.projectId).get();
            if (projectDoc.exists && projectDoc.data().submittedBy === user.uid) return true;
        } catch (e) {
            console.warn(`[AUTH] Failed to check project ownership: ${e.message}`);
        }
    }
    return false;
}

app.get('/api/list-user-scripts', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('submissions')
      .where(admin.firestore.Filter.or(
        admin.firestore.Filter.where('submittedBy', '==', req.user.uid),
        admin.firestore.Filter.where('submittedBy', '==', req.user.email)
      ))
      .where('formType', '==', 'final_script')
      .orderBy('submittedAt', 'desc')
      .get();

    const scripts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, scripts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * [NEW] Get Footage Declaration by Commission Number
 */
app.get('/api/get-footage-by-comm/:commNum', async (req, res) => {
  try {
    const commNum = req.params.commNum;
    const commNumInt = parseInt(commNum);

    const snapshot = await admin.firestore().collection('submissions')
      .where('formType', '==', 'insert_footage')
      .get();

    // Filter and Sort in JS to avoid index complexities for now
    const docs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.commissionNumber == commNum || d.commissionNumber == commNumInt)
      .sort((a, b) => (b.submittedAt?._seconds || 0) - (a.submittedAt?._seconds || 0));

    if (docs.length === 0) return res.json({ success: true, footage: null });

    if (!await canAccessFootage(docs[0], req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, footage: docs[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/get-footage-by-project/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const snapshot = await admin.firestore().collection('submissions')
      .where('projectId', '==', projectId)
      .where('formType', '==', 'insert_footage')
      .get();

    if (snapshot.empty) return res.json({ success: true, footage: null });

    const docs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt?._seconds || 0) - (a.submittedAt?._seconds || 0));

    if (!await canAccessFootage(docs[0], req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, footage: docs[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/get-footage-by-title/:storyTitle', async (req, res) => {
  try {
    const storyTitle = req.params.storyTitle;
    const snapshot = await admin.firestore().collection('submissions')
      .where('formType', '==', 'insert_footage')
      .where('storyName', '==', storyTitle)
      .get();

    if (snapshot.empty) return res.json({ success: true, footage: null });

    const docs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt?._seconds || 0) - (a.submittedAt?._seconds || 0));

    if (!await canAccessFootage(docs[0], req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, footage: docs[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- PROPOSALS LOGIC ---

async function getNextCommissionNumber() {
    const counterRef = admin.firestore().collection('metadata').doc('projectCounter');
    return admin.firestore().runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextNum = 6915;
        if (counterDoc.exists) {
            nextNum = Math.max(counterDoc.data().nextCommissionNumber, 6915);
        }
        transaction.set(counterRef, { nextCommissionNumber: nextNum + 1 });
        return nextNum;
    });
}

/**
 * [NEW] Secure File Retrieval for Producers
 */
app.get('/api/get-file', async (req, res) => {
  try {
    const { id, path } = req.query;
    if (!id || !path) return res.status(400).json({ success: false, error: 'Submission ID and Path required' });

    // 1. Get Submission to check ownership
    const doc = await admin.firestore().collection('submissions').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Submission not found' });
    
    const data = doc.data();
    const isAdmin = hasAdminAccess(req.user);
    if (data.submittedBy !== req.user.uid && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // 2. Verify file belongs to this submission
    const fileExists = (data.files || []).some(f => f.storagePath === path) || data.storagePath === path;
    if (!fileExists) return res.status(404).json({ success: false, error: 'File not found in this submission' });

    console.log(`[STORAGE] Decrypting file for user ${req.user.email}: ${path}`);
    const [fileBuffer] = await admin.storage().bucket().file(path).download();
    const decryptedBuffer = decryptBuffer(fileBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    // Filename from path
    const filename = path.split('/').pop();
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(decryptedBuffer);
  } catch (error) {
    console.error('File retrieval failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/submit-proposal', express.json(), async (req, res) => {
  try {
    let { id, ...payload } = req.body;

    if (payload.story_title && payload.story_title.trim().length > 20) {
      return res.status(400).json({ success: false, error: 'Story title cannot exceed 20 characters.' });
    }
    
    // Sensitivity defaults
    payload.isSensitive = payload.isSensitive === true || payload.isSensitive === 'true';
    if (!payload.permittedUids) payload.permittedUids = [];

    // Encrypt sensitive fields if present
    if (payload.caseStudies) {
      payload.caseStudies = encrypt(JSON.stringify(payload.caseStudies));
    }
    if (payload.experts) {
      payload.experts = encrypt(JSON.stringify(payload.experts));
    }

    let isNewSubmission = false;
    const finalStatus = payload.status || 'pending';

    if (id) {
        // Update Existing
        const docRef = admin.firestore().collection('proposals').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
        if (!canEditProposal(doc.data(), req.user)) return res.status(403).json({ success: false, error: 'Unauthorized' });

        let updatedPayload = { ...payload };
        const currentStatus = doc.data().status;
        
        // Prevent downgrading an accepted or paid story back to pending or draft
        if (currentStatus === 'accepted' || currentStatus === 'paid') {
            updatedPayload.status = currentStatus; 
        }

        if (currentStatus === 'draft' && updatedPayload.status === 'pending') {
            isNewSubmission = true;
        }

        await docRef.update({
            ...updatedPayload,
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        // Create New
        if (finalStatus === 'pending') {
            isNewSubmission = true;
        }
        const proposalData = {
            ...payload,
            submittedBy: req.user.uid,
            submittedByEmail: req.user.email,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: finalStatus,
            commissionNumber: null
        };
        const docRef = await admin.firestore().collection('proposals').add(proposalData);
        id = docRef.id;
    }

    if (isNewSubmission) {
         await notifyRelevantUsers(
             'proposal',
             `New Proposal: ${payload.story_title} - ${req.user.firstName} ${req.user.lastName}`,
             `<p>${req.user.firstName} ${req.user.lastName} has submitted a new story proposal for review.</p>
              <p><b>PROPOSAL SUMMARY</b></p>
              <ul>
                <li><b>Story Title:</b> ${payload.story_title}</li>
                <li>${payload.one_liner || 'N/A'}</li>
                <li><b>Submitted By:</b> ${req.user.firstName} ${req.user.lastName}</li>
              </ul>
              <hr/>
              <p><a href="https://cb-deliverables.web.app/proposal.html?id=${id}&view=admin">Approve / Reject Story Proposal</a></p>`
         );
    }

    return res.json({ success: true, id: id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/handle-proposal', express.json(), async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super-admin', 'editorial-production'];
    if (!hasAdminAccess(req.user)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin/Production access required.' });
    }

    const { id, action, manualCommissionNumber, storyType, duration, deliveryDate, rate, contractAccepted, txDate, presenter, legal_req, decommissionReason, liveStudioInterview, liveStudioSeason, liveStudioEpisode } = req.body; // action: 'accept' | 'reject' | 'pay' | 'decommission'
    const docRef = admin.firestore().collection('proposals').doc(id);
    
    if (action === 'accept') {
      const existingDoc = await docRef.get();
      const existingData = existingDoc.data();
      
      let commissionNumber = manualCommissionNumber;
      let finalAcceptedAt = admin.firestore.FieldValue.serverTimestamp();
      const wasAlreadyAccepted = existingData && (existingData.status === 'accepted' || existingData.status === 'paid');

      if (wasAlreadyAccepted) {
          // If already accepted, keep existing commission number and timestamp unless manual override
          commissionNumber = manualCommissionNumber || existingData.commissionNumber;
          finalAcceptedAt = existingData.acceptedAt || finalAcceptedAt;
      } else if (!commissionNumber) {
          commissionNumber = await getNextCommissionNumber();
      }
      
      const updateData = {
        status: 'accepted',
        commissionNumber: commissionNumber,
        acceptedAt: finalAcceptedAt,
        acceptanceDetails: {
            duration: duration || null,
            deliveryDate: deliveryDate || null,
            rate: rate || null,
            contractAccepted: contractAccepted || false,
            acceptedBy: req.user.email,
            presenter: presenter || null,
            legal_req: legal_req || null,
            liveStudioInterview: liveStudioInterview || false,
            liveStudioSeason: liveStudioSeason || null,
            liveStudioEpisode: liveStudioEpisode || null
        }
      };

      await docRef.update(updateData);

      // --- EMAIL NOTIFICATION FOR NEW COMMISSION ---
      if (!wasAlreadyAccepted) {
          try {
              const producerEmail = existingData.submittedByEmail || "Unknown";
              let producerName = producerEmail;
              
              // Try to get Producer's full name from users collection
              if (existingData.submittedBy) {
                  const uDoc = await admin.firestore().collection('users').doc(existingData.submittedBy).get();
                  if (uDoc.exists) {
                      const uData = uDoc.data();
                      const fName = decrypt(uData.firstName) || "";
                      const lName = decrypt(uData.lastName) || "";
                      if (fName || lName) producerName = `${fName} ${lName}`.trim();
                  }
              }

              const storyTitle = existingData.story_title || "Untitled Story";
              const season = "39"; // Hardcoded for now per user example
              const presenterName = presenter || (existingData.details && existingData.details.presenter) || "TBA";
              const isLegalRequired = (legal_req || existingData.legal_req) === 'yes' ? "Yes" : "No";

              const emailSubject = `S${season} | New Commission: ${storyTitle} | ${commissionNumber}`;
              const emailHtml = `
                <p><b>CARTE BLANCHE</b><br><b>NEW COMMISSION</b></p>
                <ul>
                    <li><b>Story Title:</b> ${storyTitle}</li>
                    <li><b>Producer:</b> ${producerName}</li>
                    <li><b>Presenter:</b> ${presenterName}</li>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 10px 0; width: 200px;" />
                    <li><b>Commission Number:</b> ${commissionNumber}</li>
                    <li><b>Duration:</b> ${duration || "TBA"}</li>
                    <li><b>Delivery Date:</b> ${deliveryDate ? formatDisplayDate(deliveryDate) : "TBA"}</li>
                    <li><b>Rate:</b> ${rate ? `R ${parseFloat(rate).toLocaleString()}` : "TBA"}</li>
                    <li><b>Legal Viewing:</b> ${isLegalRequired}</li>
                </ul>
                <p style="font-size: 0.8rem; color: #666;">This is an automated notification from the CARP Dashboard.</p>
              `;

              const extraRecipients = ['commissions@carteblanche.co.za'];
              if (producerEmail && producerEmail !== 'Unknown') {
                  extraRecipients.push(producerEmail);
              }

              await notifyRelevantUsers('proposal_commission', emailSubject, emailHtml, [], extraRecipients);
              console.log(`[NOTIFY] Commission email sent for Story: ${storyTitle}`);
          } catch (emailErr) {
              console.error("[NOTIFY] Failed to send commission email:", emailErr);
          }
      }
      res.json({ success: true, commissionNumber });
    } else if (action === 'pay') {
      const { duration, txDate, rate, deliveryDate, commDuration, deliveredDuration, isPaid } = req.body;
      const existingDoc = await docRef.get();
      const existingData = existingDoc.data();
      const acc = existingData.acceptanceDetails || {};
      
      await docRef.update({ 
        status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        txDate: txDate || null,
        acceptanceDetails: {
            ...acc,
            deliveryDate: deliveryDate || acc.deliveryDate,
            duration: commDuration || acc.duration,
            finalDuration: deliveredDuration || duration || acc.finalDuration,
            finalRate: rate || acc.finalRate,
            isPaid: isPaid || 'no'
        }
      });
      res.json({ success: true });
    } else if (action === 'decommission') {
      const existingDoc = await docRef.get();
      if (!existingDoc.exists) return res.status(404).json({ success: false, error: 'Not found' });
      
      await docRef.update({
          status: 'decommissioned',
          decommissionReason: decommissionReason || null,
          decommissionedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } else if (action === 'update-date') {
      await docRef.update({ 
        txDate: txDate || null
      });
      res.json({ success: true });
    } else if (action === 'revert-to-pending') {
      // Reverts an accepted story back to pending, freeing its commission number
      const existingDoc = await docRef.get();
      const existingData = existingDoc.data() || {};
      const freedCommNumber = existingData.commissionNumber || null;

      await docRef.update({
        status: 'pending',
        commissionNumber: null,
        acceptedAt: null,
        acceptanceDetails: null
      });

      // Decrement the commission counter only if the number was auto-generated
      // (i.e., numeric). Manual overrides are not tracked in the counter.
      if (freedCommNumber && !isNaN(parseInt(freedCommNumber))) {
        const counterRef = admin.firestore().collection('metadata').doc('projectCounter');
        const counterDoc = await counterRef.get();
        if (counterDoc.exists) {
          const current = counterDoc.data().nextCommissionNumber;
          // Only decrement if this was the most recently issued number
          if (parseInt(freedCommNumber) === current - 1) {
            await counterRef.update({ nextCommissionNumber: current - 1 });
          }
        }
      }
      res.json({ success: true, freedCommNumber });
    } else if (action === 'edit-commission') {
      // Edits acceptanceDetails fields on an already-accepted story
      const { commissionNumber: newCommNum, duration, deliveryDate, rate, presenter, legal_req, newProducerId } = req.body;
      
      const existingDoc = await docRef.get();
      const existingData = existingDoc.data() || {};
      const accDetails = existingData.acceptanceDetails || {};
      
      const updatePayload = {};
      if (newCommNum !== undefined) updatePayload.commissionNumber = newCommNum || null;
      if (duration !== undefined) updatePayload['acceptanceDetails.duration'] = duration || null;
      if (deliveryDate !== undefined) updatePayload['acceptanceDetails.deliveryDate'] = deliveryDate || null;
      if (rate !== undefined) updatePayload['acceptanceDetails.rate'] = rate || null;
      if (presenter !== undefined) updatePayload['acceptanceDetails.presenter'] = presenter || null;
      if (legal_req !== undefined) updatePayload['acceptanceDetails.legal_req'] = legal_req || null;
      
      if (newProducerId) {
          const uDoc = await admin.firestore().collection('users').doc(newProducerId).get();
          if (uDoc.exists) {
              const uData = uDoc.data();
              updatePayload.submittedBy = newProducerId;
              updatePayload.submittedByEmail = decrypt(uData.email) || uDoc.id;
          }
      }

      await docRef.update(updatePayload);

      // --- NOTIFY ON KEY UPDATES ---
      let changes = [];
      if (duration !== undefined && duration !== accDetails.duration) changes.push(`Duration: ${accDetails.duration || 'TBA'} -> ${duration || 'TBA'}`);
      if (deliveryDate !== undefined && deliveryDate !== accDetails.deliveryDate) changes.push(`Delivery Date: ${accDetails.deliveryDate ? formatDisplayDate(accDetails.deliveryDate) : 'TBA'} -> ${deliveryDate ? formatDisplayDate(deliveryDate) : 'TBA'}`);
      if (presenter !== undefined && presenter !== accDetails.presenter) changes.push(`Presenter: ${accDetails.presenter || 'TBA'} -> ${presenter || 'TBA'}`);
      
      if (changes.length > 0) {
          try {
              const storyTitle = existingData.story_title || "Untitled Story";
              const commNum = newCommNum !== undefined ? newCommNum : existingData.commissionNumber;
              const season = "39";
              const emailSubject = `S${season} | Update to Commission: ${storyTitle} | ${commNum}`;
              
              const producerEmail = updatePayload.submittedByEmail || existingData.submittedByEmail || "Unknown";
              let producerName = producerEmail;
              if (updatePayload.submittedBy || existingData.submittedBy) {
                  const uid = updatePayload.submittedBy || existingData.submittedBy;
                  const uDoc = await admin.firestore().collection('users').doc(uid).get();
                  if (uDoc.exists) {
                      const uData = uDoc.data();
                      const fName = decrypt(uData.firstName) || "";
                      const lName = decrypt(uData.lastName) || "";
                      if (fName || lName) producerName = `${fName} ${lName}`.trim();
                  }
              }

              const emailHtml = `
                <p><b>CARTE BLANCHE</b><br><b>COMMISSION UPDATED</b></p>
                <ul>
                    <li><b>Story Title:</b> ${storyTitle}</li>
                    <li><b>Producer:</b> ${producerName}</li>
                    <li><b>Commission Number:</b> ${commNum}</li>
                </ul>
                <p>The following details have been updated:</p>
                <ul>
                    ${changes.map(c => `<li>${c}</li>`).join('')}
                </ul>
                <p style="font-size: 0.8rem; color: #666;">This is an automated notification from the CARP Dashboard.</p>
              `;

              const extraRecipients = ['commissions@carteblanche.co.za'];
              if (producerEmail && producerEmail !== 'Unknown') {
                  extraRecipients.push(producerEmail);
              }

              await notifyRelevantUsers('proposal_commission_update', emailSubject, emailHtml, [], extraRecipients);
              console.log(`[NOTIFY] Commission update email sent for Story: ${storyTitle}`);
          } catch (emailErr) {
              console.error("[NOTIFY] Failed to send commission update email:", emailErr);
          }
      }

      res.json({ success: true });
    } else if (action === 'revert') {
      await docRef.update({ 
        status: 'accepted',
        paidAt: null,
        txDate: null
      });
      res.json({ success: true });
    } else {
      await docRef.update({ status: 'rejected' });
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/update-proposal-details', express.json(), async (req, res) => {
  try {
    const { id, details } = req.body;
    const docRef = admin.firestore().collection('proposals').doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    if (!canEditProposal(doc.data(), req.user)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    // --- CALL SHEET ENCRYPTION ---
    if (details && details.callSheet) {
        const cs = details.callSheet;
        const sensitiveFields = [
            'producer_phone', 'producer_id',
            'presenter_phone', 'presenter_id',
            'dop_phone', 'dop_id',
            'cam_assistant_phone', 'cam_assistant_id',
            'security_phone',
            'add1_phone', 'add1_id',
            'add2_phone', 'add2_id'
        ];
        sensitiveFields.forEach(f => {
            if (cs[f]) cs[f] = encrypt(cs[f]);
        });

        // Encrypt dynamic additional crew
        if (cs.additionalCrew && Array.isArray(cs.additionalCrew)) {
            cs.additionalCrew.forEach(member => {
                if (member.phone) member.phone = encrypt(member.phone);
                if (member.id) member.id = encrypt(member.id);
            });
        }

        // Encrypt new crew list
        if (cs.crew && Array.isArray(cs.crew)) {
            cs.crew.forEach(member => {
                if (member.phone) member.phone = encrypt(member.phone);
            });
        }

        // Encrypt new security phone
        if (cs.security && cs.security.phone) {
            cs.security.phone = encrypt(cs.security.phone);
        }
    }

    const { story_title, show, one_liner, summary, extra_budget, locations, ...others } = req.body;
    if (story_title && story_title.trim().length > 20) {
      return res.status(400).json({ success: false, error: 'Story title cannot exceed 20 characters.' });
    }
    const updateData = {};
    
    if (details) {
        for (const key in details) {
            updateData[`details.${key}`] = details[key];
        }
    }

    // Allow updating top-level fields too (e.g. for Admin edits or typos)
    if (story_title !== undefined && String(story_title).trim() !== '') updateData.story_title = story_title;
    if (show !== undefined && String(show).trim() !== '') updateData.show = show;
    if (one_liner !== undefined && String(one_liner).trim() !== '') updateData.one_liner = one_liner;
    if (summary !== undefined) {
        const trimmedSummary = String(summary).replace(/<[^>]*>/g, '').trim();
        if (trimmedSummary !== '') {
            updateData.summary = summary;
        }
    }
    if (extra_budget !== undefined) updateData.extra_budget = extra_budget;
    if (locations !== undefined) updateData.locations = locations;
    
    const topLevelFields = ['third_party', 'hidden_camera', 'legal_req', 'isSensitive', 'permittedUids', 'caseStudies', 'experts', 'budgetItems'];
    topLevelFields.forEach(f => {
        if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });

    await docRef.update({
        ...updateData,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (req.body.isSubmitCallSheet && req.body.callSheetPdfB64) {
        try {
            const pdfBuffer = Buffer.from(req.body.callSheetPdfB64, 'base64');
            const proposalData = doc.data() || {};
            const commNum = proposalData.commissionNumber || req.body.commissionNumber || 'N/A';
            const storyTitle = req.body.story_title || proposalData.story_title || 'Untitled';
            const userFullName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'A user';
            
            const emailSubject = `CALL SHEET for ${commNum} ${storyTitle}`;
            const emailHtml = `<p>${userFullName} has submitted a call sheet for ${commNum} ${storyTitle}.</p>\n<p><i>This is an automated notification from the CARP Dashboard.</i></p>`;
            
            const attachments = [{
                filename: `Call_Sheet_${commNum}.pdf`,
                content: pdfBuffer
            }];
            
            notifyRelevantUsers('call_sheet', emailSubject, emailHtml, attachments);
        } catch (err) {
            console.error('[NOTIFY] Error preparing Call Sheet notification:', err);
        }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload-call-sheet-file', async (req, res) => {
  try {
    const { fields, files, file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ success: false, error: 'No file provided' });
    const timestamp = Date.now();
    const storagePath = `proposals/call_sheets/${timestamp}_${file.filename}`;
    console.log(`[STORAGE] Encrypting ${file.filename} before upload...`);
    const encryptedBuffer = encryptBuffer(file.buffer);
    await defaultBucket.file(storagePath).save(encryptedBuffer, {
      contentType: file.mimeType || 'application/pdf',
      metadata: { firebaseStorageDownloadTokens: timestamp.toString() }
    });
    res.json({ success: true, storagePath, filename: file.filename });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/get-call-sheet-file', async (req, res) => {
  try {
    const { id, path } = req.query;
    if (!id || !path) return res.status(400).json({ success: false, error: 'Proposal ID and Path required' });

    const doc = await admin.firestore().collection('proposals').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Proposal not found' });
    
    const data = doc.data();
    const isAdmin = hasAdminAccess(req.user);
    if (data.submittedBy !== req.user.uid && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const cs = data.details?.callSheet || {};
    const pathIsValid = cs.travel_flight_file_path === path || cs.travel_trans_file_path === path;
    if (!pathIsValid && !isAdmin) {
      return res.status(404).json({ success: false, error: 'File not found in this Call Sheet' });
    }

    console.log(`[STORAGE] Decrypting Call Sheet file: ${path}`);
    const [fileBuffer] = await defaultBucket.file(path).download();
    const decryptedBuffer = decryptBuffer(fileBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    const filename = path.split('/').pop().replace(/^\d+_/, '');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(decryptedBuffer);
  } catch (error) {
    console.error('Call Sheet file retrieval failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/delete-proposal', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    const isProposal = await internalDeleteSubmission(id, req.user);
    res.json({ success: true, message: 'Proposal deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/proposals', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('proposals')
      .where(admin.firestore.Filter.or(
        admin.firestore.Filter.where('submittedBy', '==', req.user.uid),
        admin.firestore.Filter.where('submittedBy', '==', req.user.email)
      ))
      .orderBy('submittedAt', 'desc')
      .get();
    
    const proposals = snapshot.docs.map(doc => {
      const data = doc.data();
      if (data.caseStudies && data.caseStudies._encrypted) {
        try { data.caseStudies = JSON.parse(decrypt(data.caseStudies)); } catch (e) {}
      }
      if (data.experts && data.experts._encrypted) {
        try { data.experts = JSON.parse(decrypt(data.experts)); } catch (e) {}
      }
      if (data.details) {
        data.details = decryptCallSheet(data.details);
      }
      return { id: doc.id, ...data };
    });
    res.json({ success: true, proposals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
/**
 * UNIFIED SEARCH API
 * Handles keyword, UID, Episode/Season, and User searches with role-based visibility.
 */
app.get('/api/search', async (req, res) => {
  try {
    const { q, commNum, season, episode, uid: searchUid, user: userName } = req.query;
    const isAdmin = hasAdminAccess(req.user);
    const canSearchAll = true; // Everyone authenticated can use these filters

    // 1. Fetch Proposals (The main searchable entities)
    const proposalSnapshot = await admin.firestore().collection('proposals').get();
    let proposals = proposalSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Map Episodes/UIDs to Stories
    let episodeMap = {}; // "S-E" -> Set(StoryNames)
    let uidMap = {}; // "UID" -> Set(StoryNames)
    
    if (season || episode || searchUid) {
        const subSnapshot = await admin.firestore().collection('submissions')
            .where('formType', 'in', ['control_sheet', 'episode_footage'])
            .get();
        
        subSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const key = `S${data.season}E${data.episode}`;
            
            let storyNames = [];
            if (data.stories) {
                try {
                    const parsed = typeof data.stories === 'string' ? JSON.parse(data.stories) : data.stories;
                    storyNames = parsed.map(s => s.name);
                } catch (e) { console.error("Failed to parse stories in sub:", doc.id); }
            }
            
            if (data.season && data.episode) {
                if (!episodeMap[key]) episodeMap[key] = new Set();
                storyNames.forEach(name => episodeMap[key].add(name));
            }
            if (data.uid) {
                if (!uidMap[data.uid]) uidMap[data.uid] = new Set();
                storyNames.forEach(name => uidMap[data.uid].add(name));
            }
        });
    }

    // 3. Map User Names to UIDs
    let matchedUids = [];
    if (userName) {
        const userSnapshot = await admin.firestore().collection('users').get();
        userSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const decName = decrypt(data.name);
            const firstName = (typeof decName === 'string' ? decName : '').toLowerCase();
            if (firstName.includes(userName.toLowerCase())) {
                matchedUids.push(doc.id);
            }
        });
    }

    // 4. Filtering and Scoring Results
    const scoredResults = [];
    proposals.forEach(p => {
        // Exclude decommissioned stories for non-admins (e.g. producers)
        if (p.status === 'decommissioned' && !hasAdminAccess(req.user)) {
            return;
        }

        // Sensitivity Check - Strictly exclude sensitive stories for non-admins
        if (p.isSensitive && !hasAdminAccess(req.user)) {
            return;
        }

        let isMatch = false;
        let score = 0;

        // A. Keyword Search (Story Title, Summary, Experts)
        if (q) {
            const query = q.toLowerCase().trim();
            const title = (p.story_title || '').toLowerCase().trim();
            const summary = (p.summary || '').toLowerCase().trim();

            let qMatch = false;

            if (title === query) {
                score = Math.max(score, 100);
                qMatch = true;
            } else if (title.startsWith(query)) {
                score = Math.max(score, 80);
                qMatch = true;
            } else {
                const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBoundaryRegex = new RegExp('\\b' + escapedQuery + '\\b');
                const wordPrefixRegex = new RegExp('\\b' + escapedQuery);
                if (wordBoundaryRegex.test(title)) {
                    score = Math.max(score, 60);
                    qMatch = true;
                } else if (wordPrefixRegex.test(title)) {
                    score = Math.max(score, 50);
                    qMatch = true;
                } else if (title.includes(query)) {
                    score = Math.max(score, 40);
                    qMatch = true;
                }
            }

            // Score Commission Number for Admin/Editorial in global search q
            if (isAdmin && p.commissionNumber) {
                const commStr = String(p.commissionNumber).toLowerCase().trim();
                if (commStr === query) {
                    score = Math.max(score, 95);
                    qMatch = true;
                } else if (commStr.includes(query)) {
                    score = Math.max(score, 90);
                    qMatch = true;
                }
            }

            if (summary.startsWith(query)) {
                score = Math.max(score, 30);
                qMatch = true;
            } else if (summary.includes(query)) {
                score = Math.max(score, 20);
                qMatch = true;
            }

            // Search Experts (Decrypted)
            if (p.experts && p.experts._encrypted) {
                try {
                    const experts = JSON.parse(decrypt(p.experts));
                    if (JSON.stringify(experts).toLowerCase().includes(query)) {
                        score = Math.max(score, 10);
                        qMatch = true;
                    }
                } catch (e) {}
            }

            // Search Case Studies (Decrypted) - ADMIN ONLY
            if (isAdmin && p.caseStudies && p.caseStudies._encrypted) {
                try {
                    const cases = JSON.parse(decrypt(p.caseStudies));
                    if (JSON.stringify(cases).toLowerCase().includes(query)) {
                        score = Math.max(score, 5);
                        qMatch = true;
                    }
                } catch (e) {}
            }

            if (qMatch) isMatch = true;
        }

        // A2. Commission Number Search (Admin & Editorial only)
        if (commNum && isAdmin) {
            const commQuery = commNum.trim().toLowerCase();
            if (p.commissionNumber && String(p.commissionNumber).toLowerCase().includes(commQuery)) {
                isMatch = true;
            }
        }

        // B. UID Search
        if (searchUid && uidMap[searchUid]?.has(p.story_title)) {
            isMatch = true;
        }

        // C. Episode/Season Search
        if (season && episode) {
            const key = `S${season}E${episode}`;
            if (episodeMap[key]?.has(p.story_title)) {
                isMatch = true;
            }
        }

        // D. User Name Search
        if (userName && matchedUids.includes(p.submittedBy)) {
            isMatch = true;
        }

        if (isMatch) {
            scoredResults.push({ proposal: p, score });
        }
    });

    const getTimestampMillis = (ts) => {
        if (!ts) return 0;
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (ts.seconds !== undefined) return ts.seconds * 1000;
        if (ts._seconds !== undefined) return ts._seconds * 1000;
        const d = new Date(ts);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    // Sort scoredResults
    scoredResults.sort((a, b) => {
        if (userName) {
            // Sort by submittedAt descending (newest to oldest)
            return getTimestampMillis(b.proposal.submittedAt) - getTimestampMillis(a.proposal.submittedAt);
        } else if (q) {
            // Sort by score descending, then by submittedAt descending
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return getTimestampMillis(b.proposal.submittedAt) - getTimestampMillis(a.proposal.submittedAt);
        } else {
            // Default to newest to oldest
            return getTimestampMillis(b.proposal.submittedAt) - getTimestampMillis(a.proposal.submittedAt);
        }
    });

    // 5. Finalize output
    const isProducerRole = (req.user.role || '').toLowerCase() === 'producer';
    const results = scoredResults.map(({ proposal: p }) => {
        const isOwner = p.submittedBy === req.user.uid || (req.user.email && p.submittedBy === req.user.email.toLowerCase());
        const isRestricted = !isOwner && !isAdmin && isProducerRole;
        
        return {
            id: p.id,
            story_title: p.story_title,
            status: p.status,
            submittedAt: p.submittedAt,
            commissionNumber: isRestricted ? null : p.commissionNumber
        };
    });

    res.json({ success: true, results });
  } catch (error) {
    console.error('[SEARCH] Critical Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/proposals', async (req, res) => {
  try {
    const docRef = admin.firestore().collection('proposals').doc('JuzkNpP44qplQ0s9CJgk');
    const doc = await docRef.get();
    res.json(doc.exists ? doc.data() : { error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/proposals', async (req, res) => {
  try {
    if (!hasAdminAccess(req.user)) {
      console.warn(`[AUTH] Unauthorized admin access attempt by ${req.user.email}`);
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required.' });
    }

    const snapshot = await admin.firestore().collection('proposals').get();
    
    // Optimization: Fetch all users once and build a lookup map
    const userSnapshot = await admin.firestore().collection('users').get();
    const userMap = {};
    userSnapshot.docs.forEach(udoc => {
        const udata = udoc.data();
        userMap[udoc.id] = {
            name: decrypt(udata.name),
            surname: decrypt(udata.surname)
        };
    });

    const proposals = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Sensitivity Filter
      if (data.isSensitive) {
        const isPermitted = (data.permittedUids || []).includes(req.user.uid) || req.user.role === 'super-admin';
        if (!isPermitted) return null;
      }

      // Resolve Name using Map
      if (data.submittedBy && userMap[data.submittedBy]) {
          data.submittedByName = userMap[data.submittedBy].name;
          data.submittedBySurname = userMap[data.submittedBy].surname;
      }

      if (data.caseStudies && data.caseStudies._encrypted) {
        try { data.caseStudies = JSON.parse(decrypt(data.caseStudies)); } catch (e) {}
      }
      if (data.experts && data.experts._encrypted) {
        try { data.experts = JSON.parse(decrypt(data.experts)); } catch (e) {}
      }
      if (data.details) {
        data.details = decryptCallSheet(data.details);
      }
      return { id: doc.id, ...data };
    });
    
    const filteredProposals = proposals.filter(p => p !== null);
    res.json({ success: true, proposals: filteredProposals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/** 
 * [ADMIN] Decryption Proxy for Storage Files
 */
app.get('/api/admin/get-file', async (req, res) => {
  try {
    if (!hasAdminAccess(req.user)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const storagePath = req.query.path;
    if (!storagePath) return res.status(400).json({ success: false, error: 'Path required' });

    console.log(`[STORAGE] Decrypting file for admin: ${storagePath}`);
    const [fileBuffer] = await defaultBucket.file(storagePath).download();
    
    const decryptedBuffer = decryptBuffer(fileBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${storagePath.split('/').pop()}"`);
    res.send(decryptedBuffer);
  } catch (error) {
    console.error('File decryption failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * [SUPER ADMIN] User Management
 */
/** 
 * Public list for producers to select reviewers for sensitive stories
 */
app.get('/api/list-reviewers', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('users')
      .where('isEnabled', '==', true)
      .get();
    
    // Map documents to parse their fields
    const allDocs = snapshot.docs.map(doc => {
      const data = doc.data();
      const decryptedEmail = decrypt(data.email);
      const email = (typeof decryptedEmail === 'string' ? decryptedEmail : doc.id).toLowerCase().trim();
      const isEmailKey = doc.id.includes('@');
      const decName = decrypt(data.name);
      const decSurname = decrypt(data.surname);
      return {
        id: doc.id,
        email,
        name: (typeof decName === 'string' ? decName : '') || 'Unknown',
        surname: (typeof decSurname === 'string' ? decSurname : '') || '',
        role: data.role,
        isEmailKey
      };
    });

    // Deduplicate: find if there is a UID-keyed doc for each email
    const emailsWithUidDoc = new Set(
      allDocs.filter(u => !u.isEmailKey).map(u => u.email)
    );

    const permittedEmails = ['stenette@carteblanche.co.za', 'rudi@combinedartists.co.za'];

    // Filter duplicates and select only permitted reviewer emails
    const reviewers = allDocs
      .filter(u => !u.isEmailKey || !emailsWithUidDoc.has(u.email))
      .filter(u => permittedEmails.includes(u.email))
      .map(u => ({
        uid: u.id,
        name: u.name,
        surname: u.surname,
        role: u.role
      }));
      
    res.json({ success: true, reviewers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const uid = req.user.uid;
    const doc = await admin.firestore().collection('users').doc(uid).get();
    
    if (!doc.exists) {
        // Fallback for Super Admin if doc doesn't exist yet
        if (req.user.email.toLowerCase() === 'lezanne@carteblanche.co.za') {
            return res.json({
                success: true,
                profile: {
                    name: 'Lezanne',
                    surname: 'Janse van Rensburg',
                    email: req.user.email,
                    role: 'super-admin',
                    notifications: {}
                }
            });
        }
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const data = doc.data();
    const name = decrypt(data.name) || data.firstName || '';
    const surname = decrypt(data.surname) || data.surname || '';
    const email = decrypt(data.email) || data.email || req.user.email;

    res.json({ 
      success: true, 
      profile: { 
        name, 
        surname, 
        email, 
        role: data.role,
        notifications: data.notifications || {} 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/update-profile', express.json(), async (req, res) => {
  try {
    const { name, surname } = req.body;
    if (!name || !surname) return res.status(400).json({ success: false, error: 'Name and Surname are required' });

    const uid = req.user.uid;
    const docRef = admin.firestore().collection('users').doc(uid);
    
    await docRef.update({
        name: encrypt(name),
        surname: encrypt(surname),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/change-my-password', express.json(), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
    }

    const uid = req.user.uid;
    const email = req.user.email;

    // 1. Update Password in Auth
    await admin.auth().updateUser(uid, {
        password: newPassword
    });

    // 2. Notify SuperAdmin
    try {
        const mailOptions = {
            from: `"Carte Blanche Security" <${process.env.EMAIL_USER}>`,
            to: 'lezanne@carteblanche.co.za',
            subject: `Security Alert: Password Changed by ${email}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #d97706;">Security Notification</h2>
                    <p>A user has manually updated their login password.</p>
                    <p><b>User:</b> ${email}</p>
                    <p><b>Timestamp:</b> ${new Date().toLocaleString()}</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
                    <p style="font-size: 0.8rem; color: #666;">This is an automated security alert from the Carte Blanche Deliverables Portal.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (mailErr) {
        console.error('[SECURITY] Failed to send password change notification:', mailErr.message);
    }

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get('/api/admin/submissions', async (req, res) => {
  try {
    if (!hasAdminAccess(req.user)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required.' });
    }

    const snapshot = await admin.firestore().collection('submissions')
      .orderBy('submittedAt', 'desc')
      .get();
    
    const submissions = snapshot.docs.map(doc => {
      return { id: doc.id, ...doc.data() };
    });

    res.json({ success: true, submissions });
  } catch (error) {
    console.error('[ADMIN] List submissions failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super-admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required.' });
    }
    
    const snapshot = await admin.firestore().collection('users').orderBy('addedAt', 'desc').get();

    // Build full list first
    const allDocs = snapshot.docs.map(doc => {
      const data = doc.data();
      const email = decrypt(data.email) || doc.id;
      const name = decrypt(data.name) || 'N/A';
      const surname = decrypt(data.surname) || '';
      const isEmailKey = doc.id.includes('@'); // Legacy docs use email as document ID
      return {
        id: doc.id,
        email: email.toLowerCase(),
        name,
        surname,
        role: data.role,
        isEnabled: data.isEnabled,
        notifications: data.notifications || {},
        addedAt: data.addedAt,
        isEmailKey
      };
    });

    // Build a set of emails that have a UID-keyed (non-email) doc
    const emailsWithUidDoc = new Set(
      allDocs.filter(u => !u.isEmailKey).map(u => u.email)
    );

    // Keep UID-keyed docs always; only keep email-keyed docs if no UID doc exists for that email
    const users = allDocs
      .filter(u => !u.isEmailKey || !emailsWithUidDoc.has(u.email))
      .map(({ isEmailKey, ...rest }) => rest); // strip internal flag before sending

    res.json({ success: true, users });
  } catch (error) {
    console.error('[USER_MGMT] List users failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- TEMP: One-shot cleanup of duplicate email-keyed user docs ---
app.post('/api/admin/cleanup-duplicate-users', async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ success: false, error: 'Super-admin only.' });
    }
    const snapshot = await admin.firestore().collection('users').get();
    const allDocs = snapshot.docs.map(doc => ({
      id: doc.id,
      isEmailKey: doc.id.includes('@'),
      emailField: doc.data().email ? decrypt(doc.data().email) : null
    }));

    // Emails that have a UID-keyed doc
    const emailsWithUidDoc = new Set(
      allDocs.filter(d => !d.isEmailKey).map(d => (d.emailField || '').toLowerCase())
    );

    const toDelete = allDocs.filter(d => d.isEmailKey && emailsWithUidDoc.has(d.id.toLowerCase()));
    if (toDelete.length === 0) {
      return res.json({ success: true, deleted: 0, message: 'No duplicates found.' });
    }

    const batch = admin.firestore().batch();
    toDelete.forEach(d => batch.delete(admin.firestore().collection('users').doc(d.id)));
    await batch.commit();

    console.log(`[CLEANUP] Deleted ${toDelete.length} duplicate email-keyed user docs.`);
    res.json({ success: true, deleted: toDelete.length, docs: toDelete.map(d => d.id) });
  } catch (error) {
    console.error('[CLEANUP] Failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// --- END TEMP ---

app.post('/api/admin/create-user', express.json(), async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super-admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { name, surname, email, role } = req.body;
    if (!name || !surname || !email || !role) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    const lowerEmail = email.toLowerCase().trim();
    const docRef = admin.firestore().collection('users').doc(lowerEmail);
    const doc = await docRef.get();
    
    if (doc.exists) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }
    
    await docRef.set({
      name: encrypt(name),
      surname: encrypt(surname),
      email: encrypt(lowerEmail),
      role: role,
      isEnabled: true,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      notifications: {
        insert_footage: false,
        episode_footage: false,
        control_sheet: false,
        proposal: false,
        call_sheet: false
      }
    });
    
    res.json({ success: true, message: 'User created successfully' });
  } catch (error) {
    console.error('[USER_MGMT] Create user failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/delete-submission', express.json(), async (req, res) => {
  try {
    const { id } = req.body;
    await internalDeleteSubmission(id, req.user);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



app.post('/api/admin/update-user', express.json(), async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super-admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required.' });
    }
    
    const { id, email, updates } = req.body;
    if ((!id && !email) || !updates) return res.status(400).json({ success: false, error: 'ID or Email and updates required' });
    
    // Auto-encrypt PII if provided in updates
    if (updates.name) updates.name = encrypt(updates.name);
    if (updates.surname) updates.surname = encrypt(updates.surname);
    if (updates.email) updates.email = encrypt(updates.email.toLowerCase().trim());
    
    let docRef;
    if (id) {
       docRef = admin.firestore().collection('users').doc(id);
    } else {
       docRef = admin.firestore().collection('users').doc(email.toLowerCase().trim());
    }

    const doc = await docRef.get();
    if (doc.exists) {
        // Protect Super Admin
        const data = doc.data();
        const userEmail = decrypt(data.email) || data.email || doc.id;
        if (userEmail === 'lezanne@carteblanche.co.za' && updates.isEnabled === false) {
           return res.status(400).json({ success: false, error: 'Cannot disable the primary Super Admin account.' });
        }
    }

    await docRef.update(updates);
    res.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    console.error('[USER_MGMT] Update user failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/admin/reset-password', express.json(), async (req, res) => {
  try {
    // Only SuperAdmin (Lezanne) can reset passwords
    const isLezanne = req.user.email.toLowerCase() === 'lezanne@carteblanche.co.za';
    if (!isLezanne && req.user.role !== 'super-admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Super Admin access required.' });
    }
    
    const { id, email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    
    const lowerEmail = email.toLowerCase().trim();
    
    // 1. Generate Temporary Password
    const tempPassword = 'CB_' + crypto.randomBytes(4).toString('hex').toUpperCase() + '!';
    
    let authUser;
    try {
      // Check if user exists in Auth
      authUser = await admin.auth().getUserByEmail(lowerEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Create user in Auth if they don't exist
        console.log(`[USER_MGMT] User ${lowerEmail} not found in Auth. Creating...`);
        authUser = await admin.auth().createUser({
          email: lowerEmail,
          password: tempPassword,
          emailVerified: true
        });
      } else {
        throw err;
      }
    }
    
    // 2. Update Password in Auth
    if (authUser) {
      await admin.auth().updateUser(authUser.uid, {
        password: tempPassword
      });
      console.log(`[USER_MGMT] Password reset for ${lowerEmail} (UID: ${authUser.uid})`);
    }
    
    // 3. Update Firestore (record reset timestamp)
    // Try UID first, then email doc
    let docRef = admin.firestore().collection('users').doc(id || lowerEmail);
    const doc = await docRef.get();
    if (!doc.exists && id) {
        docRef = admin.firestore().collection('users').doc(lowerEmail);
    }
    
    await docRef.update({
      passwordResetAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      message: 'Password reset successful.', 
      tempPassword 
    });
  } catch (error) {
    console.error('[USER_MGMT] Reset password failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/admin/change-password', express.json(), async (req, res) => {
  try {
    // Only SuperAdmin (Lezanne) can change passwords directly
    const isLezanne = req.user.email.toLowerCase() === 'lezanne@carteblanche.co.za';
    if (!isLezanne && req.user.role !== 'super-admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Super Admin access required.' });
    }
    
    const { id, email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ success: false, error: 'Email and new password are required' });
    
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
    }

    const lowerEmail = email.toLowerCase().trim();
    
    // 1. Get user from Auth
    let authUser;
    try {
      authUser = await admin.auth().getUserByEmail(lowerEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, error: 'User not found in Authentication system' });
      }
      throw err;
    }
    
    // 2. Update Password in Auth
    await admin.auth().updateUser(authUser.uid, {
      password: newPassword
    });
    console.log(`[USER_MGMT] Password manually changed for ${lowerEmail} (UID: ${authUser.uid})`);
    
    // 3. Update Firestore (record change timestamp)
    let docRef = admin.firestore().collection('users').doc(id || lowerEmail);
    const doc = await docRef.get();
    if (!doc.exists && id) {
        docRef = admin.firestore().collection('users').doc(lowerEmail);
    }
    
    await docRef.update({
      passwordResetAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      message: 'Password changed successfully.' 
    });
  } catch (error) {
    console.error('[USER_MGMT] Change password failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



app.post('/api/admin/reset-all-notifications', async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') return res.status(403).json({ success: false, error: 'Super Admin only' });
    
    const snapshot = await admin.firestore().collection('users').get();
    const batch = admin.firestore().batch();
    const resetData = {
        insert_footage: false,
        episode_footage: false,
        control_sheet: false,
        proposal: false,
        call_sheet: false
    };
    
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { notifications: resetData });
    });
    
    await batch.commit();
    res.json({ success: true, count: snapshot.size });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});



// Removed temporary TX date endpoint

// Removed temporary DELIVERED UPDATE endpoint

// -----------------------------------------------------------------------
// MAILGUN INBOUND EMAIL WEBHOOK
// Public endpoint — verified using Mailgun's HMAC signing key.
// Mailgun will POST here whenever an email arrives at your routing address.
// -----------------------------------------------------------------------
const mailgunApp = express();
mailgunApp.use(cors({ origin: true }));

/**
 * Verifies the Mailgun webhook signature to prevent spoofing.
 * https://documentation.mailgun.com/en/latest/user_manual.html#securing-webhooks
 */
function verifyMailgunSignature(signingKey, timestamp, token, signature) {
  const encodedToken = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp.concat(token))
    .digest('hex');
  return encodedToken === signature;
}

/**
 * Extracts structured fields from a DStv tip-off notification email body.
 * Returns null if the email doesn't look like a DStv tip-off.
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

mailgunApp.post('/mailgun-inbound', async (req, res) => {
  try {
    // 1. Parse the multipart form-data Mailgun sends
    const { fields, files } = await parseMultipart(req);

    // 2. Verify Mailgun signature (skip in dev if key not configured)
    const signingKey = process.env.MAILGUN_SIGNING_KEY;
    if (signingKey) {
      const { timestamp, token, signature } = fields;
      console.log('[MAILGUN] Webhook signature inputs:', {
        timestamp,
        token,
        signature,
        signingKeyLength: signingKey ? signingKey.length : 0
      });
      const computed = crypto
        .createHmac('sha256', signingKey)
        .update((timestamp || '') + (token || ''))
        .digest('hex');
      console.log('[MAILGUN] Computed vs Received:', { computed, signature });
      const isValid = computed === signature;
      if (!isValid) {
        console.warn('[MAILGUN] Signature verification failed — rejecting request.');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } else {
      console.warn('[MAILGUN] MAILGUN_SIGNING_KEY not set — skipping signature check.');
    }

    // 3. Extract email fields from Mailgun payload
    const subject     = fields['subject']       || '(No Subject)';
    const sender      = fields['sender']        || fields['from'] || 'unknown@sender.com';
    const fromName    = (fields['from'] || '').replace(/<.*>/, '').trim() || sender;
    const bodyText    = fields['body-plain']    || fields['stripped-text'] || '';
    const bodyHtml    = fields['body-html']     || '';
    const recipient   = fields['recipient']     || '';
    const messageDate = fields['Date']          || new Date().toISOString();
    const attachCount = parseInt(fields['attachment-count'] || '0', 10);

    console.log(`[MAILGUN] Received email: "${subject}" from ${sender} (${attachCount} attachment(s))`);

    // Filter out system-generated automated notifications or bounces/auto-responses
    const normalizedSubject = subject.toLowerCase();
    const isSystemEmail = 
      normalizedSubject.includes('new commission:') || 
      normalizedSubject.includes('new proposal:') || 
      normalizedSubject.includes('call sheet for') ||
      normalizedSubject.includes('editorial leave') ||
      normalizedSubject.includes('alert: email delivery failed') ||
      normalizedSubject.includes('smtp test') ||
      normalizedSubject.includes('smtp live test') ||
      normalizedSubject.includes('test-smtp') ||
      normalizedSubject.includes('office 365 smtp test') ||
      normalizedSubject.includes('carp dashboard');

    if (isSystemEmail) {
      console.log(`[MAILGUN] Filtering out system-generated email: "${subject}" from ${sender}`);
      return res.status(200).json({ success: true, message: 'Filtered out system email.' });
    }

    // 4. Detect DStv tip-off vs general email submission
    const tipoffData = parseDstvTipOff(subject, bodyText);
    const formType   = tipoffData ? 'dstv_tipoff' : 'email_submission';
    console.log(`[MAILGUN] Identified formType: ${formType}`);

    // 5. Upload any attachments to Firebase Storage
    const storedAttachments = [];
    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) continue;
      const safeName     = file.filename.replace(/[^a-zA-Z0-9_\-.]/g, '');
      const storagePath  = `submissions/${formType}/${Date.now()}_${safeName}`;
      const encryptedBuf = encryptBuffer(file.buffer);
      await defaultBucket.file(storagePath).save(encryptedBuf, {
        contentType: file.mimeType || 'application/octet-stream',
      });
      storedAttachments.push({ filename: file.filename, contentType: file.mimeType, storagePath });
      console.log(`[MAILGUN] Stored attachment: ${storagePath}`);
    }

    // 6. Build Firestore document
    const submissionDoc = {
      formType,
      submittedAt:     admin.firestore.Timestamp.fromDate(new Date(messageDate)),
      importedAt:      admin.firestore.FieldValue.serverTimestamp(),
      submittedByEmail: sender,
      submittedByName:  fromName,
      recipient,
      subject,
      body:            bodyText,
      bodyHtml,
      attachments:     storedAttachments,
      isEmailImport:   true,
      source:          'mailgun',
    };

    if (formType === 'dstv_tipoff' && tipoffData) {
      submissionDoc.tipoffDetails = tipoffData;
    }

    const docRef = await admin.firestore().collection('submissions').add(submissionDoc);
    console.log(`[MAILGUN] Saved to Firestore: submissions/${docRef.id}`);

    // 7. Notify relevant admins (reuse existing notification helper)
    const notifyType = formType === 'dstv_tipoff' ? 'dstv_tipoff' : 'email_submission';
    const notifySubject = formType === 'dstv_tipoff'
      ? `New DStv Tip-Off received from ${fromName}`
      : `New Email Submission: ${subject}`;
    const notifyHtml = `
      <div style="font-family:sans-serif;line-height:1.6;color:#333">
        <h2 style="color:#c00">📩 ${formType === 'dstv_tipoff' ? 'DStv Tip-Off' : 'Email Submission'}</h2>
        <ul>
          <li><b>From:</b> ${fromName} &lt;${sender}&gt;</li>
          <li><b>Subject:</b> ${subject}</li>
          <li><b>Received:</b> ${new Date(messageDate).toLocaleString('en-ZA')}</li>
          ${storedAttachments.length > 0 ? `<li><b>Attachments:</b> ${storedAttachments.map(a => a.filename).join(', ')}</li>` : ''}
        </ul>
        ${tipoffData ? `
        <h3>Tip Details</h3>
        <ul>
          <li><b>Name:</b> ${tipoffData.name} ${tipoffData.lastName}</li>
          <li><b>Email:</b> ${tipoffData.email}</li>
          <li><b>Phone:</b> ${tipoffData.phone}</li>
          <li><b>Location:</b> ${tipoffData.location}</li>
          <li><b>Story:</b> ${tipoffData.story}</li>
        </ul>` : `<blockquote style="background:#f4f4f4;padding:10px;border-left:4px solid #ccc">${bodyText.substring(0, 800)}</blockquote>`}
        <p style="font-size:0.8rem;color:#999">View full submission in the CARP Dashboard.</p>
      </div>
    `;
    await notifyRelevantUsers(notifyType, notifySubject, notifyHtml);

    // Mailgun expects a 200 response to acknowledge receipt
    res.status(200).json({ success: true, firestoreDocId: docRef.id });
  } catch (error) {
    console.error('[MAILGUN] Webhook processing error:', error);
    // Still return 200 so Mailgun doesn't retry endlessly on a persistent error
    res.status(200).json({ success: false, error: error.message });
  }
});

exports.mailgunInbound = functions.runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onRequest(mailgunApp);

exports.submissionServer = functions.runWith({ timeoutSeconds: 300, memory: '1GB' }).https.onRequest(app);

exports.verifyTurnstileToken = functions.https.onCall(async (data, context) => {
    const token = data.token;
    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a Turnstile token.');
    }

    const secretKey = "0x4AAAAAADPVskOJMbVu5dDA-5BVxphwp90";

    try {
        // 1. Verify with Cloudflare
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: secretKey,
                response: token
            })
        });

        const outcome = await response.json();
        
        if (!outcome.success) {
            console.error('[AppCheck] Turnstile verification failed:', outcome['error-codes']);
            throw new functions.https.HttpsError('failed-precondition', 'Turnstile verification failed.');
        }

        // 2. Mint Firebase App Check Token
        // This must match the App ID in your firebaseConfig
        const appId = "1:705555810335:web:b10f7fc0fca566f1fc535b";
        const appCheckToken = await admin.appCheck().createToken(appId);

        return {
            token: appCheckToken.token,
            expireTimeMillis: Date.now() + (appCheckToken.ttlMillis || 3600000)
        };
    } catch (error) {
        console.error('[AppCheck] Error in token exchange:', error);
        throw new functions.https.HttpsError('internal', 'Internal error during security token exchange.');
    }
});

exports.processFailedEmails = functions.runWith({ timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('every 15 minutes').onRun(async (context) => {
    console.log('[CRON] Checking for failed emails in queue...');
    const db = admin.firestore();
    const snapshot = await db.collection('failed_emails')
        .where('status', '==', 'pending')
        .where('retryCount', '<', 5)
        .get();

    if (snapshot.empty) {
        console.log('[CRON] No pending failed emails found.');
        return null;
    }

    console.log(`[CRON] Found ${snapshot.size} pending failed emails to retry.`);
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const docRef = doc.ref;
        const fromName = data.type === 'call_sheet' ? "Call Sheets" : (data.type === 'editorial_leave' ? "Editorial Leave Calendar" : "CARP Dashboard");
        const attachments = deserializeAttachments(data.attachments);
        const recipientList = data.recipients.join(', ');

        try {
            await sendNotificationEmail(fromName, data.subject, data.html, recipientList, attachments);
            await docRef.update({
                status: 'sent',
                retryCount: data.retryCount + 1,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                lastError: null
            });
            console.log(`[CRON] Successfully retried and sent email doc ID: ${doc.id}`);
        } catch (err) {
            const nextRetryCount = data.retryCount + 1;
            const updates = {
                retryCount: nextRetryCount,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                lastError: err.message
            };

            if (nextRetryCount >= 5) {
                updates.status = 'failed_permanently';
                console.error(`[CRON] Email doc ID: ${doc.id} reached max retries and failed permanently.`);
                
                // Notify SuperAdmin Lezanne
                try {
                    const alertSubject = `ALERT: Email Delivery Failed Permanently after 5 Retries`;
                    const alertHtml = `
                        <h2>⚠️ Email Delivery Failure Alert</h2>
                        <p>An automated notification failed to send after 5 retry attempts.</p>
                        <hr/>
                        <ul>
                            <li><b>Original Subject:</b> ${data.subject}</li>
                            <li><b>Original Recipients:</b> ${recipientList}</li>
                            <li><b>Error:</b> ${err.message}</li>
                            <li><b>Document ID:</b> ${doc.id}</li>
                        </ul>
                    `;
                    await sendNotificationEmail("CARP Alerts", alertSubject, alertHtml, "lezanne@carteblanche.co.za", []);
                    console.log(`[CRON] Alert notification sent to SuperAdmin Lezanne.`);
                } catch (alertErr) {
                    console.error(`[CRON] FAILED to notify SuperAdmin Lezanne of failure: ${alertErr.message}`);
                }
            } else {
                console.warn(`[CRON] Retry attempt ${nextRetryCount} failed for doc ID: ${doc.id}: ${err.message}`);
            }

            await docRef.update(updates);
        }
    }
    return null;
});

exports.app = app;

