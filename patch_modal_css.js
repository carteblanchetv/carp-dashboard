const fs = require('fs');

let cssContent = fs.readFileSync('frontend/style.css', 'utf8');

// 1. Fix the top sticky gap for the sidebar
const oldSidebar = `.episodes-sidebar {
    grid-column: 1;
    width: 250px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem 1rem;
    position: sticky;
    top: 2rem;
    max-height: calc(100vh - 4rem);`;

const newSidebar = `.episodes-sidebar {
    grid-column: 1;
    width: 250px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem 1rem;
    position: sticky;
    top: 5rem;
    max-height: calc(100vh - 7rem);`;

cssContent = cssContent.replace(oldSidebar, newSidebar);
cssContent = cssContent.replace(oldSidebar.replace(/\n/g, '\r\n'), newSidebar);

// 2. Add Modal Styling
const modalStyles = `
/* === EPISODE MODAL === */
.episode-modal-list {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.episode-modal-list li {
    background: rgba(0, 143, 190, 0.05);
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 1rem;
    color: var(--text);
    font-size: 1rem;
}

.episode-modal-list li span.comm-num {
    font-weight: 700;
    color: var(--primary);
    min-width: 60px;
}

.episode-modal-list li span.story-title {
    font-weight: 500;
}
`;

fs.writeFileSync('frontend/style.css', cssContent + modalStyles);
console.log('Fixed sticky gap and added modal styles');
