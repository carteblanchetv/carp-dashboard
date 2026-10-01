const { PDFDocument, rgb, StandardFonts, PDFName, PDFBool } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Design Tokens & Colors
const COLOR_PRIMARY = rgb(0 / 255, 143 / 255, 190 / 255);      // #008fbe Carte Blanche Blue
const COLOR_PRIMARY_DARK = rgb(0 / 255, 115 / 255, 155 / 255);  // #00739b Deep Accent Blue
const COLOR_TEXT_DARK = rgb(15 / 255, 23 / 255, 42 / 255);       // #0f172a Slate 900
const COLOR_TEXT_BODY = rgb(30 / 255, 41 / 255, 59 / 255);       // #1e293b Slate 800
const COLOR_TEXT_MUTED = rgb(100 / 255, 116 / 255, 139 / 255);   // #64748b Slate 500
const COLOR_BORDER = rgb(203 / 255, 213 / 255, 225 / 255);       // #cbd5e1 Crisp Border
const COLOR_BG_FIELD = rgb(248 / 255, 250 / 255, 252 / 255);     // #f8fafc Soft Interactive Box
const COLOR_DIVIDER = rgb(226 / 255, 232 / 255, 240 / 255);      // #e2e8f0 Hairline Rule

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 45;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 505.28
const RIGHT_X = MARGIN_X + CONTENT_W;

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = font.widthOfTextAtSize(testLine, size);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function addStandaloneField(form, page, id, label, x, y, width, height, opts = {}) {
  if (label) {
    page.drawText(label.toUpperCase(), {
      x: x,
      y: y + height + 3,
      size: 7.2,
      font: page.docBoldFont,
      color: COLOR_TEXT_MUTED
    });
  }

  // Draw visual box onto page content stream so it renders on every viewer and print engine
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    color: COLOR_BG_FIELD
  });

  const tf = form.createTextField(id);
  if (opts.multiline) tf.enableMultiline();
  tf.addToPage(page, {
    x,
    y,
    width,
    height,
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    backgroundColor: COLOR_BG_FIELD,
    textColor: COLOR_TEXT_DARK
  });
  tf.setFontSize(opts.fontSize || 9.5);
  return tf;
}

// FlowLayout Engine: Top-down vertical cursor management to guarantee ZERO overlaps
class FlowLayout {
  constructor(page, form, startY = 730) {
    this.page = page;
    this.form = form;
    this.y = startY;
    this.marginX = MARGIN_X;
    this.width = CONTENT_W;
    this.rightX = RIGHT_X;
  }

  addSpace(h) {
    this.y -= h;
  }

  addDivider(thickness = 0.5, color = COLOR_DIVIDER) {
    this.y -= 6;
    this.page.drawLine({
      start: { x: this.marginX, y: this.y },
      end: { x: this.rightX, y: this.y },
      thickness,
      color
    });
    this.y -= 10;
  }

  addHeading(title, color = COLOR_PRIMARY) {
    this.y -= 4;
    this.page.drawText(title, {
      x: this.marginX,
      y: this.y,
      size: 8.5,
      font: this.page.docBoldFont,
      color
    });
    this.y -= 14;
  }

  addParagraph(text, font = this.page.docRegularFont, size = 7.5, color = COLOR_TEXT_BODY, lineGap = 10) {
    const lines = wrapText(text, font, size, this.width);
    for (const line of lines) {
      this.page.drawText(line, {
        x: this.marginX,
        y: this.y,
        size,
        font,
        color
      });
      this.y -= lineGap;
    }
    this.y -= 3;
  }

