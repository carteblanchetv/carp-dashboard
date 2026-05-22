const fs = require('fs');

async function doImport() {
    console.log('Reading proposals...');
    const proposals = JSON.parse(fs.readFileSync('./scraper/proposals_export_full.json', 'utf8'));

    console.log(`Sending ${proposals.length} proposals to the deployed import API...`);
    
    try {
        const response = await fetch('https://us-central1-cb-deliverables.cloudfunctions.net/importHistoricalProposals', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ proposals })
        });
        
        const data = await response.json();
        console.log('Response:', data);
        
        if (data.success) {
            console.log(`Successfully imported ${data.count} proposals!`);
        } else {
            console.error('Import failed:', data.error);
        }
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

doImport();
