const fs = require('fs');

// --- 1. CSS UPDATE ---
let cssContent = fs.readFileSync('frontend/style.css', 'utf8');
const iframeCSS = `
/* --- FCC IFRAME --- */
.fcc-iframe {
    width: 100%;
    height: 75vh;
    border: none;
    border-radius: 6px;
    background: #f8f9fa;
}
`;
if (!cssContent.includes('.fcc-iframe')) {
    fs.writeFileSync('frontend/style.css', cssContent + iframeCSS);
}

// --- 2. JS UPDATE ---
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

// Add globalSubmissions declaration if not exists
if (!jsContent.includes('let globalSubmissions = null;')) {
    const target = 'let globalProposals = [];';
    jsContent = jsContent.replace(target, target + '\nlet globalSubmissions = null;');
}

// Replace setTxDateFilter
const oldSetTxDate = `window.setTxDateFilter = (txDate) => {
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
                li.innerHTML = \`<span class="comm-num">#\${story.commissionNumber || '—'}</span> <a href="proposal?id=\${story.id}&view=preview" class="story-title" style="color: var(--primary); text-decoration: underline; font-weight: 500; cursor: pointer;">\${story.story_title || 'Untitled'}</a>\`;
                modalList.appendChild(li);
            });
        }
    }

    const modalTitle = document.getElementById('episodeModalTitle');
    if (modalTitle) {
        const firstStoryWithMeta = matchingStories.find(s => s.season || s.episode || s.uid);
        const s = firstStoryWithMeta || {};
        const uidDisplay = s.uid || '—';
        const seasonDisplay = s.season || '—';
        const episodeDisplay = s.episode || '—';
        
        modalTitle.innerHTML = \`
            Episode: \${txDate}
            <div style="font-size: 0.95rem; color: var(--text-light); font-weight: 500; margin-top: 0.4rem; letter-spacing: 0.5px;">
                UID: \${uidDisplay} &nbsp;&bull;&nbsp; Season: \${seasonDisplay} &nbsp;&bull;&nbsp; Episode: \${episodeDisplay}
            </div>
        \`;
    }

    document.getElementById('episodeModal').classList.add('active');
};`;

const newSetTxDate = `window.setTxDateFilter = async (txDate) => {
    if (!txDate || txDate === 'undefined') return;

    const modalList = document.getElementById('episodeModalList');
    const modalTitle = document.getElementById('episodeModalTitle');
    
    // Set basic title while loading
    if (modalTitle) {
        modalTitle.textContent = \`Episode: \${txDate}\`;
    }

    if (modalList) {
        modalList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Fetching document... <span class="spinner" style="display:inline-block; margin-left: 10px;">⏳</span></div>';
    }

    document.getElementById('episodeModal').classList.add('active');

    try {
        if (!globalSubmissions) {
            const response = await window.auth.fetchWithAuth('/api/admin/submissions');
            const data = await response.json();
            if (data.success) {
                globalSubmissions = data.submissions;
            } else {
                throw new Error(data.error || 'Failed to fetch submissions');
            }
        }

        // Find the FCC for this date
        // Note: txDate from sidebar is formatted. The API returns it unformatted or as a timestamp,
        // so we must format it to match the clicked txDate.
        const fcc = globalSubmissions.find(s => s.formType === 'control_sheet' && s.txDate && formatDate(s.txDate) === txDate);

        if (fcc) {
            // Update Title with Metadata from FCC
            if (modalTitle) {
                modalTitle.innerHTML = \`
                    Episode: \${txDate}
                    <div style="font-size: 0.95rem; color: var(--text-light); font-weight: 500; margin-top: 0.4rem; letter-spacing: 0.5px;">
                        UID: \${fcc.uid || '—'} &nbsp;&bull;&nbsp; Season: \${fcc.season || '—'} &nbsp;&bull;&nbsp; Episode: \${fcc.episode || '—'}
                    </div>
                \`;
            }

            // Inject iFrame
            if (modalList) {
                modalList.innerHTML = \`<iframe src="/api/admin/get-file?path=\${encodeURIComponent(fcc.storagePath)}&inline=true" class="fcc-iframe"></iframe>\`;
            }
        } else {
            if (modalList) {
                modalList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No FCC Document has been uploaded for this broadcast yet.</div>';
            }
        }
    } catch (e) {
        if (modalList) {
            modalList.innerHTML = \`<div style="padding: 2rem; text-align: center; color: #cc0000;">Error: \${e.message}</div>\`;
        }
    }
};`;

if (jsContent.includes(oldSetTxDate)) {
    jsContent = jsContent.replace(oldSetTxDate, newSetTxDate);
} else {
    jsContent = jsContent.replace(oldSetTxDate.replace(/\n/g, '\r\n'), newSetTxDate);
}

// Also update the injected modal width to 900px
const oldInject = `<div class="modal-card" style="max-width: 500px;">`;
const newInject = `<div class="modal-card" style="max-width: 900px;">`;
jsContent = jsContent.replace(oldInject, newInject);
jsContent = jsContent.replace(oldInject.replace(/\n/g, '\r\n'), newInject);

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Fixed JS logic for PDF Modal');
