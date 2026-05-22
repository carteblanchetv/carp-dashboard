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
    const proposals = JSON.parse(fs.readFileSync('proposals_export.json', 'utf8'));

    console.log('Starting browser for update scrape...');
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    
    console.log('Navigating to login...');
    await page.goto('https://www.carteblanchetv.co.za/index.php');

    console.log('\n--- MANUAL ACTION REQUIRED ---');
    console.log('1. Log in (with ReCAPTCHA and 2FA).');
    
    await prompt('\nPress ENTER in this terminal ONLY AFTER you are logged in to the dashboard...');

    console.log('\nStarting update extraction. This will skip the list and go straight to the 392 detail pages...');
    
    for (let i = 0; i < proposals.length; i++) {
        const p = proposals[i];
        console.log(`Updating [${i + 1}/${proposals.length}]: ${p.url}`);
        
        await page.goto(p.url, { waitUntil: 'domcontentloaded' });
        
        const extraData = await page.evaluate(() => {
            const cleanText = (str) => str.replace(/\s+/g, ' ').trim();
            
            const getTextAfterSpan = (labelStr) => {
                const spans = Array.from(document.querySelectorAll('span.headin'));
                const span = spans.find(s => s.textContent.trim() === labelStr || s.textContent.trim().startsWith(labelStr));
                if (!span) return '';
                
                let node = span.nextSibling;
                let text = '';
                while (node && !(node.tagName === 'SPAN' && node.className === 'headin') && node.tagName !== 'H3' && node.tagName !== 'BR' && node.tagName !== 'DIV') {
                    if (node.nodeType === 3) text += node.textContent;
                    else if (node.tagName === 'A') text += node.textContent;
                    node = node.nextSibling;
                }
                return cleanText(text);
            };

            const authorNode = document.querySelector('.col-sm-6.text-right strong a');
            
            // Note: In the HTML, the span is <span class="headin">Proposal Date:</span>
            return {
                submitterName: authorNode ? cleanText(authorNode.textContent) : '',
                proposalDate: getTextAfterSpan('Proposal Date:'),
                commissionNumber: getTextAfterSpan('Commission Number:'),
                duration: getTextAfterSpan('Duration:'),
                rate: getTextAfterSpan('Rate:'),
                acceptedBy: getTextAfterSpan('Accepted By:'),
                acceptedDate: getTextAfterSpan('Accepted Date:')
            };
        });
        
        // Merge the extra data
        proposals[i] = { ...p, ...extraData };
        
        await new Promise(r => setTimeout(r, 400));
    }
    
    console.log('\nFinished updating! Saving to proposals_export_full.json...');
    fs.writeFileSync('proposals_export_full.json', JSON.stringify(proposals, null, 2));
    console.log('Data successfully saved. You can close the browser now.');
    
    await browser.close();
    process.exit(0);
})();
