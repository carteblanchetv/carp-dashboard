
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config({path: './.env'});

admin.initializeApp({
    projectId: 'cb-deliverables'
});

const db = admin.firestore();
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function decrypt(data) {
    if (!data || typeof data !== 'object' || !data._encrypted) return data;
    try {
        const iv = Buffer.from(data.iv, 'hex');
        const tag = Buffer.from(data.tag, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(data.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return null;
    }
}

async function findNombuso() {
    const snapshot = await db.collection('users').get();
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const name = decrypt(data.name);
        const surname = decrypt(data.surname);
        const email = decrypt(data.email);
        console.log(`USER: ${name} ${surname} <${email}>`, JSON.stringify(data, null, 2));
    });
    process.exit(0);
}

findNombuso();
