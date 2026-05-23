const fs = require('fs');

// --- 1. HTML UPDATE ---
let htmlContent = fs.readFileSync('frontend/index.html', 'utf8');

const oldSection = `<section class="quick-links-section" style="margin-top: 2rem; margin-bottom: 2rem; animation: fadeIn 0.5s ease-out;">`;
const newSection = `<section id="quickLinksSection" class="quick-links-section" style="margin-top: 2rem; margin-bottom: 2rem; opacity: 0; transition: opacity 0.4s ease-in-out;">`;

if (htmlContent.includes(oldSection)) {
    htmlContent = htmlContent.replace(oldSection, newSection);
} else {
    htmlContent = htmlContent.replace(oldSection.replace(/\n/g, '\r\n'), newSection);
}

fs.writeFileSync('frontend/index.html', htmlContent);

// --- 2. JS UPDATE ---
let jsContent = fs.readFileSync('frontend/js/dashboard.js', 'utf8');

const oldJs = `    // Reveal Grid smoothly
    const mainGrid = document.getElementById('mainCardsGrid');
    if (mainGrid) mainGrid.style.opacity = '1';`;

const newJs = `    // Reveal Grid smoothly
    const mainGrid = document.getElementById('mainCardsGrid');
    if (mainGrid) mainGrid.style.opacity = '1';
    
    // Reveal Quick Links smoothly
    const quickLinks = document.getElementById('quickLinksSection');
    if (quickLinks) quickLinks.style.opacity = '1';`;

if (jsContent.includes(oldJs)) {
    jsContent = jsContent.replace(oldJs, newJs);
} else {
    jsContent = jsContent.replace(oldJs.replace(/\n/g, '\r\n'), newJs);
}

fs.writeFileSync('frontend/js/dashboard.js', jsContent);
console.log('Fixed quick links fade-in logic');
