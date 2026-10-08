// music_agreement.js - v5.3.3
function initMusicAgreement() {
    // -------------------------------------------------------------------------
    // 1. Elements & Canvas Setup (Owner & Producer Signatures)
    // -------------------------------------------------------------------------
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearSigBtn');
    const form = document.getElementById('musicAgreementForm');
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
            const nameVal = document.getElementById('musicOwnerName')?.value || '';
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
            console.warn('[MUSIC-FORM] Could not resolve active user name:', e);
        }
        return '';
    }

    const prodNameInput = document.getElementById('producerName');
    if (prodNameInput && !prodNameInput.value) {
        const activeName = getActiveProducerName();
        if (activeName) prodNameInput.value = activeName;
    }

    // -------------------------------------------------------------------------
    // 3. Dynamic Tracks List (<Add another track>)
    // -------------------------------------------------------------------------
    const tracksContainer = document.getElementById('tracksContainer');
    const addTrackBtn = document.getElementById('addTrackBtn');

    if (addTrackBtn && tracksContainer) {
        addTrackBtn.addEventListener('click', () => {
            const trackRows = tracksContainer.querySelectorAll('.track-row');
            const newIndex = trackRows.length + 1;

            const newRow = document.createElement('div');
            newRow.className = 'track-row';
            newRow.dataset.index = newIndex;
            newRow.innerHTML = `
                <div class="form-group">
                    <label>Music Track Title:</label>
                    <input type="text" name="musicTrackTitle[]" class="track-title-input" placeholder="Enter additional music track title...">
                </div>
                <button type="button" class="remove-track-btn" title="Remove track">🗑️</button>
            `;

            newRow.querySelector('.remove-track-btn').addEventListener('click', () => {
                newRow.remove();
                syncLegacyFields();
            });

            newRow.querySelector('input').addEventListener('input', syncLegacyFields);

            tracksContainer.appendChild(newRow);
            newRow.querySelector('input').focus();
            syncLegacyFields();
        });
    }

    // -------------------------------------------------------------------------
    // 4. Bi-directional Synchronization with Legacy / Alias Fields
    // -------------------------------------------------------------------------
    const musicOwnerNameInput = document.getElementById('musicOwnerName');
    const musicOwnerCompanyInput = document.getElementById('musicOwnerCompany');
    const storyTitleInput = document.getElementById('storyTitle');
    const commissionNumberInput = document.getElementById('commissionNumber');
    const ownerSignedAtInput = document.getElementById('ownerSignedAt');

    const artistNameAlias = document.getElementById('artistName');
    const publisherNameAlias = document.getElementById('publisherName');
    const fullNameAlias = document.getElementById('fullName');
    const storyNameAlias = document.getElementById('storyName');
    const trackTitleAlias = document.getElementById('trackTitle');
    const signedAtAlias = document.getElementById('signedAt');
    const signedDateAlias = document.getElementById('signedDate');

    function syncLegacyFields() {
        const ownerVal = (musicOwnerNameInput?.value || '').trim();
        if (artistNameAlias) artistNameAlias.value = ownerVal;
        if (fullNameAlias) fullNameAlias.value = ownerVal;

        const companyVal = (musicOwnerCompanyInput?.value || '').trim();
        if (publisherNameAlias) publisherNameAlias.value = companyVal;

        const storyVal = (storyTitleInput?.value || '').trim();
        if (storyNameAlias) storyNameAlias.value = storyVal;

        const signedAtVal = (ownerSignedAtInput?.value || '').trim();
        if (signedAtAlias) signedAtAlias.value = signedAtVal;

        const signedDateVal = (ownerSignedDateEl?.value || '').trim();
        if (signedDateAlias) signedDateAlias.value = signedDateVal;

        // Collect all track inputs
        const trackInputs = document.querySelectorAll('input[name="musicTrackTitle[]"], input[name="musicTrackTitle"], input[name="trackTitle"]');
        const tracks = Array.from(trackInputs).map(inp => inp.value.trim()).filter(Boolean);
        if (trackTitleAlias) {
            trackTitleAlias.value = tracks.join(', ');
        }
    }

    [musicOwnerNameInput, musicOwnerCompanyInput, storyTitleInput, commissionNumberInput, broadcastDateInput, ownerSignedAtInput].forEach(inp => {
        if (inp) inp.addEventListener('input', syncLegacyFields);
    });

    const firstTrackInp = document.querySelector('input[name="musicTrackTitle[]"]');
    if (firstTrackInp) firstTrackInp.addEventListener('input', syncLegacyFields);

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

            const ownerName = (musicOwnerNameInput?.value || artistNameAlias?.value || '').trim();
            const ownerCompany = (musicOwnerCompanyInput?.value || publisherNameAlias?.value || '').trim();
            const story = (storyTitleInput?.value || storyNameAlias?.value || '').trim();
            const commNum = (commissionNumberInput?.value || '').trim();
            const broadcastDate = (broadcastDateInput?.value || '').trim();
            const ownerPlace = (ownerSignedAtInput?.value || '').trim();
            const ownerDate = (ownerSignedDateEl?.value || todayStr).trim();

            const prodPlace = (document.getElementById('producerSignedAt')?.value || '').trim();
            const prodDate = (prodSignedDateEl?.value || todayStr).trim();
            const resolvedProdName = (producerName || prodNameInput?.value || getActiveProducerName() || 'Producer').trim();

            // Collect track titles
            const trackInputs = document.querySelectorAll('input[name="musicTrackTitle[]"], input[name="musicTrackTitle"], input[name="trackTitle"]');
            const tracks = Array.from(trackInputs).map(inp => inp.value.trim()).filter(Boolean);

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
            doc.setFontSize(16);
            doc.text('MUSIC AGREEMENT', margin, y);

            y += 3;
            doc.setDrawColor(0, 143, 190);
            doc.setLineWidth(0.6);
            doc.line(margin, y, pageWidth - margin, y);

            // 3. Centered Parties Block
            y += 6;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 143, 190);
            doc.text('Music Agreement', pageWidth / 2, y, { align: 'center' });

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
            doc.text(`Music Owner Name & Surname:  ${ownerName || '________________________________________'}`, pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('on behalf of', pageWidth / 2, y, { align: 'center' });

            y += 4.5;
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Music Owner Company:  ${ownerCompany || '________________________________________'}`, pageWidth / 2, y, { align: 'center' });

            y += 4;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('(“the owner”)', pageWidth / 2, y, { align: 'center' });

            // 4. Production & Broadcast Details
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Story Title:  ${story || '___________________________'}`, margin, y);
            doc.text(`Commission Number:  ${commNum || '________________'}`, margin + 90, y);

            y += 5;
            doc.text(`Broadcast Date:  ${broadcastDate || '___________________________'}`, margin, y);

            // 5. Legal Terms Part 1
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(30, 41, 59);

            const para1 = 'The owner hereby gives the producer permission to use portions of the following music compositions (“the music”) in the story titled below to be broadcast on Carte Blanche on M-Net on the date below and on any other MultiChoice platform as M-Net sees fit, in perpetuity.';
            const split1 = doc.splitTextToSize(para1, contentWidth);
            doc.text(split1, margin, y);
            y += split1.length * 4;

            const para2 = 'The producer undertakes to use the music fairly to illustrate issues pertaining to the story.';
            const split2 = doc.splitTextToSize(para2, contentWidth);
            doc.text(split2, margin, y);
            y += split2.length * 4;

            const para3 = 'The producer will not pay the owner for the use of the footage.';
            const split3 = doc.splitTextToSize(para3, contentWidth);
            doc.text(split3, margin, y);
            y += split3.length * 4;

            const para4 = 'The programme in its completed form is the property of M-Net and Carte Blanche.';
            const split4 = doc.splitTextToSize(para4, contentWidth);
            doc.text(split4, margin, y);
            y += split4.length * 4 + 1;

            // 6. Music Track Titles
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0, 143, 190);
            doc.text('Music Track Title:', margin, y);

            y += 4.5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);

            if (tracks.length === 0) {
                doc.text('• ____________________________________________________________________', margin, y);
                y += 5;
            } else {
                tracks.forEach((trk, idx) => {
                    doc.text(`• Track ${idx + 1}:  ${trk}`, margin, y);
                    y += 4.5;
                });
            }

            // 7. Legal Terms Part 2
            y += 2;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(30, 41, 59);

            const para5 = 'The music in its entirety remains the property of the owner and Carte Blanche and M-Net cannot share/copy/send the footage to any other news organisation or persons.';
            const split5 = doc.splitTextToSize(para5, contentWidth);
            doc.text(split5, margin, y);
            y += split5.length * 4 + 4;

            // 8. Execution Sections (THE OWNER & THE PRODUCER)
            const colWidth = (contentWidth - 14) / 2;
            const ownerColX = margin;
            const prodColX = margin + colWidth + 14;

            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.4);
            doc.line(margin, y, pageWidth - margin, y);
            y += 5;

            // Headings
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0, 143, 190);
            doc.text('THE OWNER', ownerColX, y);
            doc.text('THE PRODUCER', prodColX, y);

            y += 5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);

            // Signed at
            doc.text(`Signed at: ${ownerPlace || '________________________'}`, ownerColX, y);
            doc.text(`Signed at: ${prodPlace || '________________________'}`, prodColX, y);

            y += 4.5;
            // Date
            doc.text(`Date: ${ownerDate || '________________________'}`, ownerColX, y);
            doc.text(`Date: ${prodDate || '________________________'}`, prodColX, y);

            y += 4.5;
            // Signatures
            doc.setFont('helvetica', 'bold');
            doc.text('Owner Signature:', ownerColX, y);
            doc.text('Producer Signature:', prodColX, y);

            // Images / Placeholder
            if (contributorSigImg) {
                try {
                    doc.addImage(contributorSigImg, 'PNG', ownerColX, y + 2, colWidth - 5, 20, undefined, 'FAST');
                } catch (e) {
                    console.warn('[PDF] Failed to add owner signature image:', e);
                }
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text('[Awaiting Owner Signature]', ownerColX, y + 10);
                doc.setTextColor(15, 23, 42);
            }

            if (producerSigImg) {
                try {
                    doc.addImage(producerSigImg, 'PNG', prodColX, y + 2, colWidth - 5, 20, undefined, 'FAST');
                } catch (e) {
                    console.warn('[PDF] Failed to add producer signature image:', e);
                }
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text('[Awaiting Producer Counter-Signature]', prodColX, y + 10);
                doc.setTextColor(15, 23, 42);
            }

            // Signed by note under producer column
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text(`Producer: ${resolvedProdName}`, prodColX, y + 24);

            // Footer note
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('Combined Artists CC & Electronic Media Network Limited (M-Net)  •  Form Ref: CB-MA-2026', margin, pageHeight - 8);

            return doc.output('blob');
        } catch (fatalErr) {
            console.error('[PDF] Error in primary PDF generation, building fallback:', fatalErr);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            doc.setFontSize(16);
            doc.text('MUSIC AGREEMENT', 20, 20);
            doc.setFontSize(10);
            doc.text(`Music Owner: ${musicOwnerNameInput?.value || 'N/A'}`, 20, 35);
            doc.text(`Company: ${musicOwnerCompanyInput?.value || 'N/A'}`, 20, 45);
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

    // -------------------------------------------------------------------------
    // 6. onSubmissionLoaded (For countersign mode)
    // -------------------------------------------------------------------------
    function onSubmissionLoaded(sub) {
        if (!sub) return;

        const ownerName = sub.musicOwnerName || sub.artistName || sub.fullName || sub.contributorName || '';
        if (musicOwnerNameInput) musicOwnerNameInput.value = ownerName;

        const ownerCompany = sub.musicOwnerCompany || sub.publisherName || '';
        if (musicOwnerCompanyInput) musicOwnerCompanyInput.value = ownerCompany;

        const story = sub.storyTitle || sub.storyName || '';
        if (storyTitleInput) storyTitleInput.value = story;

        const comm = sub.commissionNumber || sub.commNum || '';
        if (commissionNumberInput) commissionNumberInput.value = comm;

        const bDate = sub.broadcastDate || '';
        if (broadcastDateInput) broadcastDateInput.value = bDate;

        const ownerSignedAt = sub.ownerSignedAt || sub.signedAt || '';
        if (ownerSignedAtInput) ownerSignedAtInput.value = ownerSignedAt;

        const ownerSignedDate = sub.ownerSignedDate || sub.signedDate || '';
        if (ownerSignedDateEl && ownerSignedDate) ownerSignedDateEl.value = ownerSignedDate;

        // Populate track titles if multiple or single
        const tracksStr = sub.musicTracks || sub.trackTitle || sub.musicTrackTitle || '';
        if (tracksStr) {
            const trackList = tracksStr.split(',').map(s => s.trim()).filter(Boolean);
            if (trackList.length > 0 && tracksContainer) {
                // Clear existing
                tracksContainer.innerHTML = '';
                trackList.forEach((trk, idx) => {
                    const row = document.createElement('div');
                    row.className = 'track-row';
                    row.dataset.index = idx + 1;
                    row.innerHTML = `
                        <div class="form-group">
                            <label>Music Track Title:</label>
                            <input type="text" name="musicTrackTitle[]" class="track-title-input" value="${trk.replace(/"/g, '&quot;')}" placeholder="Enter music track title...">
                        </div>
                        ${idx > 0 ? '<button type="button" class="remove-track-btn" title="Remove track">🗑️</button>' : ''}
                    `;
                    if (idx > 0) {
                        row.querySelector('.remove-track-btn').addEventListener('click', () => {
                            row.remove();
                            syncLegacyFields();
                        });
                    }
                    row.querySelector('input').addEventListener('input', syncLegacyFields);
                    tracksContainer.appendChild(row);
                });
            }
        }

        syncLegacyFields();
    }

    // -------------------------------------------------------------------------
    // 7. Initialize Universal Dual-Sign Flow
    // -------------------------------------------------------------------------
    if (window.countersignFlow) {
        window.countersignFlow.initDualSigning({
            formId: 'musicAgreementForm',
            formType: 'music_agreement',
            formTitle: 'Music Agreement',
            contributorSigCanvasId: 'signatureCanvas',
            contributorClearBtnId: 'clearSigBtn',
            contributorSigLabel: 'Owner Signature',
            onSubmissionLoaded,
            buildDualPdf,
            standardSubmitEndpoint: '/api/send-music-agreement'
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicAgreement);
} else {
    initMusicAgreement();
}
