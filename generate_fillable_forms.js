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

  addCenteredParagraph(text, font = this.page.docRegularFont, size = 7.5, color = COLOR_TEXT_BODY, lineGap = 10) {
    const textW = font.widthOfTextAtSize(text, size);
    const x = this.marginX + (this.width - textW) / 2;
    this.page.drawText(text, {
      x,
      y: this.y,
      size,
      font,
      color
    });
    this.y -= lineGap;
  }

  addCenteredField(id, label, width = 300, height = 20, subtext = '') {
    const labelHeight = 8;
    const labelGap = 3;
    const labelY = this.y - labelHeight;
    const fieldY = labelY - labelGap - height;
    const fieldX = this.marginX + (this.width - width) / 2;

    if (label) {
      const labelText = label.toUpperCase();
      const labelW = this.page.docBoldFont.widthOfTextAtSize(labelText, 7.2);
      const labelX = this.marginX + (this.width - labelW) / 2;
      this.page.drawText(labelText, {
        x: labelX,
        y: labelY,
        size: 7.2,
        font: this.page.docBoldFont,
        color: COLOR_TEXT_MUTED
      });
    }

    this.page.drawRectangle({
      x: fieldX,
      y: fieldY,
      width,
      height,
      borderWidth: 1,
      borderColor: COLOR_BORDER,
      color: COLOR_BG_FIELD
    });

    const tf = this.form.createTextField(id);
    tf.addToPage(this.page, {
      x: fieldX,
      y: fieldY,
      width,
      height,
      borderWidth: 1,
      borderColor: COLOR_BORDER,
      backgroundColor: COLOR_BG_FIELD,
      textColor: COLOR_TEXT_DARK
    });
    tf.setFontSize(9.5);

    if (subtext) {
      const subW = this.page.docItalicFont.widthOfTextAtSize(subtext, 6.8);
      const subX = this.marginX + (this.width - subW) / 2;
      this.page.drawText(subtext, {
        x: subX,
        y: fieldY - 9,
        size: 6.8,
        font: this.page.docItalicFont,
        color: COLOR_TEXT_MUTED
      });
      this.y = fieldY - 14;
    } else {
      this.y = fieldY - 5;
    }
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
  // Bold top notice as requested
  const topNotice = 'Email the completed form to release@carteblanche.co.za';
  const topNoticeSize = 9.5;
  const topNoticeW = page.docBoldFont.widthOfTextAtSize(topNotice, topNoticeSize);
  page.drawText(topNotice, {
    x: (PAGE_W - topNoticeW) / 2,
    y: 814,
    size: topNoticeSize,
    font: page.docBoldFont,
    color: COLOR_TEXT_DARK
  });

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

  page.drawText(title, {
    x: MARGIN_X,
    y: 775,
    size: titleSize,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });

  page.drawText(subtitle, {
    x: MARGIN_X,
    y: 758,
    size: 8.5,
    font: page.docRegularFont,
    color: COLOR_TEXT_MUTED
  });

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

  // Section 1: Commission Number, Story Title, Producer
  layout.addHeading('SECTION 1');
  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'commissionNumber', label: 'Commission Number:', width: halfW },
    { id: 'storyTitle', label: 'Story Title:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'producerName', label: 'Producer:', width: CONTENT_W, gap: 0 }
  ]);

  layout.addDivider(0.5);

  // Section 2: Participant, ID Number, Contact Number
  layout.addHeading('SECTION 2');
  layout.addFieldRow([
    { id: 'participantName', label: 'Participant:', width: CONTENT_W, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'idNumber', label: 'ID Number:', width: halfW },
    { id: 'contactNumber', label: 'Contact Number:', width: halfW, gap: 0 }
  ]);

  // Legal Terms
  layout.addDivider(0.5);

  layout.addParagraph(
    'I, the undersigned, give my consent to Electronic Media Network Limited (M-Net):',
    page.docBoldFont,
    8.2,
    COLOR_TEXT_DARK,
    11
  );

  layout.addBullet('1.', 'to film my image and record my voice in an interview on camera ("the recording")', page.docRegularFont, 7.8, COLOR_TEXT_BODY, 10.5);
  layout.addBullet('2.', 'to broadcast the recording on the current affairs and actuality programme called Carte Blanche - on any platform M-Net uses, including on television, social media and the internet.', page.docRegularFont, 7.8, COLOR_TEXT_BODY, 10.5);
  layout.addBullet('3.', 'to use the recording in any advertisements or promotional material for Carte Blanche or M-Net, and to store the recording for as long as M-Net and/or Carte Blanche needs to. I acknowledge that I have been informed that any statements I make and any information I provide during my interview done by the producers of Carte Blanche - including special information as defined under the Protection of Personal Information Act, 2013, whether it is of a private nature - may be processed by Carte Blanche for production purposes and broadcast on Carte Blanche.', page.docRegularFont, 7.8, COLOR_TEXT_BODY, 10.5);

  layout.addSpace(2);
  layout.addParagraph(
    'I agree that the recording may be edited/shortened by the producers of Carte Blanche or M-Net in the way the producers deem appropriate and fair.',
    page.docRegularFont,
    7.8,
    COLOR_TEXT_BODY,
    10.5
  );

  layout.addParagraph(
    'I agree to give M-Net any intellectual property rights and copyright that may be attached to the recording of my participation in Carte Blanche.',
    page.docRegularFont,
    7.8,
    COLOR_TEXT_BODY,
    10.5
  );

  // Execution: THE PARTICIPANT & THE PRODUCER
  layout.addDivider(0.5);

  const headingY = layout.y - 4;
  page.drawText('THE PARTICIPANT', {
    x: layout.marginX,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  page.drawText('THE PRODUCER', {
    x: layout.marginX + halfW + 12,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  layout.y = headingY - 14;

  layout.addFieldRow([
    { id: 'participantSignedAt', label: 'Signed at:', width: halfW },
    { id: 'producerSignedAt', label: 'Signed at:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'participantSignedDate', label: 'Date:', width: halfW },
    { id: 'producerSignedDate', label: 'Date:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'participantSignature', label: 'Participant Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-PRF-2026');

  // Also support alias fields for seamless form filling
  try {
    const aliasStory = form.createTextField('storyName');
    aliasStory.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProd = form.createTextField('producer');
    aliasProd.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasFull = form.createTextField('fullName');
    aliasFull.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasPhone = form.createTextField('phone');
    aliasPhone.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignAt = form.createTextField('signedAt');
    aliasSignAt.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignDate = form.createTextField('signedDate');
    aliasSignDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
  } catch (e) {}

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

  // Top Production Details
  layout.addFieldRow([
    { id: 'commissionNumber', label: 'Commission Number:', width: 150 },
    { id: 'storyTitle', label: 'Story Title:', width: CONTENT_W - 162, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'producerName', label: 'Producer Name:', width: CONTENT_W, gap: 0 }
  ]);

  // Legal Terms
  layout.addDivider(0.5);

  layout.addParagraph(
    'As the parent or legal guardian of the child named below, I hereby give my permission for my child to be interviewed and recorded by Electronic Media Network Limited (M-Net). I understand that:',
    page.docBoldFont,
    8.2,
    COLOR_TEXT_DARK,
    11
  );

  layout.addBullet('1.', 'My child may be filmed and their voice recorded on camera ("the recording").', page.docRegularFont, 7.8, COLOR_TEXT_BODY, 10.5);
  layout.addBullet('2.', 'The recording may be used in any advertisements or promotional material for Carte Blanche or M-Net.', page.docRegularFont, 7.8, COLOR_TEXT_BODY, 10.5);
  layout.addBullet('3.', 'The recording may be stored for as long as M-Net and/or Carte Blanche deems necessary.', page.docRegularFont, 7.8, COLOR_TEXT_BODY, 10.5);

  layout.addSpace(2);
  layout.addParagraph(
    'I am aware that any statements my child makes and any information they provide during the interview — including special personal information as defined under the Protection of Personal Information Act, 2013 — may be processed by Carte Blanche for production purposes and may be broadcast on Carte Blanche.',
    page.docRegularFont,
    7.8,
    COLOR_TEXT_BODY,
    10.5
  );

  layout.addParagraph(
    'I understand that the producers of Carte Blanche or M-Net may edit or shorten the recording in a manner they consider appropriate and fair.',
    page.docRegularFont,
    7.8,
    COLOR_TEXT_BODY,
    10.5
  );

  layout.addParagraph(
    'Furthermore, I grant M-Net any intellectual property rights and copyright attached to the recording of my child\'s participation in Carte Blanche.',
    page.docRegularFont,
    7.8,
    COLOR_TEXT_BODY,
    10.5
  );

  // Child & Parent/Guardian Details
  layout.addDivider(0.5);

  layout.addFieldRow([
    { id: 'childName', label: 'Child Name & Surname:', width: CONTENT_W, gap: 0 }
  ]);

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'parentName', label: 'Parent/Guardian Name & Surname:', width: halfW },
    { id: 'parentIdNumber', label: 'Parent/Guardian ID Number:', width: halfW, gap: 0 }
  ]);

  // Execution: THE PARENT/GUARDIAN & THE PRODUCER
  layout.addDivider(0.5);

  const headingY = layout.y - 4;
  page.drawText('THE PARENT/GUARDIAN', {
    x: layout.marginX,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  page.drawText('THE PRODUCER', {
    x: layout.marginX + halfW + 12,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  layout.y = headingY - 14;

  layout.addFieldRow([
    { id: 'parentSignedAt', label: 'Signed at:', width: halfW },
    { id: 'producerSignedAt', label: 'Signed at:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'parentSignedDate', label: 'Date:', width: halfW },
    { id: 'producerSignedDate', label: 'Date:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'parentSignature', label: 'Parent/Guardian Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-MRF-2026');

  // Support alias fields for seamless backward compatibility
  try {
    const aliasStory = form.createTextField('storyName');
    aliasStory.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProd = form.createTextField('producer');
    aliasProd.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasMinor = form.createTextField('minorName');
    aliasMinor.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasGuardian = form.createTextField('guardianName');
    aliasGuardian.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasGuardianId = form.createTextField('guardianId');
    aliasGuardianId.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignAt = form.createTextField('signedAt');
    aliasSignAt.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignDate = form.createTextField('signedDate');
    aliasSignDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
  } catch (e) {}

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

  drawHeader(page, cbLogoImg, caLogoImg, 'LOCATION AGREEMENT', 'Carte Blanche & M-Net  •  Location Agreement');

  const layout = new FlowLayout(page, form, 726);

  // Preamble
  layout.addParagraph('This Agreement is made by and between', page.docBoldFont, 8.5, COLOR_TEXT_DARK, 11);
  layout.addParagraph('CARTE BLANCHE & M-NET', page.docBoldFont, 10, COLOR_PRIMARY, 12);
  layout.addParagraph('(“the producer”)', page.docItalicFont, 8, COLOR_TEXT_MUTED, 11);
  layout.addSpace(2);
  layout.addParagraph('and', page.docBoldFont, 8.5, COLOR_TEXT_DARK, 11);
  layout.addSpace(2);

  layout.addFieldRow([
    { id: 'locationOwnerName', label: 'Location Owner/Manager Name & Surname:', width: CONTENT_W, subtext: '(“the owner”)', gap: 0 }
  ]);

  layout.addSpace(2);

  const halfW = (CONTENT_W - 12) / 2;
  layout.addFieldRow([
    { id: 'commissionNumber', label: 'Commission Number:', width: halfW },
    { id: 'storyTitle', label: 'Story Title:', width: halfW, gap: 0 }
  ]);

  layout.addDivider(0.5);

  // Legal Clauses
  const clauses = [
    {
      title: 'LOCATION:',
      text: 'The owner grants the producer and its employees, agents and contractors the right to enter and use the property located at the below address ("location") on the date below ("date") for the purpose of filming, recording and/or photographing scenes for Carte Blanche ("production").'
    },
    {
      title: 'USE OF LOCATION:',
      text: 'The producer shall be permitted to photograph, film and record at the location and to bring equipment and personnel necessary for such purposes. The producer may depict the location and any signs, logos or identifiers included therein, in the production at the producer\'s discretion.'
    },
    {
      title: 'CONDITION OF LOCATION:',
      text: 'The producer agrees to exercise reasonable care in the use of the location and shall return it to its original condition.'
    },
    {
      title: 'INDEMNIFICATION:',
      text: 'The producer agrees to indemnify, defend and hold harmless, the owner from any and all claims, damages, liabilities and expenses arising from the producer\'s use of the location, except to the extent they result from the owner\'s negligence or wilful misconduct.'
    }
  ];

  for (const c of clauses) {
    layout.addParagraph(c.title, page.docBoldFont, 7.8, COLOR_TEXT_DARK, 10.5);
    layout.addParagraph(c.text, page.docRegularFont, 7.5, COLOR_TEXT_BODY, 10.2);
    layout.addSpace(1.5);
  }

  layout.addDivider(0.5);

  layout.addFieldRow([
    { id: 'locationAddress', label: 'Location Address:', width: CONTENT_W - 160 },
    { id: 'dateOfFilming', label: 'Date of Filming:', width: 148, gap: 0 }
  ]);

  layout.addDivider(0.5);

  // Execution: THE OWNER & THE PRODUCER
  const headingY = layout.y - 4;
  page.drawText('THE OWNER', {
    x: layout.marginX,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  page.drawText('THE PRODUCER', {
    x: layout.marginX + halfW + 12,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  layout.y = headingY - 14;

  layout.addFieldRow([
    { id: 'ownerSignedAt', label: 'Signed at:', width: halfW },
    { id: 'producerSignedAt', label: 'Signed at:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerSignedDate', label: 'Date:', width: halfW },
    { id: 'producerSignedDate', label: 'Date:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerSignature', label: 'Owner/Manager Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-LOC-2026');

  // Support alias fields for backward compatibility
  try {
    const aliasOwner = form.createTextField('ownerName');
    aliasOwner.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProp = form.createTextField('propertyAddress');
    aliasProp.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasFilmDate = form.createTextField('filmingDate');
    aliasFilmDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasStory = form.createTextField('storyName');
    aliasStory.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProd = form.createTextField('producer');
    aliasProd.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProdName = form.createTextField('producerName');
    aliasProdName.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasFull = form.createTextField('fullName');
    aliasFull.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignAt = form.createTextField('signedAt');
    aliasSignAt.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignDate = form.createTextField('signedDate');
    aliasSignDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasOwnerDate = form.createTextField('ownerDate');
    aliasOwnerDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProducerDate = form.createTextField('producerDate');
    aliasProducerDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
  } catch (e) {}

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

  drawHeader(page, cbLogoImg, caLogoImg, 'FOOTAGE AGREEMENT', 'Carte Blanche & M-Net  •  Footage Agreement');

  const layout = new FlowLayout(page, form, 726);
  const halfW = (CONTENT_W - 12) / 2;

  // Centered Parties Block
  layout.addCenteredParagraph('Footage Agreement', page.docBoldFont, 10, COLOR_PRIMARY, 12);
  layout.addCenteredParagraph('between', page.docBoldFont, 8, COLOR_TEXT_DARK, 10);
  layout.addCenteredParagraph('CARTE BLANCHE & M-NET', page.docBoldFont, 9.5, COLOR_TEXT_DARK, 10);
  layout.addCenteredParagraph('(“the producer”)', page.docItalicFont, 7.5, COLOR_TEXT_MUTED, 10);
  layout.addCenteredParagraph('and', page.docBoldFont, 8, COLOR_TEXT_DARK, 11);

  layout.addCenteredField('footageOwnerName', 'Footage Owner Name & Surname:', 300, 18);
  layout.addCenteredParagraph('on behalf of', page.docItalicFont, 7.5, COLOR_TEXT_MUTED, 9);
  layout.addCenteredField('footageOwnerCompany', 'Footage Owner Company:', 300, 18);
  layout.addCenteredParagraph('(“the owner”)', page.docItalicFont, 7.5, COLOR_TEXT_MUTED, 11);

  // Story Title, Commission Number, Broadcast Date
  const thirdW = (CONTENT_W - 16) / 3;
  layout.addFieldRow([
    { id: 'storyTitle', label: 'Story Title:', width: thirdW },
    { id: 'commissionNumber', label: 'Commission Number:', width: thirdW },
    { id: 'broadcastDate', label: 'Broadcast Date:', width: thirdW, gap: 0 }
  ]);

  layout.addDivider(0.5);

  // Legal copy part 1
  const termsPart1 = [
    'The owner hereby gives the producer permission to use portions of the following videos/images (“the footage”) in the story titled below to be broadcast on Carte Blanche on M-Net on the date below and on any other MultiChoice platform as M-Net sees fit, in perpetuity.',
    'The producer undertakes to use the footage fairly to illustrate issues pertaining to the story.',
    'The producer undertakes to provide the owners with an on-screen courtesy credit for the footage, if requested by the owner.',
    'The producer will not pay the owner for the use of the footage.',
    'The program in its completed form is the property of M-Net and Carte Blanche.'
  ];

  for (const t of termsPart1) {
    layout.addParagraph(t, page.docRegularFont, 7.5, COLOR_TEXT_BODY, 10);
    layout.addSpace(1.5);
  }

  // Description of Footage
  layout.addDivider(0.5);
  layout.addFieldRow([
    { id: 'footageDescription', label: 'DESCRIPTION OF FOOTAGE:', width: CONTENT_W, height: 42, multiline: true, gap: 0 }
  ]);

  layout.addSpace(1.5);

  // Legal copy part 2
  const termPart2 = 'The footage in its entirety remains the property of the owner and Carte Blanche & M-NET cannot share/copy/send the footage to any other news organisations or persons.';
  layout.addParagraph(termPart2, page.docRegularFont, 7.5, COLOR_TEXT_BODY, 10);

  // Execution: THE OWNER & THE PRODUCER
  layout.addDivider(0.5);

  const headingY = layout.y - 4;
  page.drawText('THE OWNER', {
    x: layout.marginX,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  page.drawText('THE PRODUCER', {
    x: layout.marginX + halfW + 12,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  layout.y = headingY - 14;

  layout.addFieldRow([
    { id: 'ownerSignedAt', label: 'Signed at:', width: halfW },
    { id: 'producerSignedAt', label: 'Signed at:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerSignedDate', label: 'Date:', width: halfW },
    { id: 'producerSignedDate', label: 'Date:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerSignature', label: 'Owner Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-FA-2026');

  // Alias fields for backwards compatibility
  try {
    const aliasLicensorName = form.createTextField('licensorName');
    aliasLicensorName.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasLicensorEntity = form.createTextField('licensorEntity');
    aliasLicensorEntity.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasStoryName = form.createTextField('storyName');
    aliasStoryName.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasBcastDated = form.createTextField('broadcastDated');
    aliasBcastDated.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignAt = form.createTextField('signedAt');
    aliasSignAt.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignDate = form.createTextField('signedDate');
    aliasSignDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasOwnerDate = form.createTextField('ownerDate');
    aliasOwnerDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProducerDate = form.createTextField('producerDate');
    aliasProducerDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
  } catch (e) {}

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

  drawHeader(page, cbLogoImg, caLogoImg, 'MUSIC AGREEMENT', 'Carte Blanche & M-Net  •  Music Agreement');

  const layout = new FlowLayout(page, form, 726);
  const halfW = (CONTENT_W - 12) / 2;

  // Centered Parties Block
  layout.addCenteredParagraph('Music Agreement', page.docBoldFont, 10, COLOR_PRIMARY, 12);
  layout.addCenteredParagraph('between', page.docBoldFont, 8, COLOR_TEXT_DARK, 10);
  layout.addCenteredParagraph('CARTE BLANCHE & M-NET', page.docBoldFont, 9.5, COLOR_TEXT_DARK, 10);
  layout.addCenteredParagraph('(“the producer”)', page.docItalicFont, 7.5, COLOR_TEXT_MUTED, 10);
  layout.addCenteredParagraph('and', page.docBoldFont, 8, COLOR_TEXT_DARK, 11);

  layout.addCenteredField('musicOwnerName', 'Music Owner Name & Surname:', 300, 18);
  layout.addCenteredParagraph('on behalf of', page.docItalicFont, 7.5, COLOR_TEXT_MUTED, 9);
  layout.addCenteredField('musicOwnerCompany', 'Music Owner Company:', 300, 18);
  layout.addCenteredParagraph('(“the owner”)', page.docItalicFont, 7.5, COLOR_TEXT_MUTED, 11);

  // Story Title, Commission Number, Broadcast Date
  const thirdW = (CONTENT_W - 16) / 3;
  layout.addFieldRow([
    { id: 'storyTitle', label: 'Story Title:', width: thirdW },
    { id: 'commissionNumber', label: 'Commission Number:', width: thirdW },
    { id: 'broadcastDate', label: 'Broadcast Date:', width: thirdW, gap: 0 }
  ]);

  layout.addDivider(0.5);

  // Legal copy part 1
  const termsPart1 = [
    'The owner hereby gives the producer permission to use portions of the following music compositions (“the music”) in the story titled below to be broadcast on Carte Blanche on M-Net on the date below and on any other MultiChoice platform as M-Net sees fit, in perpetuity.',
    'The producer undertakes to use the music fairly to illustrate issues pertaining to the story.',
    'The producer will not pay the owner for the use of the footage.',
    'The program in its completed form is the property of M-Net and Carte Blanche.'
  ];

  for (const t of termsPart1) {
    layout.addParagraph(t, page.docRegularFont, 7.6, COLOR_TEXT_BODY, 10.2);
    layout.addSpace(1.5);
  }

  // Music Track Titles
  layout.addDivider(0.5);
  layout.addFieldRow([
    { id: 'musicTrackTitle', label: 'Music Track Title:', width: CONTENT_W, gap: 0 }
  ]);
  layout.addFieldRow([
    { id: 'musicTrackTitle2', label: 'Music Track Title (Additional Track):', width: CONTENT_W, gap: 0 }
  ]);
  layout.addFieldRow([
    { id: 'musicTrackTitle3', label: 'Music Track Title (Additional Track):', width: CONTENT_W, gap: 0 }
  ]);

  layout.addSpace(1);

  // Legal copy part 2
  const termPart2 = 'The music in its entirety remains the property of the owner and Carte Blanche and M-Net cannot share/copy/send the footage to any other news organisation or persons.';
  layout.addParagraph(termPart2, page.docRegularFont, 7.6, COLOR_TEXT_BODY, 10.2);

  // Execution: THE OWNER & THE PRODUCER
  layout.addDivider(0.5);

  const headingY = layout.y - 4;
  page.drawText('THE OWNER', {
    x: layout.marginX,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  page.drawText('THE PRODUCER', {
    x: layout.marginX + halfW + 12,
    y: headingY,
    size: 9.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });
  layout.y = headingY - 14;

  layout.addFieldRow([
    { id: 'ownerSignedAt', label: 'Signed at:', width: halfW },
    { id: 'producerSignedAt', label: 'Signed at:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerSignedDate', label: 'Date:', width: halfW },
    { id: 'producerSignedDate', label: 'Date:', width: halfW, gap: 0 }
  ]);

  layout.addFieldRow([
    { id: 'ownerSignature', label: 'Owner Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally' },
    { id: 'producerSignature', label: 'Producer Signature:', width: halfW, height: 42, subtext: 'Type full name or sign digitally', gap: 0 }
  ]);

  drawFooter(page, 'Form Ref: CB-MA-2026');

  // Support alias fields for backward compatibility
  try {
    const aliasStory = form.createTextField('storyName');
    aliasStory.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProd = form.createTextField('producer');
    aliasProd.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProdName = form.createTextField('producerName');
    aliasProdName.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasArtist = form.createTextField('artistName');
    aliasArtist.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasFull = form.createTextField('fullName');
    aliasFull.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasPublisher = form.createTextField('publisherName');
    aliasPublisher.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasTrack = form.createTextField('trackTitle');
    aliasTrack.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasTracks = form.createTextField('musicTracks');
    aliasTracks.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasOwnerDate = form.createTextField('ownerDate');
    aliasOwnerDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasProducerDate = form.createTextField('producerDate');
    aliasProducerDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignAt = form.createTextField('signedAt');
    aliasSignAt.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    const aliasSignDate = form.createTextField('signedDate');
    aliasSignDate.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
  } catch (e) {}

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

// ----------------------------------------------------
// 6. INSERT SHEET 2026 (Multi-page: 4 Pages, 20 Credits)
// ----------------------------------------------------
async function generateInsertSheet(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const form = doc.getForm();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  const TOTAL_PAGES = 4;
  let creditCounter = 1;

  // PAGE 1: Header + Production Crew + First 4 Credits
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    drawHeader(page, cbLogoImg, caLogoImg, 'INSERT SHEET', 'Carte Blanche  •  Official Post-Production Graphics & Credits Delivery');

    const layout = new FlowLayout(page, form, 726);

    layout.addFieldRow([
      { id: 'commissionNumber', label: 'Commission Number:', width: 150 },
      { id: 'storyTitle', label: 'Story Title:', width: CONTENT_W - 162, gap: 0 }
    ], 18);

    const halfW = (CONTENT_W - 12) / 2;
    layout.addFieldRow([
      { id: 'producer', label: 'Producer:', width: halfW },
      { id: 'presenter', label: 'Presenter:', width: halfW, gap: 0 }
    ], 18);

    layout.addFieldRow([
      { id: 'dop', label: 'DOP:', width: halfW },
      { id: 'camAssist', label: 'Camera Assistant:', width: halfW, gap: 0 }
    ], 18);

    layout.addFieldRow([
      { id: 'editor', label: 'Editor:', width: halfW },
      { id: 'finalMix', label: 'Final Mix Operator:', width: halfW, gap: 0 }
    ], 18);

    layout.addFieldRow([
      { id: 'deliveryDate', label: 'Delivery Date:', width: halfW },
      { id: 'insertDuration', label: 'Insert Duration:', width: halfW, subtext: 'HH:MM:SS', gap: 0 }
    ], 18);

    layout.addFieldRow([
      { id: 'thirdPartyFootage', label: '3rd Party Footage:', width: CONTENT_W, subtext: 'Yes or No', gap: 0 }
    ], 18);

    layout.addDivider(0.5);
    layout.addHeading('SCREEN CREDITS');

    // Draw 4 credit blocks on Page 1
    for (let i = 0; i < 4; i++) {
      drawCreditBlock(form, page, creditCounter++, MARGIN_X, layout.y, CONTENT_W);
      layout.y -= 78;
    }

    drawFooter(page, 'Form Ref: CB-INS-2026', `Page 1 of ${TOTAL_PAGES}`);

    // Alias fields on page 1 for backward compatibility
    try {
      const aliasStory = form.createTextField('storyName');
      aliasStory.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
      const aliasComm = form.createTextField('commNum');
      aliasComm.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
      const aliasProd = form.createTextField('producerName');
      aliasProd.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
      const aliasCam = form.createTextField('cameraAssistant');
      aliasCam.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
      const aliasMix = form.createTextField('finalMixOperator');
      aliasMix.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    } catch (e) {}
  }

  // PAGES 2 to 10: 6 Credits per page
  for (let p = 2; p <= TOTAL_PAGES; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    // Running Header
    const topNotice = 'Email the completed form to release@carteblanche.co.za';
    const topNoticeW = fontBold.widthOfTextAtSize(topNotice, 9.5);
    page.drawText(topNotice, {
      x: (PAGE_W - topNoticeW) / 2,
      y: 814,
      size: 9.5,
      font: fontBold,
      color: COLOR_TEXT_DARK
    });

    const headY = 798;
    page.drawText('CARTE BLANCHE  •  INSERT SHEET (SCREEN CREDITS)', {
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
    addStandaloneField(form, page, `storyName_p${p}`, 'Story Title:', MARGIN_X, headY - 30, CONTENT_W - 160, 18, { fontSize: 9 });
    addStandaloneField(form, page, `commNum_p${p}`, 'Commission Number:', RIGHT_X - 150, headY - 30, 150, 18, { fontSize: 9 });

    page.drawLine({
      start: { x: MARGIN_X, y: headY - 40 },
      end: { x: RIGHT_X, y: headY - 40 },
      thickness: 1,
      color: COLOR_PRIMARY
    });

    let curY = headY - 58;

    // Draw credit blocks (up to 20 total)
    const creditsOnThisPage = Math.min(6, 20 - creditCounter + 1);
    for (let c = 0; c < creditsOnThisPage; c++) {
      drawCreditBlock(form, page, creditCounter++, MARGIN_X, curY, CONTENT_W);
      curY -= 82;
    }

    drawFooter(page, 'Form Ref: CB-INS-2026', `Page ${p} of ${TOTAL_PAGES}`);
  }

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
}

function drawCreditBlock(form, page, num, x, y, width) {
  // y is the TOP edge of this credit block
  const pad = 8;
  const blockH = 70; // Total height of card
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
    y: y - 13,
    size: 8,
    font: page.docBoldFont,
    color: COLOR_PRIMARY_DARK
  });

  // TC In label and field on right
  const tcFieldW = 100;
  const tcLabelW = page.docBoldFont.widthOfTextAtSize('TC In:', 7.5);
  const tcFieldX = x + width - pad - tcFieldW;
  const tcLabelX = tcFieldX - tcLabelW - 5;

  page.drawText('TC In:', {
    x: tcLabelX,
    y: y - 13,
    size: 7.5,
    font: page.docBoldFont,
    color: COLOR_TEXT_MUTED
  });

  // TC In field: height 17
  addStandaloneField(form, page, `tcIn_${num}`, '', tcFieldX, y - 20, tcFieldW, 17, { fontSize: 8.5 });

  // Divider line inside card under top bar
  page.drawLine({
    start: { x: x + pad, y: y - 24 },
    end: { x: x + width - pad, y: y - 24 },
    thickness: 0.5,
    color: rgb(235 / 255, 240 / 255, 245 / 255)
  });

  // Row 2: On-Screen Name/Photo Credit & Case Study/Expert Title side by side
  const innerW = width - pad * 2;
  const colGap = 12;
  const colW = (innerW - colGap) / 2;

  // Name Column: Left
  const nameX = x + pad;
  page.drawText('On-Screen Name/Photo Credit:', {
    x: nameX,
    y: y - 35,
    size: 7,
    font: page.docBoldFont,
    color: COLOR_TEXT_MUTED
  });
  addStandaloneField(form, page, `creditName_${num}`, '', nameX, y - 56, colW, 18, { fontSize: 8.5 });

  // Title / Super Column: Right
  const titleX = nameX + colW + colGap;
  page.drawText('Case Study/Expert Title:', {
    x: titleX,
    y: y - 35,
    size: 7,
    font: page.docBoldFont,
    color: COLOR_TEXT_MUTED
  });
  addStandaloneField(form, page, `creditTitle_${num}`, '', titleX, y - 56, colW, 18, { fontSize: 8.5 });
}

// ----------------------------------------------------
// 7. TRAVEL BOOKING FORM (3-Page A4 Fillable)
// ----------------------------------------------------
function drawFlightBlock(form, page, fNum, x, y, width) {
  const pad = 6;
  const blockH = 125;

  // Background Card
  page.drawRectangle({
    x,
    y: y - blockH,
    width,
    height: blockH,
    borderWidth: 0.5,
    borderColor: rgb(215 / 255, 225 / 255, 235 / 255),
    color: rgb(252 / 255, 253 / 255, 255 / 255)
  });

  // Header Bar
  page.drawRectangle({
    x,
    y: y - 18,
    width,
    height: 18,
    color: COLOR_PRIMARY
  });

  page.drawText(`FLIGHT ${fNum}`, {
    x: x + pad,
    y: y - 13,
    size: 8.5,
    font: page.docBoldFont,
    color: rgb(1, 1, 1)
  });

  // Flight details row 1: Departure Airport (w: 220), Departure Date (w: 140), Departure Time (w: 160)
  const fY1 = y - 38;
  addStandaloneField(form, page, `depAirport_${fNum}`, 'Departure Airport:', x + pad, fY1, 220, 16, { fontSize: 8 });
  addStandaloneField(form, page, `depDate_${fNum}`, 'Departure Date:', x + pad + 230, fY1, 140, 16, { fontSize: 8 });
  addStandaloneField(form, page, `depTime_${fNum}`, 'Departure Time (HH:MM am/pm):', x + pad + 380, fY1, 155, 16, { fontSize: 8 });

  // Flight details row 2: Arrival Airport (w: 220), Total Passengers (w: 140)
  const fY2 = y - 62;
  addStandaloneField(form, page, `arrAirport_${fNum}`, 'Arrival Airport:', x + pad, fY2, 220, 16, { fontSize: 8 });
  addStandaloneField(form, page, `totalPax_${fNum}`, 'Total Passengers:', x + pad + 230, fY2, 140, 16, { fontSize: 8 });

  // Passenger Info Heading
  page.drawText('PASSENGER INFO', {
    x: x + pad,
    y: y - 72,
    size: 7.5,
    font: page.docBoldFont,
    color: COLOR_PRIMARY
  });

  // Table Header
  const tHeadY = y - 82;
  const colW = [65, 115, 115, 115, 115];
  const colX = [
    x + pad,
    x + pad + colW[0] + 5,
    x + pad + colW[0] + colW[1] + 10,
    x + pad + colW[0] + colW[1] + colW[2] + 15,
    x + pad + colW[0] + colW[1] + colW[2] + colW[3] + 20
  ];

  page.drawText('Passenger', { x: colX[0], y: tHeadY, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_MUTED });
  page.drawText('First Name', { x: colX[1], y: tHeadY, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_MUTED });
  page.drawText('Surname', { x: colX[2], y: tHeadY, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_MUTED });
  page.drawText('ID Number', { x: colX[3], y: tHeadY, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_MUTED });
  page.drawText('Mobile Number', { x: colX[4], y: tHeadY, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_MUTED });

  // 3 Passenger Rows
  for (let p = 1; p <= 3; p++) {
    const rowY = y - 84 - (p * 13);
    page.drawText(`Passenger ${p}`, { x: colX[0], y: rowY + 3, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_DARK });
    addStandaloneField(form, page, `f${fNum}_pax${p}_firstName`, '', colX[1], rowY, colW[1], 12, { fontSize: 7.5 });
    addStandaloneField(form, page, `f${fNum}_pax${p}_surname`, '', colX[2], rowY, colW[2], 12, { fontSize: 7.5 });
    addStandaloneField(form, page, `f${fNum}_pax${p}_id`, '', colX[3], rowY, colW[3], 12, { fontSize: 7.5 });
    addStandaloneField(form, page, `f${fNum}_pax${p}_mobile`, '', colX[4], rowY, colW[4], 12, { fontSize: 7.5 });
  }

  return blockH;
}

function drawCarRentalBlock(form, page, cNum, x, y, width) {
  const pad = 6;
  const blockH = 68;

  page.drawRectangle({
    x,
    y: y - blockH,
    width,
    height: blockH,
    borderWidth: 0.5,
    borderColor: rgb(215 / 255, 225 / 255, 235 / 255),
    color: rgb(252 / 255, 253 / 255, 255 / 255)
  });

  page.drawRectangle({
    x,
    y: y - 16,
    width,
    height: 16,
    color: rgb(2 / 255, 132 / 255, 199 / 255)
  });

  page.drawText(`CAR RENTAL ${cNum}`, {
    x: x + pad,
    y: y - 12,
    size: 8,
    font: page.docBoldFont,
    color: rgb(1, 1, 1)
  });

  const row1Y = y - 34;
  addStandaloneField(form, page, `car${cNum}_pickupLoc`, 'Pick-Up Location:', x + pad, row1Y, 220, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `car${cNum}_pickupDate`, 'Date:', x + pad + 230, row1Y, 140, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `car${cNum}_pickupTime`, 'Time (HH:MM am/pm):', x + pad + 380, row1Y, 155, 14, { fontSize: 7.5 });

  const row2Y = y - 51;
  addStandaloneField(form, page, `car${cNum}_dropoffLoc`, 'Drop-Off Location:', x + pad, row2Y, 220, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `car${cNum}_dropoffDate`, 'Date:', x + pad + 230, row2Y, 140, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `car${cNum}_dropoffTime`, 'Time (HH:MM am/pm):', x + pad + 380, row2Y, 155, 14, { fontSize: 7.5 });

  const row3Y = y - 66;
  addStandaloneField(form, page, `car${cNum}_driver`, 'Responsible Driver Name & Surname:', x + pad, row3Y, width - (pad * 2), 13, { fontSize: 7.5 });

  return blockH;
}

function drawLocationBlock(form, page, lNum, x, y, width) {
  const pad = 6;
  const blockH = 80;

  page.drawRectangle({
    x,
    y: y - blockH,
    width,
    height: blockH,
    borderWidth: 0.5,
    borderColor: rgb(215 / 255, 225 / 255, 235 / 255),
    color: rgb(252 / 255, 253 / 255, 255 / 255)
  });

  page.drawRectangle({
    x,
    y: y - 16,
    width,
    height: 16,
    color: rgb(13 / 255, 148 / 255, 136 / 255)
  });

  page.drawText(`LOCATION ${lNum}`, {
    x: x + pad,
    y: y - 12,
    size: 8,
    font: page.docBoldFont,
    color: rgb(1, 1, 1)
  });

  const row1Y = y - 33;
  addStandaloneField(form, page, `loc${lNum}_where`, 'Where:', x + pad, row1Y, 160, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `loc${lNum}_hotel`, 'Hotel / B&B (if applicable):', x + pad + 170, row1Y, 160, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `loc${lNum}_checkIn`, 'Check-In Date:', x + pad + 340, row1Y, 95, 14, { fontSize: 7.5 });
  addStandaloneField(form, page, `loc${lNum}_checkOut`, 'Check-Out Date:', x + pad + 445, row1Y, 95, 14, { fontSize: 7.5 });

  page.drawText('GUEST INFO', {
    x: x + pad,
    y: y - 41,
    size: 7.2,
    font: page.docBoldFont,
    color: rgb(13 / 255, 148 / 255, 136 / 255)
  });

  const colW = [60, 155, 155, 160];
  const colX = [
    x + pad,
    x + pad + colW[0] + 5,
    x + pad + colW[0] + colW[1] + 10,
    x + pad + colW[0] + colW[1] + colW[2] + 15
  ];

  for (let g = 1; g <= 3; g++) {
    const gY = y - 43 - (g * 11.5);
    page.drawText(`Guest ${g}`, { x: colX[0], y: gY + 2.5, size: 6.8, font: page.docBoldFont, color: COLOR_TEXT_DARK });
    addStandaloneField(form, page, `loc${lNum}_guest${g}_firstName`, '', colX[1], gY, colW[1], 10.5, { fontSize: 7 });
    addStandaloneField(form, page, `loc${lNum}_guest${g}_surname`, '', colX[2], gY, colW[2], 10.5, { fontSize: 7 });
    addStandaloneField(form, page, `loc${lNum}_guest${g}_id`, '', colX[3], gY, colW[3], 10.5, { fontSize: 7 });
  }

  return blockH;
}

async function generateTravelBooking(cbBytes, caBytes) {
  const doc = await PDFDocument.create();
  const form = doc.getForm();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cbLogoImg = await doc.embedPng(cbBytes);
  const caLogoImg = await doc.embedPng(caBytes);

  const TOTAL_PAGES = 3;

  // -------------------------------------------------------------------------
  // PAGE 1: Header + Top Details + AIR TRAVEL + Flight 1 & Flight 2
  // -------------------------------------------------------------------------
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    drawHeader(page, cbLogoImg, caLogoImg, 'TRAVEL BOOKING FORM', 'Carte Blanche & Combined Artists  •  Travel & Logistics Request');

    const layout = new FlowLayout(page, form, 726);

    // Top Details
    const halfW = (CONTENT_W - 12) / 2;
    layout.addFieldRow([
      { id: 'commissionNumber', label: 'Commission Number:', width: halfW },
      { id: 'storyName', label: 'Story Name:', width: halfW, gap: 0 }
    ], 17);

    layout.addFieldRow([
      { id: 'nameAndSurname', label: 'Name & Surname:', width: halfW },
      { id: 'email', label: 'Email:', width: halfW, gap: 0 }
    ], 17);

    layout.addDivider(0.5);

    // AIR TRAVEL Heading
    layout.addHeading('AIR TRAVEL');
    layout.addFieldRow([
      { id: 'airTravelRequired', label: 'Air Travel Required: Yes / No', width: halfW },
      { id: 'singleOrReturn', label: 'Single or Return: Single / Return', width: halfW, gap: 0 }
    ], 17);

    layout.addSpace(4);

    // FLIGHT 1
    const f1H = drawFlightBlock(form, page, 1, MARGIN_X, layout.y, CONTENT_W);
    layout.y -= (f1H + 12);

    // FLIGHT 2
    drawFlightBlock(form, page, 2, MARGIN_X, layout.y, CONTENT_W);

    drawFooter(page, 'Form Ref: CB-TRF-2026', `Page 1 of ${TOTAL_PAGES}`);

    // Backward compatibility aliases on page 1
    try {
      const aliasTraveler = form.createTextField('travelerName');
      aliasTraveler.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
      const aliasId = form.createTextField('idNumber');
      aliasId.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
      const aliasPhone = form.createTextField('phone');
      aliasPhone.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // PAGE 2: Running Header + FLIGHT 3, FLIGHT 4, FLIGHT 5
  // -------------------------------------------------------------------------
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    const headY = 808;
    page.drawText('CARTE BLANCHE  •  TRAVEL BOOKING FORM (FLIGHTS)', {
      x: MARGIN_X,
      y: headY,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY
    });

    const pageStr = `Page 2 of ${TOTAL_PAGES}`;
    const pageStrW = fontBold.widthOfTextAtSize(pageStr, 8.5);
    page.drawText(pageStr, {
      x: RIGHT_X - pageStrW,
      y: headY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT_MUTED
    });

    addStandaloneField(form, page, 'storyName_p2', 'Story Name:', MARGIN_X, headY - 26, CONTENT_W - 160, 16, { fontSize: 8.5 });
    addStandaloneField(form, page, 'commNum_p2', 'Commission Number:', RIGHT_X - 150, headY - 26, 150, 16, { fontSize: 8.5 });

    page.drawLine({
      start: { x: MARGIN_X, y: headY - 34 },
      end: { x: RIGHT_X, y: headY - 34 },
      thickness: 1,
      color: COLOR_PRIMARY
    });

    let curY = headY - 44;

    // FLIGHT 3
    const f3H = drawFlightBlock(form, page, 3, MARGIN_X, curY, CONTENT_W);
    curY -= (f3H + 12);

    // FLIGHT 4
    const f4H = drawFlightBlock(form, page, 4, MARGIN_X, curY, CONTENT_W);
    curY -= (f4H + 12);

    // FLIGHT 5
    drawFlightBlock(form, page, 5, MARGIN_X, curY, CONTENT_W);

    drawFooter(page, 'Form Ref: CB-TRF-2026', `Page 2 of ${TOTAL_PAGES}`);
  }

  // -------------------------------------------------------------------------
  // PAGE 3: CAR RENTAL + ACCOMMODATION + Special Requirements + Tick Boxes
  // -------------------------------------------------------------------------
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.docRegularFont = fontRegular;
    page.docBoldFont = fontBold;
    page.docItalicFont = fontItalic;

    const headY = 808;
    page.drawText('CARTE BLANCHE  •  TRAVEL BOOKING FORM (CAR RENTAL & ACCOMMODATION)', {
      x: MARGIN_X,
      y: headY,
      size: 9.5,
      font: fontBold,
      color: COLOR_PRIMARY
    });

    const pageStr = `Page 3 of ${TOTAL_PAGES}`;
    const pageStrW = fontBold.widthOfTextAtSize(pageStr, 8.5);
    page.drawText(pageStr, {
      x: RIGHT_X - pageStrW,
      y: headY,
      size: 8.5,
      font: fontBold,
      color: COLOR_TEXT_MUTED
    });

    addStandaloneField(form, page, 'storyName_p3', 'Story Name:', MARGIN_X, headY - 26, CONTENT_W - 160, 16, { fontSize: 8.5 });
    addStandaloneField(form, page, 'commNum_p3', 'Commission Number:', RIGHT_X - 150, headY - 26, 150, 16, { fontSize: 8.5 });

    page.drawLine({
      start: { x: MARGIN_X, y: headY - 34 },
      end: { x: RIGHT_X, y: headY - 34 },
      thickness: 1,
      color: COLOR_PRIMARY
    });

    let curY = headY - 44;

    // CAR RENTAL HEADING
    page.drawText('CAR RENTAL', { x: MARGIN_X, y: curY, size: 9, font: fontBold, color: COLOR_PRIMARY });
    addStandaloneField(form, page, 'carRentalRequired', 'Car Rental Required: Yes / No', RIGHT_X - 180, curY - 14, 180, 14, { fontSize: 8 });
    curY -= 20;

    // CAR RENTAL 1 & 2
    const cr1H = drawCarRentalBlock(form, page, 1, MARGIN_X, curY, CONTENT_W);
    curY -= (cr1H + 6);

    const cr2H = drawCarRentalBlock(form, page, 2, MARGIN_X, curY, CONTENT_W);
    curY -= (cr2H + 12);

    // ACCOMMODATION HEADING
    page.drawText('ACCOMMODATION', { x: MARGIN_X, y: curY, size: 9, font: fontBold, color: COLOR_PRIMARY });
    addStandaloneField(form, page, 'accommodationRequired', 'Accommodation Required: Yes / No', RIGHT_X - 180, curY - 14, 180, 14, { fontSize: 8 });
    curY -= 20;

    // LOCATION 1, 2, 3
    const loc1H = drawLocationBlock(form, page, 1, MARGIN_X, curY, CONTENT_W);
    curY -= (loc1H + 6);

    const loc2H = drawLocationBlock(form, page, 2, MARGIN_X, curY, CONTENT_W);
    curY -= (loc2H + 6);

    const loc3H = drawLocationBlock(form, page, 3, MARGIN_X, curY, CONTENT_W);
    curY -= (loc3H + 10);

    // Special Requirements
    page.drawText('Special Requirements', { x: MARGIN_X, y: curY, size: 8, font: fontBold, color: COLOR_PRIMARY });
    page.drawText('(Example: SUV for crew & gear)', { x: MARGIN_X + 110, y: curY, size: 7.2, font: fontItalic, color: COLOR_TEXT_MUTED });
    curY -= 6;
    addStandaloneField(form, page, 'specialRequirements', '', MARGIN_X, curY - 32, CONTENT_W, 32, { multiline: true, fontSize: 8 });
    curY -= 42;

    // Checkboxes
    try {
      const cb1 = form.createCheckBox('confirmCorrect');
      cb1.addToPage(page, { x: MARGIN_X, y: curY - 10, width: 10, height: 10 });
      page.drawText('I hereby confirm that the above information is correct.', {
        x: MARGIN_X + 16,
        y: curY - 8,
        size: 7.5,
        font: fontBold,
        color: COLOR_TEXT_DARK
      });

      const cb2 = form.createCheckBox('agreeInformManagement');
      cb2.addToPage(page, { x: MARGIN_X, y: curY - 24, width: 10, height: 10 });
      page.drawText('I agree to inform management of any changes as soon as possible.', {
        x: MARGIN_X + 16,
        y: curY - 22,
        size: 7.5,
        font: fontBold,
        color: COLOR_TEXT_DARK
      });
    } catch (e) {}

    drawFooter(page, 'Form Ref: CB-TRF-2026', `Page 3 of ${TOTAL_PAGES}`);

    // Alias for additionalNotes
    try {
      const aliasNotes = form.createTextField('additionalNotes');
      aliasNotes.addToPage(page, { x: 0, y: 0, width: 0, height: 0 });
    } catch (e) {}
  }

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  return await doc.save();
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

  console.log('7. Generating Travel Booking Form 2026...');
  const tbBytes = await generateTravelBooking(cbBytes, caBytes);
  fs.writeFileSync(path.join(outDir, 'Carte_Blanche_Travel_Booking_Form_2026.pdf'), tbBytes);

  console.log('All 7 fillable PDFs successfully generated!');
}

main().catch(err => {
  console.error('Fatal error during PDF generation:', err);
  process.exit(1);
});
