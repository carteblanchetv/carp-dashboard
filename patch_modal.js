const fs = require('fs');

// --- HTML PATCH ---
let htmlContent = fs.readFileSync('frontend/admin_dashboard.html', 'utf8');
const modalHTML = `
    <!-- EPISODE MODAL -->
    <div id="episodeModal" class="modal-overlay hidden">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 id="episodeModalTitle">Episode: </h3>
                <button type="button" class="btn-close" onclick="document.getElementById('episodeModal').classList.add('hidden')">&times;</button>
            </div>
            <div class="modal-body">
                <ul id="episodeModalList" class="episode-modal-list">
                    <!-- Populated by JS -->
                </ul>
            </div>
        </div>
    </div>

    <!-- Firebase SDKs -->`;

htmlContent = htmlContent.replace('    <!-- Firebase SDKs -->', modalHTML);
fs.writeFileSync('frontend/admin_dashboard.html', htmlContent);

// --- JS PATCH ---
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldSetTxDate = `window.setTxDateFilter = (txDate) => {
    if (!txDate || txDate === 'undefined') return;
    activeTxDateFilter = txDate;
    activeProducerFilter = null; // mutually exclusive for simplicity
    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('filterText').textContent = \`Filtering by TX Date: \${txDate}\`;
    const masqBtn = document.getElementById('masqueradeBtn');
    if (masqBtn) masqBtn.style.display = 'none';
    
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};`;

const newSetTxDate = `window.setTxDateFilter = (txDate) => {
    if (!txDate || txDate === 'undefined') return;

    // Filter globalProposals for this TX Date
    const matchingStories = globalProposals.filter(p => p.txDate && formatDate(p.txDate) === txDate);

    // Sort by Commission Number ascending
    matchingStories.sort((a, b) => {
        const numA = parseInt(a.commissionNumber) || Infinity;
        const numB = parseInt(b.commissionNumber) || Infinity;
        return numA - numB;
    });

    const modalList = document.getElementById('episodeModalList');
    if (modalList) {
        modalList.innerHTML = '';
        if (matchingStories.length === 0) {
            modalList.innerHTML = '<li>No stories found for this date.</li>';
        } else {
            matchingStories.forEach(story => {
                const li = document.createElement('li');
                li.innerHTML = \`<span class="comm-num">#\${story.commissionNumber || '—'}</span> <span class="story-title">\${story.story_title || 'Untitled'}</span>\`;
                modalList.appendChild(li);
            });
        }
    }

    const modalTitle = document.getElementById('episodeModalTitle');
    if (modalTitle) {
        modalTitle.textContent = \`Episode: \${txDate}\`;
    }

    document.getElementById('episodeModal').classList.remove('hidden');
};`;

if (jsContent.includes(oldSetTxDate)) {
    jsContent = jsContent.replace(oldSetTxDate, newSetTxDate);
} else {
    jsContent = jsContent.replace(oldSetTxDate.replace(/\n/g, '\r\n'), newSetTxDate);
}

// Remove filtering from renderProposals
const oldFilter = `    if (activeTxDateFilter) {
        filtered = filtered.filter(p => formatDate(p.txDate) === activeTxDateFilter);
    }`;
jsContent = jsContent.replace(oldFilter, '');
jsContent = jsContent.replace(oldFilter.replace(/\n/g, '\r\n'), '');

// Remove active class from populateEpisodesSidebar
const oldActive = `        if (activeTxDateFilter === date) {
            btn.classList.add('active');
        }`;
jsContent = jsContent.replace(oldActive, '');
jsContent = jsContent.replace(oldActive.replace(/\n/g, '\r\n'), '');

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Fixed HTML and JS for Episode Modal');
