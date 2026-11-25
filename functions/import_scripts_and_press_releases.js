const fs = require('fs');
const path = require('path');

const workspaceDir = 'c:\\Users\\lizzy\\OneDrive - Combined Artistic Production CC\\antigravity\\scratch\\carp-dashboard';
const functionsDir = path.join(workspaceDir, 'functions');
require(path.join(functionsDir, 'node_modules', 'dotenv')).config({ path: path.join(functionsDir, '.env') });
const admin = require(path.join(functionsDir, 'node_modules', 'firebase-admin'));

const serviceAccount = require(path.join(functionsDir, 'serviceAccountKey.json'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanHtmlText(rawHtml) {
    if (!rawHtml) return '';
    let text = rawHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

async function main() {
    console.log('Loading old system files from scraper/exports/reports...');
    const dir = path.join(workspaceDir, 'scraper', 'exports', 'reports');
    const files = fs.readdirSync(dir);

    const oldByComm = new Map();
    const oldByTitle = new Map();

    for (const file of files) {
        const fullPath = path.join(dir, file);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch (e) { continue; }
        if (!data.url || !data.url.includes('/insert-view/')) continue;
        const html = data.rawHtml || '';

        // Commission Number
        let comm = null;
        const commMatch = html.match(/<span class=["']headin["']>\s*Commission\s*(?:Number|No|#)?\s*:?\s*<\/span>\s*([^\s<]+)/i)
            || html.match(/<span class=["']headin["']>\s*COMM(?:\s+NR|\s+NO|\s*#)?\s*:?\s*<\/span>\s*([^\s<]+)/i)
            || html.match(/Commission\s*#?\s*:?\s*(\d{3,5})/i);
        if (commMatch) comm = commMatch[1].trim();

        // Title
        let title = null;
        const titleMatch = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

        // Press Release
        let pressRelease = null;
        const prMatch = html.match(/<h4>Press Release:<\/h4>\s*<br>([\s\S]*?)(?=<h4>|<\/div>|<h3|$)/i);
        if (prMatch) {
            const cleaned = cleanHtmlText(prMatch[1]);
            if (cleaned.length > 0 && cleaned !== 'Not Available' && cleaned !== 'NA') {
                pressRelease = cleaned;
            }
        }

        // Script
        let script = null;
        const scMatch = html.match(/<h4>Script:<\/h4>\s*<br>([\s\S]*?)(?=<h4>|<\/div>|<h3|$)/i);
        if (scMatch) {
            let cleaned = cleanHtmlText(scMatch[1]);
            // Handle repeated script pastes
            if (cleaned.length > 100000) {
                const chunk = cleaned.substring(0, 100);
                const secondIdx = cleaned.indexOf(chunk, 500);
                if (secondIdx > 500) {
                    cleaned = cleaned.substring(0, secondIdx).trim();
                } else {
                    cleaned = cleaned.substring(0, 50000).trim();
                }
            }
            if (cleaned.length > 0 && cleaned !== 'Not Available' && cleaned !== 'NA') {
                script = cleaned;
            }
        }

        const record = { comm, title, pressRelease, script, file, url: data.url };
        if (comm) {
            if (!oldByComm.has(comm) || (!oldByComm.get(comm).script && script)) {
                oldByComm.set(comm, record);
            }
        }
        if (title) {
            const ct = cleanTitle(title);
            if (!oldByTitle.has(ct) || (!oldByTitle.get(ct).script && script)) {
                oldByTitle.set(ct, record);
            }
        }
    }

    console.log(`Loaded ${oldByComm.size} unique commission records from old CARP system.`);

    // 2. Fetch all proposals from Firestore
    console.log('Fetching all proposals from Firestore...');
    const snap = await db.collection('proposals').get();
    console.log(`Total proposals fetched: ${snap.size}`);

    let matchedByComm = 0;
    let matchedByTitle = 0;
    let notMatched = 0;

    let hasPrCount = 0;
    let hasScriptCount = 0;
    let hasBothCount = 0;
    let neitherCount = 0;

    let preservedExistingScript = 0;
    let preservedExistingPr = 0;

    const updates = [];

    snap.forEach(doc => {
        const d = doc.data();
        const docRef = doc.ref;
        const comm = String(d.commissionNumber || '').trim();
        const title = d.story_title || '';
        const ct = cleanTitle(title);

        let match = null;
        if (comm && comm !== '--' && oldByComm.has(comm)) {
            match = oldByComm.get(comm);
            matchedByComm++;
        } else if (ct && oldByTitle.has(ct)) {
            match = oldByTitle.get(ct);
            matchedByTitle++;
        } else {
            notMatched++;
        }

        const existingFs = d.details && d.details.finalScript ? d.details.finalScript : null;
        const existingScript = existingFs && existingFs.content && existingFs.content !== 'Not Available' && existingFs.content !== 'NA' && existingFs.content.length > 50
            ? existingFs.content
            : null;
        const existingPr = existingFs && existingFs.pressRelease && existingFs.pressRelease !== 'Not Available' && existingFs.pressRelease !== 'NA' && existingFs.pressRelease.length > 20
            ? existingFs.pressRelease
            : null;

        let finalScriptText = 'Not Available';
        let finalPrText = 'Not Available';

        if (existingScript) {
            finalScriptText = existingScript;
            preservedExistingScript++;
        } else if (match && match.script) {
            finalScriptText = match.script;
        }

        if (existingPr) {
            finalPrText = existingPr;
            preservedExistingPr++;
        } else if (match && match.pressRelease) {
            finalPrText = match.pressRelease;
        }

        if (finalPrText !== 'Not Available') hasPrCount++;
        if (finalScriptText !== 'Not Available') hasScriptCount++;
        if (finalPrText !== 'Not Available' && finalScriptText !== 'Not Available') hasBothCount++;
        if (finalPrText === 'Not Available' && finalScriptText === 'Not Available') neitherCount++;

        const finalScriptData = {
            content: finalScriptText,
            pressRelease: finalPrText,
            promoLines: existingFs && Array.isArray(existingFs.promoLines) ? existingFs.promoLines : [],
            updatedAt: new Date().toISOString()
        };

        updates.push({
            docRef,
            finalScriptData
        });
    });

    console.log(`\nPrepared ${updates.length} proposals for commit:`);
    console.log(`  - Matched by Comm:               ${matchedByComm}`);
    console.log(`  - Matched by Title:              ${matchedByTitle}`);
    console.log(`  - Not found (set Not Available): ${notMatched}`);
    console.log(`  - Final Script Available:        ${hasScriptCount}`);
    console.log(`  - Press Release Available:       ${hasPrCount}`);
    console.log(`  - Both Available:                ${hasBothCount}`);
    console.log(`  - Neither Available:             ${neitherCount}`);
    console.log(`  - Preserved New Scripts:         ${preservedExistingScript}`);
    console.log(`  - Preserved New PRs:             ${preservedExistingPr}`);

    console.log('\nStarting batch commit to Firestore...');
    const batchSize = 250;
    let committed = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
        const chunk = updates.slice(i, i + batchSize);
        const batch = db.batch();
        for (const item of chunk) {
            batch.set(item.docRef, {
                details: {
                    finalScript: item.finalScriptData
                }
            }, { merge: true });
        }
        await batch.commit();
        committed += chunk.length;
        console.log(`Committed ${committed} / ${updates.length} proposals...`);
    }

    console.log('\n✅ Successfully imported Press Release and Final Script Content to all stories!');
    process.exit(0);
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