  addBullet(numStr, text, font = this.page.docRegularFont, size = 7.5, color = COLOR_TEXT_BODY, lineGap = 10) {
    const bulletW = 14;
    const textW = this.width - bulletW;
    const lines = wrapText(text, font, size, textW);
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        this.page.drawText(numStr, {
          x: this.marginX + 4,
          y: this.y,
          size,
          font: this.page.docBoldFont,
          color: COLOR_TEXT_DARK
        });
      }
      this.page.drawText(lines[i], {
        x: this.marginX + 4 + bulletW,
        y: this.y,
        size,
        font,
        color
      });
      this.y -= lineGap;
    }
    this.y -= 2;
  }

  // items = [ { id, label, width, multiline, fontSize, height, subtext } ]
  addFieldRow(items, defaultHeight = 20) {
    const labelHeight = 8;
    const labelGap = 3;

    // Label baseline
    const labelY = this.y - labelHeight;

    let maxFieldH = defaultHeight;
    for (const it of items) {
      if (it.height && it.height > maxFieldH) maxFieldH = it.height;
    }

    let currentX = this.marginX;
    for (const item of items) {
      const itemW = item.width;
      const itemH = item.height || defaultHeight;
      const fieldY = labelY - labelGap - itemH;

      if (item.label) {
        this.page.drawText(item.label.toUpperCase(), {
          x: currentX,
          y: labelY,
          size: 7.2,
          font: this.page.docBoldFont,
          color: COLOR_TEXT_MUTED
        });
      }

      // Draw visual box onto page content stream so it renders on every viewer and print engine
      this.page.drawRectangle({
        x: currentX,
        y: fieldY,
        width: itemW,
        height: itemH,
        borderWidth: 1,
        borderColor: COLOR_BORDER,
        color: COLOR_BG_FIELD
      });

      const tf = this.form.createTextField(item.id);
      if (item.multiline) tf.enableMultiline();
      tf.addToPage(this.page, {
        x: currentX,
        y: fieldY,
        width: itemW,
        height: itemH,
        borderWidth: 1,
        borderColor: COLOR_BORDER,
        backgroundColor: COLOR_BG_FIELD,
        textColor: COLOR_TEXT_DARK
      });
      tf.setFontSize(item.fontSize || 9.5);

      if (item.subtext) {
        this.page.drawText(item.subtext, {
          x: currentX + 3,
          y: fieldY - 9,
          size: 6.5,
          font: this.page.docItalicFont,
          color: COLOR_TEXT_MUTED
        });
      }

      currentX += itemW + (item.gap || 12);
    }

    const hasSubtext = items.some(it => it.subtext);
    const subtextH = hasSubtext ? 11 : 0;
    this.y = labelY - labelGap - maxFieldH - subtextH - 12; // Advance cursor for next element
  }
}

function drawHeader(page, cbLogoImg, caLogoImg, title, subtitle) {
  const cbH = 44;
  const cbW = (cbH / cbLogoImg.height) * cbLogoImg.width;
  const caH = 26;
  const caW = (caH / caLogoImg.height) * caLogoImg.width;

  const cbX = RIGHT_X - cbW;
  const cbY = 758;

  const gap = 16;
  const caX = cbX - gap - caW;
  const caY = cbY + (cbH - caH) / 2;

  page.drawImage(caLogoImg, {
    x: caX,
    y: caY,
    width: caW,
    height: caH
  });

  page.drawImage(cbLogoImg, {
    x: cbX,
    y: cbY,
    width: cbW,
    height: cbH
  });

  const availableTitleW = caX - MARGIN_X - 16;
  const titleSize = page.docBoldFont.widthOfTextAtSize(title, 17) > availableTitleW ? 15.5 : 17;
  const titleY = subtitle ? 775 : 765;

  page.drawText(title, {
    x: MARGIN_X,
    y: titleY,
    size: titleSize,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });

  if (subtitle) {
    page.drawText(subtitle, {
      x: MARGIN_X,
      y: 758,
      size: 8.5,
      font: page.docRegularFont,
      color: COLOR_TEXT_MUTED
    });
  }

  page.drawLine({
    start: { x: MARGIN_X, y: 742 },
    end: { x: RIGHT_X, y: 742 },
    thickness: 1.5,
    color: COLOR_PRIMARY
  });
}

function drawFooter(page, refCode, pageStr = '') {
  const y = 28;
  page.drawLine({
    start: { x: MARGIN_X, y: y + 9 },
    end: { x: RIGHT_X, y: y + 9 },
    thickness: 0.5,
    color: COLOR_DIVIDER
  });

  page.drawText('Carte Blanche  •  Electronic Media Network Proprietary Limited  •  Combined Artistic Productions CC', {
    x: MARGIN_X,
    y: y,
    size: 6.5,
    font: page.docRegularFont,
    color: COLOR_TEXT_MUTED
  });

  const rightText = pageStr ? `${refCode}  |  ${pageStr}` : refCode;
  const rightTextW = page.docRegularFont.widthOfTextAtSize(rightText, 6.5);
  page.drawText(rightText, {
    x: RIGHT_X - rightTextW,
    y: y,
    size: 6.5,
    font: page.docRegularFont,
    color: COLOR_TEXT_MUTED
  });
}

