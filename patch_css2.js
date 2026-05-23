const fs = require('fs');
let content = fs.readFileSync('frontend/style.css', 'utf8');

const oldWrapper = `.admin-layout-wrapper {
    display: flex;
    gap: 2rem;
    max-width: 1600px;
    margin: 0 auto;
    align-items: flex-start;
    padding-right: 1rem;
}`;

const newWrapper = `.admin-layout-wrapper {
    display: grid;
    grid-template-columns: 250px 1fr 250px;
    width: 100%;
    max-width: 100%;
    gap: 2rem;
    align-items: start;
}`;

content = content.replace(oldWrapper, newWrapper);
content = content.replace(oldWrapper.replace(/\n/g, '\r\n'), newWrapper); // Try CRLF too just in case

const oldSidebar = `.episodes-sidebar {
    flex: 0 0 250px;
    background: var(--bg-card);`;

const newSidebar = `.episodes-sidebar {
    grid-column: 1;
    width: 250px;
    background: var(--bg-card);`;

content = content.replace(oldSidebar, newSidebar);
content = content.replace(oldSidebar.replace(/\n/g, '\r\n'), newSidebar);

const oldMain = `.admin-main-content {
    flex: 1;
    min-width: 0;
    padding-left: 0;
}`;

const newMain = `.admin-main-content {
    grid-column: 2;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding-left: 0;
}`;

content = content.replace(oldMain, newMain);
content = content.replace(oldMain.replace(/\n/g, '\r\n'), newMain);

// Also update media query
const oldMedia = `    .admin-layout-wrapper {
        flex-direction: column;
    }`;
const newMedia = `    .admin-layout-wrapper {
        display: flex;
        flex-direction: column;
    }`;
content = content.replace(oldMedia, newMedia);
content = content.replace(oldMedia.replace(/\n/g, '\r\n'), newMedia);

fs.writeFileSync('frontend/style.css', content);
console.log('Fixed CSS');
