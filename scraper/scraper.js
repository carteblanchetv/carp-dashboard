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
    console.log('1. Log in.');
    console.log('2. Navigate to the Commission story list.');
    console.log('3. Please change the "Show entries" dropdown on the table to 100 to speed up extraction.');
    
    await prompt('\nPress ENTER in this terminal ONLY AFTER you are on the list page...');

    console.log('\nExtracting all proposal links...');
    let urls = [];
    while (true) {
        const newUrls = await page.$$eval('.Dtable tbody tr th a', els => els.map(a => a.href));
        urls = [...urls, ...newUrls];
        console.log(`Found ${urls.length} links so far...`);
        
        const nextBtnDisabled = await page.$eval('#insert-tbl_next', el => el.classList.contains('disabled'));
        if (nextBtnDisabled) break;
        
        await page.click('#insert-tbl_next');
        await new Promise(r => setTimeout(r, 1500)); // wait for ajax/render
    }
    
    urls = [...new Set(urls)];
    console.log(`\nTotal unique proposals found: ${urls.length}`);
    
    const allProposals = [];
    
    console.log('\nStarting extraction. This might take a few minutes...');
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`Extracting [${i + 1}/${urls.length}]: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        
        const data = await page.evaluate(() => {
            const cleanText = (str) => str.replace(/\s+/g, ' ').trim();
            
            const getTextAfterSpan = (labelStr) => {
                const spans = Array.from(document.querySelectorAll('span.headin'));
                const span = spans.find(s => s.textContent.trim().startsWith(labelStr));
                if (!span) return '';
                
                let node = span.nextSibling;
                let text = '';
                while (node && !(node.tagName === 'SPAN' && node.className === 'headin') && node.tagName !== 'H3') {
                    if (node.nodeType === 3) {
                        text += node.textContent;
                    } else if (node.tagName === 'A') {
                        text += node.textContent;
                    } else if (node.tagName === 'BR') {
                        text += '\n';
                    }
                    node = node.nextSibling;
                }
                return cleanText(text);
            };

            const getH3SectionText = (h3Text, ignoreStrings = []) => {
                const h3s = Array.from(document.querySelectorAll('h3'));
                const h3 = h3s.find(h => h.textContent.trim() === h3Text);
                if (!h3) return '';
                
                let node = h3.nextSibling;
                let text = '';
                while (node && node.tagName !== 'H3') {
                    if (node.nodeType === 3) {
                        text += node.textContent;
                    } else if (node.tagName === 'H4' || node.tagName === 'STRONG') {
                        text += node.textContent + ': ';
                    } else if (node.tagName === 'BR') {
                        text += '\n';
                    }
                    node = node.nextSibling;
                }
                
                ignoreStrings.forEach(str => {
                    text = text.replace(new RegExp(str, 'gi'), '');
                });
                
                return cleanText(text);
            };

            const getTxDate = () => {
                const h4s = Array.from(document.querySelectorAll('h4'));
                const h4 = h4s.find(h => h.textContent.trim().includes('TX Date'));
                if (!h4) return '';
                
                let node = h4.nextSibling;
                let text = '';
                while (node && node.tagName !== 'H3' && node.tagName !== 'H4') {
                    if (node.nodeType === 3) text += node.textContent;
                    node = node.nextSibling;
                }
                return cleanText(text);
            };
            
            const titleNode = document.querySelector('h2');

            // Combine Summary, USP and Further Info
            const summary = getTextAfterSpan('Summary:');
            const usp = getTextAfterSpan('Unique Selling Point:');
            const furtherInfo = getTextAfterSpan('Further Information:');
            const combinedSummary = [summary, usp, furtherInfo].filter(s => s).join('\n\n');

            return {
                url: location.href,
                title: titleNode ? cleanText(titleNode.textContent) : '',
                oneLiner: getTextAfterSpan('One Liner'),
                summary: combinedSummary,
                caseStudies: getTextAfterSpan('Case Study:'),
                experts: getTextAfterSpan('Expert:'),
                hiddenCamera: getTextAfterSpan('Hidden Camera:'),
                legal: getTextAfterSpan('Legal:'),
                
                // Insert Details
                presenter: getTextAfterSpan('Presenter:'),
                researcher: getTextAfterSpan('Researcher:'),
                camera: getTextAfterSpan('Camera:'),
                dop: getTextAfterSpan('DOP:'),
                onlineEditor: getTextAfterSpan('Online Editor:'),
                cameraAssistant: getTextAfterSpan('Camera Assistant:'),
                offlineEditor: getTextAfterSpan('Offline Editor:'),
                afm: getTextAfterSpan('AFM:'),
                
                // Footage Declaration (ignoring specific string)
                footageDeclaration: getH3SectionText('Footage Declaration', ['I confirm that all footage agreements have been signed and submitted via Jotform: (Yes|No)']),
                
                txDate: getTxDate()
            };
        });
        
        allProposals.push(data);
        
        // Wait a small amount of time to avoid hammering the server
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('\nFinished extracting! Saving to proposals_export.json...');
    fs.writeFileSync('proposals_export.json', JSON.stringify(allProposals, null, 2));
    console.log('Data successfully saved. You can close the browser now.');
    
    await browser.close();
    process.exit(0);
})();
