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
        console.log("Searching for 'Cederberg' or 'Joubert' in proposals and submissions...");
        const collections = ['proposals', 'submissions'];
        for (const col of collections) {
            const snapshot = await db.collection(col).get();
            snapshot.forEach(doc => {
                const data = doc.data();
                const str = JSON.stringify(data).toLowerCase();
                if (str.includes('cederberg') || str.includes('joubert') || str.includes('clanwilliam')) {
                    console.log(`Found match in ${col}! ID: ${doc.id}`);
                    console.log(`  story_title: ${JSON.stringify(data.story_title)}`);
                    console.log(`  one_liner: ${JSON.stringify(data.one_liner)}`);
                    console.log(`  summary: ${JSON.stringify(data.summary)}`);
                    console.log(`  status: ${data.status}`);
                    console.log(`  commissionNumber: ${data.commissionNumber}`);
                }
            });
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => process.exit(0));
