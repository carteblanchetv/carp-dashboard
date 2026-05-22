const fs = require('fs');

async function run() {
    console.log('Reading tx_dates_updates_v2.json...');
    const data = JSON.parse(fs.readFileSync('tx_dates_updates_v2.json', 'utf8'));
    
    console.log(`Loaded ${data.length} updates. Sending to Cloud Function...`);
    
    const response = await fetch('https://us-central1-cb-deliverables.cloudfunctions.net/updateTxDates', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates: data })
    });
    
    const result = await response.json();
    console.log('Result:', result);
}

run();
