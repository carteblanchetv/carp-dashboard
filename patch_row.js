const fs = require('fs');

let htmlContent = fs.readFileSync('frontend/index.html', 'utf8');

const oldCss = `.quick-link-btn {
            font-size: 0.85rem; 
            padding: 0.6rem 1rem; 
            background: var(--bg-card); 
            border: 1px solid var(--border); 
            border-radius: var(--radius-md); 
            color: var(--text-main); 
            text-decoration: none; 
            display: flex; 
            align-items: center; 
            gap: 0.5rem; 
            transition: all 0.2s;
            font-weight: 500;
        }`;

const newCss = `.quick-link-btn {
            font-size: 0.75rem; 
            padding: 0.5rem 0.5rem; 
            background: var(--bg-card); 
            border: 1px solid var(--border); 
            border-radius: var(--radius-md); 
            color: var(--text-main); 
            text-decoration: none; 
            display: flex; 
            align-items: center;
            justify-content: center;
            gap: 0.35rem; 
            transition: all 0.2s;
            font-weight: 600;
            flex: 1;
            white-space: nowrap;
        }`;

if (htmlContent.includes(oldCss)) {
    htmlContent = htmlContent.replace(oldCss, newCss);
} else {
    htmlContent = htmlContent.replace(oldCss.replace(/\n/g, '\r\n'), newCss);
}

const oldContainer = `<div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">`;
const newContainer = `<div style="display: flex; flex-wrap: nowrap; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; width: 100%;">`;

if (htmlContent.includes(oldContainer)) {
    htmlContent = htmlContent.replace(oldContainer, newContainer);
} else {
    htmlContent = htmlContent.replace(oldContainer.replace(/\n/g, '\r\n'), newContainer);
}

fs.writeFileSync('frontend/index.html', htmlContent);
console.log('Fixed quick links to be one row');
