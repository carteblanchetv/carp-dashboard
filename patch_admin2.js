const fs = require('fs');
let content = fs.readFileSync('frontend/admin.js', 'utf8');

// 1. Make sure activeTxDateFilter is defined
if (!content.includes('let activeTxDateFilter = null;')) {
    content = content.replace(
        `let activeProducerFilter = null;`,
        `let activeProducerFilter = null;\nlet activeTxDateFilter = null;`
    );
}

// 2. Add populateEpisodesSidebar
const populateFunc = `
function populateEpisodesSidebar(proposals) {
    const sidebarList = document.getElementById('episodesSidebarList');
    if (!sidebarList) return;

    // Extract unique txDates
    const txDates = new Set();
    proposals.forEach(p => {
        if (p.txDate && typeof p.txDate === 'string' && p.txDate.trim() !== '') {
            txDates.add(p.txDate);
        }
    });

    // Sort chronologically (newest first)
    const sortedDates = Array.from(txDates).sort((a, b) => new Date(b) - new Date(a));

    sidebarList.innerHTML = '';
    
    if (sortedDates.length === 0) {
        sidebarList.innerHTML = '<li><span style="padding: 0.6rem 0.8rem; display: block; color: var(--text-muted); font-size: 0.9rem;">No episodes yet.</span></li>';
        return;
    }

    sortedDates.forEach(date => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = formatDate(date);
        btn.onclick = () => window.setTxDateFilter(date);
        
        if (activeTxDateFilter === date) {
            btn.classList.add('active');
        }
        
        li.appendChild(btn);
        sidebarList.appendChild(li);
    });
}

function renderProposals`;

if (!content.includes('function populateEpisodesSidebar')) {
    content = content.replace('function renderProposals', populateFunc);
}

// 3. Call populateEpisodesSidebar inside renderProposals
const oldRenderBody = `function renderProposals(proposals, canDelete) {
    const propTableBody = document.getElementById('proposalTableBody');`;
const newRenderBody = `function renderProposals(proposals, canDelete) {
    populateEpisodesSidebar(globalProposals);

    const propTableBody = document.getElementById('proposalTableBody');`;
if (!content.includes('populateEpisodesSidebar(globalProposals);')) {
    content = content.replace(oldRenderBody, newRenderBody);
}

// 4. Update the filtered logic
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
if (content.includes(oldFilter)) {
    content = content.replace(oldFilter, newFilter);
}

fs.writeFileSync('frontend/admin.js', content);
console.log('Patched admin.js part 2');
