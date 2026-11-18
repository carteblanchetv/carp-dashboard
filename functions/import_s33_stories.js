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

async function main() {
    const xlsxJsonPath = 'C:\\Users\\lizzy\\.gemini\\antigravity\\brain\\aff4ac2e-0fb2-4565-b0c0-26080df3a8ad\\scratch\\s33_populated_rows.json';
    const rawRows = JSON.parse(fs.readFileSync(xlsxJsonPath, 'utf8').replace(/^\uFEFF/, ''));

    // Forward-fill episode date across each weekly episode block
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

    console.log(`Loaded ${dataRows.length} rows from updated S33_Populated.xlsx.`);

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

    // 2. Group rows by Commission Number
    const byComm = new Map();
    for (const r of dataRows) {
        if (!byComm.has(r.comm)) {
            byComm.set(r.comm, []);
        }
        byComm.get(r.comm).push(r);
    }

    console.log(`Grouped into ${byComm.size} unique Commission Numbers.`);

    // 3. Check existing proposals in Firestore by commissionNumber
    const existingSnap = await db.collection('proposals').get();
    const existingByComm = new Map();
    existingSnap.forEach(doc => {
        const d = doc.data();
        const c = String(d.commissionNumber || '').trim();
        if (c) existingByComm.set(c, { id: doc.id, data: d, ref: doc.ref });
    });

    const toCreate = [];
    const toUpdate = [];
    let matchedProducerStories = 0;
    let plainTextProducerStories = 0;

    for (const [comm, items] of byComm.entries()) {
        const uniqueDates = Array.from(new Set(items.map(i => i.episodeDate).filter(Boolean))).sort();
        const primaryTxDate = uniqueDates[0] || null;

        const nonRepeatRow = items.find(i => !/^repeat\b/i.test(i.title));
        const primaryRow = nonRepeatRow || items[0];

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
            season: '33',
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

        if (existingByComm.has(comm)) {
            const existing = existingByComm.get(comm);
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
    if (toUpdate.length > 0) {
        console.log('  - Updating existing proposals:', toUpdate.map(u => `#${u.comm} -> txDates: [${u.data.txDates.join(', ')}]`).join('; '));
    }

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

    console.log('\n✅ Successfully imported all Season 33 stories to Delivered (status: "paid") with zero notifications!');
    process.exit(0);
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
