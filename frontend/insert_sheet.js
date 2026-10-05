// insert_sheet.js - Carte Blanche Insert Sheet & Credits Delivery Handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('insertSheetForm');
    const container = document.getElementById('creditRowsContainer');
    const addBtn = document.getElementById('btnAddCreditRow');
    const counterDisplay = document.getElementById('creditCounterDisplay');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let creditCount = 0;

    // URL parameter pre-fill support
    const urlParams = new URLSearchParams(window.location.search);
    const initialStory = urlParams.get('story') || urlParams.get('storyName') || '';
    const initialComm = urlParams.get('comm') || urlParams.get('commissionNumber') || '';
    const initialProducer = urlParams.get('producer') || urlParams.get('producerName') || '';
    const initialPresenter = urlParams.get('presenter') || '';
    const initialDelivery = urlParams.get('delivery') || urlParams.get('deliveryDate') || '';

    if (initialStory && document.getElementById('storyName')) {
        document.getElementById('storyName').value = initialStory;
    }
    if (initialComm && document.getElementById('commissionNumber')) {
        document.getElementById('commissionNumber').value = initialComm;
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
    if (!document.getElementById('producer').value) {
        try {
            const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
            if (userStr) {
                const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                if (name) document.getElementById('producer').value = name;
            }
        } catch (e) {}
    }

    // Function to create a credit block element
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
                <button type="button" class="btn-remove-credit" title="Remove Credit Row">
                    <span>✕</span> Remove
                </button>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>TC IN (Broadcast Timecode)</label>
                    <input type="text" class="input-tc-in" placeholder="e.g. 00:01:15" value="${escapeHtml(tcIn)}">
                </div>
                <div class="form-group">
                    <label>Name / Photo Credit (On-Screen)</label>
                    <input type="text" class="input-credit-name" placeholder="e.g. Dr. Brian Ndlovu" value="${escapeHtml(name)}">
                </div>
                <div class="form-group full-width">
                    <label>Title / Designation / Lower Third</label>
                    <input type="text" class="input-credit-title" placeholder="e.g. Renewable Energy Analyst - CSIR" value="${escapeHtml(title)}">
                </div>
            </div>
        `;

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

    // Initialize with 3 empty credit rows
    container.appendChild(createCreditBlock());
    container.appendChild(createCreditBlock());
    container.appendChild(createCreditBlock());
    renumberCredits();

    addBtn.addEventListener('click', () => {
        container.appendChild(createCreditBlock());
        renumberCredits();
        // Smooth scroll to the new card
        const lastCard = container.lastElementChild;
        if (lastCard) {
            lastCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    // Handle Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const commNum = document.getElementById('commissionNumber').value.trim();
        const storyName = document.getElementById('storyName').value.trim();
        const producer = document.getElementById('producer').value.trim();
        const presenter = document.getElementById('presenter').value.trim();
        const dop = document.getElementById('dop').value.trim();
        const camAssist = document.getElementById('camAssist').value.trim();
        const editor = document.getElementById('editor').value.trim();
        const finalMix = document.getElementById('finalMix').value.trim();
        const deliveryDate = document.getElementById('deliveryDate').value.trim();
        const insertDuration = document.getElementById('insertDuration').value.trim();
        const thirdPartyFootage = document.getElementById('thirdPartyFootage').value.trim();

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

        try {
            loadingOverlay.classList.add('active');

            // Generate Multi-Page PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 16;
            const contentWidth = pageWidth - margin * 2;

            // Logos
            const caLogo = (typeof getBlackLogo === 'function' ? getBlackLogo() : (typeof CAP_LOGO_B64 !== 'undefined' ? CAP_LOGO_B64 : null));
            const cbLogo = (typeof CB_LOGO_B64 !== 'undefined' ? CB_LOGO_B64 : null);

            // Compute total pages
            // Page 1 holds Header + Crew details + up to 3 credits
            // Subsequent pages hold running header + reference + up to 6 credits per page
            const remainingCreditsCount = Math.max(0, credits.length - 3);
            const extraPages = Math.ceil(remainingCreditsCount / 6);
            const totalPages = 1 + extraPages;

            let curCreditIdx = 0;

            // --- PAGE 1 ---
            // Top notification
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 7.5, { align: 'center' });

            // Logos
            if (caLogo) {
                const props = doc.getImageProperties(caLogo);
                const caW = 34;
                const caH = caW * (props.height / props.width);
                doc.addImage(caLogo, 'PNG', margin, 11, caW, caH);
            }
            if (cbLogo) {
                const props = doc.getImageProperties(cbLogo);
                const cbW = 20;
                const cbH = cbW * (props.height / props.width);
                doc.addImage(cbLogo, 'PNG', pageWidth - margin - cbW, 10, cbW, cbH);
            }

            // Header Title
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
            let y = 47;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, y, contentWidth, 54, 2, 2, 'FD');

            doc.setTextColor(79, 70, 229);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('1. PRODUCTION & TECHNICAL CREW DETAILS', margin + 4, y + 6);

            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);

            const col1 = margin + 4;
            const col2 = margin + 50;
            const col3 = margin + (contentWidth / 2) + 4;
            const col4 = margin + (contentWidth / 2) + 46;

            let rowY = y + 13;
            doc.setFont('helvetica', 'bold'); doc.text('Commission #:', col1, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(commNum || 'N/A', col2, rowY);
            doc.setFont('helvetica', 'bold'); doc.text('Story Title:', col3, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(storyName || 'N/A', col4, rowY);

            rowY += 6.5;
            doc.setFont('helvetica', 'bold'); doc.text('Producer:', col1, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(producer || 'N/A', col2, rowY);
            doc.setFont('helvetica', 'bold'); doc.text('Presenter:', col3, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(presenter || 'N/A', col4, rowY);

            rowY += 6.5;
            doc.setFont('helvetica', 'bold'); doc.text('DOP / Camera:', col1, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(dop || 'N/A', col2, rowY);
            doc.setFont('helvetica', 'bold'); doc.text('Camera Assist:', col3, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(camAssist || 'N/A', col4, rowY);

            rowY += 6.5;
            doc.setFont('helvetica', 'bold'); doc.text('Editor:', col1, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(editor || 'N/A', col2, rowY);
            doc.setFont('helvetica', 'bold'); doc.text('Final Mix:', col3, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(finalMix || 'N/A', col4, rowY);

            rowY += 6.5;
            doc.setFont('helvetica', 'bold'); doc.text('Delivery Date:', col1, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(deliveryDate || 'N/A', col2, rowY);
            doc.setFont('helvetica', 'bold'); doc.text('Duration:', col3, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(insertDuration || 'N/A', col4, rowY);

            rowY += 6.5;
            doc.setFont('helvetica', 'bold'); doc.text('3rd Party Footage:', col1, rowY);
            doc.setFont('helvetica', 'normal'); doc.text(thirdPartyFootage || 'None declared', col2, rowY);

            // Section 2: Credits on Page 1 (Up to 3)
            y = 107;
            doc.setTextColor(79, 70, 229);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('2. ON-SCREEN SUPERS & LOWER THIRDS (CREDITS)', margin, y);
            y += 4;

            const creditsOnP1 = credits.slice(0, 3);
            creditsOnP1.forEach(c => {
                renderPdfCreditCard(doc, c, margin, y, contentWidth);
                y += 26.5;
                curCreditIdx++;
            });

            // Page 1 Footer
            renderPdfFooter(doc, 1, totalPages, margin, contentWidth);

            // --- SUBSEQUENT PAGES ---
            let currentPageNum = 2;
            while (curCreditIdx < credits.length) {
                doc.addPage([pageWidth, pageHeight], 'p');

                // Running Header
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(15, 23, 42);
                doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 7.5, { align: 'center' });

                doc.setTextColor(79, 70, 229);
                doc.setFontSize(9.5);
                doc.text('CARTE BLANCHE  •  INSERT SHEET (ON-SCREEN CREDITS)', margin, 15);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(`Story: ${storyName}  |  Commission #: ${commNum}`, margin, 19.5);

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

            // Prepare multipart submission payload
            const formData = new FormData();
            formData.append('storyName', storyName);
            formData.append('storyTitle', storyName);
            formData.append('commissionNumber', commNum);
            formData.append('producer', producer);
            formData.append('producerName', producer);
            formData.append('presenter', presenter);
            formData.append('dop', dop);
            formData.append('camAssist', camAssist);
            formData.append('editor', editor);
            formData.append('finalMix', finalMix);
            formData.append('deliveryDate', deliveryDate);
            formData.append('insertDuration', insertDuration);
            formData.append('thirdPartyFootage', thirdPartyFootage);
            formData.append('credits', JSON.stringify(credits));

            const safeFilename = `InsertSheet_${storyName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
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

            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            dialog.classList.remove('hidden');

            const isGuest = !(window.auth && window.auth.currentUser);
            const closeBtn = document.getElementById('dialogCloseBtn');
            if (isGuest) {
                const p = dialog.querySelector('p');
                if (p) p.textContent = 'Your Insert Sheet has been generated and dispatched to Carte Blanche Legal & Production. You may now close this window.';
                closeBtn.textContent = 'Done / Close Window';
                closeBtn.onclick = () => {
                    closeBtn.disabled = true;
                    closeBtn.textContent = 'Submitted ✓';
                    try { window.close(); } catch (e) {}
                };
            } else {
                closeBtn.onclick = () => window.location.href = 'forms_hub.html';
            }

        } catch (error) {
            console.error('CRITICAL ERROR:', error);
            alert('An error occurred during submission: ' + error.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    });

    function renderPdfCreditCard(doc, credit, x, y, width) {
        const height = 23;
        // Background card box
        doc.setFillColor(252, 253, 254);
        doc.setDrawColor(220, 228, 238);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');

        // Top bar badge
        doc.setTextColor(67, 56, 202);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`CREDIT #${String(credit.index).padStart(2, '0')}`, x + 3.5, y + 4.5);

        // TC IN on right
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7.5);
        doc.text('TC IN:', x + width - 38, y + 4.5);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(credit.tcIn, x + width - 26, y + 4.5);

        // Divider
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.25);
        doc.line(x + 3, y + 6.5, x + width - 3, y + 6.5);

        // Columns: Name on left, Title on right
        const halfCol = (width - 10) / 2;
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text('NAME / PHOTO CREDIT (ON-SCREEN):', x + 3.5, y + 10.5);
        doc.text('TITLE / DESIGNATION / LOWER THIRD:', x + 3.5 + halfCol + 4, y + 10.5);

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
