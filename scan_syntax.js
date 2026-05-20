const fs = require('fs');
const path = require('path');

const files = [
    'frontend/js/dashboard.js',
    'frontend/js/login.js',
    'frontend/js/hub_init.js',
    'frontend/admin.js',
    'frontend/proposal.js',
    'frontend/auth.js',
    'frontend/js/search.js'
];

files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
        console.log(`[MISSING] ${file}`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    try {
        new Function(content);
        console.log(`[OK] ${file}`);
    } catch (e) {
        console.log(`[ERROR] ${file}: ${e.message}`);
        // Log the line with the error if possible
        const lines = content.split('\n');
        // Unfortunately Function() doesn't give line numbers easily
    }
});
