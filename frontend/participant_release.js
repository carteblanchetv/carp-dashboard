// participant_release.js
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
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

    // Draw on Canvas
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

    // Touch events for mobile compatibility
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

    async function buildDualPdf({ contributorSigImg, producerSigImg, producerName, isCountersignMode }) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;

        const fullName = document.getElementById('fullName').value;
        const idNumber = document.getElementById('idNumber').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        const storyName = document.getElementById('storyName').value;

        // 0. Top Header Note
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        if (producerSigImg) {
            doc.text('OFFICIALLY EXECUTED RELEASE AGREEMENT', pageWidth / 2, 8, { align: 'center' });
        } else {
            doc.text('PARTICIPANT SIGNED • PENDING PRODUCER COUNTERSIGNATURE', pageWidth / 2, 8, { align: 'center' });
        }

        // 1. Branding Logos
        const caLogo = (typeof getBlackLogo === 'function' ? getBlackLogo() : (typeof CAP_LOGO_B64 !== 'undefined' ? CAP_LOGO_B64 : null));
        if (caLogo) {
            const props = doc.getImageProperties(caLogo);
            const caWidth = 38;
            const caHeight = caWidth * (props.height / props.width);
            doc.addImage(caLogo, 'PNG', margin, 12, caWidth, caHeight);
        }
        if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
            const props = doc.getImageProperties(CB_LOGO_B64);
            const cbWidth = 22;
            const cbHeight = cbWidth * (props.height / props.width);
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - cbWidth, 11, cbWidth, cbHeight);
        }

        // 2. Title & Header Line
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('PARTICIPANT RELEASE FORM', margin, 38);

        doc.setDrawColor(0, 143, 190);
        doc.setLineWidth(0.8);
        doc.line(margin, 42, pageWidth - margin, 42);

        // Participant Details
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Participant Details', margin, 52);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Full Name: ${fullName}`, margin, 60);
        doc.text(`ID/Passport Number: ${idNumber}`, margin, 68);
        doc.text(`Phone Number: ${phone}`, margin, 76);
        doc.text(`Email Address: ${email}`, margin, 84);
        doc.text(`Story / Project: ${storyName}`, margin, 92);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Declaration & Consent', margin, 106);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        const declarationText = 'I hereby grant Combined Artists and Carte Blanche the absolute right and permission to film, record, and use my name, voice, image, and likeness for the purposes of this television program. I understand this material may be edited and broadcast globally.';
        const splitText = doc.splitTextToSize(declarationText, 170);
        doc.text(splitText, margin, 114);

        // Signatures Section (Side by Side)
        const sigY = 145;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Participant Signature:', margin, sigY);
        if (contributorSigImg) {
            doc.addImage(contributorSigImg, 'PNG', margin, sigY + 4, 70, 20);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, margin, sigY + 30);

        // Producer Column
        const prodX = 115;
        if (producerSigImg) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Producer Counter-Signature:', prodX, sigY);
            doc.addImage(producerSigImg, 'PNG', prodX, sigY + 4, 70, 20);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Signed by: ${producerName || 'Producer'}`, prodX, sigY + 30);
            doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, prodX, sigY + 35);
        } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Producer Counter-Signature:', prodX, sigY);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text('[Awaiting Producer Counter-Signature]', prodX, sigY + 12);
            doc.setTextColor(15, 23, 42);
        }

        return doc.output('blob');
    }

    function onSubmissionLoaded(sub) {
        if (document.getElementById('fullName')) document.getElementById('fullName').value = sub.fullName || sub.contributorName || '';
        if (document.getElementById('idNumber')) document.getElementById('idNumber').value = sub.idNumber || '';
        if (document.getElementById('phone')) document.getElementById('phone').value = sub.phone || '';
        if (document.getElementById('email')) document.getElementById('email').value = sub.email || '';
        if (document.getElementById('storyName')) document.getElementById('storyName').value = sub.storyName || sub.storyTitle || '';
        if (document.getElementById('commissionNumber') && sub.commissionNumber) document.getElementById('commissionNumber').value = sub.commissionNumber;
        if (document.getElementById('producerName') && sub.producerName) document.getElementById('producerName').value = sub.producerName;
        if (document.getElementById('producerEmail') && sub.producerEmail) document.getElementById('producerEmail').value = sub.producerEmail;
    }

    // Initialize Universal Dual Signing Flow
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
