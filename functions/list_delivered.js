const admin = require('firebase-admin');
const fs = require('fs');

if (!admin.apps.length) {
    if (fs.existsSync('./serviceAccountKey.json')) {
        admin.initializeApp({
            credential: admin.credential.cert(require('./serviceAccountKey.json'))
        });
    } else {
        admin.initializeApp({ projectId: 'cb-deliverables' });
    }
}

const db = admin.firestore();

function parseDate(txDate, paidAt) {
    if (txDate) {
        const d = new Date(txDate);
        if (!isNaN(d.getTime())) return d;
    }
    if (paidAt) {
        const d = paidAt._seconds ? new Date(paidAt._seconds * 1000) : new Date(paidAt);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date(0);
}

async function listDelivered() {
    const snapshot = await db.collection('proposals').where('status', '==', 'paid').get();
    const list = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        list.push({
            id: doc.id,
            title: data.story_title || 'Untitled',
            commissionNumber: data.commissionNumber || '—',
            txDate: data.txDate || null,
            paidAt: data.paidAt || null,
            dateObject: parseDate(data.txDate, data.paidAt)
        });
    });
    
    // Sort newest to oldest
    list.sort((a, b) => b.dateObject - a.dateObject);
    
    // Format to Markdown Table
    let markdown = "| Commission # | Story Title | TX Date / Sort Date | Doc ID |\n|---|---|---|---|\n";
    list.forEach(p => {
        const dateStr = p.txDate || (p.paidAt ? (p.paidAt._seconds ? new Date(p.paidAt._seconds * 1000).toLocaleDateString() : new Date(p.paidAt).toLocaleDateString()) : '—');
        markdown += `| **${p.commissionNumber}** | ${p.title} | ${dateStr} | \`${p.id}\` |\n`;
    });
    
    fs.writeFileSync('delivered_stories.md', markdown);
    console.log(`Successfully listed ${list.length} stories.`);
}

listDelivered().catch(console.error).finally(() => process.exit());
