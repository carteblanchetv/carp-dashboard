const fs = require('fs');

let content = fs.readFileSync('frontend/admin.js', 'utf8');

const injectionLogic = `
// Dynamically inject Episode Modal if not present
if (!document.getElementById('episodeModal')) {
    const modalHTML = \`
    <div id="episodeModal" class="modal-overlay hidden">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 id="episodeModalTitle">Episode: </h3>
                <button type="button" class="btn-close" onclick="document.getElementById('episodeModal').classList.add('hidden')">&times;</button>
            </div>
            <div class="modal-body">
                <ul id="episodeModalList" class="episode-modal-list">
                </ul>
            </div>
        </div>
    </div>\`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}
`;

// Insert the injection logic at the beginning of the init() function
const target = 'async function init() {\n    try {';
if (content.includes(target)) {
    content = content.replace(target, 'async function init() {\n' + injectionLogic + '\n    try {');
} else {
    content = content.replace(target.replace(/\n/g, '\r\n'), 'async function init() {\n' + injectionLogic + '\n    try {');
}

fs.writeFileSync('frontend/admin.js', content);
console.log('Injected modal into admin.js init()');