// ----------------------------------------------------
// 1. PARTICIPANT RELEASE FORM 2026
// ----------------------------------------------------
async function generateParticipantRelease(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const form = doc.getForm();

  page.docRegularFont = await doc.embedFont(StandardFonts.Helvetica);
  page.docBoldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  page.docItalicFont = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  drawHeader(page, cbLogoImg, caLogoImg, 'PARTICIPANT RELEASE FORM', 'Carte Blanche & M-Net  •  Official Consent & Recording Agreement');

  const layout = new FlowLayout(page, form, 726);

  // Section 1: Details
  layout.addHeading('1. PRODUCTION & PARTICIPANT DETAILS');
  layout.addFieldRow([
    { id: 'commissionNumber', label: 'Commission Number', width: 150 },
    { id: 'storyName', label: 'Story Name / Working Title', width: CONTENT_W - 162, gap: 0 }
  ]);

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'producerName', label: 'Producer Name', width: halfW },
    { id: 'participantName', label: 'Participant Full Name (as per ID/Passport)', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'idNumber', label: 'Participant ID / Passport Number', width: halfW },
    { id: 'contactNumber', label: 'Participant Contact Number / Email', width: halfW, gap: 0 }
  ]);

  // Section 2: Legal Terms
  layout.addDivider();
  layout.addHeading('2. TERMS OF CONSENT & RELEASE');

  layout.addParagraph(
    'I, the undersigned, hereby give my free and informed consent to Electronic Media Network Proprietary Limited ("M-Net") and Combined Artistic Productions CC ("Carte Blanche"):'
  );

  layout.addBullet('1.', 'To film my image, likeness, actions and record my voice in an interview and/or actuality footage on camera ("the recording");');
  layout.addBullet('2.', 'To broadcast, transmit, distribute and publish the recording on the current affairs programme called Carte Blanche, and across any and all platforms M-Net and its affiliates operate (including television broadcast, streaming services, social media, and digital platforms);');
  layout.addBullet('3.', 'To use excerpts or still images of the recording in promotional, marketing, and advertising material for Carte Blanche and M-Net; and');
  layout.addBullet('4.', 'To archive and store the recording in accordance with broadcast compliance and legitimate journalistic archiving standards.');

  layout.addSpace(2);
  layout.addParagraph(
    'Protection of Personal Information: I acknowledge that I have been informed that any statements I make and any information I provide during my interview done by the producers of Carte Blanche — including special personal information as defined under the Protection of Personal Information Act, 2013 (POPIA), whether of a private nature or in the public interest — may be processed and broadcast by Carte Blanche for journalistic, investigative, and production purposes.'
  );
  layout.addParagraph(
    'Editorial Discretion: I agree that the recording may be edited, formatted, shortened, or translated by the producers of Carte Blanche or M-Net in the fair and ordinary course of news reporting and editorial assembly.'
  );
  layout.addParagraph(
    'Intellectual Property: I agree that M-Net shall own all rights, title, and copyright in and to the completed broadcast programme and the recording.'
  );

  // Section 3: Execution
  layout.addDivider();
  layout.addHeading('3. SIGNED & EXECUTED');

  layout.addFieldRow([
    { id: 'signedAt', label: 'Signed At (City / Town)', width: halfW },
    { id: 'signedDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'participantSignature', label: 'Participant Signature (Type or Sign)', width: halfW, height: 42, subtext: 'Type full name or tap to sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature (On behalf of M-Net)', width: halfW, height: 42, subtext: 'Type full name or tap to sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-PRF-2026');

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

// ----------------------------------------------------
// 2. MINOR RELEASE FORM 2026
// ----------------------------------------------------
async function generateMinorRelease(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const form = doc.getForm();

  page.docRegularFont = await doc.embedFont(StandardFonts.Helvetica);
  page.docBoldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  page.docItalicFont = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  drawHeader(page, cbLogoImg, caLogoImg, 'MINOR RELEASE FORM', 'Carte Blanche & M-Net  •  Parental / Legal Guardian Consent Agreement');

  const layout = new FlowLayout(page, form, 726);

  // Section 1: Production Details
  layout.addHeading('1. PRODUCTION DETAILS');
  layout.addFieldRow([
    { id: 'commissionNumber', label: 'Commission Number', width: 150 },
    { id: 'storyName', label: 'Story Name / Working Title', width: CONTENT_W - 162, gap: 0 }
  ]);

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'producerName', label: 'Producer Name', width: CONTENT_W, gap: 0 }
  ]);

  // Section 2: Legal terms
  layout.addDivider();
  layout.addHeading('2. PARENTAL / GUARDIAN PERMISSION & RELEASE');

  layout.addParagraph(
    'As the parent or legal guardian of the child named below, I hereby give my free, informed and explicit permission for my child to be interviewed, photographed, and recorded by Electronic Media Network Proprietary Limited ("M-Net") and Combined Artistic Productions CC ("Carte Blanche"). I understand and agree that:'
  );

  layout.addBullet('1.', 'My child may be filmed, photographed, and their voice recorded on camera ("the recording");');
  layout.addBullet('2.', 'The recording may be broadcast, distributed, and published on the current affairs programme called Carte Blanche, and across any and all platforms M-Net and its affiliates operate (including television, streaming services, social media, and digital platforms);');
  layout.addBullet('3.', 'Excerpts or still images may be used in promotional, marketing, and advertising material for Carte Blanche and M-Net; and');
  layout.addBullet('4.', 'The recording may be securely stored and archived for as long as M-Net and/or Carte Blanche deems necessary for journalistic and compliance purposes.');

  layout.addSpace(2);
  layout.addParagraph(
    'Protection of Personal Information: I am aware that any statements my child makes and any information they provide during the interview — including special personal information as defined under the Protection of Personal Information Act, 2013 (POPIA) — may be processed by Carte Blanche for production and investigative journalistic purposes and may be broadcast on Carte Blanche.'
  );
  layout.addParagraph(
    'Editorial Discretion: I understand and agree that the producers of Carte Blanche or M-Net may edit, format, or shorten the recording in a fair manner they consider appropriate in the ordinary course of news reporting.'
  );
  layout.addParagraph(
    'Intellectual Property: Furthermore, I grant M-Net any intellectual property rights and copyright attached to the recording of my child\'s participation in Carte Blanche.'
  );

  // Section 3: Child & Guardian Details
  layout.addDivider();
  layout.addHeading('3. CHILD & PARENT / GUARDIAN DETAILS');

  layout.addFieldRow([
    { id: 'childName', label: 'Child Full Name & Surname', width: halfW },
    { id: 'childAge', label: 'Child Age / Date of Birth', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'parentName', label: 'Parent / Guardian Full Name & Surname', width: halfW },
    { id: 'parentIdNumber', label: 'Parent / Guardian ID / Passport Number', width: halfW, gap: 0 }
  ]);

  // Section 4: Execution
  layout.addDivider();
  layout.addHeading('4. SIGNED & EXECUTED');

  layout.addFieldRow([
    { id: 'signedAt', label: 'Signed At (City / Town)', width: halfW },
    { id: 'signedDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'parentSignature', label: 'Parent / Guardian Signature (Type or Sign)', width: halfW, height: 42, subtext: 'Type full name or tap to sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature (On behalf of M-Net)', width: halfW, height: 42, subtext: 'Type full name or tap to sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-MRF-2026');

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

// ----------------------------------------------------
// 3. LOCATION AGREEMENT 2026
// ----------------------------------------------------
async function generateLocationAgreement(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const form = doc.getForm();

  page.docRegularFont = await doc.embedFont(StandardFonts.Helvetica);
  page.docBoldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  page.docItalicFont = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  drawHeader(page, cbLogoImg, caLogoImg, 'LOCATION AGREEMENT', 'Carte Blanche & M-Net  •  Filming Location Access & Permissions Agreement');

  const layout = new FlowLayout(page, form, 726);

  // Preamble
  layout.addParagraph('This Agreement is entered into by and between:', page.docBoldFont, 7.8);
  layout.addParagraph('Electronic Media Network Proprietary Limited ("M-Net") and Combined Artistic Productions CC ("the producer") and the Property Owner / Authorized Representative named below ("the owner").', page.docRegularFont, 7.5);

  layout.addDivider();

  // Section 1: Terms
  layout.addHeading('1. TERMS & CONDITIONS OF FILMING ACCESS');

  const terms = [
    {
      title: 'GRANT OF ACCESS & LOCATION USE:',
      text: 'The owner hereby grants the producer, its employees, crew members, agents and contractors the right to enter and use the property located at the address specified below ("the location") on the date(s) specified below, for the purpose of filming scenes, recording audio, and photographing elements for the current affairs programme Carte Blanche ("the production").'
    },
    {
      title: 'USE OF LOCATION & DEPICTION:',
      text: 'The producer shall be permitted to photograph, film and record scenes at the location and to bring equipment, lighting, vehicles and personnel reasonably necessary for such purposes. The producer may depict the location, its exterior and interior, and any signs, logos, branding or identifiers visible therein, in the broadcast, distribution and promotion of the production across all media and platforms in perpetuity at the producer\'s editorial discretion.'
    },
    {
      title: 'CONDITION OF LOCATION & REASONABLE CARE:',
      text: 'The producer agrees to exercise reasonable care in the use of the location and shall leave the property in substantially the same condition as when entered, ordinary wear and tear excepted.'
    },
    {
      title: 'INDEMNIFICATION & LIABILITY:',
      text: 'The producer agrees to indemnify, defend and hold harmless the owner from direct third-party property damage or personal injury claims caused directly by the gross negligence or wilful misconduct of the producer\'s crew while on the premises, except to the extent resulting from the owner\'s negligence, acts, omissions or pre-existing defects of the premises.'
    }
  ];

  for (const t of terms) {
    layout.addParagraph(t.title, page.docBoldFont, 7.2, COLOR_TEXT_DARK, 9);
    layout.addParagraph(t.text, page.docRegularFont, 7.2, COLOR_TEXT_BODY, 9);
    layout.addSpace(1);
  }

  // Section 2: Location & Production Details
  layout.addDivider();
  layout.addHeading('2. LOCATION & PRODUCTION DETAILS');

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'ownerName', label: 'Property Owner / Manager Full Name', width: halfW },
    { id: 'ownerEntity', label: 'Property / Venue Name (if applicable)', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'locationAddress', label: 'Location Physical Street Address', width: CONTENT_W, height: 28, multiline: true, gap: 0 }
  ]);

  const thirdW = (CONTENT_W - 16) / 3;
  layout.addFieldRow([
    { id: 'dateOfFilming', label: 'Date(s) of Filming', width: thirdW },
    { id: 'commissionNumber', label: 'Commission Number', width: thirdW },
    { id: 'storyName', label: 'Story Name / Working Title', width: thirdW, gap: 0 }
  ]);

  // Section 3: Signatures
  layout.addDivider();
  layout.addHeading('3. AUTHORISED SIGNATURES');

  layout.addFieldRow([
    { id: 'ownerSignature', label: 'Property Owner / Manager Signature', width: halfW, height: 38, subtext: 'Type full name or tap to sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature (On behalf of M-Net)', width: halfW, height: 38, subtext: 'Type full name or tap to sign digitally', gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW },
    { id: 'producerDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW, gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-LOC-2026');

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

// ----------------------------------------------------
// 4. FOOTAGE AGREEMENT 2026
// ----------------------------------------------------
async function generateFootageAgreement(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const form = doc.getForm();

  page.docRegularFont = await doc.embedFont(StandardFonts.Helvetica);
  page.docBoldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  page.docItalicFont = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  drawHeader(page, cbLogoImg, caLogoImg, 'FOOTAGE AGREEMENT', 'Carte Blanche & M-Net  •  Video & Archival Material Licence Agreement');

  const layout = new FlowLayout(page, form, 726);

  // Preamble
  layout.addParagraph('This Agreement is entered into by and between:', page.docBoldFont, 7.8);
  layout.addParagraph('Electronic Media Network Proprietary Limited ("M-Net") and Combined Artistic Productions CC ("the producer") and the Rights Holder / Licensor named below ("the owner").', page.docRegularFont, 7.5);

  layout.addDivider();

  // Section 1: Terms
  layout.addHeading('1. TERMS OF LICENCE & BROADCAST PERMISSION');

  const terms = [
    '1. Grant of Licence: The owner hereby grants the producer a non-exclusive, irrevocable licence to incorporate and use portions of the video, archival, CCTV, or photographic material described below ("the footage") in the story specified below, to be broadcast on Carte Blanche on M-Net, and across any MultiChoice platform or digital service as M-Net sees fit, in perpetuity.',
    '2. Fair Use & Illustration: The producer undertakes to use the footage fairly to illustrate and report on issues pertaining to the story in accordance with journalistic fair dealing and reporting standards.',
    '3. On-Screen Credit: The producer undertakes to provide the owner with an on-screen courtesy credit for the footage if specifically requested below.',
    '4. Royalty-Free: The owner confirms that this licence is granted on a royalty-free basis and the producer will not pay the owner for the use of the footage.',
    '5. Ownership of Programme: The television programme in its completed broadcast form is the exclusive property of M-Net and Carte Blanche.',
    '6. Protection of Original Footage: The footage in its raw, original form remains the copyright property of the owner, and Carte Blanche & M-Net shall not share, copy, resell, or distribute the standalone footage to external third-party news organisations or persons without consent.'
  ];

  for (const t of terms) {
    layout.addParagraph(t, page.docRegularFont, 7.2, COLOR_TEXT_BODY, 9.2);
    layout.addSpace(1);
  }

  // Section 2: Description
  layout.addDivider();
  layout.addHeading('2. DESCRIPTION OF FOOTAGE & REQUESTED CREDIT');

  layout.addFieldRow([
    { id: 'footageDescription', label: 'Description of Footage / Video Clip / Archival Elements', width: CONTENT_W, height: 38, multiline: true, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'courtesyCredit', label: 'Requested On-Screen Courtesy Credit (e.g. "Footage: John Smith")', width: CONTENT_W, gap: 0 }
  ]);

  // Section 3: Licensor & Production Details
  layout.addDivider();
  layout.addHeading('3. LICENSOR & PRODUCTION DETAILS');

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'licensorName', label: 'Licensor / Rights Holder Full Name', width: halfW },
    { id: 'licensorEntity', label: 'On Behalf Of (Company / Entity / Self)', width: halfW, gap: 0 }
  ]);

  const thirdW = (CONTENT_W - 16) / 3;
  layout.addFieldRow([
    { id: 'storyTitle', label: 'Story Title / Working Name', width: thirdW },
    { id: 'commissionNumber', label: 'Commission Number', width: thirdW },
    { id: 'broadcastDate', label: 'Anticipated Broadcast Date', width: thirdW, gap: 0 }
  ]);

  // Section 4: Signatures
  layout.addDivider();
  layout.addHeading('4. AUTHORISED SIGNATURES');

  layout.addFieldRow([
    { id: 'ownerSignature', label: 'Rights Holder / Owner Signature', width: halfW, height: 38, subtext: 'Type full name or tap to sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature (On behalf of M-Net)', width: halfW, height: 38, subtext: 'Type full name or tap to sign digitally', gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW },
    { id: 'producerDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW, gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-FA-2026');

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

// ----------------------------------------------------
// 5. MUSIC AGREEMENT 2026
// ----------------------------------------------------
async function generateMusicAgreement(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const form = doc.getForm();

  page.docRegularFont = await doc.embedFont(StandardFonts.Helvetica);
  page.docBoldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  page.docItalicFont = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  drawHeader(page, cbLogoImg, caLogoImg, 'MUSIC AGREEMENT', 'Carte Blanche & M-Net  •  Music Synchronisation & Broadcast Licence Agreement');

  const layout = new FlowLayout(page, form, 726);

  // Preamble
  layout.addParagraph('This Agreement is entered into by and between:', page.docBoldFont, 7.8);
  layout.addParagraph('Electronic Media Network Proprietary Limited ("M-Net") and Combined Artistic Productions CC ("the producer") and the Composer, Artist, or Rights Holder named below ("the owner").', page.docRegularFont, 7.5);

  layout.addDivider();

  // Section 1: Terms
  layout.addHeading('1. TERMS OF MUSIC SYNCHRONISATION & BROADCAST LICENCE');

  const terms = [
    '1. Grant of Synchronisation Licence: The owner hereby grants the producer a non-exclusive, worldwide licence to synchronise, incorporate and use portions of the musical compositions and sound recordings described below ("the music") in the story specified below, for broadcast on Carte Blanche on M-Net, and across any MultiChoice platform or digital service as M-Net sees fit, in perpetuity.',
    '2. Editorial & Story Illustration: The producer undertakes to use the music fairly to underscore and illustrate issues pertaining to the story in accordance with professional broadcast standards.',
    '3. Royalty-Free Synchronisation: The owner confirms that this synchronisation licence is granted on a royalty-free basis and the producer will not pay the owner a fee for the broadcast synchronisation of the music.',
    '4. Ownership of Programme: The television programme in its completed broadcast form is the exclusive property of M-Net and Carte Blanche.',
    '5. Protection of Musical Work: The music in its entirety remains the copyright property of the owner, and Carte Blanche & M-Net shall not share, copy, or distribute the standalone audio recordings outside the context of the programme.',
    '6. Warranties: The owner warrants that they are the sole creator, rights holder, or authorised representative with full legal authority to grant these synchronisation rights without infringing third-party rights.'
  ];

  for (const t of terms) {
    layout.addParagraph(t, page.docRegularFont, 7.2, COLOR_TEXT_BODY, 9.2);
    layout.addSpace(1);
  }

  // Section 2: Music Track Description
  layout.addDivider();
  layout.addHeading('2. MUSIC TRACK DETAILS & COMPOSITION CREDITS');

  layout.addFieldRow([
    { id: 'musicTracks', label: 'Track Title(s), Duration, Artist, Composer, Publisher & Record Label', width: CONTENT_W, height: 38, multiline: true, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'courtesyCredit', label: 'Requested Music Credit (e.g. "Music: Artist Name / Track Title")', width: CONTENT_W, gap: 0 }
  ]);

  // Section 3: Artist & Production Details
  layout.addDivider();
  layout.addHeading('3. ARTIST, COMPOSER & PRODUCTION DETAILS');

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'artistName', label: 'Artist / Composer Full Name', width: halfW },
    { id: 'publisherName', label: 'Publisher / Record Label / On Behalf Of', width: halfW, gap: 0 }
  ]);

  const thirdW = (CONTENT_W - 16) / 3;
  layout.addFieldRow([
    { id: 'storyTitle', label: 'Story Title / Working Name', width: thirdW },
    { id: 'commissionNumber', label: 'Commission Number', width: thirdW },
    { id: 'broadcastDate', label: 'Anticipated Broadcast Date', width: thirdW, gap: 0 }
  ]);

  // Section 4: Signatures
  layout.addDivider();
  layout.addHeading('4. AUTHORISED SIGNATURES');

  layout.addFieldRow([
    { id: 'ownerSignature', label: 'Rights Holder / Artist Signature', width: halfW, height: 38, subtext: 'Type full name or tap to sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature (On behalf of M-Net)', width: halfW, height: 38, subtext: 'Type full name or tap to sign digitally', gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW },
    { id: 'producerDate', label: 'Date Signed (DD / MM / YYYY)', width: halfW, gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-MA-2026');

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

// ----------------------------------------------------
// 6. INSERT SHEET 2026 (Multi-page: 10 Pages)
// ----------------------------------------------------
async function generateInsertSheet(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const form = doc.getForm();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  const TOTAL_PAGES = 10;
  let creditCounter = 1;

  // PAGE 1: Header + Production Crew + First 3 Credits
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    drawHeader(page, cbLogoImg, caLogoImg, 'INSERT SHEET', '');

    const layout = new FlowLayout(page, form, 726);

    layout.addHeading('1. PRODUCTION & TECHNICAL CREW DETAILS');

    layout.addFieldRow([
      { id: 'commNum', label: 'Commission Number', width: 150 },
      { id: 'storyName', label: 'Story Name', width: CONTENT_W - 162, gap: 0 }
    ], 19);

    const halfW = (CONTENT_W - 12) / 2;
    layout.addFieldRow([
      { id: 'producer', label: 'Producer', width: halfW },
      { id: 'presenter', label: 'Presenter', width: halfW, gap: 0 }
    ], 19);

    layout.addFieldRow([
      { id: 'dop', label: 'DOP / Camera Operator', width: halfW },
      { id: 'camAssist', label: 'Camera Assistant', width: halfW, gap: 0 }
    ], 19);

    layout.addFieldRow([
      { id: 'editor', label: 'Editor', width: halfW },
      { id: 'finalMix', label: 'Final Mix Operator', width: halfW, gap: 0 }
    ], 19);

    layout.addFieldRow([
      { id: 'deliveryDate', label: 'Delivery Date (DD / MM / YYYY)', width: halfW },
      { id: 'insertDuration', label: 'Insert Duration (TC: 00:00:00)', width: halfW, gap: 0 }
    ], 19);

    layout.addFieldRow([
      { id: 'thirdPartyFootage', label: '3rd Party Footage', width: CONTENT_W, gap: 0 }
    ], 19);

    layout.addDivider();
    layout.addHeading('2. ON-SCREEN SUPERS & LOWER THIRDS (CREDITS)');

    // Draw 3 credit blocks on Page 1
    for (let i = 0; i < 3; i++) {
      drawCreditBlock(form, page, creditCounter++, MARGIN_X, layout.y, CONTENT_W);
      layout.y -= 88;
    }

    drawFooter(page, 'Form Ref: CB-INS-2026', `Page 1 of ${TOTAL_PAGES}`);
  }

  // PAGES 2 to 10: 6 Credits per page
  for (let p = 2; p <= TOTAL_PAGES; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    // Running Header
    const headY = 798;
    page.drawText('CARTE BLANCHE  •  INSERT SHEET (ON-SCREEN CREDITS)', {
      x: MARGIN_X,
      y: headY,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY
    });

    const pageStr = `Page ${p} of ${TOTAL_PAGES}`;
    const pageStrW = fontBold.widthOfTextAtSize(pageStr, 8.5);
    page.drawText(pageStr, {
      x: RIGHT_X - pageStrW,
      y: headY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT_MUTED
    });

    // Reference Story Name / Comm # on subsequent pages
    addStandaloneField(form, page, `storyName_p${p}`, 'Story Name', MARGIN_X, headY - 30, CONTENT_W - 160, 18, { fontSize: 9 });
    addStandaloneField(form, page, `commNum_p${p}`, 'Commission #', RIGHT_X - 150, headY - 30, 150, 18, { fontSize: 9 });

    page.drawLine({
      start: { x: MARGIN_X, y: headY - 40 },
      end: { x: RIGHT_X, y: headY - 40 },
      thickness: 1,
      color: COLOR_PRIMARY
    });

    let curY = headY - 58;

    // Draw 6 credit blocks per page (76pt each + 16pt gap)
    for (let c = 0; c < 6; c++) {
      drawCreditBlock(form, page, creditCounter++, MARGIN_X, curY, CONTENT_W);
      curY -= 92;
    }

    drawFooter(page, 'Form Ref: CB-INS-2026', `Page ${p} of ${TOTAL_PAGES}`);
  }

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

function drawCreditBlock(form, page, num, x, y, width) {
  // y is the TOP edge of this credit block
  const pad = 10;
  const blockH = 76; // Total height of card
  const numStr = String(num).padStart(2, '0');

  // Draw card background
  page.drawRectangle({
    x: x,
    y: y - blockH,
    width: width,
    height: blockH,
    color: rgb(252 / 255, 253 / 255, 254 / 255),
    borderColor: rgb(220 / 255, 228 / 255, 238 / 255),
    borderWidth: 0.75
  });

  // Top bar inside card: Credit badge on left
  page.drawText(`CREDIT #${numStr}`, {
    x: x + pad,
    y: y - 15,
    size: 8.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY_DARK
  });

  // TC IN label and field on right
  const tcFieldW = 105;
  const tcLabelW = page.docBoldFont.widthOfTextAtSize('TC IN:', 7.5);
  const tcFieldX = x + width - pad - tcFieldW;
  const tcLabelX = tcFieldX - tcLabelW - 6;

  page.drawText('TC IN:', {
    x: tcLabelX,
    y: y - 15,
    size: 7.5,
    font: page.docBoldFont,
    color: COLOR_TEXT_MUTED
  });

  // TC IN field: height 18
  addStandaloneField(form, page, `tcIn_${num}`, '', tcFieldX, y - 22, tcFieldW, 18, { fontSize: 9 });

  // Divider line inside card under top bar
  page.drawLine({
    start: { x: x + pad, y: y - 27 },
    end: { x: x + width - pad, y: y - 27 },
    thickness: 0.5,
    color: rgb(235 / 255, 240 / 255, 245 / 255)
  });

  // Row 2: Name / Photo Credit & Title / Super side by side
  const innerW = width - pad * 2;
  const colGap = 12;
  const colW = (innerW - colGap) / 2;

  // Name Column: Left
  const nameX = x + pad;
  page.drawText('NAME / PHOTO CREDIT (ON-SCREEN)', {
    x: nameX,
    y: y - 39,
    size: 7,
    font: page.docBoldFont,
    color: COLOR_TEXT_MUTED
  });
  addStandaloneField(form, page, `creditName_${num}`, '', nameX, y - 62, colW, 19, { fontSize: 9 });

  // Title / Super Column: Right
  const titleX = nameX + colW + colGap;
  page.drawText('TITLE: CASE STUDY / EXPERT TITLE', {
    x: titleX,
    y: y - 39,
    size: 7,
    font: page.docBoldFont,
    color: COLOR_TEXT_MUTED
  });
  addStandaloneField(form, page, `creditTitle_${num}`, '', titleX, y - 62, colW, 19, { fontSize: 9 });
}

// ----------------------------------------------------
// MAIN EXECUTION
// ----------------------------------------------------
async function main() {
  console.log('Starting fillable PDF generation...');
  const outDir = path.join(__dirname, 'frontend', 'templates');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const cbBytes = fs.readFileSync(path.join(__dirname, 'frontend', 'assets', 'carte_blanche_logo.png'));
  const caForPdfPath = path.join(__dirname, 'frontend', 'assets', 'combined_artists_logo_for_pdf.png');
  const caBytes = fs.existsSync(caForPdfPath)
    ? fs.readFileSync(caForPdfPath)
    : fs.readFileSync(path.join(__dirname, 'frontend', 'assets', 'combined_artists_logo.png'));

  console.log('1. Generating Participant Release Form 2026...');
  const prBytes = await generateParticipantRelease(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Participant_Release_Form_2026.pdf'), prBytes);

  console.log('2. Generating Minor Release Form 2026...');
  const mrBytes = await generateMinorRelease(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Minor_Release_Form_2026.pdf'), mrBytes);

  console.log('3. Generating Location Agreement 2026...');
  const laBytes = await generateLocationAgreement(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Location_Agreement_2026.pdf'), laBytes);

  console.log('4. Generating Footage Agreement 2026...');
  const faBytes = await generateFootageAgreement(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Footage_Agreement_2026.pdf'), faBytes);

  console.log('5. Generating Music Agreement 2026...');
  const maBytes = await generateMusicAgreement(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Music_Agreement_2026.pdf'), maBytes);

  console.log('6. Generating Insert Sheet 2026...');
  const isBytes = await generateInsertSheet(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Insert_Sheet_2026.pdf'), isBytes);

  console.log('All 6 fillable PDFs successfully generated!');
}

main().catch(err => {
  console.error('Fatal error during PDF generation:', err);
  process.exit(1);
});
