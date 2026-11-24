const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('../functions/serviceAccountKey.json');
const crypto = require('crypto');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// Decryption helper for encrypted proposal fields if present
function decrypt(text) {
  if (!text) return text;
  try {
    const key = process.env.ENCRYPTION_KEY || 'carte-blanche-production-vault-2024-secure-key!';
    const hashKey = crypto.createHash('sha256').update(key).digest();
    const parts = text.split(':');
    if (parts.length !== 2) return text;
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text;
  }
}

function cleanPersonName(name, surname) {
  let full = `${name || ''} ${surname || ''}`.trim().toLowerCase();
  full = full.replace(/^(dr|dr\.|prof|prof\.|adv|adv\.|mr|mr\.|mrs|mrs\.|ms|ms\.)\s+/i, '');
  full = full.replace(/\s+/g, ' ').trim();
  return full;
}

function formatDisplayName(name, surname) {
  const n = (name || '').trim();
  const s = (surname || '').trim();
  if (n && s) {
    // If surname is already part of name
    if (n.toLowerCase().endsWith(s.toLowerCase())) return n;
    return `${n} ${s}`.replace(/\s+/g, ' ');
  }
  return (n || s).replace(/\s+/g, ' ');
}

async function runHarvest() {
  console.log('--- Starting Contacts Unified Harvest ---');
  const contactsMap = new Map();

  // 1. Process proposals first (case studies & experts)
  const proposalsSnap = await db.collection('proposals').get();
  console.log(`Processing ${proposalsSnap.size} proposals...`);

  proposalsSnap.forEach(doc => {
    const p = doc.data();
    const storyTitle = p.storyTitle || p.title || 'Untitled Story';
    const commNum = p.commissionNumber || p.commNum || '';
    const producer = p.producerName || p.producer || '';
    const year = p.year || (p.createdAt && p.createdAt._seconds ? new Date(p.createdAt._seconds * 1000).getFullYear() : '');

    // Case studies
    let csList = p.caseStudies;
    if (csList && csList._encrypted) {
      try { csList = JSON.parse(decrypt(csList)); } catch (e) { csList = null; }
    }
    if (Array.isArray(csList)) {
      csList.forEach(cs => {
        if (!cs) return;
        const name = typeof cs === 'string' ? cs : (cs.name || '');
        const surname = typeof cs === 'object' ? (cs.surname || '') : '';
        const role = typeof cs === 'object' ? (cs.role || 'Case Study') : 'Case Study';
        const phone = typeof cs === 'object' ? (cs.phone || cs.contactNumber || cs.cell || '') : '';
        const email = typeof cs === 'object' ? (cs.email || '') : '';
        const confidential = typeof cs === 'object' ? !!cs.confidential : false;

        const normKey = cleanPersonName(name, surname);
        if (!normKey || normKey.length < 3) return;

        const displayName = formatDisplayName(name, surname);
        const existing = contactsMap.get(normKey) || {
          name: name.trim(),
          surname: surname.trim(),
          fullName: displayName,
          type: 'case_study',
          role: role.trim() || 'Case Study',
          organization: '',
          phone: (phone || '').trim(),
          email: (email || '').trim(),
          confidential,
          hasSignedRelease: false,
          stories: [],
          source: 'proposal'
        };

        if (phone && !existing.phone) existing.phone = phone.trim();
        if (email && !existing.email) existing.email = email.trim();
        if (confidential) existing.confidential = true;
        if (role && role !== 'Case Study' && (!existing.role || existing.role === 'Case Study')) {
          existing.role = role.trim();
        }

        if (!existing.stories.some(s => s.proposalId === doc.id || (s.commissionNumber && s.commissionNumber === commNum))) {
          existing.stories.push({
            proposalId: doc.id,
            storyTitle,
            commissionNumber: commNum,
            producerName: producer,
            year,
            role: role.trim()
          });
        }
        contactsMap.set(normKey, existing);
      });
    }

    // Experts
    let exList = p.experts;
    if (exList && exList._encrypted) {
      try { exList = JSON.parse(decrypt(exList)); } catch (e) { exList = null; }
    }
    if (Array.isArray(exList)) {
      exList.forEach(ex => {
        if (!ex) return;
        const name = typeof ex === 'string' ? ex : (ex.name || '');
        const surname = typeof ex === 'object' ? (ex.surname || '') : '';
        const role = typeof ex === 'object' ? (ex.role || 'Expert') : 'Expert';
        const phone = typeof ex === 'object' ? (ex.phone || ex.contactNumber || ex.cell || '') : '';
        const email = typeof ex === 'object' ? (ex.email || '') : '';

        const normKey = cleanPersonName(name, surname);
        if (!normKey || normKey.length < 3) return;

        const displayName = formatDisplayName(name, surname);
        const existing = contactsMap.get(normKey) || {
          name: name.trim(),
          surname: surname.trim(),
          fullName: displayName,
          type: 'expert',
          role: role.trim() || 'Expert',
          organization: '',
          phone: (phone || '').trim(),
          email: (email || '').trim(),
          confidential: false,
          hasSignedRelease: false,
          stories: [],
          source: 'proposal'
        };

        // If existing was marked case_study, promote to expert
        existing.type = 'expert';
        if (role && role !== 'Expert' && (!existing.role || existing.role === 'Case Study' || existing.role === 'Expert')) {
          existing.role = role.trim();
        }
        if (phone && !existing.phone) existing.phone = phone.trim();
        if (email && !existing.email) existing.email = email.trim();

        if (!existing.stories.some(s => s.proposalId === doc.id || (s.commissionNumber && s.commissionNumber === commNum))) {
          existing.stories.push({
            proposalId: doc.id,
            storyTitle,
            commissionNumber: commNum,
            producerName: producer,
            year,
            role: role.trim()
          });
        }
        contactsMap.set(normKey, existing);
      });
    }
  });

  console.log(`Contacts from proposals: ${contactsMap.size}`);

  // 2. Fetch legal release form submissions
  const subSnap = await db.collection('submissions')
    .where('formType', 'in', ['participant_release', 'footage_release_agreement', 'footage_agreement', 'minor_release'])
    .get();

  console.log(`Processing ${subSnap.size} release form submissions...`);

  subSnap.forEach(doc => {
    const s = doc.data();
    const rawName = s.participantName || s.fullName || s.contributorName || s.footageOwnerName || s.ownerName || '';
    if (!rawName || rawName.trim().length < 2) return;

    const normKey = cleanPersonName(rawName, '');
    if (!normKey || normKey.length < 3) return;

    const parts = rawName.trim().replace(/\s+/g, ' ').split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    const phone = (s.contactNumber || s.phone || s.ownerPhone || s.participantContact || '').trim();
    let email = (s.participantEmail || s.ownerEmail || s.email || '').trim();
    if (email.includes('@carteblanche.co.za') || email.includes('@combinedartists.co.za')) {
      email = ''; // Skip internal producer fallback email
    }

    const isFootage = s.formType === 'footage_release_agreement' || s.formType === 'footage_agreement';
    const type = isFootage ? 'footage_licensor' : 'case_study';
    const storyTitle = s.storyTitle || s.storyName || 'Story';
    const commNum = s.commissionNumber || s.commission_number || '';
    const producer = s.producerName || '';

    const existing = contactsMap.get(normKey) || {
      name: firstName,
      surname: lastName,
      fullName: rawName.trim().replace(/\s+/g, ' '),
      type,
      role: isFootage ? 'Footage Licensor' : 'Release Signatory',
      organization: s.footageOwnerCompany || s.ownerEntity || '',
      phone: '',
      email: '',
      confidential: false,
      hasSignedRelease: true,
      releaseStoragePath: s.storagePath || '',
      releaseDocId: doc.id,
      stories: [],
      source: 'submission'
    };

    // Merge signed release details
    existing.hasSignedRelease = true;
    if (s.storagePath) existing.releaseStoragePath = s.storagePath;
    if (doc.id) existing.releaseDocId = doc.id;
    if (phone && !existing.phone) existing.phone = phone;
    if (email && !existing.email) existing.email = email;
    if (s.footageOwnerCompany && !existing.organization) existing.organization = s.footageOwnerCompany;
    if (isFootage && existing.type !== 'expert') existing.type = 'footage_licensor';

    if (!existing.stories.some(st => st.submissionId === doc.id || (st.commissionNumber && st.commissionNumber === commNum))) {
      existing.stories.push({
        submissionId: doc.id,
        storyTitle,
        commissionNumber: commNum,
        producerName: producer,
        formType: s.formType,
        hasRelease: true
      });
    }
    contactsMap.set(normKey, existing);
  });

  console.log(`Total unified contacts after merging: ${contactsMap.size}`);

  let withPhoneCount = 0;
  let withEmailCount = 0;
  let withReleaseCount = 0;

  for (const [k, c] of contactsMap.entries()) {
    if (c.phone) withPhoneCount++;
    if (c.email) withEmailCount++;
    if (c.hasSignedRelease) withReleaseCount++;
  }
  console.log(`Summary: With Phone: ${withPhoneCount}, With Email: ${withEmailCount}, With Signed Release: ${withReleaseCount}`);

  // 3. Clear existing /contacts and batch commit unified contacts
  console.log('Fetching old contacts to clean up duplicates...');
  const oldSnap = await db.collection('contacts').get();
  console.log(`Deleting ${oldSnap.size} old un-unified contact docs...`);
  for (let i = 0; i < oldSnap.docs.length; i += 400) {
    const b = db.batch();
    oldSnap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
    await b.commit();
  }
  console.log('Old contacts cleaned.');

  console.log('Writing clean unified contacts in batches...');
  const contactsColl = db.collection('contacts');
  const entries = Array.from(contactsMap.entries());
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + 400);

    for (const [normKey, data] of chunk) {
      // Deterministic doc ID from normalized name
      const safeId = Buffer.from(`name:${normKey}`).toString('base64').replace(/[/+=]/g, '_').slice(0, 40);
      const docRef = contactsColl.doc(safeId);
      batch.set(docRef, {
        ...data,
        updatedAt: now,
        _autoHarvested: true
      });
    }
    await batch.commit();
    console.log(`Committed chunk ${i + chunk.length} / ${entries.length}`);
  }

  console.log('--- Contacts Unified Harvest Completed Successfully! ---');
}

runHarvest().catch(console.error);
