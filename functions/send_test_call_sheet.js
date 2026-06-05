require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'smtp',
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const userFullName = "Test User";
const commNum = "1234";
const storyTitle = "Test Story Title";

const emailSubject = `CALL SHEET for ${commNum} ${storyTitle}`;
const emailHtml = `<p>${userFullName} has submitted a call sheet for ${commNum} ${storyTitle}.</p>
<p><i>This is an automated notification from the CARP Dashboard.</i></p>`;

// Simple simulated PDF content
const dummyPdfBuffer = Buffer.from("%PDF-1.4 ... (Simulated PDF Content for testing email attachments) ...");

const mailOptions = {
    from: `"Call Sheets" <${process.env.EMAIL_USER}>`,
    to: "lezanne@carteblanche.co.za",
    subject: emailSubject,
    html: emailHtml,
    attachments: [{
        filename: `Call_Sheet_${commNum}.pdf`,
        content: dummyPdfBuffer
    }]
};

transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
        console.error("Error sending test call sheet email:", err);
        process.exit(1);
    } else {
        console.log("Test call sheet email sent successfully to lezanne@carteblanche.co.za:", info.response);
        process.exit(0);
    }
});
