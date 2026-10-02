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

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Check if canvas is empty
        const blank = document.createElement('canvas');
        blank.width = canvas.width;
        blank.height = canvas.height;
        if (canvas.toDataURL() === blank.toDataURL()) {
            alert('Please sign the document before submitting.');
            return;
        }

        try {
            loadingOverlay.classList.add('active');

            const fullName = document.getElementById('fullName').value;
            const idNumber = document.getElementById('idNumber').value;
            const phone = document.getElementById('phone').value;
            const email = document.getElementById('email').value;
            const storyName = document.getElementById('storyName').value;

            // Generate PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;

            // 0. Top Instruction Note
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 8, { align: 'center' });

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

            // Add signature image to PDF
            const sigImgData = canvas.toDataURL('image/png');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Signature:', margin, 145);
            doc.addImage(sigImgData, 'PNG', margin, 150, 80, 20);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, margin, 180);

            const pdfBlob = doc.output('blob');

            // Send to server
            const formData = new FormData();
            formData.append('fullName', fullName);
            formData.append('idNumber', idNumber);
            formData.append('phone', phone);
            formData.append('email', email);
            formData.append('storyName', storyName);
            formData.append('release_pdf', pdfBlob, `ParticipantRelease_${fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);

            // Append metadata from share link if present
            const commInput = document.getElementById('commissionNumber');
            const prodNameInput = document.getElementById('producerName');
            const prodEmailInput = document.getElementById('producerEmail');
            if (commInput && commInput.value) formData.append('commissionNumber', commInput.value);
            if (prodNameInput && prodNameInput.value) formData.append('producerName', prodNameInput.value);
            if (prodEmailInput && prodEmailInput.value) formData.append('producerEmail', prodEmailInput.value);

            // Fallback for staff users submitting directly without share link
            if (!formData.get('producerName')) {
                try {
                    const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
                    if (userStr) {
                        const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                        const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                        if (name) formData.append('producerName', name);
                        if (u.email) formData.append('producerEmail', u.email);
                    }
                } catch (e) {}
            }

            const token = (window.auth && typeof window.auth.getIdToken === 'function')
                ? await window.auth.getIdToken().catch(() => null)
                : null;
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/api/send-participant-release', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Server error');

            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            dialog.classList.remove('hidden');
            const isGuest = !(window.auth && window.auth.currentUser);
            const closeBtn = document.getElementById('dialogCloseBtn');
            if (isGuest) {
                const p = dialog.querySelector('p');
                if (p) p.textContent = 'Your signed Participant Release form has been submitted and sent to Carte Blanche Legal & Production. You may now close this window.';
                closeBtn.textContent = 'Done / Close Window';
                closeBtn.onclick = () => {
                    closeBtn.disabled = true;
                    closeBtn.textContent = 'Submitted ✓';
                    try { window.close(); } catch (e) {}
                };
            } else {
                closeBtn.onclick = () => window.location.href = 'index.html';
            }

        } catch (error) {
            console.error('CRITICAL ERROR:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    });
});
