const fs = require('fs');
const html = fs.readFileSync('detail_dump.html', 'utf8');
const match = html.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*-\s*Carte Blanche HD/i);
console.log(match ? match[1] : 'Not found');
