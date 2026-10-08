// minor_release.js - Carte Blanche Minor Release Form Handler
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const clearBtn = document.getElementById('clearSigBtn');
    const form = document.getElementById('minorReleaseForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let drawing = false;
    let sigMethod = 'draw';

    const tabDraw = document.getElementById('tabDraw');
    const tabType = document.getElementById('tabType');
    const typeSignatureControls = document.getElementById('typeSignatureControls');
    const typeSigInput = document.getElementById('typeSigInput');
    const typeSigFont = document.getElementById('typeSigFont');

    // 1. Parent/Guardian Signature Draw / Type Switching
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
                const nameVal = document.getElementById('parentName')?.value || '';
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

    // Canvas coordinate helper
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
    syncFields('childName', 'minorName');
    syncFields('parentName', 'guardianName');
    syncFields('parentName', 'fullName');
    syncFields('parentIdNumber', 'guardianId');
    syncFields('storyTitle', 'storyName');
    syncFields('parentSignedAt', 'signedAt');
    syncFields('parentSignedDate', 'signedDate');
    syncFields('producerName', 'prodSignerName');

    // 3. Resolve and Auto-fill Active User Name & Surname into Producer field
    function resolveActiveProducerName() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlProd = (urlParams.get('producer') || urlParams.get('producerName') || '').trim();
        if (urlProd) return urlProd;

        if (window.auth && typeof window.auth.getCurrentUser === 'function') {
            const u = window.auth.getCurrentUser();
            if (u) {
                const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.displayName || '';
                if (name && !name.includes('@')) return name;
            }
        }

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
    const todayFormatted = new Date().toISOString().split('T')[0];
    const parentDateEl = document.getElementById('parentSignedDate');
    if (parentDateEl && !parentDateEl.value) {
        parentDateEl.value = todayFormatted;
        const aliasSignDate = document.getElementById('signedDate');
        if (aliasSignDate) aliasSignDate.value = todayFormatted;
    }
    const prodDateEl = document.getElementById('producerSignedDate');
    if (prodDateEl && !prodDateEl.value) {
        prodDateEl.value = todayFormatted;
    }

    // 5. Pre-fill URL Context (Commission #, Story Title, Names)
    const urlParams = new URLSearchParams(window.location.search);
    const commParam = urlParams.get('comm') || urlParams.get('commission') || urlParams.get('commissionNumber') || '';
    const storyParam = urlParams.get('story') || urlParams.get('storyTitle') || urlParams.get('storyName') || '';
    const childParam = urlParams.get('child') || urlParams.get('childName') || urlParams.get('minorName') || '';
    const parentParam = urlParams.get('parent') || urlParams.get('parentName') || urlParams.get('guardianName') || urlParams.get('name') || '';

    if (commParam && document.getElementById('commissionNumber')) {
        document.getElementById('commissionNumber').value = commParam;
    }
    if (storyParam) {
        if (document.getElementById('storyTitle')) document.getElementById('storyTitle').value = storyParam;
        if (document.getElementById('storyName')) document.getElementById('storyName').value = storyParam;
    }
    if (childParam) {
        if (document.getElementById('childName')) document.getElementById('childName').value = childParam;
        if (document.getElementById('minorName')) document.getElementById('minorName').value = childParam;
    }
    if (parentParam) {
        if (document.getElementById('parentName')) document.getElementById('parentName').value = parentParam;
        if (document.getElementById('guardianName')) document.getElementById('guardianName').value = parentParam;
        if (document.getElementById('fullName')) document.getElementById('fullName').value = parentParam;
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

        const childName = (document.getElementById('childName')?.value || document.getElementById('minorName')?.value || '').trim();
        const parentName = (document.getElementById('parentName')?.value || document.getElementById('guardianName')?.value || '').trim();
        const parentIdNumber = (document.getElementById('parentIdNumber')?.value || document.getElementById('guardianId')?.value || '').trim();

        const parentSignedAt = (document.getElementById('parentSignedAt')?.value || document.getElementById('signedAt')?.value || '').trim();
        const parentSignedDate = (document.getElementById('parentSignedDate')?.value || document.getElementById('signedDate')?.value || todayFormatted).trim();
        const producerSignedAt = (document.getElementById('producerSignedAt')?.value || '').trim();
        const producerSignedDate = (document.getElementById('producerSignedDate')?.value || todayFormatted).trim();

        // 0. Top Header Status Note
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        if (producerSigImg) {
            doc.text('OFFICIALLY EXECUTED RELEASE AGREEMENT', pageWidth / 2, 7.5, { align: 'center' });
        } else {
            doc.text('PARENT/GUARDIAN SIGNED • PENDING PRODUCER COUNTERSIGNATURE', pageWidth / 2, 7.5, { align: 'center' });
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

        // 2. Title: MINOR RELEASE FORM
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('MINOR RELEASE FORM', margin, 32);

        doc.setDrawColor(0, 143, 190);
        doc.setLineWidth(0.7);
        doc.line(margin, 35, pageWidth - margin, 35);

        // 3. Top Production Details
        doc.setFontSize(9);
        const col1X = margin;
        const col2X = margin + (contentW / 2) + 4;
        let currY = 41.5;

        // Row 1: Commission Number | Story Title
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

        // Row 2: Producer Name
        currY += 6.2;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Producer Name:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(resolvedProd || 'N/A', col1X + 37, currY);

        // Divider
        currY += 5;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, currY, pageWidth - margin, currY);

        // 4. Exact Legal Copy
        currY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(15, 23, 42);
        const intro = 'As the parent or legal guardian of the child named below, I hereby give my permission for my child to be interviewed and recorded by Electronic Media Network Limited (M-Net). I understand that:';
        let split = doc.splitTextToSize(intro, contentW);
        doc.text(split, margin, currY);
        currY += split.length * 4.1 + 2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);

        const b1 = 'My child may be filmed and their voice recorded on camera ("the recording").';
        doc.setFont('helvetica', 'bold');
        doc.text('1.', margin + 1, currY);
        doc.setFont('helvetica', 'normal');
        split = doc.splitTextToSize(b1, contentW - 7);
        doc.text(split, margin + 7, currY);
        currY += split.length * 4.1 + 2;

        const b2 = 'The recording may be used in any advertisements or promotional material for Carte Blanche or M-Net.';
        doc.setFont('helvetica', 'bold');
        doc.text('2.', margin + 1, currY);
        doc.setFont('helvetica', 'normal');
        split = doc.splitTextToSize(b2, contentW - 7);
        doc.text(split, margin + 7, currY);
        currY += split.length * 4.1 + 2;

        const b3 = 'The recording may be stored for as long as M-Net and/or Carte Blanche deems necessary.';
        doc.setFont('helvetica', 'bold');
        doc.text('3.', margin + 1, currY);
        doc.setFont('helvetica', 'normal');
        split = doc.splitTextToSize(b3, contentW - 7);
        doc.text(split, margin + 7, currY);
        currY += split.length * 4.1 + 3;

        const p1 = 'I am aware that any statements my child makes and any information they provide during the interview — including special personal information as defined under the Protection of Personal Information Act, 2013 — may be processed by Carte Blanche for production purposes and may be broadcast on Carte Blanche.';
        split = doc.splitTextToSize(p1, contentW);
        doc.text(split, margin, currY);
        currY += split.length * 4.1 + 2.5;

        const p2 = 'I understand that the producers of Carte Blanche or M-Net may edit or shorten the recording in a manner they consider appropriate and fair.';
        split = doc.splitTextToSize(p2, contentW);
        doc.text(split, margin, currY);
        currY += split.length * 4.1 + 2.5;

        const p3 = 'Furthermore, I grant M-Net any intellectual property rights and copyright attached to the recording of my child\'s participation in Carte Blanche.';
        split = doc.splitTextToSize(p3, contentW);
        doc.text(split, margin, currY);
        currY += split.length * 4.1 + 3.5;

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, currY, pageWidth - margin, currY);
        currY += 5;

        // 5. Child & Parent/Guardian Details
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Child Name & Surname:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(childName || 'N/A', col1X + 44, currY);

        currY += 6.2;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Parent/Guardian Name & Surname:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(parentName || 'N/A', col1X + 60, currY);

        currY += 6.2;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Parent/Guardian ID Number:', col1X, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(parentIdNumber || 'N/A', col1X + 54, currY);

        // Divider
        currY += 5;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, currY, pageWidth - margin, currY);
        currY += 5;

        // 6. Execution Sections: THE PARENT/GUARDIAN & THE PRODUCER
        const sigColW = (contentW - 8) / 2;
        const parentX = margin;
        const prodX = margin + sigColW + 8;

        // Headings
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(0, 143, 190);
        doc.text('THE PARENT/GUARDIAN', parentX, currY);
        doc.text('THE PRODUCER', prodX, currY);

        currY += 5.5;

        // Signed at
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'bold');
        doc.text('Signed at:', parentX, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(parentSignedAt || '___________________', parentX + 18, currY);

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
        doc.text('Date:', parentX, currY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(parentSignedDate || todayFormatted, parentX + 18, currY);

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
        doc.text('Parent/Guardian Signature:', parentX, currY);
        doc.text('Producer Signature:', prodX, currY);

        currY += 2;

        // Parent/Guardian Signature Image
        if (contributorSigImg) {
            try {
                doc.addImage(contributorSigImg, 'PNG', parentX, currY, Math.min(sigColW, 65), 20, undefined, 'FAST');
            } catch (sigErr) {
                console.warn('[PDF] Could not add parent signature image:', sigErr);
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
        doc.text('Form Ref: CB-MRF-2026 • Carte Blanche & M-Net Official Release Form', margin, 287);

        return doc.output('blob');
    }

    // 7. Populating loaded submission in countersign mode
    function onSubmissionLoaded(sub) {
        const cName = sub.childName || sub.minorName || '';
        if (document.getElementById('childName')) document.getElementById('childName').value = cName;
        if (document.getElementById('minorName')) document.getElementById('minorName').value = cName;

        const pName = sub.parentName || sub.guardianName || sub.fullName || sub.contributorName || '';
        if (document.getElementById('parentName')) document.getElementById('parentName').value = pName;
        if (document.getElementById('guardianName')) document.getElementById('guardianName').value = pName;
        if (document.getElementById('fullName')) document.getElementById('fullName').value = pName;

        const pId = sub.parentIdNumber || sub.guardianId || '';
        if (document.getElementById('parentIdNumber')) document.getElementById('parentIdNumber').value = pId;
        if (document.getElementById('guardianId')) document.getElementById('guardianId').value = pId;

        const sTitle = sub.storyTitle || sub.storyName || '';
        if (document.getElementById('storyTitle')) document.getElementById('storyTitle').value = sTitle;
        if (document.getElementById('storyName')) document.getElementById('storyName').value = sTitle;

        if (document.getElementById('commissionNumber') && sub.commissionNumber) {
            document.getElementById('commissionNumber').value = sub.commissionNumber;
        }

        const prod = sub.producerName || '';
        if (document.getElementById('producerName') && prod) document.getElementById('producerName').value = prod;
        if (document.getElementById('prodSignerName') && prod) document.getElementById('prodSignerName').value = prod;

        if (document.getElementById('parentSignedAt')) {
            document.getElementById('parentSignedAt').value = sub.parentSignedAt || sub.signedAt || '';
        }
        if (document.getElementById('parentSignedDate')) {
            document.getElementById('parentSignedDate').value = sub.parentSignedDate || sub.signedDate || todayFormatted;
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
            formId: 'minorReleaseForm',
            formType: 'minor_release',
            formTitle: 'Minor Release Form',
            contributorSigCanvasId: 'signatureCanvas',
            contributorClearBtnId: 'clearSigBtn',
            contributorSigLabel: 'Parent / Guardian Signature',
            onSubmissionLoaded,
            buildDualPdf,
            standardSubmitEndpoint: '/api/send-minor-release'
        });
    }
});
