const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin (using default credentials from environment)
admin.initializeApp({
  projectId: "cb-deliverables",
  storageBucket: "cb-deliverables.appspot.com"
});
const db = admin.firestore();

// Helper to convert "Wednesday, 20 May 2026" to a Firestore Timestamp
function parseDateString(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return admin.firestore.Timestamp.fromDate(parsed);
        }
    } catch (e) {
        console.warn(`Could not parse date: ${dateStr}`);
    }
    return admin.firestore.FieldValue.serverTimestamp();
}

(async () => {
    console.log('Loading updated proposals...');
    const proposals = JSON.parse(fs.readFileSync('../scraper/proposals_export_full.json', 'utf8'));

    console.log(`Ready to import ${proposals.length} proposals to Firestore...`);

    let importedCount = 0;
    const batchSize = 100;
    
    // Process in batches
    for (let i = 0; i < proposals.length; i += batchSize) {
        const batch = db.batch();
        const chunk = proposals.slice(i, i + batchSize);
        
        for (const p of chunk) {
            const docRef = db.collection('proposals').doc(); // Auto-generate ID
            
            // Map the data
            const proposalData = {
                // Top-level extracted fields
                story_title: p.title || '',
                one_liner: p.oneLiner || '',
                summary: p.summary || '',
                caseStudies: p.caseStudies || '',
                experts: p.experts || '',
                hidden_camera: p.hiddenCamera || 'No',
                legal_req: p.legal || 'No',
                txDate: p.txDate || null,
                
                // Fields from the updated scrape
                commissionNumber: p.commissionNumber || null,
                submittedAt: parseDateString(p.proposalDate),
                acceptedAt: parseDateString(p.acceptedDate),
                
                // Set metadata to indicate it's an imported historical record
                status: 'accepted',
                isImported: true,
                historicalSubmitterName: p.submitterName || 'Unknown',
                submittedBy: 'HISTORICAL_IMPORT',
                submittedByEmail: 'imported@carteblanche.co.za',
                
                // Insert Details (grouped)
                details: {
                    presenter: p.presenter || '',
                    researcher: p.researcher || '',
                    camera: p.camera || '',
                    dop: p.dop || '',
                    onlineEditor: p.onlineEditor || '',
                    cameraAssistant: p.cameraAssistant || '',
                    offlineEditor: p.offlineEditor || '',
                    afm: p.afm || '',
                    footageDeclaration: p.footageDeclaration || ''
                },
                
                // Acceptance Details
                acceptanceDetails: {
                    duration: p.duration || null,
                    rate: p.rate || null,
                    deliveryDate: p.deliveryDate || null, // Assuming you might have scraped it, else null
                    acceptedBy: p.acceptedBy || null,
                    contractAccepted: false,
                }
            };
            
            batch.set(docRef, proposalData);
        }
        
        await batch.commit();
        importedCount += chunk.length;
        console.log(`Imported ${importedCount}/${proposals.length}...`);
    }
    
    console.log('\n✅ All proposals have been successfully imported to Firestore without sending emails!');
    process.exit(0);
})();
