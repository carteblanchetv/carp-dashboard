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

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.text('PARTICIPANT RELEASE FORM 2026', 20, 25);

            doc.setDrawColor(0, 143, 190);
            doc.setLineWidth(1);
            doc.line(20, 30, 190, 30);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Participant Details', 20, 45);

            doc.setFont('helvetica', 'normal');
            doc.text(`Full Name: ${fullName}`, 20, 55);
            doc.text(`ID/Passport Number: ${idNumber}`, 20, 65);
            doc.text(`Phone Number: ${phone}`, 20, 75);
            doc.text(`Email Address: ${email}`, 20, 85);
            doc.text(`Story / Project: ${storyName}`, 20, 95);

            doc.setFont('helvetica', 'bold');
            doc.text('Declaration & Consent', 20, 115);
            doc.setFont('helvetica', 'normal');
            const declarationText = 'I hereby grant Combined Artists and Carte Blanche the absolute right and permission to film, record, and use my name, voice, image, and likeness for the purposes of this television program. I understand this material may be edited and broadcast globally.';
            const splitText = doc.splitTextToSize(declarationText, 170);
            doc.text(splitText, 20, 125);

            // Add signature image to PDF
            const sigImgData = canvas.toDataURL('image/png');
            doc.setFont('helvetica', 'bold');
            doc.text('Signature:', 20, 160);
            doc.addImage(sigImgData, 'PNG', 20, 165, 80, 20);

            doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, 20, 195);

            const pdfBlob = doc.output('blob');

            // Send to server
            const formData = new FormData();
            formData.append('fullName', fullName);
            formData.append('idNumber', idNumber);
            formData.append('phone', phone);
            formData.append('email', email);
            formData.append('storyName', storyName);
            formData.append('release_pdf', pdfBlob, `ParticipantRelease_${fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);

            const token = await window.auth.getIdToken();
            const response = await fetch('/api/send-participant-release', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Server error');

            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            dialog.classList.remove('hidden');
            document.getElementById('dialogCloseBtn').onclick = () => window.location.href = 'index.html';

        } catch (error) {
            console.error('CRITICAL ERROR:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    });
});
