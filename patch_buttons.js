const fs = require('fs');

let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

jsContent = jsContent.replace('>View Proposal<', '>Preview<');
jsContent = jsContent.replace('>Decommission<', '>Decom<');

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Renamed buttons in admin.js');
