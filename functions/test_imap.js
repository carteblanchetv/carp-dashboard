const imapSimple = require('imap-simple');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testImap(user) {
  const config = {
    imap: {
      user: user,
      password: process.env.IMAP_PASSWORD,
      host: process.env.IMAP_HOST || 'outlook.office365.com',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      tls: process.env.IMAP_TLS !== 'false',
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  console.log(`Connecting to IMAP for ${user}...`);
  try {
    const connection = await imapSimple.connect(config);
    console.log(`Successfully connected to IMAP for ${user}!`);
    await connection.openBox('INBOX');
    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: ['HEADER'],
      markSeen: false
    };
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Found ${messages.length} total message(s) in INBOX.`);
    if (messages.length > 0) {
      // Sort messages descending by UID to get the most recent
      messages.sort((a, b) => b.attributes.uid - a.attributes.uid);
      console.log('Last 5 messages:');
      const limit = Math.min(messages.length, 5);
      for (let i = 0; i < limit; i++) {
        const msg = messages[i];
        const headerPart = msg.parts.find(p => p.which === 'HEADER');
        const subject = headerPart ? headerPart.body.subject : 'No Subject';
        const from = headerPart ? headerPart.body.from : 'Unknown';
        const date = headerPart ? headerPart.body.date : 'Unknown';
        console.log(`${i+1}. Subject: ${subject}`);
        console.log(`   From: ${from}`);
        console.log(`   Date: ${date}`);
      }
    }
    connection.end();
  } catch (err) {
    console.error(`IMAP connection failed for ${user}:`, err.message);
  }
}

async function run() {
  await testImap(process.env.IMAP_USER || 'story@combinedartists.co.za');
  console.log('\n--- Trying mystory@carteblanche.co.za ---\n');
  await testImap('mystory@carteblanche.co.za');
}

run().catch(console.error);
