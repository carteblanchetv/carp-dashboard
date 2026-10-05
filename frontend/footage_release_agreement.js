// footage_release_agreement.js - Carte Blanche Footage Agreement Handler
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearSigBtn');
    const form = document.getElementById('footageAgreementForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let drawing = false;
    let sigMethod = 'draw';

    // Parse URL query parameters if accessed via share link or proposal
    const urlParams = new URLSearchParams(window.location.search);
    const initialStory = urlParams.get('story') || urlParams.get('storyName') || '';
    const initialComm = urlParams.get('comm') || urlParams.get('commissionNumber') || '';
    const initialProducer = urlParams.get('producer') || urlParams.get('producerName') || '';
    const initialProducerEmail = urlParams.get('producerEmail') || '';
    const initialName = urlParams.get('name') || urlParams.get('licensorName') || '';

    if (initialStory && document.getElementById('storyName')) {
        document.getElementById('storyName').value = initialStory;
    }
    if (initialComm && document.getElementById('commissionNumber')) {
        document.getElementById('commissionNumber').value = initialComm;
    }
    if (initialName && document.getElementById('licensorName')) {
        document.getElementById('licensorName').value = initialName;
    }

    // Hidden inputs for producer routing if provided
    let producerNameMeta = initialProducer;
    let producerEmailMeta = initialProducerEmail;

    // Tabs for Draw vs Type Signature
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
        ctx.font = `italic 38px "${font}", cursive`;
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    typeSigInput.addEventListener('input', renderTypedSignature);
    typeSigFont.addEventListener('change', renderTypedSignature);

    // Canvas drawing helpers
    function getMousePos(canvasDom, touchOrMouseEvent) {
        const rect = canvasDom.getBoundingClientRect();
        const clientX = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientX : touchOrMouseEvent.clientX;
        const clientY = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientY : touchOrMouseEvent.clientY;
        return {
            x: (clientX - rect.left) * (canvasDom.width / rect.width),
            y: (clientY - rect.top) * (canvasDom.height / rect.height)
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
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseleave', () => drawing = false);

    // Touch events for mobile phones and tablets
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

        const licensorName = document.getElementById('licensorName').value.trim();
        const licensorEntity = document.getElementById('licensorEntity').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const email = document.getElementById('email').value.trim();
        const footageDescription = document.getElementById('footageDescription').value.trim();
        const courtesyCredit = document.getElementById('courtesyCredit').value.trim();
        const storyName = document.getElementById('storyName').value.trim();
        const commissionNumber = document.getElementById('commissionNumber').value.trim() || 'N/A';
        const broadcastDate = document.getElementById('broadcastDate').value.trim();

        // Top instruction notice
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        if (producerSigImg) {
            doc.text('OFFICIALLY EXECUTED RELEASE AGREEMENT', pageWidth / 2, 8, { align: 'center' });
        } else {
            doc.text('LICENSOR SIGNED • PENDING PRODUCER COUNTERSIGNATURE', pageWidth / 2, 8, { align: 'center' });
        }

        // Branding Logos
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

        // Title & Accent Rule
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('FOOTAGE AGREEMENT', margin, 36);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Carte Blanche & M-Net  •  Video & Archival Material Licence Agreement', margin, 41);

        doc.setDrawColor(0, 143, 190);
        doc.setLineWidth(0.8);
        doc.line(margin, 44, pageWidth - margin, 44);

        let curY = 51;

        // Section 1: Terms Summary
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text('1. Terms of Licence & Broadcast Permission', margin, curY);
        curY += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const termsText = 'The Rights Holder ("owner") grants Electronic Media Network Proprietary Limited ("M-Net") and Combined Artistic Productions CC ("producer") a non-exclusive, irrevocable licence to incorporate and broadcast the footage described below in the story specified below across all MultiChoice platforms in perpetuity on a royalty-free basis. The completed broadcast programme remains the exclusive property of M-Net and Carte Blanche. Standalone original raw footage remains the property of the owner.';
        const splitTerms = doc.splitTextToSize(termsText, pageWidth - margin * 2);
        doc.text(splitTerms, margin, curY);
        curY += (splitTerms.length * 3.6) + 4;

        // Section 2: Description of Footage & Story Details
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text('2. Description of Footage & Story Details', margin, curY);
        curY += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Story Title / Working Name: ${storyName}`, margin, curY);
        doc.text(`Commission #: ${commissionNumber}`, margin + 105, curY);
        curY += 6;

        if (broadcastDate) {
            doc.text(`Anticipated Broadcast Date: ${broadcastDate}`, margin, curY);
            curY += 6;
        }

        if (courtesyCredit) {
            doc.text(`Requested On-Screen Credit: ${courtesyCredit}`, margin, curY);
            curY += 6;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Footage Description:', margin, curY);
        curY += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const splitDesc = doc.splitTextToSize(footageDescription, pageWidth - margin * 2);
        doc.text(splitDesc, margin, curY);
        curY += (splitDesc.length * 4) + 5;

        // Section 3: Licensor Details
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text('3. Licensor / Rights Holder Details', margin, curY);
        curY += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Full Name: ${licensorName}`, margin, curY);
        doc.text(`On Behalf Of: ${licensorEntity || 'Self / Individual'}`, margin + 90, curY);
        curY += 5.5;
        doc.text(`Phone: ${phone}`, margin, curY);
        doc.text(`Email: ${email}`, margin + 90, curY);
        curY += 8;

        // Section 4: Signatures (Side by Side)
        const sigY = curY;
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Licensor / Rights Holder Signature:', margin, sigY);
        if (contributorSigImg) {
            doc.addImage(contributorSigImg, 'PNG', margin, sigY + 4, 70, 18);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, margin, sigY + 28);

        // Producer Column
        const prodX = 115;
        if (producerSigImg) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Producer Counter-Signature:', prodX, sigY);
            doc.addImage(producerSigImg, 'PNG', prodX, sigY + 4, 70, 18);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(`Signed by: ${producerName || 'Producer'}`, prodX, sigY + 28);
            doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, prodX, sigY + 33);
        } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Producer Counter-Signature:', prodX, sigY);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            doc.text('[Awaiting Producer Counter-Signature]', prodX, sigY + 12);
            doc.setTextColor(15, 23, 42);
        }

        // Footer reference
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Form Ref: CB-FA-2026  •  Carte Blanche Legal & Clearances', margin, 287);

        return doc.output('blob');
    }

    function onSubmissionLoaded(sub) {
        if (document.getElementById('licensorName')) document.getElementById('licensorName').value = sub.licensorName || sub.contributorName || '';
        if (document.getElementById('licensorEntity')) document.getElementById('licensorEntity').value = sub.licensorEntity || '';
        if (document.getElementById('phone')) document.getElementById('phone').value = sub.phone || '';
        if (document.getElementById('email')) document.getElementById('email').value = sub.email || '';
        if (document.getElementById('footageDescription')) document.getElementById('footageDescription').value = sub.footageDescription || '';
        if (document.getElementById('courtesyCredit')) document.getElementById('courtesyCredit').value = sub.courtesyCredit || '';
        if (document.getElementById('storyName')) document.getElementById('storyName').value = sub.storyName || sub.storyTitle || '';
        if (document.getElementById('commissionNumber') && sub.commissionNumber) document.getElementById('commissionNumber').value = sub.commissionNumber;
        if (document.getElementById('broadcastDate')) document.getElementById('broadcastDate').value = sub.broadcastDate || '';
        if (document.getElementById('producerName') && sub.producerName) document.getElementById('producerName').value = sub.producerName;
        if (document.getElementById('producerEmail') && sub.producerEmail) document.getElementById('producerEmail').value = sub.producerEmail;
    }

    // Initialize Universal Dual Signing Flow
    if (window.countersignFlow) {
        window.countersignFlow.initDualSigning({
            formId: 'footageAgreementForm',
            formType: 'footage_agreement',
            formTitle: 'Footage Agreement',
            contributorSigCanvasId: 'signatureCanvas',
            contributorClearBtnId: 'clearSigBtn',
            contributorSigLabel: 'Licensor Signature',
            onSubmissionLoaded,
            buildDualPdf,
            standardSubmitEndpoint: '/api/send-footage-release-agreement'
        });
    }
});
