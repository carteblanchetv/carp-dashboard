const fs = require('fs');

// --- 1. CSS UPDATE ---
let cssContent = fs.readFileSync('frontend/style.css', 'utf8');

const oldModalCard = `.modal-card {
    background: var(--bg-card);
    width: 100%;
    max-width: 550px;
    border-radius: var(--radius-lg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border);
    overflow: hidden;
    transform: translateY(20px);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}`;

const newModalCard = `.modal-card {
    background: var(--bg-card);
    width: 100%;
    max-width: 550px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border);
    overflow: hidden;
    transform: translateY(20px);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}`;

const oldModalBody = `.modal-body {
    padding: 2rem;
}`;

const newModalBody = `.modal-body {
    padding: 2rem;
    overflow-y: auto;
    flex: 1;
}`;

if (cssContent.includes(oldModalCard)) {
    cssContent = cssContent.replace(oldModalCard, newModalCard);
} else {
    cssContent = cssContent.replace(oldModalCard.replace(/\n/g, '\r\n'), newModalCard);
}

if (cssContent.includes(oldModalBody)) {
    cssContent = cssContent.replace(oldModalBody, newModalBody);
} else {
    cssContent = cssContent.replace(oldModalBody.replace(/\n/g, '\r\n'), newModalBody);
}

fs.writeFileSync('frontend/style.css', cssContent);

// --- 2. JS UPDATE ---
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldClose = `onclick="document.getElementById('episodeModal').classList.remove('active')"`;
const newClose = `onclick="document.getElementById('episodeModal').classList.remove('active'); document.body.style.overflow = '';"`;

if (jsContent.includes(oldClose)) {
    jsContent = jsContent.replace(oldClose, newClose);
} else {
    jsContent = jsContent.replace(oldClose.replace(/\n/g, '\r\n'), newClose);
}

const oldOpen = `    document.getElementById('episodeModal').classList.add('active');`;
const newOpen = `    document.getElementById('episodeModal').classList.add('active');\n    document.body.style.overflow = 'hidden';`;

if (jsContent.includes(oldOpen)) {
    jsContent = jsContent.replace(oldOpen, newOpen);
} else {
    jsContent = jsContent.replace(oldOpen.replace(/\n/g, '\r\n'), newOpen);
}

// Ensure background click also restores scrolling
const oldBackdropClick = `window.onclick = (event) => {
    const modals = [
        document.getElementById('statusModal'),
        document.getElementById('deliveryModal'),
        document.getElementById('decommissionModal'),
        document.getElementById('editCommissionModal'),
        document.getElementById('episodeModal')
    ];
    modals.forEach(m => {
        if (event.target === m) {
            m.classList.remove('active');
        }
    });
};`;
const newBackdropClick = `window.onclick = (event) => {
    const modals = [
        document.getElementById('statusModal'),
        document.getElementById('deliveryModal'),
        document.getElementById('decommissionModal'),
        document.getElementById('editCommissionModal'),
        document.getElementById('episodeModal')
    ];
    modals.forEach(m => {
        if (event.target === m) {
            m.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
};`;
if (jsContent.includes(oldBackdropClick)) {
    jsContent = jsContent.replace(oldBackdropClick, newBackdropClick);
} else {
    jsContent = jsContent.replace(oldBackdropClick.replace(/\n/g, '\r\n'), newBackdropClick);
}

// We should also patch the other modal close buttons in admin_dashboard.html if they exist, but the prompt only complained about the scrolling for THIS modal when the background scrolls.
// Wait, the other modals use document.getElementById('someBtn').onclick in admin.js
const oldDeliveryClose = `document.getElementById('deliveryModalCloseBtn').onclick = () => document.getElementById('deliveryModal').classList.remove('active');`;
const newDeliveryClose = `document.getElementById('deliveryModalCloseBtn').onclick = () => { document.getElementById('deliveryModal').classList.remove('active'); document.body.style.overflow = ''; };`;
if (jsContent.includes(oldDeliveryClose)) { jsContent = jsContent.replace(oldDeliveryClose, newDeliveryClose); }
else { jsContent = jsContent.replace(oldDeliveryClose.replace(/\n/g, '\r\n'), newDeliveryClose); }

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Fixed modal scroll logic');
