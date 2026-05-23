const fs = require('fs');
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldModalTitleLogic = `    const modalTitle = document.getElementById('episodeModalTitle');
    if (modalTitle) {
        modalTitle.textContent = \`Episode: \${txDate}\`;
    }`;

const newModalTitleLogic = `    const modalTitle = document.getElementById('episodeModalTitle');
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
    }`;

if (jsContent.includes(oldModalTitleLogic)) {
    jsContent = jsContent.replace(oldModalTitleLogic, newModalTitleLogic);
} else {
    jsContent = jsContent.replace(oldModalTitleLogic.replace(/\n/g, '\r\n'), newModalTitleLogic);
}

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Added metadata to modal title');
