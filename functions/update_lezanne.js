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

// Initialize without service account - assuming environment has access (e.g. firebase-tools)
admin.initializeApp();
const db = admin.firestore();

async function updateLezanne() {
    const email = 'lezanne@carteblanche.co.za';
    console.log(`Updating surname for ${email}...`);
    
    // Check both UID and email-based docs
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    let updatedCount = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        // We need to decrypt the email to check
        // Or just check the ID if it's the email
        if (doc.id === email || doc.id.toLowerCase() === email) {
             await doc.ref.update({ surname: encrypt('Janse van Rensburg') });
             updatedCount++;
        }
    }
    
    console.log(`Updated ${updatedCount} records.`);
}

updateLezanne().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
