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

async function removeDuplicates() {
    console.log("Fetching all proposals...");
    const snapshot = await db.collection('proposals').get();
    
    const proposals = [];
    snapshot.forEach(doc => {
        proposals.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`Total proposals: ${proposals.length}`);
    
    // Group proposals by both Normalized Title and Commission Number (if available)
    const titleGroups = {};
    const commGroups = {};
    
    proposals.forEach(p => {
        if (p.story_title) {
            const norm = normalizeTitle(p.story_title);
            if (norm) {
                if (!titleGroups[norm]) titleGroups[norm] = [];
                titleGroups[norm].push(p);
            }
        }
        if (p.commissionNumber) {
            const comm = p.commissionNumber.toString().trim();
            if (comm && comm !== '—' && comm !== '') {
                if (!commGroups[comm]) commGroups[comm] = [];
                commGroups[comm].push(p);
            }
        }
    });
    
    const docsToDelete = new Set();
    const deletionDetails = [];
    
    // Helper to evaluate a duplicate group and schedule deletion of imported duplicates
    function processGroup(group, groupName, groupValue) {
        // Filter out any documents that have already been marked for deletion
        const activeGroup = group.filter(p => !docsToDelete.has(p.id));
        if (activeGroup.length <= 1) return;
        
        const manualProps = activeGroup.filter(p => !p.isImported && p.submittedByEmail !== 'imported@carteblanche.co.za');
        const importedProps = activeGroup.filter(p => p.isImported || p.submittedByEmail === 'imported@carteblanche.co.za');
        
        // If we have both manual and imported copies, delete the imported copies!
        if (manualProps.length > 0 && importedProps.length > 0) {
            importedProps.forEach(imp => {
                if (!docsToDelete.has(imp.id)) {
                    docsToDelete.add(imp.id);
                    deletionDetails.push({
                        id: imp.id,
                        title: imp.story_title,
                        commNumber: imp.commissionNumber || 'N/A',
                        reason: `Duplicate of manual proposal: "${manualProps[0].story_title}" (${manualProps[0].id}) matching by ${groupName} "${groupValue}"`
                    });
                }
            });
        } 
        // If we only have imported copies, keep one and delete the rest!
        else if (manualProps.length === 0 && importedProps.length > 1) {
            const keeper = importedProps[0];
            const toDelete = importedProps.slice(1);
            toDelete.forEach(imp => {
                if (!docsToDelete.has(imp.id)) {
                    docsToDelete.add(imp.id);
                    deletionDetails.push({
                        id: imp.id,
                        title: imp.story_title,
                        commNumber: imp.commissionNumber || 'N/A',
                        reason: `Multiple imports detected. Keeping: "${keeper.story_title}" (${keeper.id}) matching by ${groupName} "${groupValue}"`
                    });
                }
            });
        }
    }
    
    // Process groups (first by Comm #, then by Title)
    for (const [comm, group] of Object.entries(commGroups)) {
        processGroup(group, 'Comm #', comm);
    }

    for (const [title, group] of Object.entries(titleGroups)) {
        processGroup(group, 'Title', title);
    }
    
    console.log(`\nFound ${docsToDelete.size} imported duplicate proposals to delete.`);
    
    if (docsToDelete.size === 0) {
        console.log("No duplicate imported proposals found.");
        return;
    }
    
    // Perform deletion in batches
    const deleteList = Array.from(docsToDelete);
    const batchSize = 100;
    let deletedCount = 0;
    
    for (let i = 0; i < deleteList.length; i += batchSize) {
        const batch = db.batch();
        const chunk = deleteList.slice(i, i + batchSize);
        
        chunk.forEach(id => {
            const detail = deletionDetails.find(d => d.id === id);
            console.log(`Deleting Duplicate: "${detail.title}" (${id}) - Reason: ${detail.reason}`);
            batch.delete(db.collection('proposals').doc(id));
        });
        
        await batch.commit();
        deletedCount += chunk.length;
        console.log(`Deleted ${deletedCount}/${deleteList.length}...`);
    }
    
    console.log(`\n✅ Successfully deleted all ${deletedCount} duplicate imported proposals.`);
}

removeDuplicates().catch(console.error).finally(() => process.exit());
