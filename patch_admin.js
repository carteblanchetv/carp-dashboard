const fs = require('fs');
let content = fs.readFileSync('frontend/admin.js', 'utf8');

// 1. Add activeTxDateFilter
content = content.replace(
    `let activeProducerFilter = null;`,
    `let activeProducerFilter = null;\nlet activeTxDateFilter = null;`
);

// 2. Update filtered logic
const oldFilter = `    const filtered = activeProducerFilter 
        ? proposals.filter(p => p.submittedBy === activeProducerFilter)
        : proposals;`;
const newFilter = `    let filtered = proposals;
    if (activeProducerFilter) {
        filtered = filtered.filter(p => p.submittedBy === activeProducerFilter);
    }
    if (activeTxDateFilter) {
        filtered = filtered.filter(p => p.txDate === activeTxDateFilter);
    }`;
content = content.replace(oldFilter, newFilter);

// 3. Make TX Date clickable
const oldTxTd = `<td data-label="TX Date">\${txDateDisplay}</td>`;
const newTxTd = `<td data-label="TX Date"><a href="#" onclick="event.preventDefault(); window.setTxDateFilter('\${p.txDate}')" style="color: var(--primary); text-decoration: underline;" title="View all stories for this episode">\${txDateDisplay}</a></td>`;
content = content.replace(oldTxTd, newTxTd);

// 4. Update setProducerFilter to hide masquerade button if doing TX filter (not needed because it's separate, but let's clear txDate if setting producer)
const oldSetProducer = `window.setProducerFilter = (uid, name) => {
    activeProducerFilter = uid;
    document.getElementById('filterBar').style.display = 'flex';`;
const newSetProducer = `window.setProducerFilter = (uid, name) => {
    activeProducerFilter = uid;
    activeTxDateFilter = null;
    document.getElementById('filterBar').style.display = 'flex';`;
content = content.replace(oldSetProducer, newSetProducer);

// 5. Add setTxDateFilter and change clearProducerFilter to clearFilters
const oldClear = `window.clearProducerFilter = () => {
    activeProducerFilter = null;
    document.getElementById('filterBar').style.display = 'none';
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
};`;
const newClear = `window.setTxDateFilter = (txDate) => {
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
};`;
content = content.replace(oldClear, newClear);

fs.writeFileSync('frontend/admin.js', content);
console.log('Patched admin.js');
