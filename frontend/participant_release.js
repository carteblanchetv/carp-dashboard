// participant_release.js - Carte Blanche Participant Release Form Handler
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const clearBtn = document.getElementById('clearSigBtn');
    const form = document.getElementById('participantReleaseForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let drawing = false;
    let sigMethod = 'draw';

    const tabDraw = document.getElementById('tabDraw');
    const tabType = document.getElementById('tabType');
    const typeSignatureControls = document.getElementById('typeSignatureControls');
    const typeSigInput = document.getElementById('typeSigInput');
    const typeSigFont = document.getElementById('typeSigFont');

    // 1. Participant Signature Draw / Type Switching
    if (tabDraw && tabType && canvas) {
        tabDraw.addEventListener('click', () => {
            sigMethod = 'draw';
            tabDraw.classList.add('active');
            tabType.classList.remove('active');
            if (typeSignatureControls) typeSignatureControls.style.display = 'none';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.pointerEvents = 'auto';
        });

        tabType.addEventListener('click', () => {
            sigMethod = 'type';
            tabType.classList.add('active');
            tabDraw.classList.remove('active');
            if (typeSignatureControls) typeSignatureControls.style.display = 'block';
            canvas.style.pointerEvents = 'none';
            if (!typeSigInput.value) {
                const nameVal = document.getElementById('participantName')?.value || '';
                if (nameVal) typeSigInput.value = nameVal;
            }
            renderTypedSignature();
        });
    }

    function renderTypedSignature() {
        if (!canvas || !ctx || !typeSigInput) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const text = typeSigInput.value.trim();
        if (!text) return;

        const font = typeSigFont ? typeSigFont.value : 'Caveat';
        ctx.font = `italic 40px "${font}", cursive`;
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    if (typeSigInput) typeSigInput.addEventListener('input', renderTypedSignature);
    if (typeSigFont) typeSigFont.addEventListener('change', renderTypedSignature);

    // Canvas drawing pos helper
    function getMousePos(canvasDom, touchOrMouseEvent) {
        const rect = canvasDom.getBoundingClientRect();
        const clientX = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientX : touchOrMouseEvent.clientX;
        const clientY = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientY : touchOrMouseEvent.clientY;
        return {
            x: (clientX - rect.left) * (canvasDom.width / rect.width),
            y: (clientY - rect.top) * (canvasDom.height / rect.height)
        };
    }

    if (canvas && ctx) {
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
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#000000';
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
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#000000';
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }, { passive: false });

        canvas.addEventListener('touchend', () => drawing = false);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (sigMethod === 'draw') {
                if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
            } else {
                if (typeSigInput) typeSigInput.value = '';
                renderTypedSignature();
            }
        });
    }

    // 2. Field Bi-Directional Synchronizer
    function syncFields(el1Id, el2Id) {
        const el1 = document.getElementById(el1Id);
        const el2 = document.getElementById(el2Id);
        if (!el1 || !el2) return;
        el1.addEventListener('input', () => { el2.value = el1.value; });
        el2.addEventListener('input', () => { el1.value = el2.value; });
    }
    syncFields('participantName', 'fullName');
    syncFields('storyTitle', 'storyName');
    syncFields('contactNumber', 'phone');
    syncFields('participantSignedAt', 'signedAt');
    syncFields('participantSignedDate', 'signedDate');
    syncFields('producerName', 'prodSignerName');

    // 3. Resolve and Auto-fill Active User Name & Surname into Producer field
    function resolveActiveProducerName() {
        // A. From URL Parameters
        const urlParams = new URLSearchParams(window.location.search);
        const urlProd = (urlParams.get('producer') || urlParams.get('producerName') || '').trim();
        if (urlProd) return urlProd;

        // B. From Auth State
        if (window.auth && typeof window.auth.getCurrentUser === 'function') {
            const u = window.auth.getCurrentUser();
            if (u) {
                const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.displayName || '';
                if (name && !name.includes('@')) return name;
            }
        }

        // C. From Local Storage Cache
        try {
            const profileKey = Object.keys(localStorage).find(k => k.startsWith('user_profile_') && k.includes('@'));
            if (profileKey) {
                const parsed = JSON.parse(localStorage.getItem(profileKey) || '{}');
                const name = `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || parsed.displayName || parsed.name || '';
                if (name && !name.includes('@')) return name;
            }
            const cached = localStorage.getItem('user_profile_cache') || sessionStorage.getItem('cb_user_profile');
            if (cached) {
                const parsed = JSON.parse(cached);
                const name = `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || parsed.displayName || parsed.name || '';
                if (name && !name.includes('@')) return name;
            }
        } catch (e) {}

        return '';
    }

    function applyActiveUserProducer() {
        const prodInput = document.getElementById('producerName');
        const hiddenProd = document.getElementById('prodSignerName');
        if (!prodInput) return;
        const name = resolveActiveProducerName();
        if (name && (!prodInput.value || prodInput.value === 'Producer')) {
            prodInput.value = name;
            if (hiddenProd) hiddenProd.value = name;
        }
    }
    applyActiveUserProducer();

    // Re-check when auth resolves asynchronously
    if (window.auth && typeof window.auth.checkAuth === 'function') {
        window.auth.checkAuth(false).then(u => {
            if (u) {
                const n = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.displayName || '';
                const prodInput = document.getElementById('producerName');
                if (prodInput && (!prodInput.value || prodInput.value.trim() === '') && n && !n.includes('@')) {
                    prodInput.value = n;
                    const hiddenProd = document.getElementById('prodSignerName');
                    if (hiddenProd) hiddenProd.value = n;
                }
            }
        }).catch(() => {});
    }

    // 4. Auto-fill Today's Date
    const todayFormatted = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const partDateEl = document.getElementById('participantSignedDate');
    if (partDateEl && !partDateEl.value) {
        partDateEl.value = todayFormatted;
        const aliasSignDate = document.getElementById('signedDate');
        if (aliasSignDate) aliasSignDate.value = todayFormatted;
    }
    const prodDateEl = document.getElementById('producerSignedDate');
    if (prodDateEl && !prodDateEl.value) {
        prodDateEl.value = todayFormatted;
    }

    // 5. Pre-fill URL Context (Commission #, Story Title, Participant Name)
    const urlParams = new URLSearchParams(window.location.search);
    const commParam = urlParams.get('comm') || urlParams.get('commission') || urlParams.get('commissionNumber') || '';
    const storyParam = urlParams.get('story') || urlParams.get('storyTitle') || urlParams.get('storyName') || '';
    const nameParam = urlParams.get('name') || urlParams.get('participantName') || urlParams.get('fullName') || '';

    if (commParam && document.getElementById('commissionNumber')) {
        document.getElementById('commissionNumber').value = commParam;
    }
    if (storyParam) {
        if (document.getElementById('storyTitle')) document.getElementById('storyTitle').value = storyParam;
        if (document.getElementById('storyName')) document.getElementById('storyName').value = storyParam;
    }
    if (nameParam) {
        if (document.getElementById('participantName')) document.getElementById('participantName').value = nameParam;
        if (document.getElementById('fullName')) document.getElementById('fullName').value = nameParam;
    }

    // 6. Dual PDF Generation matching EXACT requested specification
    async function buildDualPdf({ contributorSigImg, producerSigImg, producerName, isCountersignMode }) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 18;
        const contentW = pageWidth - margin * 2; // 174mm

        const commissionNumber = (document.getElementById('commissionNumber')?.value || '').trim();
        const storyTitle = (document.getElementById('storyTitle')?.value || document.getElementById('storyName')?.value || '').trim();
        const resolvedProd = (document.getElementById('producerName')?.value || producerName || '').trim();
        const participant = (document.getElementById('participantName')?.value || document.getElementById('fullName')?.value || '').trim();
        const idNumber = (document.getElementById('idNumber')?.value || '').trim();
        const contactNumber = (document.getElementById('contactNumber')?.value || document.getElementById('phone')?.value || '').trim();

        const participantSignedAt = (document.getElementById('participantSignedAt')?.value || document.getElementById('signedAt')?.value || '').trim();
        const participantSignedDate = (document.getElementById('participantSignedDate')?.value || document.getElementById('signedDate')?.value || todayFormatted).trim();
        const producerSignedAt = (document.getElementById('producerSignedAt')?.value || '').trim();
        const producerSignedDate = (document.getElementById('producerSignedDate')?.value || todayFormatted).trim();

        // 0. Top Header Status Note
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        if (producerSigImg) {
            doc.text('OFFICIALLY EXECUTED RELEASE AGREEMENT', pageWidth / 2, 7.5, { align: 'center' });
        } else {
            doc.text('PARTICIPANT SIGNED • PENDING PRODUCER COUNTERSIGNATURE', pageWidth / 2, 7.5, { align: 'center' });
        }

        // 1. Logos
        try {
            let caLogo = null;
            try { if (typeof getBlackLogo === 'function') caLogo = getBlackLogo(); } catch (e) {}
            if (!caLogo && typeof CAP_LOGO_B64 !== 'undefined') caLogo = CAP_LOGO_B64;
            if (caLogo) {
                const props = doc.getImageProperties(caLogo);
                const caWidth = 34;
                const caHeight = caWidth * (props.height / props.width);
                doc.addImage(caLogo, 'PNG', margin, 11, caWidth, caHeight, undefined, 'FAST');
            }
        } catch (e) {}

        try {
            if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
                const props = doc.getImageProperties(CB_LOGO_B64);
                const cbWidth = 20;
                const cbHeight = cbWidth * (props.height / props.width);
                doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - cbWidth, 10, cbWidth, cbHeight, undefined, 'FAST');
            }
        } catch (e) {}

        // 2. Title: PARTICIPANT RELEASE FORM
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('PARTICIPANT RELEASE FORM', margin, 32);

        doc.setDrawColor(0, 143, 190);
        doc.setLineWidth(0.7);
        doc.line(margin, 35, pageWidth - margin, 35);

        // 3. Top Fields: Section 1 (Production Details) & Section 2 (Participant Details)
        doc.setFontSize(9);
        const col1X = margin;
        const col2X = margin + (contentW / 2) + 4;
        const rowH = 6;
        let currY = 40.5;

        // Story & Production Details
        // Row 1: Commission Number | Story Title
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Commission Number:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(commissionNumber || 'N/A', col1X + 37, currY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Story Title:', col2X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(storyTitle || 'N/A', col2X + 22, currY);

        // Row 2: Producer
        currY += rowH;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Producer:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(resolvedProd || 'N/A', col1X + 37, currY);

        // Divider between Production Details and Participant Info
        currY += 4.5;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, currY, pageWidth - margin, currY);

        // PARTICIPANT INFO
        currY += 5.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 143, 190);
        doc.text('PARTICIPANT INFO', col1X, currY);
        currY += 5;

        // Row 3: Participant
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Participant:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(participant || 'N/A', col1X + 37, currY);

        // Row 4: ID Number | Contact Number
        currY += rowH;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('ID Number:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(idNumber || 'N/A', col1X + 37, currY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Contact Number:', col2X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(contactNumber || 'N/A', col2X + 28, currY);

        // Divider between Section 2 and Legal Copy
        currY += 4.5;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, currY, pageWidth - margin, currY);

        // 4. Exact Legal Copy
        currY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text('I, the undersigned, give my consent to Electronic Media Network Limited (M-Net):', margin, currY);

        currY += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);

        const b1 = 'to film my image and record my voice in an interview on camera ("the recording")';
        doc.setFont('helvetica', 'bold');
        doc.text('1.', margin + 1, currY);
        doc.setFont('helvetica', 'normal');
        let split = doc.splitTextToSize(b1, contentW - 7);
        doc.text(split, margin + 7, currY);
        currY += split.length * 4.2 + 2;

        const b2 = 'to broadcast the recording on the current affairs and actuality programme called Carte Blanche - on any platform M-Net uses, including on television, social media and the internet.';
        doc.setFont('helvetica', 'bold');
        doc.text('2.', margin + 1, currY);
        doc.setFont('helvetica', 'normal');
        split = doc.splitTextToSize(b2, contentW - 7);
        doc.text(split, margin + 7, currY);
        currY += split.length * 4.2 + 2;

        const b3 = 'to use the recording in any advertisements or promotional material for Carte Blanche or M-Net, and to store the recording for as long as M-Net and/or Carte Blanche needs to. I acknowledge that I have been informed that any statements I make and any information I provide during my interview done by the producers of Carte Blanche - including special information as defined under the Protection of Personal Information Act, 2013, whether it is of a private nature - may be processed by Carte Blanche for production purposes and broadcast on Carte Blanche.';
        doc.setFont('helvetica', 'bold');
        doc.text('3.', margin + 1, currY);
        doc.setFont('helvetica', 'normal');
        split = doc.splitTextToSize(b3, contentW - 7);
        doc.text(split, margin + 7, currY);
        currY += split.length * 4.2 + 3;

        const p1 = 'I agree that the recording may be edited/shortened by the producers of Carte Blanche or M-Net in the way the producers deem appropriate and fair.';
        split = doc.splitTextToSize(p1, contentW);
        doc.text(split, margin, currY);
        currY += split.length * 4.2 + 2.5;

        const p2 = 'I agree to give M-Net any intellectual property rights and copyright that may be attached to the recording of my participation in Carte Blanche.';
        split = doc.splitTextToSize(p2, contentW);
        doc.text(split, margin, currY);
        currY += split.length * 4.2 + 4;

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, currY, pageWidth - margin, currY);
        currY += 5;

        // 5. Execution Sections: THE PARTICIPANT & THE PRODUCER
        const sigColW = (contentW - 8) / 2;
        const partX = margin;
        const prodX = margin + sigColW + 8;

        // Headings
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(0, 143, 190);
        doc.text('THE PARTICIPANT', partX, currY);
        doc.text('THE PRODUCER', prodX, currY);

        currY += 5.5;

        // Signed at
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'bold');
        doc.text('Signed at:', partX, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(participantSignedAt || '___________________', partX + 18, currY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Signed at:', prodX, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(producerSignedAt || '___________________', prodX + 18, currY);

        currY += 5.5;

        // Date
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Date:', partX, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(participantSignedDate || todayFormatted, partX + 18, currY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Date:', prodX, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(producerSignedDate || todayFormatted, prodX + 18, currY);

        currY += 6;

        // Signature labels
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Participant Signature:', partX, currY);
        doc.text('Producer Signature:', prodX, currY);

        currY += 2;

        // Participant Signature Image
        if (contributorSigImg) {
            try {
                doc.addImage(contributorSigImg, 'PNG', partX, currY, Math.min(sigColW, 65), 20, undefined, 'FAST');
            } catch (sigErr) {
                console.warn('[PDF] Could not add participant signature image:', sigErr);
            }
        }

        // Producer Signature Image
        if (producerSigImg) {
            try {
                doc.addImage(producerSigImg, 'PNG', prodX, currY, Math.min(sigColW, 65), 20, undefined, 'FAST');
            } catch (sigErr) {
                console.warn('[PDF] Could not add producer signature image:', sigErr);
            }
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('[Pending Producer Counter-Signature]', prodX, currY + 10);
        }

        // Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Form Ref: CB-PRF-2026 • Carte Blanche & M-Net Official Release Form', margin, 287);

        return doc.output('blob');
    }

    // 7. Populating loaded submission in countersign mode
    function onSubmissionLoaded(sub) {
        const pName = sub.participantName || sub.participant || sub.fullName || sub.contributorName || '';
        if (document.getElementById('participantName')) document.getElementById('participantName').value = pName;
        if (document.getElementById('fullName')) document.getElementById('fullName').value = pName;

        if (document.getElementById('idNumber')) document.getElementById('idNumber').value = sub.idNumber || '';

        const phoneVal = sub.contactNumber || sub.phone || '';
        if (document.getElementById('contactNumber')) document.getElementById('contactNumber').value = phoneVal;
        if (document.getElementById('phone')) document.getElementById('phone').value = phoneVal;

        if (document.getElementById('email')) document.getElementById('email').value = sub.email || '';

        const sTitle = sub.storyTitle || sub.storyName || '';
        if (document.getElementById('storyTitle')) document.getElementById('storyTitle').value = sTitle;
        if (document.getElementById('storyName')) document.getElementById('storyName').value = sTitle;

        if (document.getElementById('commissionNumber') && sub.commissionNumber) {
            document.getElementById('commissionNumber').value = sub.commissionNumber;
        }

        const prod = sub.producerName || '';
        if (document.getElementById('producerName') && prod) document.getElementById('producerName').value = prod;
        if (document.getElementById('prodSignerName') && prod) document.getElementById('prodSignerName').value = prod;

        if (document.getElementById('participantSignedAt')) {
            document.getElementById('participantSignedAt').value = sub.participantSignedAt || sub.signedAt || '';
        }
        if (document.getElementById('participantSignedDate')) {
            document.getElementById('participantSignedDate').value = sub.participantSignedDate || sub.signedDate || todayFormatted;
        }
        if (document.getElementById('producerSignedAt') && sub.producerSignedAt) {
            document.getElementById('producerSignedAt').value = sub.producerSignedAt;
        }
        if (document.getElementById('producerSignedDate') && sub.producerSignedDate) {
            document.getElementById('producerSignedDate').value = sub.producerSignedDate;
        }
    }

    // 8. Initialize Universal Dual Signing Flow
    if (window.countersignFlow) {
        window.countersignFlow.initDualSigning({
            formId: 'participantReleaseForm',
            formType: 'participant_release',
            formTitle: 'Participant Release Form',
            contributorSigCanvasId: 'signatureCanvas',
            contributorClearBtnId: 'clearSigBtn',
            contributorSigLabel: 'Participant Signature',
            onSubmissionLoaded,
            buildDualPdf,
            standardSubmitEndpoint: '/api/send-participant-release'
        });
    }
});
