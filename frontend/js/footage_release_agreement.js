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
    drawSignatureInFieldBox,
    embedSignatureSafe
} from './form_submission_helper.js?v=5.4.2';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.4.2';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialise Dual-Mode Signature Pads
    const producerPad = new DualSignaturePad('#producerSigContainer', {
        nameSourceId: 'producerName',
        role: 'producer'
    });
    const ownerPad = new DualSignaturePad('#ownerSigContainer', {
        nameSourceId: 'ownerSignatory',
        role: 'cosigner'
    });

    // Bi-directional sync between Signatory Name and Owner Name
    const ownerSigInput = document.getElementById('ownerSignatory');
    const ownerNameInput = document.getElementById('ownerName');
    if (ownerSigInput && ownerNameInput) {
        ownerSigInput.addEventListener('input', () => {
            if (!ownerNameInput.value || ownerNameInput.dataset.synced !== 'manual') {
                ownerNameInput.value = ownerSigInput.value;
            }
        });
        ownerNameInput.addEventListener('input', () => {
            ownerNameInput.dataset.synced = 'manual';
            if (!ownerSigInput.value) {
                ownerSigInput.value = ownerNameInput.value;
            }
        });
    }

    // 2. Default Dates
    const today = new Date().toISOString().split('T')[0];
    ['broadcastDate', 'producerDate', 'ownerDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    // 3. Pre-fill from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    let loadedSubmission = null;

    const commVal = urlParams.get('commNum') || urlParams.get('comm');
    if (commVal) document.getElementById('commissionNumber').value = commVal;
    if (urlParams.get('story')) document.getElementById('storyTitle').value = urlParams.get('story');
    if (urlParams.get('producer')) document.getElementById('producerName').value = urlParams.get('producer');

    // Check if loading an existing agreement for co-signing
    if (submissionId) {
        document.documentElement.classList.add('co-sign-mode');
        document.body?.classList.add('co-sign-mode');
        document.querySelector('.global-top-nav')?.remove();
        document.getElementById('masqueradeBanner')?.remove();
        document.getElementById('resetFormBtn')?.remove();
        document.getElementById('downloadBlankPdfBtn')?.remove();
        document.getElementById('shareForCosignBtn')?.remove();
        document.getElementById('shareFormBtn')?.remove();
        const dlBtn = document.getElementById('downloadCompletedPdfBtn');
        if (dlBtn) {
            dlBtn.innerHTML = '<span>📥</span> Download PDF Copy';
        }

        (async () => {
            try {
                loadedSubmission = await getAgreementForCoSign(submissionId);
                const container = document.querySelector('.form-card-container') || document.querySelector('.form-container') || document.querySelector('form');

                if (loadedSubmission.commissionNumber) {
                    const el = document.getElementById('commissionNumber');
                    if (el) { el.value = loadedSubmission.commissionNumber; el.readOnly = true; }
                }
                if (loadedSubmission.storyTitle || loadedSubmission.storyName) {
                    const el = document.getElementById('storyTitle');
                    if (el) { el.value = loadedSubmission.storyTitle || loadedSubmission.storyName; el.readOnly = true; }
                }
                if (loadedSubmission.producerName) {
                    const el = document.getElementById('producerName');
                    if (el) { el.value = loadedSubmission.producerName; el.readOnly = true; }
                }
                if (loadedSubmission.broadcastDate) {
                    const el = document.getElementById('broadcastDate');
                    if (el) el.value = loadedSubmission.broadcastDate;
                }
                if (loadedSubmission.footageDescription) {
                    const el = document.getElementById('footageDescription');
                    if (el) el.value = loadedSubmission.footageDescription;
                }
                if (loadedSubmission.ownerEntity || loadedSubmission.footageOwnerCompany || loadedSubmission.licensorEntity) {
                    const el = document.getElementById('ownerEntity');
                    if (el) el.value = loadedSubmission.ownerEntity || loadedSubmission.footageOwnerCompany || loadedSubmission.licensorEntity;
                }
                const ownerVal = loadedSubmission.ownerSignatory || loadedSubmission.footageOwnerName || loadedSubmission.licensorName || loadedSubmission.ownerName || '';
                if (ownerVal && !ownerVal.includes('Footage Owner')) {
                    const sEl = document.getElementById('ownerSignatory');
                    const nEl = document.getElementById('ownerName');
                    if (sEl && !sEl.value) sEl.value = ownerVal;
                    if (nEl && !nEl.value) nEl.value = ownerVal;
                }
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && !emailEl.value) {
                    emailEl.value = loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || 'release@carteblanche.co.za';
                }

                if (loadedSubmission.status === 'completed' || loadedSubmission.status === 'APPROVED' || loadedSubmission.isLocked) {
                    renderCoSignBanner(container, {
                        title: 'Agreement Completed',
                        subtitle: 'This footage agreement has already been fully signed by both parties.',
                        status: 'completed'
                    });
                    if (loadedSubmission.producerSignature) {
                        producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                        producerPad.lock('Signed by Producer');
                    }
                    if (loadedSubmission.ownerSignature || loadedSubmission.participantSignature) {
                        ownerPad.loadDataURL(loadedSubmission.ownerSignature || loadedSubmission.participantSignature, loadedSubmission.ownerSignatory || loadedSubmission.ownerName);
                        ownerPad.lock('Signed by Licensor');
                    }
                    document.getElementById('submitFormBtn').disabled = true;
                    document.getElementById('submitFormBtn').style.display = 'none';
                    document.getElementById('shareForCosignBtn')?.remove();
                    return;
                }

                if (loadedSubmission.producerSignature) {
                    producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                    producerPad.lock(`Signed by Producer: ${loadedSubmission.producerName || ''}`);
                    
                    renderCoSignBanner(container, {
                        title: `Pre-signed by Producer: ${loadedSubmission.producerName || 'Producer'}`,
                        subtitle: 'Please review the footage details and sign below as the footage rights owner / licensor.',
                        status: 'info'
                    });

                    const submitBtn = document.getElementById('submitFormBtn');
                    submitBtn.innerHTML = '<span>✍️</span> Co-Sign & Complete Agreement';
                    document.getElementById('shareForCosignBtn')?.remove();

                    setTimeout(() => {
                        document.getElementById('ownerSignatory')?.focus();
                    }, 400);
                } else if (loadedSubmission.ownerSignature || loadedSubmission.participantSignature) {
                    ownerPad.loadDataURL(loadedSubmission.ownerSignature || loadedSubmission.participantSignature);
                    ownerPad.lock(`Signed by Licensor: ${loadedSubmission.ownerSignatory || loadedSubmission.ownerName || ''}`);
                    
                    renderCoSignBanner(container, {
                        title: `Pre-signed by Licensor: ${loadedSubmission.ownerSignatory || loadedSubmission.ownerName || 'Licensor'}`,
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
        const story = document.getElementById('storyTitle')?.value.trim() || '';
        const producer = document.getElementById('producerName')?.value.trim() || '';
        const ownerSignatory = document.getElementById('ownerSignatory')?.value.trim() || '';
        const ownerEntity = document.getElementById('ownerEntity')?.value.trim() || '';
        const footageDesc = document.getElementById('footageDescription')?.value.trim() || '';
        const broadcastDate = document.getElementById('broadcastDate')?.value || '';
        const submitterEmail = document.getElementById('submitterEmail')?.value.trim() || '';

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
            const { pdfBlob, filename } = await buildCompletedPDF(producerPad, ownerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'footage_release_agreement');
            formData.append('formTitle', 'Footage Agreement 2026');
            formData.append('storyName', story);
            formData.append('storyTitle', story);
            formData.append('commissionNumber', comm);
            formData.append('producerName', producer);
            formData.append('producerEmail', (window.auth?.currentUser?.email) || submitterEmail || '');
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('contributorName', ownerSignatory || ownerEntity || 'Footage Licensor');
            formData.append('ownerSignatory', ownerSignatory);
            formData.append('ownerEntity', ownerEntity);
            formData.append('footageDescription', footageDesc);
            formData.append('broadcastDate', broadcastDate);
            formData.append('dateVal', broadcastDate);
            formData.append('metadata', JSON.stringify({
                ownerEntity,
                ownerSignatory,
                footageDescription: footageDesc,
                broadcastDate
            }));

            const res = await initCoSignAgreement(formData);
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Server error creating co-sign link.');
            }

            openShareModal({
                title: 'Footage Agreement 2026',
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
        if (!producerPad.isEmpty() && (!loadedSubmission || loadedSubmission.status !== 'completed')) {
            handleSendForCoSign();
            return;
        }
        const comm = document.getElementById('commissionNumber')?.value || '';
        const story = document.getElementById('storyTitle')?.value || '';
        openShareModal({
            title: 'Footage Agreement 2026',
            url: window.location.href,
            storyTitle: story,
            commNum: comm
        });
    });

    // Send to Co-Signer Button Handler (Bottom Button)
    document.getElementById('shareForCosignBtn')?.addEventListener('click', handleSendForCoSign);

    // 4. Reset Form Event
    document.getElementById('resetFormBtn').addEventListener('click', () => {
        if (!loadedSubmission || !loadedSubmission.producerSignature) producerPad.clear();
        if (!loadedSubmission || (!loadedSubmission.ownerSignature && !loadedSubmission.participantSignature)) ownerPad.clear();
    });

    // 5. Download & Share Completed PDF Handler
    document.getElementById('downloadCompletedPdfBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            if (submissionId && ownerPad.isEmpty()) {
                const candidateName = document.getElementById('ownerName')?.value.trim() || document.getElementById('ownerSignatory')?.value.trim() || '';
                if (candidateName) ownerPad.autoSignFromName(candidateName);
            }
            const { pdfBlob, filename } = await buildCompletedPDF(producerPad, ownerPad);
            if (submissionId) {
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'Footage_Agreement_2026.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const comm = document.getElementById('commissionNumber')?.value || '';
                const story = document.getElementById('storyTitle')?.value || document.getElementById('storyName')?.value || '';
                await downloadAndSharePDF(pdfBlob, filename, {
                    title: 'Footage Agreement 2026',
                    storyTitle: story,
                    commNum: comm
                });
            }
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
        const form = document.getElementById('footageAgreementForm');

        // 1. Sync ownerSignatory & ownerName
        const sigEl = document.getElementById('ownerSignatory');
        const nameEl = document.getElementById('ownerName');
        if (sigEl && nameEl) {
            if (sigEl.value && !nameEl.value) nameEl.value = sigEl.value;
            if (!sigEl.value && nameEl.value) sigEl.value = nameEl.value;
        }

        // 2. Ensure submitterEmail and pre-filled fields have valid fallbacks so co-signers never get blocked
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

        if (submissionId || loadedSubmission) {
            const commEl = document.getElementById('commissionNumber');
            if (commEl && !commEl.value.trim()) commEl.value = loadedSubmission?.commissionNumber || urlParams.get('comm') || 'N/A';
            const storyEl = document.getElementById('storyTitle');
            if (storyEl && !storyEl.value.trim()) storyEl.value = loadedSubmission?.storyTitle || loadedSubmission?.storyName || urlParams.get('story') || 'Carte Blanche Story';
            const prodEl = document.getElementById('producerName');
            if (prodEl && !prodEl.value.trim()) prodEl.value = loadedSubmission?.producerName || urlParams.get('producer') || 'Carte Blanche Producer';
        }

        // 3. Fallback for ownerEntity
        const entityEl = document.getElementById('ownerEntity');
        if (entityEl && !entityEl.value.trim()) {
            entityEl.value = sigEl?.value?.trim() || 'Individual';
        }

        // 4. Fallback for dates
        const todayStr = new Date().toISOString().split('T')[0];
        ['broadcastDate', 'ownerDate', 'producerDate'].forEach(id => {
            const dEl = document.getElementById(id);
            if (dEl && !dEl.value) dEl.value = todayStr;
        });

        if (!loadedSubmission && !submissionId && ownerPad.isEmpty() && !producerPad.isEmpty()) {
            if (confirm('Footage Licensor signature is empty. Would you like to create a secure co-signing link with your Producer signature and share it with the rights owner?')) {
                handleSendForCoSign();
                return;
            }
        }

        if (!form.checkValidity()) {
            const firstInvalid = form.querySelector(':invalid');
            if (firstInvalid) {
                firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            form.reportValidity();
            return;
        }

        // Auto-sign from entered name if signature pad was left in Draw mode without strokes
        if (ownerPad.isEmpty()) {
            const candidateOwner = nameEl?.value?.trim() || sigEl?.value?.trim() || '';
            if (candidateOwner) {
                ownerPad.autoSignFromName(candidateOwner);
            }
        }
        if (producerPad.isEmpty()) {
            const candidateProd = document.getElementById('producerName')?.value?.trim() || loadedSubmission?.producerName || '';
            if (candidateProd) {
                producerPad.autoSignFromName(candidateProd);
            }
        }

        if (ownerPad.isEmpty()) {
            ownerPad.container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert('Please provide the Owner Signatory Signature before submitting.');
            return;
        }
        if (producerPad.isEmpty()) {
            producerPad.container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert('Please provide the Producer Signature before submitting.');
            return;
        }

        const submitBtn = document.getElementById('submitFormBtn');
        const origSubmitText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>⏳</span> Submitting & Sending Email...';
        submitBtn.disabled = true;

        try {
            const { pdfBlob, filename, metadata } = await buildCompletedPDF(producerPad, ownerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('file', pdfBlob, filename);
            formData.append('formType', 'footage_release_agreement');
            formData.append('formTitle', 'Footage Agreement 2026');
            formData.append('storyTitle', metadata.storyTitle);
            formData.append('storyName', metadata.storyTitle);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.producerName);
            formData.append('footageOwnerName', metadata.ownerSignatory);
            formData.append('footageOwnerCompany', metadata.ownerEntity);
            formData.append('ownerEntity', metadata.ownerEntity);
            formData.append('footageDescription', metadata.footageDesc);
            formData.append('signatoryName', `${metadata.ownerSignatory} (${metadata.ownerEntity})`);
            formData.append('contributorName', metadata.ownerSignatory || metadata.ownerEntity);
            formData.append('ownerSignatory', metadata.ownerSignatory);
            formData.append('submitterEmail', metadata.submitterEmail);
            formData.append('broadcastDated', metadata.broadcastDate);
            formData.append('broadcastDate', metadata.broadcastDate);
            formData.append('dateVal', metadata.broadcastDate);
            if (!producerPad.isEmpty()) {
                formData.append('producerSignature', producerPad.toDataURL());
            }
            if (!ownerPad.isEmpty()) {
                formData.append('participantSignature', ownerPad.toDataURL());
                formData.append('ownerSignature', ownerPad.toDataURL());
            }
            formData.append('metadata', JSON.stringify({
                ownerEntity: metadata.ownerEntity,
                footageDescription: metadata.footageDesc,
                broadcastDate: metadata.broadcastDate,
                producerDate: metadata.producerDate,
                ownerDate: metadata.ownerDate
            }));

            let response;
            const targetSubId = (loadedSubmission && loadedSubmission.id) || submissionId;
            if (targetSubId) {
                formData.append('submissionId', targetSubId);
                formData.append('shareToken', urlParams.get('token') || loadedSubmission?.shareToken || '');
                response = await completeCoSignedAgreement(formData);
            } else {
                response = await submitLegalForm(formData);
            }

            let result;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text.substring(0, 150)}`);
            }

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Server rejected submission.');
            }

            showSubmissionSuccessModal({
                title: 'Footage Agreement 2026',
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

async function buildCompletedPDF(producerPad, ownerPad) {
    if (document.fonts && document.fonts.ready) {
        try {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
        } catch (e) {}
    }
    const ownerSignatory = document.getElementById('ownerSignatory')?.value.trim() || '';
    const ownerName = document.getElementById('ownerName')?.value.trim() || ownerSignatory;
    const ownerEntity = document.getElementById('ownerEntity')?.value.trim() || 'Individual';
    const footageDesc = document.getElementById('footageDescription')?.value.trim() || '';
    const storyTitle = document.getElementById('storyTitle')?.value.trim() || '';
    const commNum = document.getElementById('commissionNumber')?.value.trim() || '';
    const broadcastDate = document.getElementById('broadcastDate')?.value || '';
    const producerName = document.getElementById('producerName')?.value.trim() || '';
    const submitterEmail = document.getElementById('submitterEmail')?.value.trim() || 'release@carteblanche.co.za';
    const producerDate = document.getElementById('producerDate')?.value || new Date().toISOString().split('T')[0];
    const ownerDate = document.getElementById('ownerDate')?.value || new Date().toISOString().split('T')[0];

    const formatDate = (val) => {
        if (!val) return '';
        const parts = val.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return val;
    };

    const templateUrl = 'templates/Carte_Blanche_Footage_Agreement_2026.pdf';
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

    const drawBox = (fieldName, text, isBold = false, opts = {}) => {
        drawInFieldBox(page, fieldMap, fieldName, text, {
            size: fontSize,
            font: isBold ? fontBold : font,
            color: textColor,
            ...opts
        });
    };

    drawBox('footageOwnerName', ownerSignatory, true, { align: 'center' });
    drawBox('footageOwnerCompany', ownerEntity, true, { align: 'center' });
    drawBox('storyTitle', storyTitle, true);
    drawBox('commissionNumber', commNum, true);
    drawBox('broadcastDate', formatDate(broadcastDate));
    drawBox('footageDescription', footageDesc, false, { multiline: true, size: 8.5 });
    drawBox('ownerSignedAt', ownerName || ownerSignatory || 'Johannesburg');
    drawBox('producerSignedAt', producerName || 'Johannesburg');
    drawBox('ownerSignedDate', formatDate(ownerDate));
    drawBox('producerSignedDate', formatDate(producerDate));

    if (!producerPad.isEmpty()) {
        const pSig = await embedSignatureSafe(pdfDoc, producerPad.toDataURL());
        if (pSig) drawSignatureInFieldBox(page, fieldMap, 'producerSignature', pSig);
    }
    if (!ownerPad.isEmpty()) {
        const oSig = await embedSignatureSafe(pdfDoc, ownerPad.toDataURL());
        if (oSig) drawSignatureInFieldBox(page, fieldMap, 'ownerSignature', oSig);
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const cleanStory = (storyTitle || 'Carte_Blanche').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Footage_Agreement_${cleanStory}_2026.pdf`;

    return {
        pdfBlob,
        filename,
        metadata: {
            ownerSignatory,
            ownerEntity,
            footageDesc,
            storyTitle,
            commNum,
            producerName,
            submitterEmail,
            broadcastDate: formatDate(broadcastDate),
            producerDate: formatDate(producerDate),
            ownerDate: formatDate(ownerDate)
        }
    };
}
