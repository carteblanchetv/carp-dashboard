const fs = require('fs');
const path = require('path');
const file = 'c:/Users/lizzy/.gemini/antigravity/scratch/cb_forms/functions/index.js';

let content = fs.readFileSync(file, 'utf8');

const target = `    } else if (action === 'revert') {
      await docRef.update({ 
    if (extra_budget !== undefined) updateData.extra_budget = extra_budget;
    if (locations !== undefined) updateData.locations = locations;`;

const replacement = `    } else if (action === 'revert') {
      await docRef.update({ 
        status: 'accepted',
        paidAt: null,
        txDate: null
      });
      res.json({ success: true });
    } else {
      await docRef.update({ status: 'rejected' });
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/update-proposal-details', express.json(), async (req, res) => {
  try {
    const { id, details } = req.body;
    const docRef = admin.firestore().collection('proposals').doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    if (!canEditProposal(doc.data(), req.user)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    // --- CALL SHEET ENCRYPTION ---
    if (details && details.callSheet) {
        const cs = details.callSheet;
        const sensitiveFields = [
            'producer_phone', 'producer_id',
            'presenter_phone', 'presenter_id',
            'dop_phone', 'dop_id',
            'cam_assistant_phone', 'cam_assistant_id',
            'security_phone',
            'add1_phone', 'add1_id',
            'add2_phone', 'add2_id'
        ];
        sensitiveFields.forEach(f => {
            if (cs[f]) cs[f] = encrypt(cs[f]);
        });

        // Encrypt dynamic additional crew
        if (cs.additionalCrew && Array.isArray(cs.additionalCrew)) {
            cs.additionalCrew.forEach(member => {
                if (member.phone) member.phone = encrypt(member.phone);
                if (member.id) member.id = encrypt(member.id);
            });
        }
    }

    const { story_title, show, one_liner, summary, extra_budget, locations, ...others } = req.body;
    const updateData = {};
    
    if (details) {
        for (const key in details) {
            updateData[\`details.\${key}\`] = details[key];
        }
    }

    // Allow updating top-level fields too (e.g. for Admin edits or typos)
    if (story_title !== undefined) updateData.story_title = story_title;
    if (show !== undefined) updateData.show = show;
    if (one_liner !== undefined) updateData.one_liner = one_liner;
    if (summary !== undefined) updateData.summary = summary;
    if (extra_budget !== undefined) updateData.extra_budget = extra_budget;
    if (locations !== undefined) updateData.locations = locations;`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
  console.log("Target found! Replacing...");
  const newContent = normalizedContent.replace(normalizedTarget, normalizedReplacement);
  fs.writeFileSync(file, newContent, 'utf8');
  console.log("Replacement successful!");
} else {
  console.log("Target NOT found in file.");
  for (let i = 10; i < normalizedTarget.length; i++) {
    const sub = normalizedTarget.substring(0, i);
    if (!normalizedContent.includes(sub)) {
      console.log("Failed at substring of length:", i);
      console.log("Sub:", JSON.stringify(sub));
      break;
    }
  }
}
