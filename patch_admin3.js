const fs = require('fs');
let content = fs.readFileSync('frontend/admin.js', 'utf8');

// 1. add setTxDateFilter
if (!content.includes('window.setTxDateFilter =')) {
    const newFuncs = `
window.setTxDateFilter = (txDate) => {
    if (!txDate || txDate === 'undefined') return;
    activeTxDateFilter = txDate;
    activeProducerFilter = null; // mutually exclusive for simplicity
    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('filterText').textContent = \`Filtering by TX Date: \${formatDate(txDate)}\`;
    const masqBtn = document.getElementById('masqueradeBtn');
    if (masqBtn) masqBtn.style.display = 'none';
    
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearFilters = () => {
    activeProducerFilter = null;
    activeTxDateFilter = null;
    document.getElementById('filterBar').style.display = 'none';
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
};
`;
    // Insert it before clearProducerFilter
    content = content.replace('window.clearProducerFilter = () => {', newFuncs + '\nwindow.clearProducerFilter = () => {');
}

// 2. Make sure setProducerFilter clears activeTxDateFilter
if (!content.includes('activeTxDateFilter = null;') && content.includes('activeProducerFilter = uid;')) {
    content = content.replace(
        'activeProducerFilter = uid;',
        'activeProducerFilter = uid;\n    activeTxDateFilter = null;'
    );
}

fs.writeFileSync('frontend/admin.js', content);
console.log('Fixed missing setTxDateFilter');
