import { submitLegalForm, showSubmissionSuccessModal, safeDrawField, cleanPdfText, prepareTemplatePdf, drawInFieldBox } from './form_submission_helper.js?v=5.4.0';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.4.0';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Default TX Date
    const today = new Date().toISOString().split('T')[0];
    const txInput = document.getElementById('txDate');
    if (txInput && !txInput.value) txInput.value = today;

    // 2. Pre-fill from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const commVal = urlParams.get('commNum') || urlParams.get('comm');
    if (commVal) document.getElementById('commissionNumber').value = commVal;
    if (urlParams.get('story')) document.getElementById('storyName').value = urlParams.get('story');
    if (urlParams.get('producer')) document.getElementById('producerName').value = urlParams.get('producer');

    // Share Form Handler
    document.getElementById('shareFormBtn')?.addEventListener('click', () => {
        const comm = document.getElementById('commissionNumber')?.value || '';
        const story = document.getElementById('storyName')?.value || '';
        openShareModal({
            title: 'Insert Sheet 2026',
            url: window.location.href,
            storyTitle: story,
            commNum: comm
        });
    });

    // 3. Dynamic Additional Production Credits
    let creditCounter = 0;
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    window.addCreditRow = function(role = '', name = '') {
        creditCounter++;
        const id = creditCounter;
        const container = document.getElementById('additionalCreditsList');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'credit-row-item';
        row.id = `creditRow_${id}`;
        row.innerHTML = `
            <div class="form-field">
                <label>Credit Role / Title</label>
                <input type="text" name="extra_credit_role[]" list="commonProductionRoles" placeholder="e.g. Drone Pilot, Co-Producer, Camera 2..." value="${escapeHtml(role)}">
            </div>
            <div class="form-field">
                <label>Crew Member Name</label>
                <input type="text" name="extra_credit_name[]" placeholder="Full name of crew member..." value="${escapeHtml(name)}">
            </div>
            <div>
                <button type="button" class="btn-remove-credit" onclick="document.getElementById('creditRow_${id}')?.remove()" title="Remove this credit">
                    <span>✕</span> Remove
                </button>
            </div>
        `;
        container.appendChild(row);
    };

    document.getElementById('btnAddCredit')?.addEventListener('click', () => {
        window.addCreditRow();
    });

    // Clear extra credits on reset
    document.getElementById('resetFormBtn')?.addEventListener('click', () => {
        const container = document.getElementById('additionalCreditsList');
        if (container) container.innerHTML = '';
    });

    // 4. Download & Share Completed PDF Handler
    document.getElementById('downloadCompletedPdfBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            const { pdfBlob, filename } = await buildCompletedPDF();
            const comm = document.getElementById('commissionNumber')?.value || '';
            const story = document.getElementById('storyName')?.value || '';
            await downloadAndSharePDF(pdfBlob, filename, {
                title: 'Insert Sheet 2026',
                storyTitle: story,
                commNum: comm
            });
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            alert('Error generating PDF: ' + err.message);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    });

    // 5. Submit Sheet Handler
    document.getElementById('submitFormBtn').addEventListener('click', async () => {
        const form = document.getElementById('insertSheetForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const submitBtn = document.getElementById('submitFormBtn');
        const origSubmitText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>⏳</span> Submitting & Sending Email...';
        submitBtn.disabled = true;

        try {
            const { pdfBlob, filename, metadata } = await buildCompletedPDF();

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'insert_sheet');
            formData.append('formTitle', 'Insert Sheet 2026');
            formData.append('storyName', metadata.storyName);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.producerName);
            formData.append('submitterEmail', metadata.submitterEmail);
            formData.append('dateVal', metadata.txDate);
            formData.append('presenter', metadata.presenterName);
            formData.append('dop', metadata.cameraName);
            formData.append('camAssist', metadata.researcherName);
            formData.append('editor', metadata.editorName);
            formData.append('finalMix', metadata.soundName);
            formData.append('insertDuration', metadata.duration);
            formData.append('thirdPartyFootage', metadata.music);
            formData.append('notes', metadata.notes || '');
            formData.append('extraCredits', JSON.stringify(metadata.extraCredits || []));
            formData.append('metadata', JSON.stringify({
                presenterName: metadata.presenterName,
                researcherName: metadata.researcherName,
                cameraName: metadata.cameraName,
                soundName: metadata.soundName,
                editorName: metadata.editorName,
                duration: metadata.duration,
                music: metadata.music,
                notes: metadata.notes,
                extraCredits: metadata.extraCredits
            }));

            const response = await submitLegalForm(formData);

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Server rejected submission.');
            }

            showSubmissionSuccessModal({
                title: 'Insert Sheet 2026',
                recipients: result.recipients || [metadata.submitterEmail],
                pdfBlob,
                filename
            });

        } catch (err) {
            console.error('Submission failed:', err);
            alert('Submission failed: ' + err.message);
        } finally {
            submitBtn.innerHTML = origSubmitText;
            submitBtn.disabled = false;
        }
    });
});

