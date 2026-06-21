const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
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

const routes = {
    reports: 'https://www.carteblanchetv.co.za/reports',
    commission: 'https://www.carteblanchetv.co.za/inserts/commission',
    production: 'https://www.carteblanchetv.co.za/inserts/production',
    delivery: 'https://www.carteblanchetv.co.za/inserts/delivery',
    paid: 'https://www.carteblanchetv.co.za/inserts/paid',
    rejected: 'https://www.carteblanchetv.co.za/inserts/rejected'
};

(async () => {
    console.log('Starting browser...');
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();

    console.log('Navigating to portal for login...');
    await page.goto('https://www.carteblanchetv.co.za/index.php');

    console.log('\n--- MANUAL ACTION REQUIRED ---');
    console.log('1. Log in to the portal.');
    console.log('2. Once logged in, return here and press ENTER.');
    await prompt('\nPress ENTER only after you have successfully logged in...');

    // Create exports directory
    const baseExportDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(baseExportDir)) {
        fs.mkdirSync(baseExportDir);
    }

    for (const [key, url] of Object.entries(routes)) {
        console.log(`\n==========================================`);
        console.log(`Starting Section: ${key.toUpperCase()}`);
        console.log(`==========================================`);
        
        const sectionDir = path.join(baseExportDir, key);
        if (!fs.existsSync(sectionDir)) {
            fs.mkdirSync(sectionDir);
        }

        console.log(`Navigating to list: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        console.log('Extracting links from table...');
        let detailUrls = [];
        
        while (true) {
            // Get links from table cells (often a th or td with link)
            const newUrls = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('table tbody tr a, .Dtable tbody tr a'));
                return links.map(a => a.href).filter(href => href && !href.includes('javascript') && !href.endsWith('#'));
            });
            detailUrls = [...detailUrls, ...newUrls];
            console.log(`Found ${detailUrls.length} detail links so far...`);

            // Find next page button
            const nextBtn = await page.$('.paginate_button.next, #insert-tbl_next, #reports-tbl_next, [id$="_next"]');
            if (!nextBtn) {
                console.log('No next page button found.');
                break;
            }
            
            const nextDisabled = await page.evaluate(el => el.classList.contains('disabled') || el.hasAttribute('disabled'), nextBtn);
            if (nextDisabled) {
                console.log('Next page button is disabled (reached last page).');
                break;
            }

            console.log('Clicking next page...');
            await nextBtn.click();
            await new Promise(r => setTimeout(r, 2000)); // Wait for AJAX load
        }

        // Deduplicate URLs
        detailUrls = [...new Set(detailUrls)];
        console.log(`Total unique links to scrape for ${key}: ${detailUrls.length}`);

        // Scrape detail pages
        const results = [];
        for (let i = 0; i < detailUrls.length; i++) {
            const detailUrl = detailUrls[i];
            console.log(`[${key}] Scraping [${i + 1}/${detailUrls.length}]: ${detailUrl}`);
            
            try {
                await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
                
                const data = await page.evaluate(() => {
                    const cleanText = (str) => str.replace(/\s+/g, ' ').trim();
                    
                    const titleNode = document.querySelector('h2, h1');
                    const bodyContainer = document.querySelector('.main-content, .container, body');
                    
                    // Extract metadata key-value pairs (e.g., span.headin: value)
                    const metadata = {};
                    const spans = Array.from(document.querySelectorAll('span.headin'));
                    spans.forEach(span => {
                        const label = cleanText(span.textContent).replace(/:$/, '');
                        if (!label) return;
                        
                        let node = span.nextSibling;
                        let text = '';
                        while (node && !(node.tagName === 'SPAN' && node.className === 'headin') && node.tagName !== 'H3' && node.tagName !== 'DIV') {
                            if (node.nodeType === 3) text += node.textContent;
                            else if (node.tagName === 'A') text += node.textContent;
                            node = node.nextSibling;
                        }
                        metadata[label] = cleanText(text);
                    });

                    return {
                        url: location.href,
                        title: titleNode ? cleanText(titleNode.textContent) : '',
                        rawHtml: bodyContainer ? bodyContainer.innerHTML : '',
                        text: bodyContainer ? cleanText(bodyContainer.innerText) : '',
                        metadata: metadata
                    };
                });
                
                results.push(data);
                
                // Save incrementally
                fs.writeFileSync(
                    path.join(sectionDir, `item_${i + 1}.json`), 
                    JSON.stringify(data, null, 2)
                );
            } catch (err) {
                console.error(`Error scraping ${detailUrl}:`, err.message);
            }
            
            await new Promise(r => setTimeout(r, 800)); // Small delay to protect server
        }

        // Save complete section export
        fs.writeFileSync(
            path.join(sectionDir, `all_${key}_export.json`), 
            JSON.stringify(results, null, 2)
        );
        console.log(`Saved complete export for ${key} in exports/${key}/all_${key}_export.json`);
    }

    console.log('\nAll sections successfully scraped! You can close the browser now.');
    await browser.close();
    process.exit(0);
})();
