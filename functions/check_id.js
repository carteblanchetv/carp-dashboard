const admin = require('firebase-admin');
const fs = require('fs');

if (admin.apps.length === 0) {
    if (fs.existsSync('./serviceAccountKey.json')) {
        admin.initializeApp({
            credential: admin.credential.cert(require('./serviceAccountKey.json')),
            projectId: 'cb-deliverables'
        });
    } else {
        admin.initializeApp({
            projectId: 'cb-deliverables'
        });
    }
}

const db = admin.firestore();

async function check() {
    try {
        const id = 'OZkzr70HKWWFtNZOi5rs';
        console.log(`Checking ID: ${id}`);
        
        const doc = await db.collection('proposals').doc(id).get();
        if (doc.exists) {
            console.log('Exists in proposals collection!');
            const data = doc.data();
            console.log('story_title:', data.story_title);
            console.log('one_liner:', data.one_liner);
            console.log('summary:', data.summary);
            console.log('status:', data.status);
            console.log('commissionNumber:', data.commissionNumber);
        } else {
            console.log('Not found in proposals collection.');
        }

        const sDoc = await db.collection('submissions').doc(id).get();
        if (sDoc.exists) {
            console.log('Exists in submissions collection!');
            const data = sDoc.data();
            console.log('story_title:', data.story_title);
            console.log('one_liner:', data.one_liner);
            console.log('summary:', data.summary);
            console.log('status:', data.status);
            console.log('commissionNumber:', data.commissionNumber);
        } else {
            console.log('Not found in submissions collection.');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => process.exit(0));
