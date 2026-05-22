const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');

// Helper function to prompt the user in the terminal
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
    console.log('Starting browser in semi-automated mode...');
    // Launch a visible browser so the user can manually handle 2FA and ReCAPTCHA
    const browser = await puppeteer.launch({ 
        headless: false, // Must be false to allow manual interaction
        defaultViewport: null // Use default window size
    });
    
    const page = await browser.newPage();
    
    console.log('Navigating to the old system login page...');
    await page.goto('https://www.carteblanchetv.co.za/index.php');

    console.log('\n--- MANUAL ACTION REQUIRED ---');
    console.log('1. Please log in using your email/username and password.');
    console.log('2. Complete the ReCAPTCHA.');
    console.log('3. Enter your Google Authenticator 2FA code.');
    console.log('4. Once you are fully logged in, navigate to the "Story Proposals" page.');
    
    // Wait for user to confirm they are ready
    await prompt('\nPress ENTER in this terminal ONLY AFTER you are on the Story Proposals page...');

    console.log('Extracting the page structure...');
    
    // We don't know the structure of the proposals yet, so our first step
    // is just to save the HTML of the page so the AI can analyze it.
    const html = await page.content();
    fs.writeFileSync('page_dump.html', html);
    
    console.log('\nPage HTML saved to page_dump.html!');
    console.log('Please share the contents of this file (or the file itself) so we can write the extraction logic.');

    console.log('\nClosing browser...');
    await browser.close();
})();
