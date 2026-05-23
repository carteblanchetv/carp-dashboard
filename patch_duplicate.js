const fs = require('fs');
let htmlContent = fs.readFileSync('frontend/admin_dashboard.html', 'utf8');

const duplicateTag = '    <script type="module" src="admin.js?v=3.2.0"></script>';
htmlContent = htmlContent.replace(duplicateTag + '\r\n', '');
htmlContent = htmlContent.replace(duplicateTag + '\n', '');
htmlContent = htmlContent.replace(duplicateTag, '');

// Also bump cache buster on line 14 to v=5.1.9
htmlContent = htmlContent.replace('admin.js?v=5.1.8', 'admin.js?v=5.1.9');

fs.writeFileSync('frontend/admin_dashboard.html', htmlContent);
console.log('Removed duplicate script tag and bumped version');
