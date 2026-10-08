// footage_release_agreement.js - v5.3.3
function initFootageAgreement() {
    // -------------------------------------------------------------------------
    // 1. Elements & Canvas Setup (Owner & Producer Signatures)
    // -------------------------------------------------------------------------
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearSigBtn');
    const form = document.getElementById('footageAgreementForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let drawing = false;
    let sigMethod = 'draw';

    const tabDraw = document.getElementById('tabDraw');
    const tabType = document.getElementById('tabType');
    const typeSignatureControls = document.getElementById('typeSignatureControls');
    const typeSigInput = document.getElementById('typeSigInput');
    const typeSigFont = document.getElementById('typeSigFont');

    tabDraw.addEventListener('click', () => {
        sigMethod = 'draw';
        tabDraw.classList.add('active');
        tabType.classList.remove('active');
        typeSignatureControls.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.pointerEvents = 'auto';
    });

    tabType.addEventListener('click', () => {
        sigMethod = 'type';
        tabType.classList.add('active');
        tabDraw.classList.remove('active');
        typeSignatureControls.style.display = 'block';
        canvas.style.pointerEvents = 'none';
        if (!typeSigInput.value) {
            const nameVal = document.getElementById('footageOwnerName')?.value || '';
            if (nameVal) typeSigInput.value = nameVal;
        }
        renderTypedSignature();
    });

    function renderTypedSignature() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const text = typeSigInput.value.trim();
        if (!text) return;

        const font = typeSigFont.value;
        ctx.font = `italic 40px "${font}", cursive`;
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    typeSigInput.addEventListener('input', renderTypedSignature);
    typeSigFont.addEventListener('change', renderTypedSignature);

    function getMousePos(canvasDom, touchOrMouseEvent) {
        const rect = canvasDom.getBoundingClientRect();
        const clientX = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientX : touchOrMouseEvent.clientX;
        const clientY = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientY : touchOrMouseEvent.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (sigMethod !== 'draw') return;
        drawing = true;
        const pos = getMousePos(canvas, e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (sigMethod !== 'draw' || !drawing) return;
        const pos = getMousePos(canvas, e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseleave', () => drawing = false);

    canvas.addEventListener('touchstart', (e) => {
        if (sigMethod !== 'draw') return;
        e.preventDefault();
        drawing = true;
        const pos = getMousePos(canvas, e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (sigMethod !== 'draw') return;
        e.preventDefault();
        if (!drawing) return;
        const pos = getMousePos(canvas, e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }, { passive: false });

    canvas.addEventListener('touchend', () => drawing = false);

    clearBtn.addEventListener('click', () => {
        if (sigMethod === 'draw') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            typeSigInput.value = '';
            renderTypedSignature();
        }
    });

    // Producer Canvas Elements
    const producerCanvas = document.getElementById('producerSignatureCanvas');
    const producerCtx = producerCanvas ? producerCanvas.getContext('2d') : null;
    const clearProducerBtn = document.getElementById('clearProducerSigBtn');
    let producerDrawing = false;
    let producerSigMethod = 'draw';

    const tabProducerDraw = document.getElementById('tabProducerDraw');
    const tabProducerType = document.getElementById('tabProducerType');
    const producerTypeSignatureControls = document.getElementById('producerTypeSignatureControls');
    const producerTypeSigInput = document.getElementById('producerTypeSigInput');
    const producerTypeSigFont = document.getElementById('producerTypeSigFont');

    if (producerCanvas && producerCtx) {
        if (tabProducerDraw && tabProducerType) {
            tabProducerDraw.addEventListener('click', () => {
                producerSigMethod = 'draw';
                tabProducerDraw.classList.add('active');
                tabProducerType.classList.remove('active');
                if (producerTypeSignatureControls) producerTypeSignatureControls.style.display = 'none';
                producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
                producerCanvas.style.pointerEvents = 'auto';
            });

            tabProducerType.addEventListener('click', () => {
                producerSigMethod = 'type';
                tabProducerType.classList.add('active');
                tabProducerDraw.classList.remove('active');
                if (producerTypeSignatureControls) producerTypeSignatureControls.style.display = 'block';
                producerCanvas.style.pointerEvents = 'none';
                renderProducerTypedSignature();
            });
        }

        function renderProducerTypedSignature() {
            if (!producerCtx || !producerTypeSigInput) return;
            producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
            const text = producerTypeSigInput.value.trim();
            if (!text) return;

            const font = (producerTypeSigFont && producerTypeSigFont.value) || 'Caveat';
            producerCtx.font = `italic 40px "${font}", cursive`;
            producerCtx.fillStyle = '#000000';
            producerCtx.textBaseline = 'middle';
            producerCtx.textAlign = 'center';
            producerCtx.fillText(text, producerCanvas.width / 2, producerCanvas.height / 2);
        }

        if (producerTypeSigInput) producerTypeSigInput.addEventListener('input', renderProducerTypedSignature);
        if (producerTypeSigFont) producerTypeSigFont.addEventListener('change', renderProducerTypedSignature);

        producerCanvas.addEventListener('mousedown', (e) => {
            if (producerSigMethod !== 'draw') return;
            producerDrawing = true;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.beginPath();
            producerCtx.moveTo(pos.x, pos.y);
        });

        producerCanvas.addEventListener('mousemove', (e) => {
            if (producerSigMethod !== 'draw' || !producerDrawing) return;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.lineTo(pos.x, pos.y);
            producerCtx.stroke();
        });

        producerCanvas.addEventListener('mouseup', () => producerDrawing = false);
        producerCanvas.addEventListener('mouseleave', () => producerDrawing = false);

        producerCanvas.addEventListener('touchstart', (e) => {
            if (producerSigMethod !== 'draw') return;
            e.preventDefault();
            producerDrawing = true;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.beginPath();
            producerCtx.moveTo(pos.x, pos.y);
        }, { passive: false });

        producerCanvas.addEventListener('touchmove', (e) => {
            if (producerSigMethod !== 'draw') return;
            e.preventDefault();
            if (!producerDrawing) return;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.lineTo(pos.x, pos.y);
            producerCtx.stroke();
        }, { passive: false });

        producerCanvas.addEventListener('touchend', () => producerDrawing = false);

        if (clearProducerBtn) {
            clearProducerBtn.addEventListener('click', () => {
                if (producerSigMethod === 'draw') {
                    producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
                } else {
                    if (producerTypeSigInput) producerTypeSigInput.value = '';
                    renderProducerTypedSignature();
                }
            });
        }
    }

    // -------------------------------------------------------------------------
    // 2. Auto-Fill Defaults (Today's Date & Active Producer)
    // -------------------------------------------------------------------------
    const todayStr = new Date().toISOString().split('T')[0];
    const ownerSignedDateEl = document.getElementById('ownerSignedDate');
    const prodSignedDateEl = document.getElementById('producerSignedDate');
    const broadcastDateInput = document.getElementById('broadcastDate');
    if (ownerSignedDateEl && !ownerSignedDateEl.value) ownerSignedDateEl.value = todayStr;
    if (prodSignedDateEl && !prodSignedDateEl.value) prodSignedDateEl.value = todayStr;
    if (broadcastDateInput && !broadcastDateInput.value) broadcastDateInput.value = todayStr;

    function getActiveProducerName() {
        try {
            const cacheKey = localStorage.getItem('user_profile_cache') ||
                Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
            if (cacheKey) {
                const u = JSON.parse(localStorage.getItem(cacheKey) || '{}');
                const n = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                if (n) return n;
            }
            if (window.auth && typeof window.auth.getCurrentUser === 'function') {
                const cur = window.auth.getCurrentUser();
                if (cur) return cur.displayName || cur.email || '';
            }
        } catch (e) {
            console.warn('[FOOTAGE-FORM] Could not resolve active user name:', e);
        }
        return '';
    }

    const prodNameInput = document.getElementById('producerName');
    if (prodNameInput && !prodNameInput.value) {
        const activeName = getActiveProducerName();
        if (activeName) prodNameInput.value = activeName;
    }

    // -------------------------------------------------------------------------
    // 3. Pre-fill from URL parameters (if accessed via shared link or proposal)
    // -------------------------------------------------------------------------
    const urlParams = new URLSearchParams(window.location.search);
    const initialStory = urlParams.get('story') || urlParams.get('storyName') || '';
    const initialComm = urlParams.get('comm') || urlParams.get('commissionNumber') || '';
    const initialProducer = urlParams.get('producer') || urlParams.get('producerName') || '';
    const initialProducerEmail = urlParams.get('producerEmail') || '';
    const initialName = urlParams.get('name') || urlParams.get('licensorName') || urlParams.get('footageOwnerName') || '';

    if (initialStory && document.getElementById('storyTitle')) {
        document.getElementById('storyTitle').value = initialStory;
    }
    if (initialComm && document.getElementById('commissionNumber')) {
        document.getElementById('commissionNumber').value = initialComm;
    }
    if (initialName && document.getElementById('footageOwnerName')) {
        document.getElementById('footageOwnerName').value = initialName;
    }
    if (initialProducer && prodNameInput) {
        prodNameInput.value = initialProducer;
    }
    const prodEmailInput = document.getElementById('producerEmail');
    if (initialProducerEmail && prodEmailInput) {
        prodEmailInput.value = initialProducerEmail;
    }

    // -------------------------------------------------------------------------
    // 4. Bi-directional Synchronization with Legacy / Alias Fields
    // -------------------------------------------------------------------------
    const footageOwnerNameInput = document.getElementById('footageOwnerName');
    const footageOwnerCompanyInput = document.getElementById('footageOwnerCompany');
    const storyTitleInput = document.getElementById('storyTitle');
    const commissionNumberInput = document.getElementById('commissionNumber');
    const broadcastDatedInput = document.getElementById('broadcastDated');
    const footageDescInput = document.getElementById('footageDescription');
    const ownerSignedAtInput = document.getElementById('ownerSignedAt');

    const licensorNameAlias = document.getElementById('licensorName');
    const licensorEntityAlias = document.getElementById('licensorEntity');
    const ownerNameAlias = document.getElementById('ownerName');
    const fullNameAlias = document.getElementById('fullName');
    const storyNameAlias = document.getElementById('storyName');
    const broadcastDateAlias = document.getElementById('broadcastDate');
    const broadcastDatedAlias = document.getElementById('broadcastDated');
    const signedAtAlias = document.getElementById('signedAt');
    const signedDateAlias = document.getElementById('signedDate');
    const ownerDateAlias = document.getElementById('ownerDate');
    const producerDateAlias = document.getElementById('producerDate');

    function syncLegacyFields() {
        const ownerVal = (footageOwnerNameInput?.value || '').trim();
        if (licensorNameAlias) licensorNameAlias.value = ownerVal;
        if (ownerNameAlias) ownerNameAlias.value = ownerVal;
        if (fullNameAlias) fullNameAlias.value = ownerVal;

        const compVal = (footageOwnerCompanyInput?.value || '').trim();
        if (licensorEntityAlias) licensorEntityAlias.value = compVal;

        const storyVal = (storyTitleInput?.value || '').trim();
        if (storyNameAlias) storyNameAlias.value = storyVal;

        const bcastVal = (broadcastDateInput?.value || broadcastDatedInput?.value || '').trim();
        if (broadcastDateInput) broadcastDateInput.value = bcastVal;
        if (broadcastDatedInput && broadcastDatedInput !== broadcastDateInput) broadcastDatedInput.value = bcastVal;
        if (broadcastDateAlias && broadcastDateAlias !== broadcastDateInput) broadcastDateAlias.value = bcastVal;
        if (broadcastDatedAlias && broadcastDatedAlias !== broadcastDatedInput) broadcastDatedAlias.value = bcastVal;

        const signedAtVal = (ownerSignedAtInput?.value || '').trim();
        if (signedAtAlias) signedAtAlias.value = signedAtVal;

        const ownerSignedDateVal = (ownerSignedDateEl?.value || '').trim();
        if (signedDateAlias) signedDateAlias.value = ownerSignedDateVal;
        if (ownerDateAlias) ownerDateAlias.value = ownerSignedDateVal;

        const prodSignedDateVal = (prodSignedDateEl?.value || '').trim();
        if (producerDateAlias) producerDateAlias.value = prodSignedDateVal;
    }

    [footageOwnerNameInput, footageOwnerCompanyInput, storyTitleInput, commissionNumberInput, broadcastDateInput, broadcastDatedInput, footageDescInput, ownerSignedAtInput].forEach(inp => {
        if (inp) inp.addEventListener('input', syncLegacyFields);
    });

    // Initial sync
    syncLegacyFields();

    // -------------------------------------------------------------------------
    // 5. Dual-Sign PDF Generator (buildDualPdf)
    // -------------------------------------------------------------------------
    async function buildDualPdf({ contributorSigImg, producerSigImg, producerName, isCountersignMode }) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 18;
            const contentWidth = pageWidth - (margin * 2);

            const ownerName = (footageOwnerNameInput?.value || licensorNameAlias?.value || '').trim();
            const ownerCompany = (footageOwnerCompanyInput?.value || licensorEntityAlias?.value || '').trim();
            const story = (storyTitleInput?.value || storyNameAlias?.value || '').trim();
            const commNum = (commissionNumberInput?.value || '').trim();
            const broadcastDate = (broadcastDateInput?.value || broadcastDatedInput?.value || broadcastDateAlias?.value || '').trim();
            const footageDesc = (footageDescInput?.value || '').trim();
            const ownerPlace = (ownerSignedAtInput?.value || '').trim();
            const ownerDate = (ownerSignedDateEl?.value || todayStr).trim();

            const prodPlace = (document.getElementById('producerSignedAt')?.value || '').trim();
            const prodDate = (prodSignedDateEl?.value || todayStr).trim();
            const resolvedProdName = (producerName || prodNameInput?.value || getActiveProducerName() || 'Producer').trim();

            // 0. Top Header Status Note
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            if (producerSigImg) {
                doc.text('OFFICIALLY EXECUTED RELEASE AGREEMENT', pageWidth / 2, 7.5, { align: 'center' });
            } else {
                doc.text('OWNER SIGNED • PENDING PRODUCER COUNTERSIGNATURE', pageWidth / 2, 7.5, { align: 'center' });
            }

            // 1. Branding Logos
            try {
                let caLogo = null;
                try {
                    if (typeof getBlackLogo === 'function') caLogo = getBlackLogo();
                } catch (e) {}
                if (!caLogo && typeof CAP_LOGO_B64 !== 'undefined') caLogo = CAP_LOGO_B64;
                if (caLogo) {
                    const props = doc.getImageProperties(caLogo);
                    const caWidth = 34;
                    const caHeight = (props && props.width > 0) ? caWidth * (props.height / props.width) : 13;
                    doc.addImage(caLogo, 'PNG', margin, 11, caWidth, caHeight, undefined, 'FAST');
                }
            } catch (e) {}

            try {
                if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
                    const props = doc.getImageProperties(CB_LOGO_B64);
                    const cbWidth = 20;
                    const cbHeight = (props && props.width > 0) ? cbWidth * (props.height / props.width) : 16;
                    doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - cbWidth, 10, cbWidth, cbHeight, undefined, 'FAST');
                }
            } catch (e) {}

            // 2. Title & Horizontal Rule
            let y = 30;
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.text('FOOTAGE AGREEMENT', margin, y);

            y += 3;
            doc.setDrawColor(0, 143, 190);
            doc.setLineWidth(0.6);
            doc.line(margin, y, pageWidth - margin, y);

            // 3. Centered Parties Block
            y += 5.5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 143, 190);
            doc.text('Footage Agreement', pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            doc.text('between', pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text('CARTE BLANCHE & M-NET', pageWidth / 2, y, { align: 'center' });

            y += 4;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('(“the producer”)', pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            doc.text('and', pageWidth / 2, y, { align: 'center' });

            y += 5.5;
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Footage Owner Name & Surname:  ${ownerName || '________________________________________'}`, pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('on behalf of', pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Footage Owner Company:  ${ownerCompany || '________________________________________'}`, pageWidth / 2, y, { align: 'center' });

            y += 4;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('(“the owner”)', pageWidth / 2, y, { align: 'center' });

            // 4. Production & Broadcast Details
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(`Story Title:  ${story || '___________________________'}`, margin, y);
            doc.text(`Commission Number:  ${commNum || '________________'}`, margin + 90, y);

            y += 4.5;
            doc.text(`Broadcast Date:  ${broadcastDate || '___________________________'}`, margin, y);

            // 5. Legal Terms Part 1
            y += 5.5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(30, 41, 59);

            const para1 = 'The owner hereby gives the producer permission to use portions of the following videos/images (“the footage”) in the story titled below to be broadcast on Carte Blanche on M-Net on the date below and on any other MultiChoice platform as M-Net sees fit, in perpetuity.';
            const split1 = doc.splitTextToSize(para1, contentWidth);
            doc.text(split1, margin, y);
            y += split1.length * 3.6 + 1;

            const para2 = 'The producer undertakes to use the footage fairly to illustrate issues pertaining to the story.';
            const split2 = doc.splitTextToSize(para2, contentWidth);
            doc.text(split2, margin, y);
            y += split2.length * 3.6 + 1;

            const para3 = 'The producer undertakes to provide the owners with an on-screen courtesy credit for the footage, if requested by the owner.';
            const split3 = doc.splitTextToSize(para3, contentWidth);
            doc.text(split3, margin, y);
            y += split3.length * 3.6 + 1;

            const para4 = 'The producer will not pay the owner for the use of the footage.';
            const split4 = doc.splitTextToSize(para4, contentWidth);
            doc.text(split4, margin, y);
            y += split4.length * 3.6 + 1;

            const para5 = 'The programme in its completed form is the property of M-Net and Carte Blanche.';
            const split5 = doc.splitTextToSize(para5, contentWidth);
            doc.text(split5, margin, y);
            y += split5.length * 3.6 + 2;

            // 6. Description of Footage Box
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(0, 143, 190);
            doc.text('DESCRIPTION OF FOOTAGE:', margin, y);

            y += 3.5;
            const descBoxH = 18;
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, y, contentWidth, descBoxH, 1.5, 1.5, 'FD');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            const splitDesc = doc.splitTextToSize(footageDesc || 'No specific description provided.', contentWidth - 6);
            doc.text(splitDesc.slice(0, 3), margin + 3, y + 4.5);

            y += descBoxH + 4;

            // 7. Legal Terms Part 2
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(30, 41, 59);
            const para6 = 'The footage in its entirety remains the property of the owner and Carte Blanche & M-NET cannot share/copy/send the footage to any other news organisations or persons.';
            const split6 = doc.splitTextToSize(para6, contentWidth);
            doc.text(split6, margin, y);
            y += split6.length * 3.6 + 3;

            // 8. Execution Sections (THE OWNER & THE PRODUCER)
            const colWidth = (contentWidth - 14) / 2;
            const ownerColX = margin;
            const prodColX = margin + colWidth + 14;

            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.4);
            doc.line(margin, y, pageWidth - margin, y);
            y += 4.5;

            // Headings
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(0, 143, 190);
            doc.text('THE OWNER', ownerColX, y);
            doc.text('THE PRODUCER', prodColX, y);

            y += 4.5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);

            // Signed at
            doc.text(`Signed at: ${ownerPlace || '________________________'}`, ownerColX, y);
            doc.text(`Signed at: ${prodPlace || '________________________'}`, prodColX, y);

            y += 4;
            // Date
            doc.text(`Date: ${ownerDate || '________________________'}`, ownerColX, y);
            doc.text(`Date: ${prodDate || '________________________'}`, prodColX, y);

            y += 4;
            // Signatures
            doc.setFont('helvetica', 'bold');
            doc.text('Owner Signature:', ownerColX, y);
            doc.text('Producer Signature:', prodColX, y);

            // Images / Placeholder
            if (contributorSigImg) {
                try {
                    doc.addImage(contributorSigImg, 'PNG', ownerColX, y + 2, colWidth - 5, 18, undefined, 'FAST');
                } catch (e) {
                    console.warn('[PDF] Failed to add owner signature image:', e);
                }
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 116, 139);
                doc.text('[Awaiting Owner Signature]', ownerColX, y + 9);
                doc.setTextColor(15, 23, 42);
            }

            if (producerSigImg) {
                try {
                    doc.addImage(producerSigImg, 'PNG', prodColX, y + 2, colWidth - 5, 18, undefined, 'FAST');
                } catch (e) {
                    console.warn('[PDF] Failed to add producer signature image:', e);
                }
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 116, 139);
                doc.text('[Awaiting Producer Counter-Signature]', prodColX, y + 9);
                doc.setTextColor(15, 23, 42);
            }

            // Signed by note under producer column
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text(`Producer: ${resolvedProdName}`, prodColX, y + 22);

            // Footer note
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('Combined Artists CC & Electronic Media Network Limited (M-Net)  •  Form Ref: CB-FA-2026', margin, pageHeight - 7);

            return doc.output('blob');
        } catch (fatalErr) {
            console.error('[PDF] Error in primary PDF generation, building fallback:', fatalErr);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            doc.setFontSize(16);
            doc.text('FOOTAGE AGREEMENT', 20, 20);
            doc.setFontSize(10);
            doc.text(`Owner: ${footageOwnerNameInput?.value || 'N/A'}`, 20, 35);
            doc.text(`Company: ${footageOwnerCompanyInput?.value || 'N/A'}`, 20, 45);
            doc.text(`Story Title: ${storyTitleInput?.value || 'N/A'}`, 20, 55);
            doc.text(`Commission: ${commissionNumberInput?.value || 'N/A'}`, 20, 65);
            if (contributorSigImg) {
                try { doc.addImage(contributorSigImg, 'PNG', 20, 75, 70, 20, undefined, 'FAST'); } catch (e) {}
            }
            if (producerSigImg) {
                try { doc.addImage(producerSigImg, 'PNG', 115, 75, 70, 20, undefined, 'FAST'); } catch (e) {}
            }
            return doc.output('blob');
        }
    }

    // Expose PDF generator globally
    window.generateFormPDF = buildDualPdf;

    // -------------------------------------------------------------------------
    // 6. onSubmissionLoaded (For countersign mode)
    // -------------------------------------------------------------------------
    function onSubmissionLoaded(sub) {
        if (!sub) return;

        const ownerName = sub.footageOwnerName || sub.licensorName || sub.ownerName || sub.fullName || sub.contributorName || '';
        if (footageOwnerNameInput) footageOwnerNameInput.value = ownerName;

        const ownerCompany = sub.footageOwnerCompany || sub.licensorEntity || '';
        if (footageOwnerCompanyInput) footageOwnerCompanyInput.value = ownerCompany;

        const story = sub.storyTitle || sub.storyName || '';
        if (storyTitleInput) storyTitleInput.value = story;

        const comm = sub.commissionNumber || sub.commNum || '';
        if (commissionNumberInput) commissionNumberInput.value = comm;

        const bcast = sub.broadcastDate || sub.broadcastDated || '';
        if (broadcastDateInput) broadcastDateInput.value = bcast;
        if (broadcastDatedInput) broadcastDatedInput.value = bcast;

        const desc = sub.footageDescription || '';
        if (footageDescInput) footageDescInput.value = desc;

        const ownerSignedAt = sub.ownerSignedAt || sub.signedAt || '';
        if (ownerSignedAtInput) ownerSignedAtInput.value = ownerSignedAt;

        const ownerSignedDate = sub.ownerSignedDate || sub.signedDate || '';
        if (ownerSignedDateEl && ownerSignedDate) ownerSignedDateEl.value = ownerSignedDate;

        syncLegacyFields();
    }

    // -------------------------------------------------------------------------
    // 7. Initialize Universal Dual-Sign Flow
    // -------------------------------------------------------------------------
    if (window.countersignFlow) {
        window.countersignFlow.initDualSigning({
            formId: 'footageAgreementForm',
            formType: 'footage_agreement',
            formTitle: 'Footage Agreement',
            contributorSigCanvasId: 'signatureCanvas',
            contributorClearBtnId: 'clearSigBtn',
            contributorSigLabel: 'Owner Signature',
            onSubmissionLoaded,
            buildDualPdf,
            standardSubmitEndpoint: '/api/send-footage-release-agreement'
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFootageAgreement);
} else {
    initFootageAgreement();
}
