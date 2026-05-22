const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');

function prompt(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

(async () => {
    console.log('Loading existing proposals...');
    const proposals = JSON.parse(fs.readFileSync('proposals_export_full.json', 'utf8'));

    console.log('Starting browser for TX Date scrape...');
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    
    console.log('Navigating to login...');
    await page.goto('https://www.carteblanchetv.co.za/index.php');

    console.log('\n--- MANUAL ACTION REQUIRED ---');
    console.log('1. Log in (with ReCAPTCHA and 2FA).');
    
    await prompt('\nPress ENTER in this terminal ONLY AFTER you are logged in to the dashboard...');

    console.log('\nStarting extraction of TX Dates. Looping through 392 pages...');
    
    const txUpdates = [];
    
    for (let i = 0; i < proposals.length; i++) {
        const p = proposals[i];
        console.log(`Checking [${i + 1}/${proposals.length}]: ${p.url}`);
        
        await page.goto(p.url, { waitUntil: 'domcontentloaded' });
        
        const txDate = await page.evaluate(() => {
            const html = document.documentElement.innerHTML;
            const match = html.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*-\s*Carte Blanche HD/i);
            return match ? match[1] : null;
        });
        
        if (txDate) {
            console.log(`--> Found TX Date: ${txDate}`);
            txUpdates.push({
                commissionNumber: p.commissionNumber,
                txDate: txDate
            });
        }
        
        await new Promise(r => setTimeout(r, 400));
    }
    
    console.log(`\nFinished updating! Found ${txUpdates.length} TX Dates.`);
    fs.writeFileSync('tx_dates_updates.json', JSON.stringify(txUpdates, null, 2));
    console.log('Data successfully saved to tx_dates_updates.json.');
    
    await browser.close();
    process.exit(0);
})();
