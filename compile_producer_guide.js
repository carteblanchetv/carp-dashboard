
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const artifactDir = "/Users/liz/.gemini/antigravity/brain/332cf3cc-604b-47e8-b131-cbf28952d7ea";
const projectDir = "/Users/liz/.gemini/antigravity/scratch/carp-dashboard";

function getBase64Image(filename) {
  const filePath = path.join(artifactDir, filename);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString("base64")}`;
  }
  return "";
}

const img1 = getBase64Image("1_forms_hub_overview.png");
const img2 = getBase64Image("2_share_modal_clean.png");
const img3 = getBase64Image("3_in_person_dual_signing.png");
const img4 = getBase64Image("4_countersign_review.png");

const htmlContent = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<title>Carte Blanche - A Beginner's Guide to Signing Forms & Releases</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 14mm 10mm 14mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.44;
    font-size: 8.7pt;
    margin: 0;
    padding: 0;
  }

  .page {
    height: 277mm;
    max-height: 277mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child {
    page-break-after: avoid;
    break-after: avoid;
  }

  /* Document & Page Headers */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .brand-badge {
    background: linear-gradient(135deg, #09101d 0%, #1e293b 100%);
    color: #ffffff;
    padding: 5px 14px;
    border-radius: 5px;
    font-weight: 800;
    font-size: 11pt;
    letter-spacing: 1.2px;
  }
  .doc-meta {
    text-align: right;
    font-size: 8pt;
    color: #64748b;
    line-height: 1.35;
  }
  .doc-meta strong {
    color: #0f172a;
    font-size: 8.5pt;
  }

  /* Typography */
  h1 {
    font-size: 14pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 4px 0;
    letter-spacing: -0.3px;
    line-height: 1.25;
  }
  h2 {
    font-size: 11pt;
    font-weight: 750;
    color: #0f172a;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 3px;
    margin: 8px 0 6px 0;
    line-height: 1.3;
  }
  .section-title-top {
    margin-top: 0 !important;
  }

  h3 {
    font-size: 9.6pt;
    font-weight: 700;
    color: #0369a1;
    margin: 8px 0 3px 0;
    display: flex;
    align-items: center;
    line-height: 1.3;
  }

  p {
    margin: 0 0 6px 0;
    line-height: 1.44;
  }
  .lead {
    font-size: 9pt;
    color: #334155;
    margin-bottom: 7px;
    line-height: 1.44;
  }

  ul, ol {
    margin: 0 0 7px 0;
    padding-left: 18px;
  }
  li {
    margin-bottom: 3px;
    line-height: 1.42;
  }

  /* Callouts & summary */
  .callout-rule {
    background: #f0f9ff;
    border-left: 4.5px solid #008fbe;
    padding: 7px 12px;
    border-radius: 0 5px 5px 0;
    margin: 6px 0 8px 0;
  }
  .callout-rule h3 {
    margin: 0 0 2px 0;
    color: #0369a1;
    font-size: 9.2pt;
  }
  .callout-rule p {
    margin: 0;
    font-size: 8.5pt;
    color: #0c4a6e;
    line-height: 1.38;
  }

  .summary-table {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 8px 0;
    font-size: 8.1pt;
  }
  .summary-table th {
    background: #0f172a;
    color: #ffffff;
    text-align: left;
    padding: 5px 8px;
    font-weight: 700;
    font-size: 7.9pt;
    letter-spacing: 0.2px;
  }
  .summary-table td {
    padding: 5px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    line-height: 1.32;
  }
  .summary-table tr:nth-child(even) td {
    background: #f8fafc;
  }

  .quick-picker {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 3px 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 6px 12px;
    margin: 5px 0 6px 0;
    font-size: 8.1pt;
  }
  .quick-picker-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #334155;
    line-height: 1.32;
  }
  .quick-picker-item strong {
    color: #0f172a;
  }

  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #008fbe;
    color: white;
    font-weight: 800;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 8pt;
    margin-right: 6px;
    flex-shrink: 0;
  }

  .badge-tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 7.4pt;
    font-weight: 700;
    background: #e0f2fe;
    color: #0369a1;
    margin-right: 3px;
  }

  /* UNIFIED SCREENSHOT CARD STYLING */
  .screengrab-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 20px;
    text-align: center;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
  }
  .screengrab-card img {
    display: block;
    margin: 0 auto;
    object-fit: contain;
    border-radius: 8px;
    background: transparent;
  }
  .screengrab-caption {
    font-size: 8pt;
    color: #0369a1;
    font-style: italic;
    margin: 8px auto 0 auto;
    line-height: 1.38;
    text-align: center;
    background: #e0f2fe;
    border: 1px solid #bae6fd;
    border-radius: 6px;
    padding: 6px 16px;
    display: inline-block;
    max-width: 95%;
  }

  /* Figure 1 Card */
  .fig1-card {
    margin-top: 10px;
  }
  .fig1-card img {
    width: 100%;
    max-height: 62mm;
    border: 2px solid #008fbe;
    box-shadow: 0 4px 14px rgba(0, 143, 190, 0.16);
  }

  /* Figure 2 Card: Clean breathing room, transparent PNG without borders/corners */
  .fig2-card {
    margin-top: 18px;
  }
  .fig2-card img {
    max-width: 440px;
    width: 100%;
    max-height: 74mm;
    border: none;
    box-shadow: none;
  }

  /* Figure 3 Card */
  .fig3-card {
    margin-top: 8px;
    margin-bottom: 8px;
    padding: 12px 16px;
  }
  .fig3-card img {
    width: 100%;
    max-height: 44mm;
    border: 1px solid #cbd5e1;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
  }

  /* Figure 4 Card */
  .fig4-card {
    margin-top: 8px;
    padding: 12px 16px;
  }
  .fig4-card img {
    width: 100%;
    max-height: 44mm;
    border: 1px solid #cbd5e1;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
  }
</style>
</head>
<body>

  <!-- ================= PAGE 1 ================= -->
  <div class="page">
    <div class="doc-header">
      <div class="brand-badge">CARTE BLANCHE</div>
      <div class="doc-meta">
        <strong>FORMS &amp; RELEASES MADE SIMPLE</strong><br>
        Producer Quickstart Guide<br>
        Portal: <code>https://cb-deliverables.web.app/</code><br>
        October 2026 &bull; UK English
      </div>
    </div>

    <h1>A Beginner's Guide to Signing Forms &amp; Releases</h1>
    <p class="lead">
      Welcome to the Carte Blanche Forms Hub! Signing legal releases might sound like dry paperwork, but we've made the whole process fast, easy, and completely paper-free. Here's everything you need to know in plain English.
    </p>

    <div class="callout-rule">
      <h3>⭐ The Golden Rule: Two Signatures Needed!</h3>
      <p style="margin-bottom: 3px;">A release form is only legally valid once <strong>both</strong> people have signed: the <strong>Contributor</strong> (interviewee or guest) and the <strong>Producer</strong> (you!).</p>
      <p><strong>To save everyone time and energy, our system only emails the final form to release@carteblanche.co.za after everyone has signed.</strong></p>
    </div>

    <h2>Which Way Should You Sign?</h2>
    <table class="summary-table">
      <thead>
        <tr>
          <th style="width: 28%;">IF YOUR SITUATION IS...</th>
          <th style="width: 32%;">USE THIS OPTION</th>
          <th style="width: 40%;">HOW IT WORKS IN PRACTICE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Contributor is not with you</strong><br><span style="color: #64748b; font-size: 7.2pt;">(or prefers using their own phone)</span></td>
          <td><span class="badge-tag">METHOD 1</span> <strong>Share a Link</strong><br>(WhatsApp, Email, QR)</td>
          <td>You send them a link &rarr; They sign on their phone &rarr; You get an email to review and countersign &rarr; Sent to Legal automatically!</td>
        </tr>
        <tr>
          <td><strong>Standing with them on shoot</strong></td>
          <td><span class="badge-tag">METHOD 2</span> <strong>Sign Together on One Device</strong></td>
          <td>Open the form on your tablet or phone &rarr; Turn on "Producer Present" &rarr; Both sign on screen &rarr; Done on the spot!</td>
        </tr>
        <tr>
          <td><strong>Out in the bush with no signal</strong></td>
          <td><span class="badge-tag">METHOD 3</span> <strong>Offline PDF Backup</strong></td>
          <td>Download a blank PDF before you leave &rarr; Sign on an iPad or print it out &rarr; Email it when you get back online.</td>
        </tr>
      </tbody>
    </table>

    <h2>Accessing the Forms Hub</h2>
    <p style="margin-bottom: 3px;">
      Go to <strong>https://cb-deliverables.web.app/</strong> (the new CARP) and click on the pink card titled <strong>Legal &amp; Production Forms</strong>.
    </p>

    <div style="font-weight: 700; color: #0f172a; font-size: 8.2pt; margin-bottom: 2px;">Quick Form Picker:</div>
    <div class="quick-picker">
      <div class="quick-picker-item">&bull; <strong>Participant Release</strong> (Interviewees)</div>
      <div class="quick-picker-item">&bull; <strong>Footage Release</strong> (Third-Party Footage)</div>
      <div class="quick-picker-item">&bull; <strong>Minor Release</strong> (Children)</div>
      <div class="quick-picker-item">&bull; <strong>Music Agreement</strong> (Non-Library Music)</div>
      <div class="quick-picker-item">&bull; <strong>Location Agreement</strong> (Venues)</div>
      <div class="quick-picker-item">&bull; <strong>Insert Sheet</strong> (Straps &amp; Titles / Credits)</div>
    </div>

    <div class="screengrab-card fig1-card">
      <img src="${img1}" alt="CARP Dashboard Overview">
      <div class="screengrab-caption">Figure 1: On the CARP Dashboard (https://cb-deliverables.web.app/), click the pink Legal &amp; Production Forms card to open the Forms Hub.</div>
    </div>
  </div>

  <!-- ================= PAGE 2 ================= -->
  <div class="page">
    <div class="doc-header">
      <div class="brand-badge">CARTE BLANCHE</div>
      <div class="doc-meta">
        <strong>METHOD 1 &bull; REMOTE LINK SHARING</strong><br>
        Page 2 of 4 &bull; Producer Walkthrough
      </div>
    </div>

    <h2 class="section-title-top">Method 1: Sending a Link to a Contributor (Most Popular)</h2>
    <p class="lead">
      Use this to easily share a form to be signed with your case study, expert or source. You can share the form as follows:
    </p>
    <ul>
      <li>WhatsApp the link</li>
      <li>Copy the link to send on platforms other than WhatsApp</li>
      <li>QR Code (for your case study to scan with their phone)</li>
      <li>Email the link</li>
    </ul>

    <h3><span class="step-num">1</span> Click "Share Online Form with Participant"</h3>
    <p>On the Forms Hub, find the agreement you need (e.g. <em>Participant Release Form</em>). Instead of opening it yourself, click the blue button marked <strong>"Share Online Form with Participant"</strong>.</p>

    <h3><span class="step-num">2</span> Enter the Shoot Details</h3>
    <p>A window pops up asking for your story details so your contributor doesn't have to guess them:</p>
    <ul>
      <li><strong>Story / Project Title:</strong> e.g. <em>Solar Farm Investigation</em></li>
      <li><strong>Commission Number:</strong> e.g. <em>2026-CB-042</em></li>
      <li><strong>Producer Name:</strong> Your name</li>
      <li><strong>Producer Email:</strong> Your email address (crucial &mdash; this is where your countersignature notice arrives!)</li>
    </ul>

    <h3><span class="step-num">3</span> Send It Across</h3>
    <p>As soon as you type those in, the system generates a tailored link:</p>
    <ul>
      <li><strong>On WhatsApp:</strong> Click the green <strong>"Share to WhatsApp"</strong> button to send the pre-filled message straight to your contributor.</li>
      <li><strong>Copy Link:</strong> Click <strong>"Copy Link"</strong> and paste it into an email, SMS, or Telegram chat.</li>
      <li><strong>QR Code:</strong> Click <strong>"Show QR Code"</strong> if you are standing with them &mdash; they can simply point their phone camera at your screen to open the form!</li>
    </ul>

    <!-- Clean, properly-padded container for Figure 2 with no dark corner artifacts -->
    <div class="screengrab-card fig2-card">
      <img src="${img2}" alt="Share Modal">
      <div class="screengrab-caption">Figure 2: The Share modal creates a pre-populated link ready to send via WhatsApp, email, or instant QR code.</div>
    </div>
  </div>

  <!-- ================= PAGE 3 ================= -->
  <div class="page">
    <div class="doc-header">
      <div class="brand-badge">CARTE BLANCHE</div>
      <div class="doc-meta">
        <strong>COUNTERSIGNATURE &amp; DUAL SIGNING</strong><br>
        Page 3 of 4 &bull; Producer Walkthrough
      </div>
    </div>

    <h3 style="margin-top: 0;"><span class="step-num">4</span> You Sign the Final Approval (Countersign)</h3>
    <p>You will receive an email from <strong>Forms Hub - Carte Blanche</strong> with subject <code>PLEASE SIGN: [Form Title] - [Comm Nr] - [Story Title]</code>. Click the <strong>"Review &amp; Countersign Agreement"</strong> button in your email to open the portal:</p>
    <ol>
      <li>Review the contributor's verified details and digital signature.</li>
      <li>Draw your signature in the Producer Countersignature box.</li>
      <li>Tap <strong>"Approve &amp; Submit to Legal"</strong>.</li>
    </ol>

    <div class="screengrab-card fig3-card">
      <img src="${img4}" alt="Countersign Review Screen">
      <div class="screengrab-caption">Figure 3: Your one-click review screen showing the contributor's verified submission and your countersignature pad.</div>
    </div>

    <h2>Method 2: Signing Together in Person (On Location)</h2>
    <p class="lead">If you're on location with your contributor and have an iPad, tablet, or phone, you can get both signatures done together in under two minutes.</p>

    <ul>
      <li><strong>Step 1:</strong> On the Forms Hub, click <strong>"Fill Online"</strong>. Fill in the shoot details.</li>
      <li><strong>Step 2:</strong> Scroll down and switch on <strong>"Producer Present? Sign Together Now"</strong>. Two separate signature boxes appear side-by-side.</li>
      <li><strong>Step 3:</strong> Hand the phone to the contributor to sign, then sign in your box, and tap <strong>"Sign &amp; Submit Agreement"</strong>.</li>
    </ul>

    <div class="screengrab-card fig4-card">
      <img src="${img3}" alt="In-Person Dual Signing">
      <div class="screengrab-caption">Figure 4: The in-person toggle unlocks side-by-side contributor and producer signature pads on a single device.</div>
    </div>
  </div>

  <!-- ================= PAGE 4 ================= -->
  <div class="page">
    <div class="doc-header">
      <div class="brand-badge">CARTE BLANCHE</div>
      <div class="doc-meta">
        <strong>OFFLINE BACKUP &amp; PRODUCER FAQ</strong><br>
        Page 4 of 4 &bull; Producer Walkthrough
      </div>
    </div>

    <h2 class="section-title-top">Method 3: The Offline Backup (When You Have No Signal)</h2>
    <p class="lead">Headed out to a remote game reserve, a boat at sea, or somewhere where your mobile phone says <em>No Service</em>? Don't stress:</p>

    <ol>
      <li><strong>Before you leave the office:</strong> Go to the Forms Hub and click <strong>"Blank PDF"</strong> under the agreement you need. This downloads a fillable PDF to your device.</li>
      <li><strong>On location:</strong> Open the PDF on an iPad or tablet and have them sign with a stylus / Apple Pencil. Or print paper copies before your trip and sign with a pen.</li>
      <li><strong>When you're back in range:</strong> Simply email the signed PDF or a clear photo of the form to <code>release@carteblanche.co.za</code>.</li>
    </ol>

    <h2>Frequently Asked Questions</h2>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-top: 6px;">
      <p style="margin-bottom: 6px;"><strong>Q: What if I lose cell reception midway through an interview?</strong><br>
      <span style="color: #475569;">A: The forms work offline once opened in Safari or Chrome! If connection drops, use the downloaded Blank PDF or sign in person as soon as signal returns.</span></p>

      <p style="margin-bottom: 6px;"><strong>Q: Can the contributor download a copy of what they signed?</strong><br>
      <span style="color: #475569;">A: Yes! Once submitted, the confirmation screen offers an instant PDF download, and a copy is emailed to their provided email address.</span></p>

      <p style="margin: 0;"><strong>Q: Can I forward my countersign email to another producer or researcher?</strong><br>
      <span style="color: #475569;">A: Yes. The review link is secured by an encrypted submission token. Any authorized team member can open the link and countersign on behalf of production.</span></p>
    </div>

    <div style="margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 7.5pt;">
      Combined Artists &bull; Carte Blanche Digital Deliverables &bull; For internal production use only
    </div>
  </div>

</body>
</html>`;

const tmpHtml = "/tmp/walkthrough_unified_final.html";
fs.writeFileSync(tmpHtml, htmlContent);

const pdfTarget = path.join(artifactDir, "Carte_Blanche_Producer_Signing_Guide.pdf");
const projectPdf = path.join(projectDir, "Carte_Blanche_Producer_Signing_Guide.pdf");

console.log("Compiling PDF with crisp vector modal, transparent background, and unified card style...");
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --print-to-pdf="${pdfTarget}" --no-pdf-header-footer "${tmpHtml}"`);

fs.copyFileSync(pdfTarget, projectPdf);
console.log("Compiled successfully!");
