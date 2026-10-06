// location_agreement.js
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearSigBtn');
    const form = document.getElementById('locationAgreementForm');
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

        const ownerName = document.getElementById('ownerName').value;
        const ownerId = document.getElementById('ownerId').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        const propertyAddress = document.getElementById('propertyAddress').value;
        const filmingDate = document.getElementById('filmingDate').value;
        const storyName = document.getElementById('storyName').value;
        const commissionNumber = document.getElementById('commissionNumber') ? document.getElementById('commissionNumber').value.trim() : '';

        // 0. Top Header Note
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        if (producerSigImg) {
            doc.text('OFFICIALLY EXECUTED RELEASE AGREEMENT', pageWidth / 2, 8, { align: 'center' });
        } else {
            doc.text('OWNER SIGNED • PENDING PRODUCER COUNTERSIGNATURE', pageWidth / 2, 8, { align: 'center' });
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
        doc.text('LOCATION AGREEMENT', margin, 38);

        doc.setDrawColor(0, 143, 190);
        doc.setLineWidth(0.8);
        doc.line(margin, 42, pageWidth - margin, 42);

        // Property Owner / Representative Details
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Property Owner / Representative Details', margin, 52);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Full Name: ${ownerName}`, margin, 60);
        doc.text(`ID/Passport Number: ${ownerId}`, margin, 68);
        doc.text(`Phone Number: ${phone}`, margin, 76);
        doc.text(`Email Address: ${email}`, margin, 84);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Location & Filming Details', margin, 96);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Property Address: ${propertyAddress}`, margin, 104);
        doc.text(`Filming Date: ${filmingDate}`, margin, 112);
        doc.text(`Story / Project: ${storyName}`, margin, 120);
        doc.text(`Commission Number: ${commissionNumber || 'N/A'}`, margin, 128);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Grant of Rights', margin, 140);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        const declarationText = 'I hereby grant Combined Artists and Carte Blanche and their assignees the right to enter and film on the property described above. This includes the right to photograph and record both interior and exterior scenes, and to use the recordings in any manner worldwide, in perpetuity.';
        const splitText = doc.splitTextToSize(declarationText, 170);
        doc.text(splitText, margin, 148);

        // Signatures Section (Side by Side)
        const sigY = 178;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Owner / Representative Signature:', margin, sigY);
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
        if (document.getElementById('ownerName')) document.getElementById('ownerName').value = sub.ownerName || sub.contributorName || '';
        if (document.getElementById('ownerId')) document.getElementById('ownerId').value = sub.ownerId || '';
        if (document.getElementById('phone')) document.getElementById('phone').value = sub.phone || '';
        if (document.getElementById('email')) document.getElementById('email').value = sub.email || '';
        if (document.getElementById('propertyAddress')) document.getElementById('propertyAddress').value = sub.propertyAddress || '';
        if (document.getElementById('filmingDate')) document.getElementById('filmingDate').value = sub.filmingDate || '';
        if (document.getElementById('storyName')) document.getElementById('storyName').value = sub.storyName || sub.storyTitle || '';
        if (document.getElementById('commissionNumber') && sub.commissionNumber) document.getElementById('commissionNumber').value = sub.commissionNumber;
        if (document.getElementById('producerName') && sub.producerName) document.getElementById('producerName').value = sub.producerName;
        if (document.getElementById('producerEmail') && sub.producerEmail) document.getElementById('producerEmail').value = sub.producerEmail;
    }

    // Initialize Universal Dual Signing Flow
    if (window.countersignFlow) {
        window.countersignFlow.initDualSigning({
            formId: 'locationAgreementForm',
            formType: 'location_agreement',
            formTitle: 'Location Agreement',
            contributorSigCanvasId: 'signatureCanvas',
            contributorClearBtnId: 'clearSigBtn',
            contributorSigLabel: 'Owner / Representative Signature',
            onSubmissionLoaded,
            buildDualPdf,
            standardSubmitEndpoint: '/api/send-location-agreement'
        });
    }
});
