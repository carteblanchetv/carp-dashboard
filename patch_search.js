const fs = require('fs');
let content = fs.readFileSync('functions/index.js', 'utf8');

const target = `// Sensitivity Check - Strictly exclude sensitive stories for non-admins
        if (p.isSensitive && !hasAdminAccess(req.user)) {
            return false;
        }`;

const replacement = `// Sensitivity Check - Strictly exclude sensitive stories for non-admins
        if (p.isSensitive && !hasAdminAccess(req.user)) {
            return false;
        }

        // Decommissioned Check - Exclude decommissioned stories for non-admins
        if (p.status === 'decommissioned' && !isAdmin) {
            return false;
        }`;

content = content.replace(target, replacement);

fs.writeFileSync('functions/index.js', content);
console.log('Patched search logic');
