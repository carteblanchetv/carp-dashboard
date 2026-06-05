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

function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function findDuplicates() {
    console.log("Fetching all proposals from Firestore...");
    const snapshot = await db.collection('proposals').get();
    
    const proposals = [];
    snapshot.forEach(doc => {
        proposals.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`Total proposals retrieved: ${proposals.length}`);
    
    const duplicatesByTitle = {};
    const duplicatesByCommNum = {};
    
    proposals.forEach(p => {
        // 1. Group by normalized title
        if (p.story_title) {
            const normTitle = normalizeTitle(p.story_title);
            if (normTitle) {
                if (!duplicatesByTitle[normTitle]) {
                    duplicatesByTitle[normTitle] = [];
                }
                duplicatesByTitle[normTitle].push(p);
            }
        }
        
        // 2. Group by Commission Number
        if (p.commissionNumber) {
            const commNum = p.commissionNumber.toString().trim();
            if (commNum && commNum !== '—' && commNum !== '') {
                if (!duplicatesByCommNum[commNum]) {
                    duplicatesByCommNum[commNum] = [];
                }
                duplicatesByCommNum[commNum].push(p);
            }
        }
    });
    
    console.log("\n=== DUPLICATE ANALYSIS BY TITLE ===");
    let titleDupCount = 0;
    for (const [title, list] of Object.entries(duplicatesByTitle)) {
        if (list.length > 1) {
            titleDupCount++;
            console.log(`\nDuplicate Group #${titleDupCount} (Title: "${list[0].story_title}"):`);
            list.forEach(p => {
                console.log(`  - Doc ID: ${p.id} | Status: ${p.status} | Comm #: ${p.commissionNumber || 'N/A'} | isImported: ${p.isImported || false}`);
            });
        }
    }
    
    console.log("\n=== DUPLICATE ANALYSIS BY COMMISSION NUMBER ===");
    let commDupCount = 0;
    for (const [commNum, list] of Object.entries(duplicatesByCommNum)) {
        if (list.length > 1) {
            commDupCount++;
            console.log(`\nDuplicate Group #${commDupCount} (Commission #: "${commNum}"):`);
            list.forEach(p => {
                console.log(`  - Doc ID: ${p.id} | Title: "${p.story_title}" | Status: ${p.status} | isImported: ${p.isImported || false}`);
            });
        }
    }
    
    console.log(`\nFound ${titleDupCount} title duplicate groups and ${commDupCount} commission number duplicate groups.`);
}

findDuplicates().catch(console.error).finally(() => process.exit());
