const fs = require('fs');

// --- 1. BACKEND UPDATE ---
let backendContent = fs.readFileSync('functions/index.js', 'utf8');

const oldAuth = `  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    console.warn('[AUTH] Missing or malformed Authorization header');
    res.status(403).json({ success: false, error: 'Unauthorized: Missing token.' });
    return;
  }
  let idToken = req.headers.authorization.split('Bearer ')[1];`;

const newAuth = `  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else if (req.query.token) {
    idToken = req.query.token;
  } else {
    console.warn('[AUTH] Missing or malformed Authorization header');
    res.status(403).json({ success: false, error: 'Unauthorized: Missing token.' });
    return;
  }`;

if (backendContent.includes(oldAuth)) {
    backendContent = backendContent.replace(oldAuth, newAuth);
} else {
    backendContent = backendContent.replace(oldAuth.replace(/\n/g, '\r\n'), newAuth);
}
fs.writeFileSync('functions/index.js', backendContent);
console.log('Fixed backend auth middleware');


// --- 2. FRONTEND UPDATE ---
let frontendContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldIframe = `modalList.innerHTML = \`<iframe src="/api/admin/get-file?path=\${encodeURIComponent(fcc.storagePath)}&inline=true" class="fcc-iframe"></iframe>\`;`;
const newIframe = `const token = await window.auth.getIdToken();
                modalList.innerHTML = \`<iframe src="/api/admin/get-file?path=\${encodeURIComponent(fcc.storagePath)}&inline=true&token=\${token}" class="fcc-iframe"></iframe>\`;`;

if (frontendContent.includes(oldIframe)) {
    frontendContent = frontendContent.replace(oldIframe, newIframe);
} else {
    frontendContent = frontendContent.replace(oldIframe.replace(/\n/g, '\r\n'), newIframe);
}
fs.writeFileSync('frontend/admin.js', frontendContent);
console.log('Fixed frontend iframe src');
