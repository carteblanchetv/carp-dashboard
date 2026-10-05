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

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Signature validation
        const blank = document.createElement('canvas');
        blank.width = canvas.width;
        blank.height = canvas.height;
        if (canvas.toDataURL() === blank.toDataURL()) {
            alert('Please sign the document before submitting.');
            return;
        }

        try {
            loadingOverlay.classList.add('active');

            const licensorName = document.getElementById('licensorName').value.trim();
            const licensorEntity = document.getElementById('licensorEntity').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const email = document.getElementById('email').value.trim();
            const footageDescription = document.getElementById('footageDescription').value.trim();
            const courtesyCredit = document.getElementById('courtesyCredit').value.trim();
            const storyName = document.getElementById('storyName').value.trim();
            const commissionNumber = document.getElementById('commissionNumber').value.trim() || 'N/A';
            const broadcastDate = document.getElementById('broadcastDate').value.trim();

            // Auto-detect producer credentials if not supplied via share parameters
            if (!producerNameMeta) {
                try {
                    const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
                    if (userStr) {
                        const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                        const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                        if (name) producerNameMeta = name;
                        if (u.email) producerEmailMeta = u.email;
                    }
                } catch (e) {}
            }

            // Generate clean vector PDF matching official Carte Blanche layout
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;

            // Top instruction notice
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 8, { align: 'center' });

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

            // Section 4: Signatures
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.text('4. Authorised Digital Execution', margin, curY);
            curY += 5;

            const sigImgData = canvas.toDataURL('image/png');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text('Rights Holder / Owner Signature (Digitally Signed):', margin, curY);
            curY += 2;
            doc.addImage(sigImgData, 'PNG', margin, curY, 70, 18);
            curY += 22;

            const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            doc.text(`Date Signed: ${todayFormatted}`, margin, curY);
            if (producerNameMeta) {
                doc.text(`Producer: ${producerNameMeta}`, margin + 90, curY);
            }

            // Footer reference
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('Form Ref: CB-FA-2026  •  Carte Blanche Legal & Clearances', margin, 287);

            const pdfBlob = doc.output('blob');

            // Build FormData payload
            const formData = new FormData();
            formData.append('licensorName', licensorName);
            formData.append('licensorEntity', licensorEntity);
            formData.append('phone', phone);
            formData.append('email', email);
            formData.append('footageDescription', footageDescription);
            formData.append('courtesyCredit', courtesyCredit);
            formData.append('storyName', storyName);
            formData.append('storyTitle', storyName);
            formData.append('commissionNumber', commissionNumber);
            formData.append('broadcastDate', broadcastDate);
            formData.append('producerName', producerNameMeta || 'Producer');
            if (producerEmailMeta) formData.append('producerEmail', producerEmailMeta);

            const safeFilename = `FootageAgreement_${storyName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
            formData.append('footage_pdf', pdfBlob, safeFilename);
            formData.append('pdf', pdfBlob, safeFilename);

            const token = (window.auth && typeof window.auth.getIdToken === 'function')
                ? await window.auth.getIdToken().catch(() => null)
                : null;
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // Try dedicated endpoint first, fallback to standard endpoint
            let response = await fetch('/api/send-footage-release-agreement', {
                method: 'POST',
                headers: headers,
                body: formData
            }).catch(() => null);

            if (!response || !response.ok) {
                response = await fetch('/api/send-footage-agreement', {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });
            }

            const result = await response.json();
            if (!result.success) throw new Error(result.error || result.message || 'Server error while submitting');

            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            dialog.classList.remove('hidden');

            const isGuest = !(window.auth && window.auth.currentUser);
            const closeBtn = document.getElementById('dialogCloseBtn');
            if (isGuest) {
                const p = dialog.querySelector('p');
                if (p) p.textContent = 'Your signed Footage Agreement has been submitted and dispatched to Carte Blanche Legal & Clearances. You may now close this window.';
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
});
