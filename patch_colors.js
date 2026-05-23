const fs = require('fs');

// --- 1. ADMIN.JS UPDATE ---
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

// Change Decom to danger
const oldDecom = `<button class="btn-admin-cell warning" onclick="window.openDecommissionModal('\${p.id}')" style="background: var(--danger); color: white; border-color: var(--danger);">Decom</button>`;
const newDecom = `<button class="btn-admin-cell danger" onclick="window.openDecommissionModal('\${p.id}')">Decom</button>`;

if (jsContent.includes(oldDecom)) {
    jsContent = jsContent.replace(oldDecom, newDecom);
} else {
    jsContent = jsContent.replace(oldDecom.replace(/\n/g, '\r\n'), newDecom);
}

// Change Revert in Commissioned to warning (it was danger)
const oldRevertComm = `<button class="btn-admin-cell danger" onclick="window.handleProposalAction('\${p.id}', 'revert-to-pending')">Revert</button>`;
const newRevertComm = `<button class="btn-admin-cell warning" onclick="window.handleProposalAction('\${p.id}', 'revert-to-pending')">Revert</button>`;

if (jsContent.includes(oldRevertComm)) {
    jsContent = jsContent.replace(oldRevertComm, newRevertComm);
} else {
    jsContent = jsContent.replace(oldRevertComm.replace(/\n/g, '\r\n'), newRevertComm);
}

// Ensure Producer column <td> has class
const replaceAll = (str, find, replace) => str.split(find).join(replace);
jsContent = replaceAll(jsContent, 
    `<td data-label="Producer"><a href="#"`, 
    `<td data-label="Producer" class="col-producer"><a href="#"`
);

fs.writeFileSync('frontend/admin.js', jsContent);

// --- 2. HTML UPDATE ---
let htmlContent = fs.readFileSync('frontend/admin_dashboard.html', 'utf8');
htmlContent = replaceAll(htmlContent, `<th>Producer</th>`, `<th class="col-producer">Producer</th>`);
fs.writeFileSync('frontend/admin_dashboard.html', htmlContent);

// --- 3. CSS UPDATE ---
let cssContent = fs.readFileSync('frontend/style.css', 'utf8');
const producerCss = `
.col-producer {
    width: 15% !important;
    min-width: 180px !important;
}
`;
if (!cssContent.includes('.col-producer')) {
    cssContent += producerCss;
}
fs.writeFileSync('frontend/style.css', cssContent);

console.log('Fixed button colors and producer column width');
