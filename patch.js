const fs = require('fs');
let content = fs.readFileSync('functions/index.js', 'utf8');

// The `decommission` part was added successfully according to the log.
// Let's re-try replacing the `accept` parts.

const target1 = `commissionNumber = manualCommissionNumber || existingData.commissionNumber;
          finalAcceptedAt = existingData.acceptedAt || finalAcceptedAt;
      } else if (!commissionNumber) {
          commissionNumber = await getNextCommissionNumber();
      }`;

const replacement1 = `commissionNumber = manualCommissionNumber || existingData.commissionNumber;
          finalAcceptedAt = existingData.acceptedAt || finalAcceptedAt;
      } else if (storyType === 'TFU') {
          commissionNumber = null;
      } else if (!commissionNumber) {
          commissionNumber = await getNextCommissionNumber();
      }`;

content = content.replace(target1, replacement1);

const target2 = `status: 'accepted',
        commissionNumber: commissionNumber,
        acceptedAt: finalAcceptedAt,`;

const replacement2 = `status: 'accepted',
        commissionNumber: commissionNumber,
        storyType: storyType || 'Standard',
        acceptedAt: finalAcceptedAt,`;

content = content.replace(target2, replacement2);

fs.writeFileSync('functions/index.js', content);
console.log('Patched index.js part 2');
