const puppeteer = require('puppeteer');
const fs = require('fs');

function waitForReady() {
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (fs.existsSync('ready.txt')) {
                clearInterval(interval);
                fs.unlinkSync('ready.txt');
                resolve();
            }
        }, 1000);
    });
}

(async () => {
    console.log('Loading existing proposals...');
    const proposals = JSON.parse(fs.readFileSync('proposals_export_full.json', 'utf8'));

    console.log('Starting browser for TX Date scrape v2...');
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    
    console.log('Navigating to login...');
    await page.goto('https://www.carteblanchetv.co.za/index.php');

    console.log('\n--- MANUAL ACTION REQUIRED ---');
    console.log('1. Log in (with ReCAPTCHA and 2FA).');
    
    console.log('\nWaiting for ready.txt to be created...');
    await waitForReady();

    console.log('\nStarting precise extraction of TX Dates...');
    
    const txUpdates = [];
    
    for (let i = 0; i < proposals.length; i++) {
        const p = proposals[i];
        console.log(`Checking [${i + 1}/${proposals.length}]: ${p.url}`);
        
        await page.goto(p.url, { waitUntil: 'domcontentloaded' });
        
        const txDate = await page.evaluate(() => {
            const allText = document.body.innerText;
            const targetPhrase = 'Back references from Insert in Show';
            const idx = allText.indexOf(targetPhrase);
            
            if (idx === -1) return null;
            
            // Extract the section immediately following the phrase
            const relevantSection = allText.substring(idx, idx + 1000);
            
            // Match the date format: "17 May 2026 - Carte Blanche HD"
            const match = relevantSection.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*-\s*Carte Blanche HD/i);
            return match ? match[1] : null;
        });
        
        if (txDate) {
            console.log(`--> Found real TX Date: ${txDate}`);
            txUpdates.push({
                commissionNumber: p.commissionNumber,
                txDate: txDate
            });
        }
        
        await new Promise(r => setTimeout(r, 400));
    }
    
    console.log(`\nFinished updating! Found ${txUpdates.length} REAL TX Dates.`);
    fs.writeFileSync('tx_dates_updates_v2.json', JSON.stringify(txUpdates, null, 2));
    console.log('Data successfully saved to tx_dates_updates_v2.json.');
    
    await browser.close();
    process.exit(0);
})();
