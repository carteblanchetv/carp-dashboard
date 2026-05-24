require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'smtp',
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const id = 'TEST_ID_123';
const html = `<p>Test User has submitted a new story proposal for review. (THIS IS A TEST)</p>
              <p><b>PROPOSAL SUMMARY</b></p>
              <ul>
                <li><b>Story Title:</b> TEST: Fake Story Title</li>
                <li>This is a test one liner to demonstrate the updated link.</li>
                <li><b>Submitted By:</b> Test User</li>
              </ul>
              <hr/>
              <p><a href="https://cb-deliverables.web.app/proposal.html?id=${id}&view=admin">Approve / Reject Story Proposal</a></p>`;

const mailOptions = {
    from: `"CARP Dashboard" <${process.env.EMAIL_USER}>`,
    to: "lezanne@carteblanche.co.za",
    subject: `Test New Proposal: TEST: Fake Story Title`,
    html: html
};

transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
        console.error("Error sending test email:", err);
        process.exit(1);
    } else {
        console.log("Test email sent successfully:", info.response);
        process.exit(0);
    }
});
