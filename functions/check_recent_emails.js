const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function getMicrosoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  params.set('scope', 'https://graph.microsoft.com/.default');
  params.set('grant_type', 'client_credentials');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const data = await response.json();
  return data.access_token;
}

async function run() {
  const accessToken = await getMicrosoftAccessToken();
  const mailbox = process.env.MICROSOFT_MAILBOX_EMAIL || 'story@combinedartists.co.za';

  const folders = ['inbox', 'junkemail'];
  for (const folder of folders) {
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/${folder}/messages?$select=id,subject,from,receivedDateTime&$top=10&$orderby=receivedDateTime desc`;
    console.log(`\nFetching 10 most recent messages from folder [${folder}] in mailbox [${mailbox}]...`);
    const response = await fetch(messagesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Failed to fetch folder ${folder}: ${response.statusText} - ${errText}`);
      continue;
    }

    const data = await response.json();
    console.log(`Most recent emails in ${folder}:`);
    data.value.forEach((msg, idx) => {
      console.log(`${idx + 1}. Subject: "${msg.subject}"`);
      console.log(`   From: ${msg.from?.emailAddress?.name} <${msg.from?.emailAddress?.address}>`);
      console.log(`   Received: ${msg.receivedDateTime}`);
    });
  }
}

run().catch(console.error);
