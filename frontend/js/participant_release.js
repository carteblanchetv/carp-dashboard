import {
    submitLegalForm,
    initCoSignAgreement,
    getAgreementForCoSign,
    completeCoSignedAgreement,
    renderCoSignBanner,
    showSubmissionSuccessModal,
    safeDrawField,
    cleanPdfText,
    prepareTemplatePdf,
    drawInFieldBox,
    drawSignatureInFieldBox
} from './form_submission_helper.js?v=5.4.0';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.4.0';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialise Dual-Mode Signature Pads
    const participantPad = new DualSignaturePad('#participantSigContainer', {
        nameSourceId: 'participantName',
        role: 'cosigner'
    });
    const producerPad = new DualSignaturePad('#producerSigContainer', {
        nameSourceId: 'producerName',
        role: 'producer'
    });

    // 2. Set default date to today
    const dateInput = document.getElementById('dateOfSignature');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Set default place if empty
    const placeInput = document.getElementById('placeOfSignature');
    if (placeInput && !placeInput.value) {
        placeInput.value = 'Johannesburg';
    }

    // 3. Pre-fill from URL parameters (e.g. ?commNum=7002&story=Title or ?id=submissionId)
    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    let loadedSubmission = null;

    const commVal = urlParams.get('commNum') || urlParams.get('comm');
    if (commVal) {
        document.getElementById('commissionNumber').value = commVal;
    }
    if (urlParams.get('story')) {
        document.getElementById('storyName').value = urlParams.get('story');
    }
    if (urlParams.get('producer')) {
        document.getElementById('producerName').value = urlParams.get('producer');
    }

    // Check if loading an existing agreement for co-signing
    if (submissionId) {
        document.documentElement.classList.add('co-sign-mode');
        document.body?.classList.add('co-sign-mode');
        document.querySelector('.global-top-nav')?.remove();
        document.querySelector('.form-top-actions')?.remove();
        document.getElementById('masqueradeBanner')?.remove();
        document.getElementById('resetFormBtn')?.remove();
        document.getElementById('downloadCompletedPdfBtn')?.remove();
        document.getElementById('shareForCosignBtn')?.remove();
        document.getElementById('shareFormBtn')?.remove();

        (async () => {
            try {
                loadedSubmission = await getAgreementForCoSign(submissionId);
                const container = document.querySelector('.form-card-container') || document.querySelector('.form-container') || document.querySelector('form');

                if (loadedSubmission.commissionNumber) {
                    const el = document.getElementById('commissionNumber');
                    el.value = loadedSubmission.commissionNumber;
                    el.readOnly = true;
                }
                if (loadedSubmission.storyName || loadedSubmission.storyTitle) {
                    const el = document.getElementById('storyName');
                    el.value = loadedSubmission.storyName || loadedSubmission.storyTitle;
                    el.readOnly = true;
                }
                if (loadedSubmission.producerName) {
                    const el = document.getElementById('producerName');
                    el.value = loadedSubmission.producerName;
                    el.readOnly = true;
                }
                if (loadedSubmission.place) {
                    document.getElementById('placeOfSignature').value = loadedSubmission.place;
                }
                if (loadedSubmission.fullName || loadedSubmission.participantName) {
                    const val = loadedSubmission.fullName || loadedSubmission.participantName;
                    if (val && !val.includes('Pending')) {
                        document.getElementById('participantName').value = val;
                    }
                }
                let parsedMeta = {};
                if (loadedSubmission.metadata) {
                    try {
                        parsedMeta = typeof loadedSubmission.metadata === 'string'
                            ? JSON.parse(loadedSubmission.metadata)
                            : loadedSubmission.metadata;
                    } catch (e) {}
                }
                if (loadedSubmission.idNumber || parsedMeta.participantId) {
                    document.getElementById('participantId').value = loadedSubmission.idNumber || parsedMeta.participantId;
                }
                if (loadedSubmission.phone || loadedSubmission.contactNumber || parsedMeta.participantContact) {
                    document.getElementById('participantContact').value = loadedSubmission.phone || loadedSubmission.contactNumber || parsedMeta.participantContact;
                }
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && !emailEl.value) {
                    emailEl.value = loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || 'release@carteblanche.co.za';
                }

                if (loadedSubmission.status === 'completed') {
                    renderCoSignBanner(container, {
                        title: 'Agreement Completed',
                        subtitle: 'This agreement has already been fully signed by both parties.',
                        status: 'completed'
                    });
                    if (loadedSubmission.producerSignature) {
                        producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                        producerPad.lock('Signed by Producer');
                    }
                    if (loadedSubmission.participantSignature) {
                        participantPad.loadDataURL(loadedSubmission.participantSignature, loadedSubmission.participantName || loadedSubmission.fullName);
                        participantPad.lock('Signed by Participant');
                    }
                    document.getElementById('submitFormBtn').disabled = true;
                    document.getElementById('submitFormBtn').style.display = 'none';
                    document.getElementById('shareForCosignBtn')?.remove();
                    return;
                }

                // Producer signed first -> Participant needs to sign
                if (loadedSubmission.producerSignature) {
                    producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                    producerPad.lock(`Signed by Producer: ${loadedSubmission.producerName || ''}`);
                    
                    renderCoSignBanner(container, {
                        title: `Pre-signed by Producer: ${loadedSubmission.producerName || 'Producer'}`,
                        subtitle: 'Please review the agreement, complete your participant details, and sign below to finalize.',
                        status: 'info'
                    });

                    const submitBtn = document.getElementById('submitFormBtn');
                    submitBtn.innerHTML = '<span>✍️</span> Co-Sign & Complete Agreement';
                    document.getElementById('shareForCosignBtn')?.remove();

                    // Scroll to participant signature area
                    setTimeout(() => {
                        document.getElementById('participantName')?.focus();
                    }, 400);
                } else if (loadedSubmission.participantSignature) {
                    // Participant signed first -> Producer countersigning
                    participantPad.loadDataURL(loadedSubmission.participantSignature);
                    participantPad.lock(`Signed by Participant: ${loadedSubmission.participantName || ''}`);
                    
                    renderCoSignBanner(container, {
                        title: `Pre-signed by Participant: ${loadedSubmission.participantName || 'Participant'}`,
                        subtitle: 'Please review the agreement and sign as Producer to complete.',
                        status: 'info'
                    });

                    const submitBtn = document.getElementById('submitFormBtn');
                    submitBtn.innerHTML = '<span>✍️</span> Countersign & Complete Agreement';
                    document.getElementById('shareForCosignBtn')?.remove();
                }
            } catch (err) {
                console.error('Failed to load co-sign agreement:', err);
                alert('Could not load agreement details: ' + err.message);
            }
        })();
    }

    // Send for Co-Signing Handler (Producer signs first)
    async function handleSendForCoSign() {
        const comm = document.getElementById('commissionNumber')?.value.trim() || '';
        const story = document.getElementById('storyName')?.value.trim() || '';
        const producer = document.getElementById('producerName')?.value.trim() || '';
        const place = document.getElementById('placeOfSignature')?.value.trim() || '';
        const dateVal = document.getElementById('dateOfSignature')?.value || '';
        const participant = document.getElementById('participantName')?.value.trim() || '';

        if (!producer) {
            alert('Please enter the Producer Name.');
            document.getElementById('producerName')?.focus();
            return;
        }

        if (producerPad.isEmpty()) {
            alert('Please sign your Producer Signature pad before sending for co-signing.');
            producerPad.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const btn = document.getElementById('shareForCosignBtn') || document.getElementById('shareFormBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Creating Co-Sign Link...';
        btn.disabled = true;

        try {
            const { pdfBlob, filename } = await buildCompletedPDF(participantPad, producerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'participant_release');
            formData.append('formTitle', 'Participant Release Form 2026');
            formData.append('storyName', story);
            formData.append('commissionNumber', comm);
            formData.append('producerName', producer);
            formData.append('producerEmail', (window.auth?.currentUser?.email) || '');
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('contributorName', participant);
            formData.append('place', place);
            formData.append('dateVal', dateVal);
            formData.append('metadata', JSON.stringify({
                participantId: document.getElementById('participantId')?.value.trim() || '',
                participantContact: document.getElementById('participantContact')?.value.trim() || ''
            }));

            const res = await initCoSignAgreement(formData);
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Server error creating co-sign link.');
            }

            openShareModal({
                title: 'Participant Release Form 2026',
                url: result.shareUrl,
                storyTitle: story,
                commNum: comm
            });
        } catch (err) {
            console.error('Send for co-sign failed:', err);
            alert('Error creating co-sign link: ' + err.message);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    // Share Form Handler (Top Button)
    document.getElementById('shareFormBtn')?.addEventListener('click', () => {
        // If producer has signed, offer co-signing link with signature
        if (!producerPad.isEmpty() && (!loadedSubmission || loadedSubmission.status !== 'completed')) {
            handleSendForCoSign();
            return;
        }
        const comm = document.getElementById('commissionNumber')?.value || '';
        const story = document.getElementById('storyName')?.value || '';
        openShareModal({
            title: 'Participant Release Form 2026',
            url: window.location.href,
            storyTitle: story,
            commNum: comm
        });
    });

    // Send to Co-Signer Button Handler (Bottom Button)
    document.getElementById('shareForCosignBtn')?.addEventListener('click', handleSendForCoSign);

    // 4. Reset Form Event
    document.getElementById('resetFormBtn').addEventListener('click', () => {
        if (!loadedSubmission || !loadedSubmission.participantSignature) participantPad.clear();
        if (!loadedSubmission || !loadedSubmission.producerSignature) producerPad.clear();
    });

    // 5. Download & Share Completed PDF Handler
    document.getElementById('downloadCompletedPdfBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            const { pdfBlob, filename } = await buildCompletedPDF(participantPad, producerPad);
            const comm = document.getElementById('commissionNumber')?.value || '';
            const story = document.getElementById('storyName')?.value || '';
            await downloadAndSharePDF(pdfBlob, filename, {
                title: 'Participant Release Form 2026',
                storyTitle: story,
                commNum: comm
            });
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            alert('Error generating PDF: ' + err.message);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    });

    // 6. Submit Agreement Handler
    document.getElementById('submitFormBtn').addEventListener('click', async () => {
        const form = document.getElementById('participantReleaseForm');

        const emailEl = document.getElementById('submitterEmail');
        if (emailEl && !emailEl.value.trim()) {
            if (loadedSubmission) {
                emailEl.value = loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || 'release@carteblanche.co.za';
            } else if (window.auth?.currentUser?.email) {
                emailEl.value = window.auth.currentUser.email;
            } else {
                emailEl.value = 'release@carteblanche.co.za';
            }
        }

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // If producer signed first but participant has not yet signed, offer to send for co-signing
        if (!loadedSubmission && participantPad.isEmpty() && !producerPad.isEmpty()) {
            if (confirm('Participant signature is empty. Would you like to create a secure co-signing link with your Producer signature and share it with the participant?')) {
                handleSendForCoSign();
                return;
            }
        }

        if (participantPad.isEmpty()) {
            alert('Please provide the Participant Signature before submitting.');
            return;
        }
        if (producerPad.isEmpty()) {
            alert('Please provide the Producer Signature before submitting.');
            return;
        }

        const submitBtn = document.getElementById('submitFormBtn');
        const origSubmitText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>⏳</span> Submitting & Sending Email...';
        submitBtn.disabled = true;

        try {
            const { pdfBlob, filename, metadata } = await buildCompletedPDF(participantPad, producerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'participant_release');
            formData.append('formTitle', 'Participant Release Form 2026');
            formData.append('storyName', metadata.storyName);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.producerName);
            formData.append('signatoryName', metadata.participantName);
            formData.append('participantName', metadata.participantName);
            formData.append('fullName', metadata.participantName);
            formData.append('idNumber', metadata.participantId);
            formData.append('contactNumber', metadata.participantContact);
            formData.append('phone', metadata.participantContact);
            formData.append('submitterEmail', metadata.submitterEmail);
            formData.append('email', metadata.submitterEmail);
            formData.append('place', metadata.place);
            formData.append('participantSignedAt', metadata.place);
            formData.append('producerSignedAt', metadata.place);
            formData.append('dateVal', metadata.formattedDate);
            formData.append('participantSignedDate', metadata.formattedDate);
            formData.append('producerSignedDate', metadata.formattedDate);
            formData.append('participantSignature', participantPad.toDataURL());
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('metadata', JSON.stringify({
                participantId: metadata.participantId,
                participantContact: metadata.participantContact
            }));

            let response;
            if (loadedSubmission && loadedSubmission.id) {
                formData.append('submissionId', loadedSubmission.id);
                response = await completeCoSignedAgreement(formData);
            } else {
                response = await submitLegalForm(formData);
            }

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Server rejected submission.');
            }

            showSubmissionSuccessModal({
                title: 'Participant Release Form 2026',
                recipients: result.recipients || [metadata.submitterEmail, 'release@carteblanche.co.za'],
                pdfBlob,
                filename
            });

        } catch (err) {
            console.error('Submission failed:', err);
            alert('Submission failed: ' + err.message);
        } finally {
            submitBtn.innerHTML = origSubmitText;
            submitBtn.disabled = false;
        }
    });
});

