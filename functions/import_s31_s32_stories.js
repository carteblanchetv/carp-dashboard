const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const workspaceDir = 'c:\\Users\\lizzy\\OneDrive - Combined Artistic Production CC\\antigravity\\scratch\\carp-dashboard';
const functionsDir = path.join(workspaceDir, 'functions');
require(path.join(functionsDir, 'node_modules', 'dotenv')).config({ path: path.join(functionsDir, '.env') });
const admin = require(path.join(functionsDir, 'node_modules', 'firebase-admin'));

const serviceAccount = require(path.join(functionsDir, 'serviceAccountKey.json'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    : Buffer.alloc(32);
const ALGORITHM = 'aes-256-gcm';

function decrypt(data) {
    if (!data || typeof data !== 'object' || !data._encrypted) return data;
    try {
        const iv = Buffer.from(data.iv, 'hex');
        const tag = Buffer.from(data.tag, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(data.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return data;
    }
}

function excelSerialToDate(serial) {
    if (!serial) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(serial).trim())) return String(serial).trim();
    const num = Number(serial);
    if (isNaN(num)) return String(serial).trim();
    const utcDays = Math.round(num - 25569);
    const utcValue = utcDays * 86400 * 1000;
    return new Date(utcValue).toISOString().slice(0, 10);
}

function formatDurationMMSS(rawDur) {
    const s = String(rawDur || '').trim();
    if (!s) return null;
    if (/^\d{1,2}:\d{2}$/.test(s)) {
        const parts = s.split(':');
        return `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }
    const mins = parseInt(s, 10);
    if (!isNaN(mins)) {
        return `${String(mins).padStart(2, '0')}:00`;
    }
    return s;
}

function splitFullName(fullName) {
    const clean = String(fullName || '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    }
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
    };
}

function loadSeasonRows(jsonPath, seasonNum) {
    const rawRows = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
    let currentDate = '';
    const dataRows = [];
    for (const r of rawRows.slice(1)) {
        const rawDate = String(r.G || '').trim();
        if (rawDate) {
            currentDate = excelSerialToDate(rawDate);
        }
        const comm = String(r.A || '').trim();
        const title = String(r.B || '').trim();
        const producer = String(r.C || '').trim();
        const oneLiner = String(r.D || '').trim();
        const summary = String(r.E || '').trim();
        const duration = String(r.F || '').trim();
        if (!comm && !title) continue;

        dataRows.push({
            season: String(seasonNum),
            rowNum: r.rowNum,
            comm,
            title,
            producer,
            oneLiner,
            summary,
            duration,
            episodeDate: currentDate
        });
    }
    return dataRows;
}

async function main() {
    const s31Rows = loadSeasonRows('C:\\Users\\lizzy\\.gemini\\antigravity\\brain\\aff4ac2e-0fb2-4565-b0c0-26080df3a8ad\\scratch\\s31_populated_rows.json', 31);
    const s32Rows = loadSeasonRows('C:\\Users\\lizzy\\.gemini\\antigravity\\brain\\aff4ac2e-0fb2-4565-b0c0-26080df3a8ad\\scratch\\s32_populated_rows.json', 32);

    console.log(`Loaded ${s31Rows.length} rows from S31_Populated.xlsx and ${s32Rows.length} rows from S32_Populated.xlsx.`);
    const allRows = [...s31Rows, ...s32Rows];

    // 1. Load & decrypt Firestore users
    const usersSnap = await db.collection('users').get();
    const users = [];
    usersSnap.forEach(doc => {
        const d = doc.data();
        const rawFirst = String(decrypt(d.firstName || d.name) || '').trim();
        const rawLast = String(decrypt(d.lastName || d.surname) || '').trim();
        const firstName = rawFirst === '--' ? '' : rawFirst;
        const lastName = rawLast === '--' ? '' : rawLast;
        const email = String(decrypt(d.email) || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();
        users.push({
            uid: doc.id,
            firstName,
            lastName,
            fullName,
            email,
            role: d.role
        });
    });

    function matchProducer(prodName) {
        const prodLower = prodName.toLowerCase().trim();
        const candidates = users.filter(u => {
            if (u.fullName.toLowerCase() === prodLower) return true;
            const f = u.firstName.toLowerCase();
            const l = u.lastName.toLowerCase();
            return f && l && prodLower.includes(f) && prodLower.includes(l);
        });
        if (candidates.length === 0) return null;
        return candidates.find(c => !c.uid.includes('@')) || candidates[0];
    }

    // 2. Group rows:
    // Comm #5580 ("Desmond D'Sa" on 2019-12-22 and "Kevin Kimwelle" on 2019-12-29) and
    // Comm #5543 ("Story Updates Sep 2019" on 2019-09-29 and "UPDATE Gluten" on 2019-10-06)
    // are distinct stories sharing a commission number, so keep them separate by (comm + title).
    // All other multi-row commission numbers (#5292, #5403, #5436, #5444, #5594) are repeat broadcasts of the same story.
    const distinctSharedComms = new Set(['5580', '5543']);
    const groups = new Map();

    for (const r of allRows) {
        const key = distinctSharedComms.has(r.comm)
            ? `${r.comm}::${r.title.toLowerCase()}`
            : r.comm;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(r);
    }

    console.log(`Grouped into ${groups.size} unique stories across S31 and S32.`);

    // 3. Check existing proposals in Firestore by (commissionNumber + story_title) or commissionNumber
    const existingSnap = await db.collection('proposals').get();
    const existingByKey = new Map();
    existingSnap.forEach(doc => {
        const d = doc.data();
        const c = String(d.commissionNumber || '').trim();
        const t = String(d.story_title || '').trim().toLowerCase();
        if (c) {
            const k = distinctSharedComms.has(c) ? `${c}::${t}` : c;
            existingByKey.set(k, { id: doc.id, data: d, ref: doc.ref });
        }
    });

    const toCreate = [];
    const toUpdate = [];
    let matchedProducerStories = 0;
    let plainTextProducerStories = 0;

    for (const [key, items] of groups.entries()) {
        // Sort items chronologically by episodeDate ascending so the earliest broadcast is primary
        const sortedItems = [...items].sort((a, b) => (a.episodeDate || '').localeCompare(b.episodeDate || ''));
        const uniqueDates = Array.from(new Set(sortedItems.map(i => i.episodeDate).filter(Boolean))).sort();
        const primaryTxDate = uniqueDates[0] || null;

        // Prefer non-REPEAT row as primary row (earliest non-REPEAT row)
        const nonRepeatRow = sortedItems.find(i => !/^repeat\b/i.test(i.title));
        const primaryRow = nonRepeatRow || sortedItems[0];

        const comm = primaryRow.comm;
        const cleanTitle = primaryRow.title.replace(/^REPEAT\s+/i, '').trim();
        const formattedDuration = formatDurationMMSS(primaryRow.duration);
        const producerName = primaryRow.producer;
        const matchedUser = matchProducer(producerName);

        let producerFields = {};
        if (matchedUser) {
            matchedProducerStories++;
            const split = splitFullName(producerName);
            producerFields = {
                submittedBy: matchedUser.uid,
                submittedByEmail: matchedUser.email,
                submittedByName: matchedUser.firstName || split.firstName,
                submittedBySurname: matchedUser.lastName || split.lastName,
                producer: producerName,
                producerName: producerName,
                producerEmail: matchedUser.email,
                producer_email: matchedUser.email,
                historicalSubmitterName: producerName
            };
        } else {
            plainTextProducerStories++;
            const split = splitFullName(producerName);
            producerFields = {
                submittedBy: 'HISTORICAL_IMPORT',
                submittedByEmail: 'imported@carteblanche.co.za',
                submittedByName: split.firstName,
                submittedBySurname: split.lastName,
                producer: producerName,
                producerName: producerName,
                historicalSubmitterName: producerName
            };
        }

        const txTimestamp = primaryTxDate
            ? admin.firestore.Timestamp.fromDate(new Date(`${primaryTxDate}T12:00:00Z`))
            : admin.firestore.FieldValue.serverTimestamp();

        const proposalData = {
            commissionNumber: comm,
            story_title: cleanTitle,
            one_liner: primaryRow.oneLiner || '',
            summary: primaryRow.summary || '',
            show: 'Carte Blanche',
            season: primaryRow.season,
            status: 'paid',
            isImported: true,
            notificationsMuted: true,
            txDate: primaryTxDate,
            txDates: uniqueDates,
            submittedAt: txTimestamp,
            acceptedAt: txTimestamp,
            paidAt: txTimestamp,
            ...producerFields,
            acceptanceDetails: {
                duration: formattedDuration,
                finalDuration: formattedDuration,
                rate: null,
                deliveryDate: primaryTxDate,
                acceptedBy: null,
                contractAccepted: true,
                isPaid: 'yes'
            }
        };

        if (existingByKey.has(key)) {
            const existing = existingByKey.get(key);
            const existingDates = Array.isArray(existing.data.txDates)
                ? existing.data.txDates
                : (existing.data.txDate ? [existing.data.txDate] : []);
            const mergedDates = Array.from(new Set([...uniqueDates, ...existingDates])).filter(Boolean).sort();
            const earliestTxDate = mergedDates[0] || primaryTxDate;
            const earliestTimestamp = earliestTxDate
                ? admin.firestore.Timestamp.fromDate(new Date(`${earliestTxDate}T12:00:00Z`))
                : txTimestamp;

            toUpdate.push({
                ref: existing.ref,
                comm,
                title: cleanTitle,
                data: {
                    ...proposalData,
                    txDate: earliestTxDate,
                    txDates: mergedDates,
                    submittedAt: earliestTimestamp,
                    acceptedAt: earliestTimestamp,
                    paidAt: earliestTimestamp,
                    acceptanceDetails: {
                        ...proposalData.acceptanceDetails,
                        deliveryDate: earliestTxDate
                    }
                }
            });
        } else {
            toCreate.push(proposalData);
        }
    }

    console.log(`Prepared ${toCreate.length} new proposals to create and ${toUpdate.length} existing proposals to update.`);
    console.log(`  - Linked to existing user accounts: ${matchedProducerStories}`);
    console.log(`  - Plain-text producer names (no account): ${plainTextProducerStories}`);

    const allOps = [
        ...toCreate.map(data => ({ type: 'create', ref: db.collection('proposals').doc(), data })),
        ...toUpdate.map(item => ({ type: 'update', ref: item.ref, data: item.data }))
    ];

    const batchSize = 100;
    let committed = 0;
    for (let i = 0; i < allOps.length; i += batchSize) {
        const chunk = allOps.slice(i, i + batchSize);
        const batch = db.batch();
        for (const op of chunk) {
            if (op.type === 'create') {
                batch.set(op.ref, op.data);
            } else {
                batch.set(op.ref, op.data, { merge: true });
            }
        }
        await batch.commit();
        committed += chunk.length;
        console.log(`Committed ${committed}/${allOps.length} stories to Firestore...`);
    }

    console.log('\n✅ Successfully imported all Season 31 and Season 32 stories to Delivered (status: "paid") with zero notifications!');
    process.exit(0);
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
