const fs = require('fs');

let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldInject = `// Dynamically inject Episode Modal if not present
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
}`;

const newInject = `// Dynamically inject Episode Modal if not present
if (!document.getElementById('episodeModal')) {
    const modalHTML = \`
    <div id="episodeModal" class="modal-backdrop">
        <div class="modal-card" style="max-width: 500px;">
            <div class="modal-header">
                <h3 id="episodeModalTitle">Episode: </h3>
                <button class="close-modal" onclick="document.getElementById('episodeModal').classList.remove('active')">&times;</button>
            </div>
            <div class="modal-body">
                <ul id="episodeModalList" class="episode-modal-list">
                </ul>
            </div>
        </div>
    </div>\`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}`;

jsContent = jsContent.replace(oldInject, newInject);
jsContent = jsContent.replace(oldInject.replace(/\n/g, '\r\n'), newInject);

const oldShow = `    document.getElementById('episodeModal').classList.remove('hidden');`;
const newShow = `    document.getElementById('episodeModal').classList.add('active');`;

jsContent = jsContent.replace(oldShow, newShow);
jsContent = jsContent.replace(oldShow.replace(/\n/g, '\r\n'), newShow);

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Fixed modal classes');
