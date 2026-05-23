const fs = require('fs');

// --- 1. HTML UPDATE ---
let htmlContent = fs.readFileSync('frontend/admin_dashboard.html', 'utf8');

// Add class to Story Title headers
htmlContent = htmlContent.replace(/<th>Story Title<\/th>/g, '<th class="col-story-title">Story Title</th>');

// Remove Status column from Commissioned Stories table
const oldCommHeaders = `<th>Comm #</th>
                            <th class="col-story-title">Story Title</th>
                            <th>Producer</th>
                            <th>Status</th>
                            <th>Actions</th>`;
const newCommHeaders = `<th>Comm #</th>
                            <th class="col-story-title">Story Title</th>
                            <th>Producer</th>
                            <th>Actions</th>`;
if (htmlContent.includes(oldCommHeaders)) {
    htmlContent = htmlContent.replace(oldCommHeaders, newCommHeaders);
} else {
    htmlContent = htmlContent.replace(oldCommHeaders.replace(/\n/g, '\r\n'), newCommHeaders);
}

// Remove empty colspan adjustment if needed
htmlContent = htmlContent.replace(/<td colspan="5" class="table-empty-msg">No commissioned stories.<\/td>/g, '<td colspan="4" class="table-empty-msg">No commissioned stories.</td>');

fs.writeFileSync('frontend/admin_dashboard.html', htmlContent);

// --- 2. JS UPDATE ---
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

// Remove Status column data from Commissioned table
const oldStatusRow = `                <td data-label="Producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('\${p.submittedBy}', '\${submitterDisplay.replace(/'/g, "\\\\'").replace(/"/g, '&quot;')}')">\${submitterDisplay}</a></td>
                <td data-label="Status"><span class="status-badge" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2);">IN PRODUCTION</span></td>
                <td data-label="Actions">`;

const newStatusRow = `                <td data-label="Producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('\${p.submittedBy}', '\${submitterDisplay.replace(/'/g, "\\\\'").replace(/"/g, '&quot;')}')">\${submitterDisplay}</a></td>
                <td data-label="Actions">`;

if (jsContent.includes(oldStatusRow)) {
    jsContent = jsContent.replace(oldStatusRow, newStatusRow);
} else {
    jsContent = jsContent.replace(oldStatusRow.replace(/\n/g, '\r\n'), newStatusRow);
}

fs.writeFileSync('frontend/admin.js', jsContent);

// --- 3. CSS UPDATE ---
let cssContent = fs.readFileSync('frontend/style.css', 'utf8');

const oldBtnCss = `    min-width: 100px !important;
    padding: 0 1rem !important;`;
const newBtnCss = `    min-width: auto !important;
    padding: 0 1.25rem !important;
    white-space: nowrap !important;`;

if (cssContent.includes(oldBtnCss)) {
    cssContent = cssContent.replace(oldBtnCss, newBtnCss);
} else {
    cssContent = cssContent.replace(oldBtnCss.replace(/\n/g, '\r\n'), newBtnCss);
}

const tableWidthCss = `
.col-story-title {
    width: 45%;
    min-width: 250px;
}
`;
if (!cssContent.includes('.col-story-title')) {
    cssContent += tableWidthCss;
}

fs.writeFileSync('frontend/style.css', cssContent);
console.log('Fixed tables and buttons layout');
