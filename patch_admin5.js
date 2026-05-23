const fs = require('fs');
let content = fs.readFileSync('frontend/admin.js', 'utf8');

const targetStr = `function renderProposals(proposals, canDelete) {
    const propTableBody = document.getElementById('proposalTableBody');`;

const replacementStr = `function renderProposals(proposals, canDelete) {
    populateEpisodesSidebar(globalProposals);
    const propTableBody = document.getElementById('proposalTableBody');`;

content = content.replace(targetStr, replacementStr);
content = content.replace(targetStr.replace(/\n/g, '\r\n'), replacementStr);

fs.writeFileSync('frontend/admin.js', content);
console.log('Added populateEpisodesSidebar call');
