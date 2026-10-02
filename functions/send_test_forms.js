const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { PDFDocument, StandardFonts, rgb, PDFName } = require('pdf-lib');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TARGET_EMAIL = 'lezanne@carteblanche.co.za';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper to remove any leftover interactive annotations so PDF is pure static vector
function cleanAcroForm(doc) {
  try {
    const form = doc.getForm();
    form.getFields().forEach(f => {
      try { form.removeField(f); } catch (e) {}
    });
  } catch (e) {}
  doc.getPages().forEach(pg => {
    pg.node.set(PDFName.of('Annots'), doc.context.obj([]));
  });
  if (doc.catalog.has(PDFName.of('AcroForm'))) {
    doc.catalog.delete(PDFName.of('AcroForm'));
  }
}

function getFormEmoji(formTitle = '') {
  const lower = formTitle.toLowerCase();
  if (lower.includes('travel')) return '✈️';
  if (lower.includes('minor')) return '🧒';
  if (lower.includes('participant')) return '👤';
  if (lower.includes('location')) return '📍';
  if (lower.includes('footage')) return '🎞️';
  if (lower.includes('music')) return '🎵';
  if (lower.includes('insert')) return '📝';
  return '📋';
}

// Format the exact required body copy: blue header, Form Title, Commission Number, Story Title, Producer, and attachment note
function formatFormEmailBody(formTitle, commissionNumber, storyTitle, producer) {
  const emoji = getFormEmoji(formTitle);
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px;">
      <h2 style="color: #008fbe; margin-top: 0; margin-bottom: 16px; font-size: 19px; font-weight: 700;">${emoji ? `${emoji} ` : ''}CARTE BLANCHE &bull; ${formTitle.toUpperCase()}</h2>
      <ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 15px; line-height: 1.6; color: #1e293b;">
        <li style="margin-bottom: 6px;"><b>Commission Number:</b> ${commissionNumber}</li>
        <li style="margin-bottom: 6px;"><b>Story Title:</b> ${storyTitle}</li>
        <li style="margin-bottom: 6px;"><b>Producer:</b> ${producer}</li>
      </ul>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #1e293b;">Please find the completed ${formTitle} attached to this email.</p>
    </div>
  `.trim();
}

// 1. Travel Booking Request PDF (Fully Completed Mock - FlowLayout Vector Render)
async function createFilledTravelBookingPdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Travel_Booking_Form_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  // Section 1: Details
  page.drawText('CB-2026-033', { x: 48, y: 682.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Kalahari Renewable Power Investigation', { x: 210, y: 682.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('John Doe', { x: 48, y: 639.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('8805055012083', { x: 311.5, y: 639.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('+27 82 987 6543', { x: 48, y: 596.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('john.test@example.com', { x: 311.5, y: 596.5, size: 9.5, font, color: COLOR_TEXT });

  // Section 2: Flights
  page.drawText('JNB (O.R. Tambo International)', { x: 48, y: 519.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('CPT (Cape Town International)', { x: 311.5, y: 519.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('22/10/2026', { x: 48, y: 476.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('25/10/2026', { x: 311.5, y: 476.5, size: 9.5, font, color: COLOR_TEXT });

  // Section 3: Accommodation
  page.drawText('Yes (Hotel near Cape Town CBD - 3 nights)', { x: 48, y: 399.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Yes (Group B - Automatic, Airport Pickup)', { x: 311.5, y: 399.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Morning departure before 09:00 AM; vegetarian meal preference', { x: 48, y: 352, size: 9.5, font, color: COLOR_TEXT });

  // Section 4: Execution
  page.drawText('Lezanne van Zyl', { x: 48, y: 271.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 311.5, y: 271.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('John Doe (Digitally Signed)', { x: 48, y: 228.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Submitted to Embassy Travel & Nombuso Nkosi', { x: 311.5, y: 228.5, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// 2. Participant Release PDF (Fully Completed Mock - Direct Vector Render)
async function createFilledParticipantReleasePdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Participant_Release_Form_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  page.drawText('CB-2026-089', { x: 53, y: 683.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('State of Hospitals', { x: 215, y: 683.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 53, y: 640.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Sipho Dlamini', { x: 311, y: 640.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('8501015023088', { x: 53, y: 597.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('+27 82 123 4567 / sipho.test@example.com', { x: 311, y: 597.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Johannesburg', { x: 53, y: 324.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 311, y: 324.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Sipho Dlamini (Digitally Signed)', { x: 53, y: 270, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 311, y: 270, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// 3. Minor Release PDF (Fully Completed Mock - Direct Vector Render)
async function createFilledMinorReleasePdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Minor_Release_Form_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  page.drawText('CB-2026-092', { x: 53, y: 683.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Youth Choir National Tour', { x: 215, y: 683.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 53, y: 640.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lerato Khumalo', { x: 53, y: 347.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('12', { x: 311, y: 347.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Thandi Khumalo', { x: 53, y: 304.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('8203045021087', { x: 311, y: 304.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Durban', { x: 53, y: 227.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 311, y: 227.5, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Thandi Khumalo (Parent / Legal Guardian)', { x: 53, y: 173, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 311, y: 173, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// 4. Location Agreement PDF (Fully Completed Mock - Direct Vector Render)
async function createFilledLocationAgreementPdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Location_Agreement_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  page.drawText('Johan van der Merwe', { x: 53, y: 434, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Sandton Office Properties (Pty) Ltd', { x: 311, y: 434, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('45 West Street, Sandton, Johannesburg', { x: 53, y: 387, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('15/10/2026', { x: 53, y: 340, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('CB-2026-077', { x: 227, y: 340, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Corporate Investigation', { x: 402, y: 340, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Johan van der Merwe (Authorized Signatory)', { x: 53, y: 257, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 311, y: 257, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 53, y: 191, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 311, y: 191, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// 5. Footage Agreement PDF (Fully Completed Mock - Direct Vector Render)
async function createFilledFootageAgreementPdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Footage_Agreement_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  page.drawText('Aerial drone footage of Kruger National Park buffalo migration (approx 2m 15s)', { x: 53, y: 475, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Courtesy of African Wildlife Archives', { x: 53, y: 420, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('David Ndlovu', { x: 53, y: 343, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('African Wildlife Archives CC', { x: 311, y: 343, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Wildlife Documentary Special', { x: 53, y: 300, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('CB-2026-064', { x: 227, y: 300, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('18/10/2026', { x: 402, y: 300, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('David Ndlovu (Rights Holder)', { x: 53, y: 217, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 311, y: 217, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 53, y: 151, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 311, y: 151, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// 6. Music Agreement PDF (Fully Completed Mock - Direct Vector Render)
async function createFilledMusicAgreementPdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Music_Agreement_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  page.drawText('Track: "Sunset Horizons" (Duration: 03:45) - Master & Sync Clearance', { x: 53, y: 457, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Music by Nomsa Mazibuko courtesy of SoundWave Publishing', { x: 53, y: 402, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Nomsa Mazibuko', { x: 53, y: 325, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('SoundWave Publishing (Pty) Ltd', { x: 311, y: 325, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Feature Story Insert', { x: 53, y: 282, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('CB-2026-051', { x: 227, y: 282, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('25/10/2026', { x: 402, y: 282, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Nomsa Mazibuko (Artist & Composer)', { x: 53, y: 199, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 311, y: 199, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 53, y: 133, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('02/10/2026', { x: 311, y: 133, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// 7. Insert Sheet PDF (Fully Completed Mock - Direct Vector Render)
async function createFilledInsertSheetPdf(templatesDir) {
  const p = path.join(templatesDir, 'Carte_Blanche_Insert_Sheet_2026.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(p));
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const COLOR_TEXT = rgb(15 / 255, 23 / 255, 42 / 255);

  page.drawText('CB-2026-042', { x: 53, y: 684, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Green Energy Transition', { x: 215, y: 684, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Lezanne van Zyl', { x: 53, y: 642, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Masa Kekana', { x: 311, y: 642, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Michael Smith', { x: 53, y: 600, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Thabo Molefe', { x: 311, y: 600, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Sarah Jenkins', { x: 53, y: 558, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Sound Studio A', { x: 311, y: 558, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('20/10/2026', { x: 53, y: 516, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('12:45', { x: 311, y: 516, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Yes (Archives)', { x: 53, y: 474, size: 9.5, font, color: COLOR_TEXT });

  // Credit supers
  page.drawText('00:01:15', { x: 442, y: 405, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Dr. Brian Ndlovu', { x: 62, y: 365, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Renewable Energy Analyst - CSIR', { x: 311, y: 365, size: 9.5, font, color: COLOR_TEXT });

  page.drawText('00:03:40', { x: 442, y: 317, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Eskom Substation', { x: 62, y: 277, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Megawatt Park, Sunninghill', { x: 311, y: 277, size: 9.5, font, color: COLOR_TEXT });

  page.drawText('00:06:22', { x: 442, y: 229, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Prof. Annelize Botha', { x: 62, y: 189, size: 9.5, font, color: COLOR_TEXT });
  page.drawText('Head of Electrical Engineering - Wits', { x: 311, y: 189, size: 9.5, font, color: COLOR_TEXT });

  cleanAcroForm(doc);
  return Buffer.from(await doc.save());
}

// Build PDF filename: [CommissionNumber]-[StoryTitle]-[FormTitle]-[YYYY-MM-DD].pdf
function buildPdfFilename(commissionNumber, storyTitle, formTitle) {
  const today = new Date().toISOString().slice(0, 10);
  const safe = str => (str || 'Unknown').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${safe(commissionNumber)}-${safe(storyTitle)}-${safe(formTitle)}-${today}.pdf`;
}

