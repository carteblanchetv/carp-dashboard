const fs = require('fs');

let htmlContent = fs.readFileSync('frontend/index.html', 'utf8');

// Update Legal & Admin Forms margin
const oldLegalH3 = `<h3 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; padding-left: 0.2rem;">Legal &amp; Admin Forms</h3>`;
const newLegalH3 = `<h3 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; padding-left: 0.2rem;">Legal &amp; Admin Forms</h3>`;

if (htmlContent.includes(oldLegalH3)) {
    htmlContent = htmlContent.replace(oldLegalH3, newLegalH3);
} else {
    htmlContent = htmlContent.replace(oldLegalH3.replace(/\n/g, '\r\n'), newLegalH3);
}

// Update section bottom margin
const oldQuickLinks = `<section class="quick-links-section" style="margin-top: 1rem; margin-bottom: 3rem; animation: fadeIn 0.5s ease-out;">`;
const newQuickLinks = `<section class="quick-links-section" style="margin-top: 2rem; margin-bottom: 2rem; animation: fadeIn 0.5s ease-out;">`;

if (htmlContent.includes(oldQuickLinks)) {
    htmlContent = htmlContent.replace(oldQuickLinks, newQuickLinks);
} else {
    htmlContent = htmlContent.replace(oldQuickLinks.replace(/\n/g, '\r\n'), newQuickLinks);
}

// Update My Stories top margin
const oldStories = `<section id="storiesSection" class="dashboard-section hidden" style="margin-top: 3rem;">`;
const newStories = `<section id="storiesSection" class="dashboard-section hidden" style="margin-top: 2rem;">`;

if (htmlContent.includes(oldStories)) {
    htmlContent = htmlContent.replace(oldStories, newStories);
} else {
    htmlContent = htmlContent.replace(oldStories.replace(/\n/g, '\r\n'), newStories);
}

fs.writeFileSync('frontend/index.html', htmlContent);
console.log('Fixed padding alignment');
