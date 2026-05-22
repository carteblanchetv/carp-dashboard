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
    console.log('Starting browser...');
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    
    console.log('Navigating to login...');
    await page.goto('https://www.carteblanchetv.co.za/index.php');

    console.log('\n--- MANUAL ACTION REQUIRED ---');
    console.log('1. Log in (with ReCAPTCHA and 2FA).');
    console.log('2. Navigate to the Commission story list.');
    console.log('3. Click on the Title of ANY SINGLE PROPOSAL (e.g., "The Loneliness Club") to open its details.');
    
    await prompt('\nPress ENTER in this terminal ONLY AFTER you are viewing the full details of a SINGLE proposal...');

    console.log('Extracting the detail page structure...');
    const html = await page.content();
    fs.writeFileSync('detail_dump.html', html);
    
    console.log('\nDetail Page HTML saved to detail_dump.html!');
    console.log('Closing browser...');
    await browser.close();
})();
