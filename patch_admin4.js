const fs = require('fs');
let content = fs.readFileSync('frontend/admin.js', 'utf8');

// 1. Fix populateEpisodesSidebar
const oldPopulate = `function populateEpisodesSidebar(proposals) {
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
}`;
const newPopulate = `function populateEpisodesSidebar(proposals) {
    const sidebarList = document.getElementById('episodesSidebarList');
    if (!sidebarList) return;

    const txDates = new Set();
    proposals.forEach(p => {
        if (p.txDate) {
            const formatted = formatDate(p.txDate);
            if (formatted !== '—') {
                txDates.add(formatted);
            }
        }
    });

    const sortedDates = Array.from(txDates).sort((a, b) => new Date(b) - new Date(a));

    sidebarList.innerHTML = '';
    
    if (sortedDates.length === 0) {
        sidebarList.innerHTML = '<li><span style="padding: 0.6rem 0.8rem; display: block; color: var(--text-muted); font-size: 0.9rem;">No episodes yet.</span></li>';
        return;
    }

    sortedDates.forEach(date => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = date;
        btn.onclick = () => window.setTxDateFilter(date);
        
        if (activeTxDateFilter === date) {
            btn.classList.add('active');
        }
        
        li.appendChild(btn);
        sidebarList.appendChild(li);
    });
}`;
if (content.includes(oldPopulate)) {
    content = content.replace(oldPopulate, newPopulate);
} else {
    // try removing carriage returns for the search
    content = content.replace(oldPopulate.replace(/\n/g, '\r\n'), newPopulate);
}

// 2. Fix the filtering logic inside renderProposals
const oldFilter = `    if (activeTxDateFilter) {
        filtered = filtered.filter(p => p.txDate === activeTxDateFilter);
    }`;
const newFilter = `    if (activeTxDateFilter) {
        filtered = filtered.filter(p => formatDate(p.txDate) === activeTxDateFilter);
    }`;
content = content.replace(oldFilter, newFilter);

// 3. Fix the setTxDateFilter text output since 'date' is already formatted
const oldSetFilter = `document.getElementById('filterText').textContent = \`Filtering by TX Date: \${formatDate(txDate)}\`;`;
const newSetFilter = `document.getElementById('filterText').textContent = \`Filtering by TX Date: \${txDate}\`;`;
content = content.replace(oldSetFilter, newSetFilter);

// 4. Re-add the clickable links in the Delivered table
const oldTableCode = `        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const paidDate = formatDate(p.paidAt);
            const txDateDisplay = p.txDate ? formatDate(p.txDate) : paidDate;
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? \`\${p.submittedByName} \${p.submittedBySurname}\` : p.submittedByEmail;`;
const newTableCode = `        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const paidDate = formatDate(p.paidAt);
            const rawFormattedTx = p.txDate ? formatDate(p.txDate) : '—';
            const txDateDisplay = rawFormattedTx !== '—' 
                ? \`<a href="#" onclick="event.preventDefault(); window.setTxDateFilter('\${rawFormattedTx}')" style="color: var(--primary); text-decoration: underline;" title="View all stories for this episode">\${rawFormattedTx}</a>\`
                : paidDate;
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? \`\${p.submittedByName} \${p.submittedBySurname}\` : p.submittedByEmail;`;
content = content.replace(oldTableCode, newTableCode);
content = content.replace(oldTableCode.replace(/\n/g, '\r\n'), newTableCode);


fs.writeFileSync('frontend/admin.js', content);
console.log('Fixed TX Dates logic');
