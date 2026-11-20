import { submitLegalForm, getAgreementForCoSign, renderCoSignBanner, showSubmissionSuccessModal, safeDrawField, cleanPdfText, prepareTemplatePdf, drawInFieldBox, normalizeDateForInput, getActiveProducerEmail } from './form_submission_helper.js?v=5.4.4';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.4.4';

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // 1. Timecode Formatter (<HH:MM:SS> automatically adding colons as user types)
    // -------------------------------------------------------------------------
    function formatTimecode(value) {
        if (!value) return '';
        const digits = value.replace(/\D/g, '').slice(0, 6);
        if (digits.length <= 2) {
            return digits;
        } else if (digits.length <= 4) {
            return digits.slice(0, 2) + ':' + digits.slice(2);
        } else {
            return digits.slice(0, 2) + ':' + digits.slice(2, 4) + ':' + digits.slice(4);
        }
    }

    function attachTimecodeMask(input) {
        if (!input) return;
        input.addEventListener('input', () => {
            input.value = formatTimecode(input.value);
        });
    }

    const durationInput = document.getElementById('storyDuration');
    if (durationInput) {
        attachTimecodeMask(durationInput);
    }

    // -------------------------------------------------------------------------
    // 2. Default Dates & URL Parameter Pre-fills
    // -------------------------------------------------------------------------
    const today = new Date().toISOString().split('T')[0];
    const txInput = document.getElementById('txDate');
    if (txInput && !txInput.value) txInput.value = today;

    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    const isEditMode = urlParams.get('mode') === 'edit';
    let loadedSubmission = null;

    const commVal = urlParams.get('commNum') || urlParams.get('comm');
    if (commVal) document.getElementById('commissionNumber').value = commVal;
    if (urlParams.get('story')) document.getElementById('storyName').value = urlParams.get('story');
    if (urlParams.get('producer')) document.getElementById('producerName').value = urlParams.get('producer');
    if (urlParams.get('presenter') && document.getElementById('presenterName')) {
        document.getElementById('presenterName').value = urlParams.get('presenter');
    }

    // Auto-detect logged-in user profile if producer field is empty
    const producerInput = document.getElementById('producerName');
    if (producerInput && !producerInput.value) {
        try {
            if (window.auth && typeof window.auth.getMasqueradeTarget === 'function') {
                const masq = window.auth.getMasqueradeTarget();
                if (masq && (masq.viewMode || 'user') === 'user' && masq.name) {
                    producerInput.value = masq.name;
                }
            }
            if (!producerInput.value && window.auth && typeof window.auth.getCurrentUser === 'function') {
                const cur = window.auth.getCurrentUser();
                if (cur) producerInput.value = cur.displayName || cur.email || '';
            }
        } catch (e) {}
    }

    // -------------------------------------------------------------------------
    // 3. Dynamic Screen Credits Blocks (Initial 4 + Add More)
    // -------------------------------------------------------------------------
    const screenCreditsContainer = document.getElementById('creditRowsContainer');
    const creditCounterDisplay = document.getElementById('creditCounterDisplay');
    let screenCreditCount = 0;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function createScreenCreditBlock(tcIn = '', name = '', title = '') {
        screenCreditCount++;
        const card = document.createElement('div');
        card.className = 'credit-block-card';
        card.dataset.index = screenCreditCount;

        card.innerHTML = `
            <div class="credit-block-header">
                <span class="credit-badge">
                    <span>🏷️</span> <span class="badge-label">CREDIT #${String(screenCreditCount).padStart(2, '0')}</span>
                </span>
                <button type="button" class="btn-remove-credit" title="Remove Credit Block">
                    <span>✕</span> Remove
                </button>
            </div>
            <div class="credit-grid">
                <div class="form-field">
                    <label>TC In:</label>
                    <input type="text" class="input-tc-in" placeholder="HH:MM:SS" maxlength="8" value="${escapeHtml(tcIn)}">
                </div>
                <div class="form-field">
                    <label>On-Screen Name/Photo Credit:</label>
                    <input type="text" class="input-credit-name" placeholder="e.g. Dr. Brian Ndlovu" value="${escapeHtml(name)}">
                </div>
                <div class="form-field">
                    <label>Case Study/Expert Title:</label>
                    <input type="text" class="input-credit-title" placeholder="e.g. Renewable Energy Analyst - CSIR" value="${escapeHtml(title)}">
                </div>
            </div>
        `;

        const tcInInput = card.querySelector('.input-tc-in');
        attachTimecodeMask(tcInInput);

        card.querySelector('.btn-remove-credit').addEventListener('click', () => {
            if (screenCreditsContainer.querySelectorAll('.credit-block-card').length <= 1) {
                alert('An Insert Sheet requires at least one credit entry.');
                return;
            }
            card.remove();
            renumberScreenCredits();
        });

        return card;
    }

    function renumberScreenCredits() {
        if (!screenCreditsContainer) return;
        const cards = screenCreditsContainer.querySelectorAll('.credit-block-card');
        cards.forEach((card, idx) => {
            const num = idx + 1;
            card.dataset.index = num;
            const badge = card.querySelector('.badge-label');
            if (badge) badge.textContent = `CREDIT #${String(num).padStart(2, '0')}`;
        });
        screenCreditCount = cards.length;
        if (creditCounterDisplay) {
            creditCounterDisplay.textContent = `${screenCreditCount} Credit${screenCreditCount === 1 ? '' : 's'}`;
        }
    }

    // Add initial 4 credit blocks
    if (screenCreditsContainer) {
        screenCreditsContainer.innerHTML = '';
        screenCreditsContainer.appendChild(createScreenCreditBlock());
        screenCreditsContainer.appendChild(createScreenCreditBlock());
        screenCreditsContainer.appendChild(createScreenCreditBlock());
        screenCreditsContainer.appendChild(createScreenCreditBlock());
        renumberScreenCredits();
    }

    // Add More Credit Button
    document.getElementById('btnAddCreditRow')?.addEventListener('click', () => {
        if (!screenCreditsContainer) return;
        const card = createScreenCreditBlock();
        screenCreditsContainer.appendChild(card);
        renumberScreenCredits();
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        card.querySelector('.input-tc-in')?.focus();
    });

    // -------------------------------------------------------------------------
    // 4. Load Existing Submission (if ?id=...)
    // -------------------------------------------------------------------------
    if (submissionId) {
        (async () => {
            try {
                loadedSubmission = await getAgreementForCoSign(submissionId);
                let parsedMeta = {};
                if (loadedSubmission.metadata) {
                    try {
                        parsedMeta = typeof loadedSubmission.metadata === 'string'
                            ? JSON.parse(loadedSubmission.metadata)
                            : loadedSubmission.metadata;
                    } catch (e) {}
                }
                if (loadedSubmission.commissionNumber) document.getElementById('commissionNumber').value = loadedSubmission.commissionNumber;
                if (loadedSubmission.storyName || loadedSubmission.storyTitle) document.getElementById('storyName').value = loadedSubmission.storyName || loadedSubmission.storyTitle;
                if (loadedSubmission.producerName) document.getElementById('producerName').value = loadedSubmission.producerName;
                const normTx = normalizeDateForInput(loadedSubmission.dateVal || loadedSubmission.txDate || loadedSubmission.deliveryDate || parsedMeta.txDate);
                if (normTx && txInput) txInput.value = normTx;
                if (loadedSubmission.presenter || parsedMeta.presenterName) document.getElementById('presenterName').value = loadedSubmission.presenter || parsedMeta.presenterName;
                if (loadedSubmission.dop || parsedMeta.cameraName) document.getElementById('cameraName').value = loadedSubmission.dop || parsedMeta.cameraName;
                if (loadedSubmission.camAssist || parsedMeta.researcherName) document.getElementById('researcherName').value = loadedSubmission.camAssist || parsedMeta.researcherName;
                if (loadedSubmission.editor || parsedMeta.editorName) document.getElementById('editorName').value = loadedSubmission.editor || parsedMeta.editorName;
                if (loadedSubmission.finalMix || parsedMeta.soundName) document.getElementById('soundName').value = loadedSubmission.finalMix || parsedMeta.soundName;
                if (loadedSubmission.insertDuration || parsedMeta.duration) document.getElementById('storyDuration').value = loadedSubmission.insertDuration || parsedMeta.duration;
                if (loadedSubmission.thirdPartyFootage && document.getElementById('thirdPartyFootage')) {
                    document.getElementById('thirdPartyFootage').value = loadedSubmission.thirdPartyFootage;
                }
                if ((loadedSubmission.notes || parsedMeta.notes) && document.getElementById('notes')) {
                    document.getElementById('notes').value = loadedSubmission.notes || parsedMeta.notes;
                }
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && !emailEl.value) {
                    emailEl.value = getActiveProducerEmail(loadedSubmission.submittedByEmail || loadedSubmission.producerEmail) || '';
                }

                // Populate Screen Credits
                let savedCredits = loadedSubmission.credits || parsedMeta.credits;
                if (typeof savedCredits === 'string') {
                    try { savedCredits = JSON.parse(savedCredits); } catch (e) { savedCredits = null; }
                }
                if (Array.isArray(savedCredits) && savedCredits.length > 0 && screenCreditsContainer) {
                    screenCreditsContainer.innerHTML = '';
                    screenCreditCount = 0;
                    savedCredits.forEach(c => {
                        const tc = c.tcIn || c.tc || '';
                        const n = c.name || c.creditName || '';
                        const t = c.title || c.creditTitle || '';
                        screenCreditsContainer.appendChild(createScreenCreditBlock(tc, n, t));
                    });
                    renumberScreenCredits();
                }

                // Populate Additional Production Credits
                const extra = parsedMeta.extraCredits || loadedSubmission.extraCredits;
                if (Array.isArray(extra) && window.addCreditRow) {
                    extra.forEach(c => window.addCreditRow(c.role || '', c.name || ''));
                }

                if (isEditMode) {
                    const container = document.querySelector('.form-card-container') || document.querySelector('.form-container') || document.querySelector('form');
                    renderCoSignBanner(container, {
                        title: '✏️ Edit Mode — Updating Existing Insert Sheet',
                        subtitle: 'Modify any fields below and click Save & Update Insert Sheet.',
                        status: 'info'
                    });
                    const submitBtn = document.getElementById('submitFormBtn');
                    if (submitBtn) submitBtn.innerHTML = '<span>💾</span> Save & Update Insert Sheet';
                }
            } catch (err) {
                console.error('Failed to load Insert Sheet:', err);
            }
        })();
    }

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

    // -------------------------------------------------------------------------
    // 5. Dynamic Additional Production Credits (Supplementary Crew)
    // -------------------------------------------------------------------------
    let additionalCreditCounter = 0;
    window.addCreditRow = function(role = '', name = '') {
        additionalCreditCounter++;
        const id = additionalCreditCounter;
        const container = document.getElementById('additionalCreditsList');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'credit-row-item';
        row.id = `additionalCreditRow_${id}`;
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
                <button type="button" class="btn-remove-credit" onclick="document.getElementById('additionalCreditRow_${id}')?.remove()" title="Remove this credit">
                    <span>✕</span> Remove
                </button>
            </div>
        `;
        container.appendChild(row);
    };

    document.getElementById('btnAddCredit')?.addEventListener('click', () => {
        window.addCreditRow();
    });

    // Reset Form Event
    document.getElementById('resetFormBtn')?.addEventListener('click', () => {
        const container = document.getElementById('additionalCreditsList');
        if (container) container.innerHTML = '';
        if (screenCreditsContainer) {
            screenCreditsContainer.innerHTML = '';
            screenCreditCount = 0;
            screenCreditsContainer.appendChild(createScreenCreditBlock());
            screenCreditsContainer.appendChild(createScreenCreditBlock());
            screenCreditsContainer.appendChild(createScreenCreditBlock());
            screenCreditsContainer.appendChild(createScreenCreditBlock());
            renumberScreenCredits();
        }
    });

    // -------------------------------------------------------------------------
    // 6. Download & Share Completed PDF Handler
    // -------------------------------------------------------------------------
    document.getElementById('downloadCompletedPdfBtn')?.addEventListener('click', async () => {
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

    // -------------------------------------------------------------------------
    // 7. Submit Sheet Handler
    // -------------------------------------------------------------------------
    document.getElementById('submitFormBtn')?.addEventListener('click', async () => {
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
            if (submissionId) formData.append('submissionId', submissionId);
            formData.append('pdf', pdfBlob, filename);
            formData.append('file', pdfBlob, filename);
            formData.append('insert_sheet_pdf', pdfBlob, filename);
            formData.append('formType', 'insert_sheet');
            formData.append('formTitle', 'Insert Sheet 2026');
            formData.append('storyName', metadata.storyName);
            formData.append('storyTitle', metadata.storyName);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('commNum', metadata.commNum);
            formData.append('producer', metadata.producerName);
            formData.append('producerName', metadata.producerName);
            formData.append('submitterEmail', metadata.submitterEmail);
            formData.append('deliveryDate', metadata.txDate);
            formData.append('dateVal', metadata.txDate);
            formData.append('presenter', metadata.presenterName);
            formData.append('dop', metadata.cameraName);
            formData.append('camAssist', metadata.researcherName);
            formData.append('cameraAssistant', metadata.researcherName);
            formData.append('editor', metadata.editorName);
            formData.append('finalMix', metadata.soundName);
            formData.append('finalMixOperator', metadata.soundName);
            formData.append('insertDuration', metadata.duration);
            formData.append('thirdPartyFootage', metadata.thirdPartyFootage);
            formData.append('notes', metadata.notes || '');
            formData.append('credits', JSON.stringify(metadata.credits || []));
            formData.append('extraCredits', JSON.stringify(metadata.extraCredits || []));
            formData.append('metadata', JSON.stringify({
                presenterName: metadata.presenterName,
                researcherName: metadata.researcherName,
                cameraName: metadata.cameraName,
                soundName: metadata.soundName,
                editorName: metadata.editorName,
                duration: metadata.duration,
                thirdPartyFootage: metadata.thirdPartyFootage,
                notes: metadata.notes,
                credits: metadata.credits,
                extraCredits: metadata.extraCredits
            }));

            const response = await submitLegalForm(formData);

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Server rejected submission.');
            }

            showSubmissionSuccessModal({
                title: 'Insert Sheet 2026',
                recipients: result.recipients || [metadata.submitterEmail, 'release@carteblanche.co.za'],
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

// -----------------------------------------------------------------------------
// 8. Completed PDF Generation using Official Template Carte_Blanche_Insert_Sheet_2026.pdf
// -----------------------------------------------------------------------------
async function buildCompletedPDF() {
    if (document.fonts && document.fonts.ready) {
        try {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
        } catch (e) {}
    }

    const commNum = (document.getElementById('commissionNumber')?.value || '').trim();
    const txDate = document.getElementById('txDate')?.value || '';
    const storyName = (document.getElementById('storyName')?.value || '').trim();
    const producerName = (document.getElementById('producerName')?.value || '').trim();
    const submitterEmail = (document.getElementById('submitterEmail')?.value || '').trim();
    const presenterName = (document.getElementById('presenterName')?.value || '').trim();
    const cameraName = (document.getElementById('cameraName')?.value || '').trim();
    const researcherName = (document.getElementById('researcherName')?.value || '').trim();
    const soundName = (document.getElementById('soundName')?.value || '').trim();
    const editorName = (document.getElementById('editorName')?.value || '').trim();
    const duration = (document.getElementById('storyDuration')?.value || '').trim();
    const thirdPartyFootage = (document.getElementById('thirdPartyFootage')?.value || 'No').trim();
    const notes = (document.getElementById('notes')?.value || '').trim();

    // Extract dynamic Screen Credits
    const screenCreditCards = document.querySelectorAll('#creditRowsContainer .credit-block-card');
    const credits = [];
    screenCreditCards.forEach((card, idx) => {
        const tcIn = (card.querySelector('.input-tc-in')?.value || '').trim();
        const name = (card.querySelector('.input-credit-name')?.value || '').trim();
        const title = (card.querySelector('.input-credit-title')?.value || '').trim();
        if (tcIn || name || title) {
            credits.push({
                index: idx + 1,
                tcIn: tcIn || '',
                name: name || '',
                title: title || ''
            });
        }
    });

    // Collect dynamic extra crew credits
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
        const parts = val.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return val;
    };

    const formattedTxDate = formatDate(txDate);

    // Load official PDF template
    const templateUrl = 'templates/Carte_Blanche_Insert_Sheet_2026.pdf';
    const templateBytes = await fetch(templateUrl).then(res => {
        if (!res.ok) throw new Error('Could not load Insert Sheet PDF template file.');
        return res.arrayBuffer();
    });

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fieldMap = prepareTemplatePdf(pdfDoc);
    const pages = pdfDoc.getPages();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 9;
    const textColor = rgb(0.06, 0.09, 0.16);

    const drawInBox = (fieldName, text, isBold = false, opts = {}) => {
        const box = fieldMap[fieldName];
        if (!box) return;
        const pageIdx = box.pageIndex !== undefined ? box.pageIndex : 0;
        const targetPage = pages[pageIdx];
        if (!targetPage) return;

        drawInFieldBox(targetPage, fieldMap, fieldName, text, {
            size: fontSize,
            font: isBold ? fontBold : font,
            color: textColor,
            ...opts
        });
    };

    // 1. Draw Production & Technical Crew Details on Page 1
    drawInBox('commissionNumber', commNum, true);
    drawInBox('storyTitle', storyName, true);
    drawInBox('producer', producerName);
    drawInBox('presenter', presenterName);
    drawInBox('dop', cameraName);
    drawInBox('camAssist', researcherName);
    drawInBox('editor', editorName);
    drawInBox('finalMix', soundName);
    drawInBox('deliveryDate', formattedTxDate);
    drawInBox('insertDuration', duration);
    drawInBox('thirdPartyFootage', thirdPartyFootage);

    // 2. Draw Screen Credits into template slots (up to 20 slots)
    // Page 1: 1..4 | Page 2: 5..10 | Page 3: 11..16 | Page 4: 17..20
    const templateSlotsCount = 20;
    const templateCreditsCount = Math.min(credits.length, templateSlotsCount);

    for (let i = 0; i < templateCreditsCount; i++) {
        const num = i + 1;
        const c = credits[i];
        drawInBox(`tcIn_${num}`, c.tcIn, true);
        drawInBox(`creditName_${num}`, c.name, true);
        drawInBox(`creditTitle_${num}`, c.title, false);
    }

    // 3. Page Trimming: Remove trailing unused template pages
    // Slots: 1..4 on page 1, 5..10 on page 2, 11..16 on page 3, 17..20 on page 4
    const neededTemplatePages = credits.length <= 4 ? 1 : credits.length <= 10 ? 2 : credits.length <= 16 ? 3 : 4;
    const originalTemplateCount = pdfDoc.getPageCount();
    for (let p = originalTemplateCount - 1; p >= neededTemplatePages; p--) {
        pdfDoc.removePage(p);
    }

    // 4. Handle Credits beyond 20 on Supplementary Page(s)
    let extraCreditsStartingIndex = 20;
    if (credits.length > templateSlotsCount) {
        const overflowCredits = credits.slice(templateSlotsCount);
        let suppPage = pdfDoc.addPage([595.28, 841.89]);

        const drawOverflowHeader = (pg) => {
            pg.drawRectangle({ x: 40, y: 805, width: 515, height: 4, color: rgb(0.39, 0.40, 0.95) });
            safeDrawField(pg, 'CARTE BLANCHE - INSERT SHEET 2026', 40, 782, { size: 15, font: fontBold, color: rgb(0.08, 0.12, 0.22) });
            safeDrawField(pg, 'ADDITIONAL SCREEN CREDITS (OVERFLOW)', 40, 766, { size: 9.5, font: fontBold, color: rgb(0.39, 0.40, 0.95) });
            safeDrawField(pg, `COMMISSION: ${commNum || 'N/A'}  |  STORY: ${storyName || 'N/A'}  |  PRODUCER: ${producerName || 'N/A'}`, 40, 746, { size: 8.5, font: font, color: rgb(0.3, 0.35, 0.45) });
        };

        drawOverflowHeader(suppPage);
        let curY = 720;

        // Table Header
        suppPage.drawRectangle({ x: 40, y: curY - 4, width: 515, height: 22, color: rgb(0.92, 0.94, 0.98), borderColor: rgb(0.82, 0.86, 0.92), borderWidth: 1 });
        safeDrawField(suppPage, 'TC IN', 52, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
        safeDrawField(suppPage, 'ON-SCREEN NAME / PHOTO CREDIT', 150, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
        safeDrawField(suppPage, 'CASE STUDY / EXPERT TITLE', 340, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
        curY -= 22;

        for (let i = 0; i < overflowCredits.length; i++) {
            if (curY < 80) {
                suppPage = pdfDoc.addPage([595.28, 841.89]);
                drawOverflowHeader(suppPage);
                curY = 720;
            }
            const c = overflowCredits[i];
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

            safeDrawField(suppPage, c.tcIn || '-', 52, curY + 2, { size: 9, font: fontBold, color: rgb(0.15, 0.20, 0.30) });
            safeDrawField(suppPage, c.name || '-', 150, curY + 2, { size: 9, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
            safeDrawField(suppPage, c.title || '-', 340, curY + 2, { size: 8.5, font: font, color: rgb(0.15, 0.20, 0.28) });
            curY -= 22;
        }
    }

    // 5. Supplementary Page for Extra Crew Credits or Notes
    if (extraCredits.length > 0 || notes) {
        let suppPage = pdfDoc.addPage([595.28, 841.89]);

        const drawSuppHeader = (pg) => {
            pg.drawRectangle({ x: 40, y: 805, width: 515, height: 4, color: rgb(0.39, 0.40, 0.95) });
            safeDrawField(pg, 'CARTE BLANCHE - INSERT SHEET 2026', 40, 782, { size: 15, font: fontBold, color: rgb(0.08, 0.12, 0.22) });
            safeDrawField(pg, 'ADDITIONAL PRODUCTION CREDITS & NOTES (SUPPLEMENTARY)', 40, 766, { size: 9.5, font: fontBold, color: rgb(0.39, 0.40, 0.95) });
            safeDrawField(pg, `COMMISSION: ${commNum || 'N/A'}  |  STORY: ${storyName || 'N/A'}  |  PRODUCER: ${producerName || 'N/A'}`, 40, 746, { size: 8.5, font: font, color: rgb(0.3, 0.35, 0.45) });
        };

        drawSuppHeader(suppPage);
        let curY = 710;

        if (extraCredits.length > 0) {
            safeDrawField(suppPage, 'ADDITIONAL PRODUCTION CREW CREDITS', 40, curY, { size: 11, font: fontBold, color: rgb(0.08, 0.12, 0.22) });
            curY -= 18;

            suppPage.drawRectangle({ x: 40, y: curY - 4, width: 515, height: 22, color: rgb(0.92, 0.94, 0.98), borderColor: rgb(0.82, 0.86, 0.92), borderWidth: 1 });
            safeDrawField(suppPage, 'ROLE / PRODUCTION TITLE', 52, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
            safeDrawField(suppPage, 'CREW MEMBER NAME', 250, curY + 2, { size: 8.5, font: fontBold, color: rgb(0.25, 0.3, 0.4) });
            curY -= 22;

            for (let i = 0; i < extraCredits.length; i++) {
                if (curY < 80) {
                    suppPage = pdfDoc.addPage([595.28, 841.89]);
                    drawSuppHeader(suppPage);
                    curY = 710;
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

        if (notes) {
            if (curY < 140) {
                suppPage = pdfDoc.addPage([595.28, 841.89]);
                drawSuppHeader(suppPage);
                curY = 710;
            }

            safeDrawField(suppPage, 'GENERAL NOTES & LOWER THIRD INSTRUCTIONS', 40, curY, { size: 11, font: fontBold, color: rgb(0.08, 0.12, 0.22) });
            curY -= 14;

            const wrapText = (text, maxChars = 85) => {
                const lines = [];
                const rawParagraphs = text.split('\n');
                for (const para of rawParagraphs) {
                    if (!para.trim()) { lines.push(''); continue; }
                    const words = para.split(/\s+/);
                    let currentLine = '';
                    for (const word of words) {
                        if (!currentLine) currentLine = word;
                        else if ((currentLine + ' ' + word).length <= maxChars) currentLine += ' ' + word;
                        else { lines.push(currentLine); currentLine = word; }
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
                    suppPage = pdfDoc.addPage([595.28, 841.89]);
                    drawSuppHeader(suppPage);
                    textY = 680;
                }
                safeDrawField(suppPage, line, 52, textY, { size: 9, font: font, color: rgb(0.15, 0.20, 0.28) });
                textY -= lineHeight;
            }
        }
    }

    // 6. Update Page Numbers on all final pages
    const finalPages = pdfDoc.getPages();
    const finalTotalPages = finalPages.length;

    for (let p = 0; p < finalTotalPages; p++) {
        const pg = finalPages[p];
        if (p < neededTemplatePages) {
            // Template page: cover original "Page X of 4" with white patch and write new page number
            pg.drawRectangle({
                x: 480,
                y: 20,
                width: 75,
                height: 14,
                color: rgb(1, 1, 1)
            });
            pg.drawText(`Page ${p + 1} of ${finalTotalPages}`, {
                x: 495,
                y: 22,
                size: 7.5,
                font: font,
                color: rgb(0.4, 0.45, 0.55)
            });
        } else {
            // Supplementary page footer
            safeDrawField(pg, 'Carte Blanche Insert Sheet 2026 | Combined Artists | Automated CARP Deliverables', 40, 25, {
                size: 7.5,
                font: font,
                color: rgb(0.55, 0.60, 0.68)
            });
            safeDrawField(pg, `Page ${p + 1} of ${finalTotalPages}`, 495, 25, {
                size: 7.5,
                font: font,
                color: rgb(0.55, 0.60, 0.68)
            });
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
            thirdPartyFootage,
            notes,
            credits,
            extraCredits
        }
    };
}
