const fs = require('fs');

// 1. Update admin.js to limit to 10 entries
let adminContent = fs.readFileSync('frontend/admin.js', 'utf8');
const oldSort = `const sortedDates = Array.from(txDates).sort((a, b) => new Date(b) - new Date(a));`;
const newSort = `const sortedDates = Array.from(txDates).sort((a, b) => new Date(b) - new Date(a)).slice(0, 10);`;
adminContent = adminContent.replace(oldSort, newSort);
fs.writeFileSync('frontend/admin.js', adminContent);

// 2. Update style.css for prettier sidebar
let cssContent = fs.readFileSync('frontend/style.css', 'utf8');

const oldSidebar = `.episodes-sidebar {
    grid-column: 1;
    width: 250px;
    background: var(--bg-card);
    border-right: 1px solid var(--border);
    border-radius: 0 8px 8px 0;
    padding: 1.5rem 1rem;
    position: sticky;
    top: 2rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    box-shadow: 2px 0 8px rgba(0,0,0,0.05);
    margin-top: 2rem;
}`;
const newSidebar = `.episodes-sidebar {
    grid-column: 1;
    width: 250px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem 1rem;
    position: sticky;
    top: 2rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    margin-top: 2rem;
}`;

const oldH3 = `.episodes-sidebar h3 {
    font-size: 1.1rem;
    color: var(--text);
    margin-bottom: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid var(--border);
    padding-bottom: 0.5rem;
}`;
const newH3 = `.episodes-sidebar h3 {
    font-size: 1rem;
    color: var(--primary);
    margin-bottom: 1.25rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.episodes-sidebar h3::before {
    content: "📺";
    font-size: 1.2rem;
}`;

const oldBtn = `.episodes-list button {
    width: 100%;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-light);
    font-size: 0.95rem;
    font-weight: 500;
    transition: all 0.2s;
}`;
const newBtn = `.episodes-list button {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-left: 3px solid transparent;
    padding: 0.7rem 0.8rem 0.7rem 1rem;
    border-radius: 0 6px 6px 0;
    cursor: pointer;
    color: var(--text);
    font-size: 0.95rem;
    font-weight: 500;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.episodes-list button::before {
    content: "•";
    color: var(--border);
    font-size: 1.5rem;
    line-height: 0.5;
    transition: color 0.2s;
}`;

const oldHover = `.episodes-list button:hover {
    background: rgba(0, 143, 190, 0.05);
    color: var(--primary);
}`;
const newHover = `.episodes-list button:hover {
    background: linear-gradient(90deg, rgba(0,143,190,0.08) 0%, rgba(0,143,190,0.02) 100%);
    color: var(--primary);
    transform: translateX(4px);
}
.episodes-list button:hover::before {
    color: var(--primary);
}`;

const oldActive = `.episodes-list button.active {
    background: rgba(0, 143, 190, 0.1);
    color: var(--primary);
    border-color: rgba(0, 143, 190, 0.2);
    font-weight: 600;
}`;
const newActive = `.episodes-list button.active {
    background: linear-gradient(90deg, rgba(0,143,190,0.15) 0%, rgba(0,143,190,0.02) 100%);
    color: var(--primary);
    border-left-color: var(--primary);
    font-weight: 600;
    transform: translateX(4px);
}
.episodes-list button.active::before {
    color: var(--primary);
    content: "📅";
    font-size: 1rem;
}`;

cssContent = cssContent.replace(oldSidebar, newSidebar);
cssContent = cssContent.replace(oldSidebar.replace(/\n/g, '\r\n'), newSidebar);

cssContent = cssContent.replace(oldH3, newH3);
cssContent = cssContent.replace(oldH3.replace(/\n/g, '\r\n'), newH3);

cssContent = cssContent.replace(oldBtn, newBtn);
cssContent = cssContent.replace(oldBtn.replace(/\n/g, '\r\n'), newBtn);

cssContent = cssContent.replace(oldHover, newHover);
cssContent = cssContent.replace(oldHover.replace(/\n/g, '\r\n'), newHover);

cssContent = cssContent.replace(oldActive, newActive);
cssContent = cssContent.replace(oldActive.replace(/\n/g, '\r\n'), newActive);

fs.writeFileSync('frontend/style.css', cssContent);
console.log('Fixed CSS & Admin Limit');