async function buildCompletedPDF() {
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    const commNum = document.getElementById('commissionNumber').value.trim();
    const txDate = document.getElementById('txDate').value;
    const storyName = document.getElementById('storyName').value.trim();
    const producerName = document.getElementById('producerName').value.trim();
    const submitterEmail = document.getElementById('submitterEmail').value.trim();
    const presenterName = document.getElementById('presenterName').value.trim();
    const cameraName = document.getElementById('cameraName').value.trim();
    const researcherName = document.getElementById('researcherName').value.trim();
    const soundName = document.getElementById('soundName').value.trim();
    const editorName = document.getElementById('editorName').value.trim();
    const duration = document.getElementById('storyDuration').value.trim();
    const music = document.getElementById('musicDetails').value.trim();
    const notes = (document.getElementById('notes')?.value || '').trim();

    // Collect dynamic extra credits
    const extraCredits = [];
    const roleInputs = document.querySelectorAll('input[name="extra_credit_role[]"]');
    const nameInputs = document.querySelectorAll('input[name="extra_credit_name[]"]');
    for (let i = 0; i < roleInputs.length; i++) {
        const role = (roleInputs[i]?.value || '').trim();
        const name = (nameInputs[i]?.value || '').trim();
        if (role || name) {
            extraCredits.push({ role, name });
        }
    }

    const formatDate = (val) => {
        if (!val) return '';
        const [y, m, d] = val.split('-');
        return `${d}/${m}/${y}`;
    };

    const formattedTxDate = formatDate(txDate);

    const templateUrl = 'templates/Carte_Blanche_Insert_Sheet_2026.pdf';
    const templateBytes = await fetch(templateUrl).then(res => {
        if (!res.ok) throw new Error('Could not load PDF template file.');
        return res.arrayBuffer();
    });

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fieldMap = prepareTemplatePdf(pdfDoc);
    const page1 = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 9.5;
    const textColor = rgb(0.06, 0.09, 0.16);

    const drawBoxOnPage1 = (fieldName, text, isBold = false) => {
        drawInFieldBox(page1, fieldMap, fieldName, text, {
            size: fontSize,
            font: isBold ? fontBold : font,
            color: textColor
        });
    };

    drawBoxOnPage1('commissionNumber', commNum, true);
    drawBoxOnPage1('storyTitle', storyName, true);
    drawBoxOnPage1('producer', producerName);
    drawBoxOnPage1('presenter', presenterName);
    drawBoxOnPage1('dop', cameraName);
    drawBoxOnPage1('camAssist', researcherName);
    drawBoxOnPage1('editor', editorName);
    drawBoxOnPage1('finalMix', soundName);
    drawBoxOnPage1('deliveryDate', formattedTxDate);
    drawBoxOnPage1('insertDuration', duration);
    drawBoxOnPage1('thirdPartyFootage', music);

    // If Additional Production Credits or General Notes exist, insert supplementary page(s) right after Page 1
    if (extraCredits.length > 0 || notes) {
        let insertIndex = 1;
        let suppPage = pdfDoc.insertPage(insertIndex, [595.28, 841.89]);

        const drawSuppHeader = (pg) => {
            // Indigo top accent bar
            pg.drawRectangle({
                x: 40,
                y: 805,
                width: 515,
                height: 4,
                color: rgb(0.39, 0.40, 0.95)
            });

            // Title
            safeDrawField(pg, 'CARTE BLANCHE - INSERT SHEET 2026', 40, 782, {
                size: 15,
                font: fontBold,
                color: rgb(0.08, 0.12, 0.22)
            });
            safeDrawField(pg, 'ADDITIONAL PRODUCTION CREDITS & NOTES (SUPPLEMENTARY)', 40, 766, {
                size: 9.5,
                font: fontBold,
                color: rgb(0.39, 0.40, 0.95)
            });

            // Meta summary box
            pg.drawRectangle({
                x: 40,
                y: 718,
                width: 515,
                height: 36,
                color: rgb(0.96, 0.97, 0.99),
                borderColor: rgb(0.85, 0.88, 0.92),
                borderWidth: 1
            });

            safeDrawField(pg, `COMMISSION: ${commNum || 'N/A'}`, 52, 737, { size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
            safeDrawField(pg, `TX DATE: ${formattedTxDate || 'N/A'}`, 230, 737, { size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
            safeDrawField(pg, `PRODUCER: ${producerName || 'N/A'}`, 380, 737, { size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.35) });

            const truncatedStory = storyName.length > 65 ? storyName.substring(0, 62) + '...' : storyName;
            safeDrawField(pg, `STORY TITLE: ${truncatedStory || 'N/A'}`, 52, 724, { size: 8.5, font: fontBold, color: rgb(0.08, 0.12, 0.22) });

            // Bottom footer
            safeDrawField(pg, 'Carte Blanche Insert Sheet 2026 | Combined Artists | Automated CARP Deliverables', 40, 30, {
                size: 7.5,
                font: font,
                color: rgb(0.55, 0.60, 0.68)
            });
            const timestampStr = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            safeDrawField(pg, `Generated: ${timestampStr}`, 430, 30, {
                size: 7.5,
                font: font,
                color: rgb(0.55, 0.60, 0.68)
            });
        };

        drawSuppHeader(suppPage);
        let curY = 700;

        // Render Extra Credits Table
        if (extraCredits.length > 0) {
            safeDrawField(suppPage, 'ADDITIONAL PRODUCTION CREDITS', 40, curY, {
                size: 11,
                font: fontBold,
                color: rgb(0.08, 0.12, 0.22)
            });
            curY -= 18;

            // Table Header
            suppPage.drawRectangle({
                x: 40,
                y: curY - 4,
                width: 515,
                height: 22,
                color: rgb(0.92, 0.94, 0.98),
                borderColor: rgb(0.82, 0.86, 0.92),
                borderWidth: 1
            });
            safeDrawField(suppPage, 'ROLE / PRODUCTION TITLE', 52, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
            safeDrawField(suppPage, 'CREW MEMBER NAME', 250, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
            curY -= 22;

            for (let i = 0; i < extraCredits.length; i++) {
                if (curY < 80) {
                    insertIndex++;
                    suppPage = pdfDoc.insertPage(insertIndex, [595.28, 841.89]);
                    drawSuppHeader(suppPage);
                    curY = 700;
                }

                const credit = extraCredits[i];
                const isOdd = i % 2 === 1;

                suppPage.drawRectangle({
                    x: 40,
                    y: curY - 4,
                    width: 515,
                    height: 22,
                    color: isOdd ? rgb(0.97, 0.98, 1.0) : rgb(1, 1, 1),
                    borderColor: rgb(0.88, 0.90, 0.94),
                    borderWidth: 0.5
                });

                safeDrawField(suppPage, credit.role || '-', 52, curY + 2, { size: 9, font: fontBold, color: rgb(0.15, 0.20, 0.30) });
                safeDrawField(suppPage, credit.name || '-', 250, curY + 2, { size: 9.5, font: font, color: rgb(0.06, 0.09, 0.16) });

                curY -= 22;
            }

            curY -= 15;
        }

        // Render General Notes & Instructions
        if (notes) {
            if (curY < 140) {
                insertIndex++;
                suppPage = pdfDoc.insertPage(insertIndex, [595.28, 841.89]);
                drawSuppHeader(suppPage);
                curY = 700;
            }

            safeDrawField(suppPage, 'GENERAL NOTES & LOWER THIRD INSTRUCTIONS', 40, curY, {
                size: 11,
                font: fontBold,
                color: rgb(0.08, 0.12, 0.22)
            });
            curY -= 14;

            // Simple text wrapping helper
            const wrapText = (text, maxChars = 85) => {
                const lines = [];
                const rawParagraphs = text.split('\n');
                for (const para of rawParagraphs) {
                    if (!para.trim()) {
                        lines.push('');
                        continue;
                    }
                    const words = para.split(/\s+/);
                    let currentLine = '';
                    for (const word of words) {
                        if (!currentLine) {
                            currentLine = word;
                        } else if ((currentLine + ' ' + word).length <= maxChars) {
                            currentLine += ' ' + word;
                        } else {
                            lines.push(currentLine);
                            currentLine = word;
                        }
                    }
                    if (currentLine) lines.push(currentLine);
                }
                return lines;
            };

            const noteLines = wrapText(notes, 85);
            const boxPadding = 10;
            const lineHeight = 14;
            const boxHeight = Math.max(36, (noteLines.length * lineHeight) + (boxPadding * 2));

            suppPage.drawRectangle({
                x: 40,
                y: curY - boxHeight,
                width: 515,
                height: boxHeight,
                color: rgb(0.98, 0.99, 1.0),
                borderColor: rgb(0.85, 0.88, 0.92),
                borderWidth: 1
            });

            let textY = curY - boxPadding - 10;
            for (const line of noteLines) {
                if (textY < 60) {
                    insertIndex++;
                    suppPage = pdfDoc.insertPage(insertIndex, [595.28, 841.89]);
                    drawSuppHeader(suppPage);
                    textY = 680;
                }
                safeDrawField(suppPage, line, 52, textY, { size: 9, font: font, color: rgb(0.15, 0.20, 0.28) });
                textY -= lineHeight;
            }
        }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const cleanStory = (storyName || 'Carte_Blanche').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Insert_Sheet_${cleanStory}_2026.pdf`;

    return {
        pdfBlob,
        filename,
        metadata: {
            commNum,
            txDate: formattedTxDate,
            storyName,
            producerName,
            submitterEmail,
            presenterName,
            researcherName,
            cameraName,
            soundName,
            editorName,
            duration,
            music,
            notes,
            extraCredits
        }
    };
}