async function sendAllTestEmails() {
  console.log(`Starting mock completed test email dispatch to: ${TARGET_EMAIL}`);

  const templatesDir = path.join(__dirname, '..', 'frontend', 'templates');

  console.log('Generating completed mock PDF documents...');
  const [
    travelPdf,
    participantPdf,
    minorPdf,
    locationPdf,
    footagePdf,
    musicPdf,
    insertPdf
  ] = await Promise.all([
    createFilledTravelBookingPdf(templatesDir),
    createFilledParticipantReleasePdf(templatesDir),
    createFilledMinorReleasePdf(templatesDir),
    createFilledLocationAgreementPdf(templatesDir),
    createFilledFootageAgreementPdf(templatesDir),
    createFilledMusicAgreementPdf(templatesDir),
    createFilledInsertSheetPdf(templatesDir)
  ]);
  console.log('All 7 completed mock PDFs generated successfully.');

  // Subject line format: [Commission Number] - [Story Title] - [Form Title] - [Producer Name]
  const testCases = [
    {
      name: 'Travel Booking Form',
      fromName: 'Travel Booking - Carte Blanche',
      subject: 'CB-2026-033 - Kalahari Renewable Power Investigation - Travel Booking Form - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-033', 'Kalahari Renewable Power Investigation', 'Travel Booking Form'),
      pdfBuffer: travelPdf,
      html: formatFormEmailBody(
        'Travel Booking Form',
        'CB-2026-033',
        'Kalahari Renewable Power Investigation',
        'Lezanne van Zyl'
      )
    },
    {
      name: 'Participant Release Form',
      fromName: 'Participant Release - Carte Blanche',
      subject: 'CB-2026-089 - State of Hospitals - Participant Release Form - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-089', 'State of Hospitals', 'Participant Release Form'),
      pdfBuffer: participantPdf,
      html: formatFormEmailBody(
        'Participant Release Form',
        'CB-2026-089',
        'State of Hospitals',
        'Lezanne van Zyl'
      )
    },
    {
      name: 'Minor Release Form',
      fromName: 'Minor Release - Carte Blanche',
      subject: 'CB-2026-092 - Youth Choir National Tour - Minor Release Form - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-092', 'Youth Choir National Tour', 'Minor Release Form'),
      pdfBuffer: minorPdf,
      html: formatFormEmailBody(
        'Minor Release Form',
        'CB-2026-092',
        'Youth Choir National Tour',
        'Lezanne van Zyl'
      )
    },
    {
      name: 'Location Agreement',
      fromName: 'Location Agreement - Carte Blanche',
      subject: 'CB-2026-077 - Corporate Investigation - Location Agreement - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-077', 'Corporate Investigation', 'Location Agreement'),
      pdfBuffer: locationPdf,
      html: formatFormEmailBody(
        'Location Agreement',
        'CB-2026-077',
        'Corporate Investigation',
        'Lezanne van Zyl'
      )
    },
    {
      name: 'Footage Agreement',
      fromName: 'Footage Agreement - Carte Blanche',
      subject: 'CB-2026-064 - Wildlife Documentary Special - Footage Agreement - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-064', 'Wildlife Documentary Special', 'Footage Agreement'),
      pdfBuffer: footagePdf,
      html: formatFormEmailBody(
        'Footage Agreement',
        'CB-2026-064',
        'Wildlife Documentary Special',
        'Lezanne van Zyl'
      )
    },
    {
      name: 'Music Agreement',
      fromName: 'Music Agreement - Carte Blanche',
      subject: 'CB-2026-051 - Feature Story Insert - Music Agreement - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-051', 'Feature Story Insert', 'Music Agreement'),
      pdfBuffer: musicPdf,
      html: formatFormEmailBody(
        'Music Agreement',
        'CB-2026-051',
        'Feature Story Insert',
        'Lezanne van Zyl'
      )
    },
    {
      name: 'Insert Sheet',
      fromName: 'Insert Sheet - Carte Blanche',
      subject: 'CB-2026-042 - Green Energy Transition - Insert Sheet - Lezanne van Zyl',
      filename: buildPdfFilename('CB-2026-042', 'Green Energy Transition', 'Insert Sheet'),
      pdfBuffer: insertPdf,
      html: formatFormEmailBody(
        'Insert Sheet',
        'CB-2026-042',
        'Green Energy Transition',
        'Lezanne van Zyl'
      )
    }
  ];

  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] Sending updated format test email for: ${tc.name}...`);

    const mailOptions = {
      from: `"${tc.fromName}" <${process.env.EMAIL_USER}>`,
      to: TARGET_EMAIL,
      subject: tc.subject,
      html: tc.html,
      attachments: [
        {
          filename: tc.filename,
          content: tc.pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`  ✓ Successfully sent "${tc.name}" to ${TARGET_EMAIL}: ${info.response}`);
      results.push({ name: tc.name, success: true, messageId: info.messageId });
    } catch (err) {
      console.error(`  ✗ Failed to send "${tc.name}":`, err.message);
      results.push({ name: tc.name, success: false, error: err.message });
    }

    // Small delay between sends to respect rate limits
    if (i < testCases.length - 1) {
      await new Promise(res => setTimeout(res, 1500));
    }
  }

  console.log('\n--- Test Summary ---');
  results.forEach(r => {
    console.log(`${r.success ? '✓' : '✗'} ${r.name}: ${r.success ? 'Sent' : r.error}`);
  });
}

sendAllTestEmails().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
