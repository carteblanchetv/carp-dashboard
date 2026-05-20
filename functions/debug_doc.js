
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'cb-deliverables'
    });
}

const db = admin.firestore();

async function check() {
    try {
        const id = 'Uackto32PS1M6n83g67a';
        const doc = await db.collection('proposals').doc(id).get();
        if (doc.exists) {
            console.log('Exists in proposals');
            const data = doc.data();
            console.log('Story Title:', data.story_title);
            console.log('Status:', data.status);
            console.log('Submitted By:', data.submittedBy);
        } else {
            const sDoc = await db.collection('submissions').doc(id).get();
            if (sDoc.exists) {
                console.log('Exists in submissions');
                const data = sDoc.data();
                console.log('Story Title:', data.story_title);
                console.log('Status:', data.status);
                console.log('Submitted By:', data.submittedBy);
            } else {
                console.log('Not found in proposals or submissions');
            }
        }
    } catch (e) {
        console.error('Error fetching from Firestore:', e.message);
        if (e.message.includes('credential')) {
            console.log('TIP: Try running "gcloud auth application-default login" if you have the CLI installed.');
        }
    }
}

check();
