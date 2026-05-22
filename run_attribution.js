async function doAttribution() {
    console.log('Hitting the attribution endpoint...');
    try {
        const response = await fetch('https://us-central1-cb-deliverables.cloudfunctions.net/attributeProposals');
        
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
        
        if (data.success) {
            console.log(`Successfully attributed ${data.updatedCount} imported proposals!`);
        } else {
            console.error('Attribution failed:', data.error);
        }
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

doAttribution();
