const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

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
    _encrypted: true
  };
}

admin.initializeApp();
const db = admin.firestore();

async function ensureLezanne() {
    const email = 'lezanne@carteblanche.co.za';
    console.log(`Checking for ${email}...`);
    
    // Check by email as document ID (legacy format)
    const doc = await db.collection('users').doc(email).get();
    
    if (!doc.exists) {
        console.log("Lezanne not found. Creating record...");
        await db.collection('users').doc(email).set({
            name: encrypt('Lezanne'),
            surname: encrypt('Janse van Rensburg'),
            email: encrypt(email),
            role: 'super-admin',
            isEnabled: true,
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
            notifications: {
                insert_footage: false,
                episode_footage: false,
                control_sheet: false,
                proposal: false
            }
        });
        console.log("Lezanne record created successfully.");
    } else {
        console.log("Lezanne already exists in Firestore.");
    }
}

ensureLezanne().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
