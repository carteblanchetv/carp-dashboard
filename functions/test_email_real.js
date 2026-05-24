const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
require('dotenv').config();

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'smtp',
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function run() {
  try {
    const snapshot = await admin.firestore().collection('proposals').where('status', '==', 'pending').limit(1).get();
    
    if (snapshot.empty) {
        console.log("No pending proposals found to use as a test.");
        process.exit(0);
    }
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    const id = doc.id;
    
    const html = `<p>Test User has submitted a new story proposal for review. (THIS IS A TEST USING A REAL PROPOSAL)</p>
                  <p><b>PROPOSAL SUMMARY</b></p>
                  <ul>
                    <li><b>Story Title:</b> ${data.story_title || 'N/A'}</li>
                    <li>This is a test one liner to demonstrate the updated link.</li>
                    <li><b>Submitted By:</b> Test User</li>
                  </ul>
                  <hr/>
                  <p><a href="https://cb-deliverables.web.app/proposal.html?id=${id}&view=admin">Approve / Reject Story Proposal</a></p>`;

    const mailOptions = {
        from: `"CARP Dashboard" <${process.env.EMAIL_USER}>`,
        to: "lezanne@carteblanche.co.za",
        subject: `Test New Proposal: ${data.story_title || 'Real Proposal Test'}`,
        html: html
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.error("Error sending test email:", err);
            process.exit(1);
        } else {
            console.log("Test email sent successfully with real ID:", id);
            process.exit(0);
        }
    });

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
