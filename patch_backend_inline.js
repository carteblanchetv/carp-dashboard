const fs = require('fs');

let backendContent = fs.readFileSync('functions/index.js', 'utf8');

const oldAPI = `    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', \`attachment; filename="\${storagePath.split('/').pop()}"\`);
    res.send(decryptedBuffer);`;

const newAPI = `    res.setHeader('Content-Type', 'application/pdf');
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', \`\${disposition}; filename="\${storagePath.split('/').pop()}"\`);
    res.send(decryptedBuffer);`;

backendContent = backendContent.replace(oldAPI, newAPI);
backendContent = backendContent.replace(oldAPI.replace(/\n/g, '\r\n'), newAPI);

fs.writeFileSync('functions/index.js', backendContent);
console.log('Fixed backend inline PDF');