async function buildCompletedPDF(participantPad, producerPad) {
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    const commNum = document.getElementById('commissionNumber').value.trim();
    const storyName = document.getElementById('storyName').value.trim();
    const producerName = document.getElementById('producerName').value.trim();
    const submitterEmail = document.getElementById('submitterEmail').value.trim();
    const participantName = document.getElementById('participantName').value.trim();
    const participantId = document.getElementById('participantId').value.trim();
    const participantContact = document.getElementById('participantContact').value.trim();
    const place = document.getElementById('placeOfSignature').value.trim();
    const dateVal = document.getElementById('dateOfSignature').value;

    let formattedDate = dateVal;
    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        formattedDate = `${d}/${m}/${y}`;
    }

    // Fetch Official PDF Template
    const templateUrl = 'templates/Carte_Blanche_Participant_Release_Form_2026.pdf';
    const templateBytes = await fetch(templateUrl).then(res => {
        if (!res.ok) throw new Error('Could not load PDF template file.');
        return res.arrayBuffer();
    });

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fieldMap = prepareTemplatePdf(pdfDoc);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 9.5;
    const textColor = rgb(0.06, 0.09, 0.16);

    const drawBox = (fieldName, text, isBold = false) => {
        drawInFieldBox(page, fieldMap, fieldName, text, {
            size: fontSize,
            font: isBold ? fontBold : font,
            color: textColor
        });
    };

    drawBox('commissionNumber', commNum, true);
    drawBox('storyTitle', storyName, true);
    drawBox('producerName', producerName);
    drawBox('participantName', participantName, true);
    drawBox('idNumber', participantId);
    drawBox('contactNumber', participantContact);
    drawBox('participantSignedAt', place);
    drawBox('producerSignedAt', place);
    drawBox('participantSignedDate', formattedDate);
    drawBox('producerSignedDate', formattedDate);

    if (!participantPad.isEmpty()) {
        const pSigData = participantPad.toDataURL();
        const pSigImage = await pdfDoc.embedPng(pSigData);
        drawSignatureInFieldBox(page, fieldMap, 'participantSignature', pSigImage);
    }

    if (!producerPad.isEmpty()) {
        const prSigData = producerPad.toDataURL();
        const prSigImage = await pdfDoc.embedPng(prSigData);
        drawSignatureInFieldBox(page, fieldMap, 'producerSignature', prSigImage);
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const cleanName = (participantName || 'Release').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanStory = (storyName || 'Carte_Blanche').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Participant_Release_${cleanStory}_${cleanName}_2026.pdf`;

    return {
        pdfBlob,
        filename,
        metadata: {
            commNum,
            storyName,
            producerName,
            submitterEmail,
            participantName,
            participantId,
            participantContact,
            place,
            formattedDate
        }
    };
}
