// insert_sheet.js - v5.3.0
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('insertSheetForm');
    const container = document.getElementById('creditRowsContainer');
    const addBtn = document.getElementById('btnAddCreditRow');
    const counterDisplay = document.getElementById('creditCounterDisplay');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let creditCount = 0;

    // -------------------------------------------------------------------------
    // 1. Timecode Formatter (<HH:MM:SS> automatically adding colons as user types)
    // -------------------------------------------------------------------------
    function formatTimecode(value) {
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

    const durationInput = document.getElementById('insertDuration');
    if (durationInput) {
        attachTimecodeMask(durationInput);
    }

    // -------------------------------------------------------------------------
    // 2. Active User & URL Parameter Pre-fills
    // -------------------------------------------------------------------------
    const urlParams = new URLSearchParams(window.location.search);
    const initialStory = urlParams.get('story') || urlParams.get('storyTitle') || urlParams.get('storyName') || '';
    const initialComm = urlParams.get('comm') || urlParams.get('commission') || urlParams.get('commissionNumber') || '';
    const initialProducer = urlParams.get('producer') || urlParams.get('producerName') || '';
    const initialPresenter = urlParams.get('presenter') || '';
    const initialDelivery = urlParams.get('delivery') || urlParams.get('deliveryDate') || '';

    if (initialStory) {
        if (document.getElementById('storyTitle')) document.getElementById('storyTitle').value = initialStory;
        if (document.getElementById('storyName')) document.getElementById('storyName').value = initialStory;
    }
    if (initialComm) {
        if (document.getElementById('commissionNumber')) document.getElementById('commissionNumber').value = initialComm;
        if (document.getElementById('commNum')) document.getElementById('commNum').value = initialComm;
    }
    if (initialProducer && document.getElementById('producer')) {
        document.getElementById('producer').value = initialProducer;
    }
    if (initialPresenter && document.getElementById('presenter')) {
        document.getElementById('presenter').value = initialPresenter;
    }
    if (initialDelivery && document.getElementById('deliveryDate')) {
        document.getElementById('deliveryDate').value = initialDelivery;
    }

    // Auto-detect logged-in user profile if producer field is empty
    const producerInput = document.getElementById('producer');
    if (producerInput && !producerInput.value) {
        try {
            const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
            if (userStr) {
                const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                if (name) producerInput.value = name;
            }
            if (!producerInput.value && window.auth && typeof window.auth.getCurrentUser === 'function') {
                const cur = window.auth.getCurrentUser();
                if (cur) producerInput.value = cur.displayName || cur.email || '';
            }
        } catch (e) {}
    }

    // -------------------------------------------------------------------------
    // 3. Bi-directional Synchronization with Aliases
    // -------------------------------------------------------------------------
    const storyTitleEl = document.getElementById('storyTitle');
    const storyNameEl = document.getElementById('storyName');
    const commissionNumberEl = document.getElementById('commissionNumber');
    const commNumEl = document.getElementById('commNum');
    const producerNameEl = document.getElementById('producerName');

    function syncAliases() {
        if (storyTitleEl && storyNameEl) storyNameEl.value = storyTitleEl.value;
        if (commissionNumberEl && commNumEl) commNumEl.value = commissionNumberEl.value;
        if (producerInput && producerNameEl) producerNameEl.value = producerInput.value;
    }

    if (storyTitleEl) storyTitleEl.addEventListener('input', syncAliases);
    if (commissionNumberEl) commissionNumberEl.addEventListener('input', syncAliases);
    if (producerInput) producerInput.addEventListener('input', syncAliases);
    syncAliases();

    // -------------------------------------------------------------------------
    // 4. Dynamic Credit Blocks (Initial 4 + <Add More>)
    // -------------------------------------------------------------------------
    function createCreditBlock(tcIn = '', name = '', title = '') {
        creditCount++;
        const card = document.createElement('div');
        card.className = 'credit-block-card';
        card.dataset.index = creditCount;

        card.innerHTML = `
            <div class="credit-block-header">
                <span class="credit-badge">
                    <span>🏷️</span> <span class="badge-label">CREDIT #${String(creditCount).padStart(2, '0')}</span>
                </span>
                <button type="button" class="btn-remove-credit" title="Remove Credit Block">
                    <span>✕</span> Remove
                </button>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>TC In:</label>
                    <input type="text" class="input-tc-in" placeholder="HH:MM:SS" maxlength="8" value="${escapeHtml(tcIn)}">
                </div>
                <div class="form-group">
                    <label>On-Screen Name/Photo Credit:</label>
                    <input type="text" class="input-credit-name" placeholder="e.g. Dr. Brian Ndlovu" value="${escapeHtml(name)}">
                </div>
                <div class="form-group full-width">
                    <label>Case Study/Expert Title:</label>
                    <input type="text" class="input-credit-title" placeholder="e.g. Renewable Energy Analyst - CSIR" value="${escapeHtml(title)}">
                </div>
            </div>
        `;

        const tcInInput = card.querySelector('.input-tc-in');
        attachTimecodeMask(tcInInput);

        card.querySelector('.btn-remove-credit').addEventListener('click', () => {
            if (container.querySelectorAll('.credit-block-card').length <= 1) {
                alert('An Insert Sheet requires at least one credit entry.');
                return;
            }
            card.remove();
            renumberCredits();
        });

        return card;
    }

    function renumberCredits() {
        const cards = container.querySelectorAll('.credit-block-card');
        cards.forEach((card, idx) => {
            const num = idx + 1;
            card.dataset.index = num;
            const badge = card.querySelector('.badge-label');
            if (badge) badge.textContent = `CREDIT #${String(num).padStart(2, '0')}`;
        });
        creditCount = cards.length;
        if (counterDisplay) {
            counterDisplay.textContent = `${creditCount} Credit${creditCount === 1 ? '' : 's'}`;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // Initialize with EXACTLY 4 empty credit blocks as requested
    container.appendChild(createCreditBlock());
    container.appendChild(createCreditBlock());
    container.appendChild(createCreditBlock());
    container.appendChild(createCreditBlock());
    renumberCredits();

    // <Add More> button handler
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            container.appendChild(createCreditBlock());
            renumberCredits();
            const lastCard = container.lastElementChild;
            if (lastCard) {
                lastCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    // -------------------------------------------------------------------------
    // 5. Form Submission & PDF Generation
    // -------------------------------------------------------------------------
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const commNum = (document.getElementById('commissionNumber')?.value || '').trim();
        const storyTitle = (document.getElementById('storyTitle')?.value || '').trim();
        const producer = (document.getElementById('producer')?.value || '').trim();
        const presenter = (document.getElementById('presenter')?.value || '').trim();
        const dop = (document.getElementById('dop')?.value || '').trim();
        const camAssist = (document.getElementById('camAssist')?.value || '').trim();
        const editor = (document.getElementById('editor')?.value || '').trim();
        const finalMix = (document.getElementById('finalMix')?.value || '').trim();
        const deliveryDate = (document.getElementById('deliveryDate')?.value || '').trim();
        const insertDuration = (document.getElementById('insertDuration')?.value || '').trim();
        const thirdPartyFootage = (document.getElementById('thirdPartyFootage')?.value || 'No').trim();

        // Extract credits
        const creditCards = container.querySelectorAll('.credit-block-card');
        const credits = [];
        creditCards.forEach((card, idx) => {
            const tcIn = card.querySelector('.input-tc-in').value.trim();
            const name = card.querySelector('.input-credit-name').value.trim();
            const title = card.querySelector('.input-credit-title').value.trim();
            if (tcIn || name || title) {
                credits.push({
                    index: idx + 1,
                    tcIn: tcIn || 'N/A',
                    name: name || 'N/A',
                    title: title || 'N/A'
                });
            }
        });

        if (credits.length === 0) {
            alert('Please specify at least one credit entry with a timecode or name.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.dataset.originalText = submitBtn.textContent;
            submitBtn.textContent = 'Submitted';
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        if (loadingOverlay) loadingOverlay.classList.remove('active');

        // Show confirmation dialog immediately
        const dialog = document.getElementById('successDialog');
        let isBgDone = false;
        let isNavigating = false;

        const scheduleAutoClose = () => {
            setTimeout(() => {
                if (!isNavigating && dialog && !dialog.classList.contains('hidden')) {
                    handleModalNavigate('index.html');
                }
            }, 2500);
        };

        if (dialog) {
            dialog.classList.remove('hidden');
            const returnBtn = document.getElementById('dialogReturnBtn');
            const anotherBtn = document.getElementById('dialogAnotherBtn');

            const handleModalNavigate = async (targetUrl) => {
                if (isNavigating) return;
                isNavigating = true;
                if (!isBgDone && bgSubmitPromise) {
                    try {
                        await Promise.race([
                            bgSubmitPromise,
                            new Promise(resolve => setTimeout(resolve, 3500))
                        ]);
                    } catch (e) {
                        console.warn('[INSERT-SHEET] Proceeding with navigation:', e);
                    }
                }
                window.location.href = targetUrl;
            };

            if (returnBtn) {
                returnBtn.disabled = false;
                returnBtn.textContent = 'Return to Dashboard';
                returnBtn.onclick = () => handleModalNavigate('index.html');
            }
            if (anotherBtn) {
                anotherBtn.disabled = false;
                anotherBtn.textContent = 'Submit Another Form';
                anotherBtn.onclick = () => handleModalNavigate('forms_hub.html');
            }

            scheduleAutoClose();
        }

        const bgSubmitPromise = (async () => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 16;
                const contentWidth = pageWidth - margin * 2;

                const caLogo = (typeof getBlackLogo === 'function' ? getBlackLogo() : (typeof CAP_LOGO_B64 !== 'undefined' ? CAP_LOGO_B64 : null));
                const cbLogo = (typeof CB_LOGO_B64 !== 'undefined' ? CB_LOGO_B64 : null);

                // Page 1 holds Crew details + up to 4 credits
                // Subsequent pages hold running header + reference + up to 6 credits per page
                const remainingCreditsCount = Math.max(0, credits.length - 4);
                const extraPages = Math.ceil(remainingCreditsCount / 6);
                const totalPages = 1 + extraPages;

                let curCreditIdx = 0;

                // --- PAGE 1 ---
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(15, 23, 42);
                doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 7.5, { align: 'center' });

                if (caLogo) {
                    const props = doc.getImageProperties(caLogo);
                    const caW = 34;
                    const caH = caW * (props.height / props.width);
                    doc.addImage(caLogo, 'PNG', margin, 11, caW, caH, undefined, 'FAST');
                }
                if (cbLogo) {
                    const props = doc.getImageProperties(cbLogo);
                    const cbW = 20;
                    const cbH = cbW * (props.height / props.width);
                    doc.addImage(cbLogo, 'PNG', pageWidth - margin - cbW, 10, cbW, cbH, undefined, 'FAST');
                }

                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(15);
                doc.text('INSERT SHEET', margin, 34);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text('Carte Blanche  •  Official Post-Production Graphics & Credits Delivery', margin, 38.5);

                doc.setDrawColor(79, 70, 229);
                doc.setLineWidth(0.8);
                doc.line(margin, 41, pageWidth - margin, 41);

                // Section 1: Crew Details Card
                let y = 46;
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.roundedRect(margin, y, contentWidth, 54, 2, 2, 'FD');

                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.text('PRODUCTION & TECHNICAL CREW DETAILS', margin + 4, y + 6);

                doc.setTextColor(15, 23, 42);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);

                const col1 = margin + 4;
                const col2 = margin + 45;
                const col3 = margin + (contentWidth / 2) + 4;
                const col4 = margin + (contentWidth / 2) + 45;

                let rowY = y + 13;
                doc.setFont('helvetica', 'bold'); doc.text('Commission Number:', col1, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(commNum || 'N/A', col2, rowY);
                doc.setFont('helvetica', 'bold'); doc.text('Story Title:', col3, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(storyTitle || 'N/A', col4, rowY);

                rowY += 6.5;
                doc.setFont('helvetica', 'bold'); doc.text('Producer:', col1, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(producer || 'N/A', col2, rowY);
                doc.setFont('helvetica', 'bold'); doc.text('Presenter:', col3, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(presenter || 'N/A', col4, rowY);

                rowY += 6.5;
                doc.setFont('helvetica', 'bold'); doc.text('DOP:', col1, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(dop || 'N/A', col2, rowY);
                doc.setFont('helvetica', 'bold'); doc.text('Camera Assistant:', col3, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(camAssist || 'N/A', col4, rowY);

                rowY += 6.5;
                doc.setFont('helvetica', 'bold'); doc.text('Editor:', col1, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(editor || 'N/A', col2, rowY);
                doc.setFont('helvetica', 'bold'); doc.text('Final Mix Operator:', col3, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(finalMix || 'N/A', col4, rowY);

                rowY += 6.5;
                doc.setFont('helvetica', 'bold'); doc.text('Delivery Date:', col1, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(deliveryDate || 'N/A', col2, rowY);
                doc.setFont('helvetica', 'bold'); doc.text('Insert Duration:', col3, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(insertDuration || 'N/A', col4, rowY);

                rowY += 6.5;
                doc.setFont('helvetica', 'bold'); doc.text('3rd Party Footage:', col1, rowY);
                doc.setFont('helvetica', 'normal'); doc.text(thirdPartyFootage || 'No', col2, rowY);

                // Section 2: SCREEN CREDITS on Page 1 (Up to 4)
                y = 106;
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.text('SCREEN CREDITS', margin, y);
                y += 4;

                const creditsOnP1 = credits.slice(0, 4);
                creditsOnP1.forEach(c => {
                    renderPdfCreditCard(doc, c, margin, y, contentWidth);
                    y += 26.5;
                    curCreditIdx++;
                });

                renderPdfFooter(doc, 1, totalPages, margin, contentWidth);

                // --- SUBSEQUENT PAGES ---
                let currentPageNum = 2;
                while (curCreditIdx < credits.length) {
                    doc.addPage([pageWidth, pageHeight], 'p');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.setTextColor(15, 23, 42);
                    doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 7.5, { align: 'center' });

                    doc.setTextColor(79, 70, 229);
                    doc.setFontSize(9.5);
                    doc.text('CARTE BLANCHE  •  INSERT SHEET (SCREEN CREDITS)', margin, 15);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`Story Title: ${storyTitle}  |  Commission Number: ${commNum}`, margin, 19.5);

                    doc.setDrawColor(79, 70, 229);
                    doc.setLineWidth(0.6);
                    doc.line(margin, 21.5, pageWidth - margin, 21.5);

                    y = 26;
                    const pageBatch = credits.slice(curCreditIdx, curCreditIdx + 6);
                    pageBatch.forEach(c => {
                        renderPdfCreditCard(doc, c, margin, y, contentWidth);
                        y += 26.5;
                        curCreditIdx++;
                    });

                    renderPdfFooter(doc, currentPageNum, totalPages, margin, contentWidth);
                    currentPageNum++;
                }

                const pdfBlob = doc.output('blob');

                const formData = new FormData();
                formData.append('storyTitle', storyTitle);
                formData.append('storyName', storyTitle);
                formData.append('commissionNumber', commNum);
                formData.append('commNum', commNum);
                formData.append('producer', producer);
                formData.append('producerName', producer);
                formData.append('presenter', presenter);
                formData.append('dop', dop);
                formData.append('camAssist', camAssist);
                formData.append('cameraAssistant', camAssist);
                formData.append('editor', editor);
                formData.append('finalMix', finalMix);
                formData.append('finalMixOperator', finalMix);
                formData.append('deliveryDate', deliveryDate);
                formData.append('insertDuration', insertDuration);
                formData.append('thirdPartyFootage', thirdPartyFootage);
                formData.append('credits', JSON.stringify(credits));

                const safeFilename = `InsertSheet_${storyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
                formData.append('insert_sheet_pdf', pdfBlob, safeFilename);
                formData.append('file', pdfBlob, safeFilename);

                const token = (window.auth && typeof window.auth.getIdToken === 'function')
                    ? await window.auth.getIdToken().catch(() => null)
                    : null;
                const headers = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const response = await fetch('/api/send-insert-sheet', {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });

                const result = await response.json();
                if (!result.success) throw new Error(result.error || result.message || 'Server error while submitting');

                isBgDone = true;
                return result;

            } catch (error) {
                console.error('[INSERT-SHEET] Background submission error:', error);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = submitBtn.dataset.originalText || 'Submit Insert Sheet';
                    submitBtn.style.opacity = '1';
                    submitBtn.style.cursor = 'pointer';
                }
                if (dialog && !isNavigating) {
                    const p = dialog.querySelector('p');
                    if (p) p.innerHTML += `<br><span style="color: #ef4444; font-size: 0.85rem;">Notice: Upload experienced an error (${escapeHtml(error.message)}). Please check your connection.</span>`;
                }
                throw error;
            }
        })();
    });

    function renderPdfCreditCard(doc, credit, x, y, width) {
        const height = 23;
        doc.setFillColor(252, 253, 254);
        doc.setDrawColor(220, 228, 238);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');

        doc.setTextColor(67, 56, 202);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`CREDIT #${String(credit.index).padStart(2, '0')}`, x + 3.5, y + 4.5);

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7.5);
        doc.text('TC In:', x + width - 38, y + 4.5);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(credit.tcIn, x + width - 26, y + 4.5);

        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.25);
        doc.line(x + 3, y + 6.5, x + width - 3, y + 6.5);

        const halfCol = (width - 10) / 2;
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text('On-Screen Name/Photo Credit:', x + 3.5, y + 10.5);
        doc.text('Case Study/Expert Title:', x + 3.5 + halfCol + 4, y + 10.5);

        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        const nameLines = doc.splitTextToSize(credit.name || 'N/A', halfCol);
        doc.text(nameLines, x + 3.5, y + 14.5);

        const titleLines = doc.splitTextToSize(credit.title || 'N/A', halfCol);
        doc.text(titleLines, x + 3.5 + halfCol + 4, y + 14.5);
    }

    function renderPdfFooter(doc, pageNum, totalPages, x, width) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Form Ref: CB-INS-2026  •  Carte Blanche Post-Production & Legal', x, 290);
        doc.text(`Page ${pageNum} of ${totalPages}`, x + width, 290, { align: 'right' });
    }
});
