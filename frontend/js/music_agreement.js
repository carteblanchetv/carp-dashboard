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
                if (loadedSubmission.musicTracks) {
                    const el = document.getElementById('musicTracks');
                    if (el) el.value = loadedSubmission.musicTracks;
                }
                if (loadedSubmission.ownerEntity) {
                    const el = document.getElementById('ownerEntity');
                    if (el) el.value = loadedSubmission.ownerEntity;
                }
                const ownerVal = loadedSubmission.ownerSignatory || loadedSubmission.ownerName || '';
                if (ownerVal) {
                    const sEl = document.getElementById('ownerSignatory');
                    const nEl = document.getElementById('ownerName');
                    if (sEl && !sEl.value) sEl.value = ownerVal;
                    if (nEl && !nEl.value) nEl.value = ownerVal;
                }
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && !emailEl.value) {
                    emailEl.value = loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || 'release@carteblanche.co.za';
                }

                if (loadedSubmission.status === 'completed') {
                    renderCoSignBanner(container, {
                        title: 'Agreement Completed',
                        subtitle: 'This music agreement has already been fully signed by both parties.',
                        status: 'completed'
                    });
                    if (loadedSubmission.producerSignature) {
                        producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                        producerPad.lock('Signed by Producer');
                    }
                    if (loadedSubmission.ownerSignature || loadedSubmission.participantSignature) {
                        ownerPad.loadDataURL(loadedSubmission.ownerSignature || loadedSubmission.participantSignature, loadedSubmission.ownerSignatory || loadedSubmission.ownerName);
                        ownerPad.lock('Signed by Rights Holder');
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
                        subtitle: 'Please review the music composition details and sign below as the copyright holder / licensor.',
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
                        title: `Pre-signed by Rights Holder: ${loadedSubmission.ownerSignatory || loadedSubmission.ownerName || 'Licensor'}`,
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
        const musicTracks = document.getElementById('musicTracks')?.value.trim() || '';
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
            formData.append('formType', 'music_agreement');
            formData.append('formTitle', 'Music Agreement 2026');
            formData.append('storyName', story);
            formData.append('storyTitle', story);
            formData.append('commissionNumber', comm);
            formData.append('producerName', producer);
            formData.append('producerEmail', (window.auth?.currentUser?.email) || submitterEmail || '');
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('contributorName', ownerSignatory || ownerEntity || 'Music Rights Holder');
            formData.append('ownerSignatory', ownerSignatory);
            formData.append('ownerEntity', ownerEntity);
            formData.append('musicTracks', musicTracks);
            formData.append('broadcastDate', broadcastDate);
            formData.append('dateVal', broadcastDate);
            formData.append('metadata', JSON.stringify({
                ownerEntity,
                ownerSignatory,
                musicTracks,
                broadcastDate
            }));

            const res = await initCoSignAgreement(formData);
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Server error creating co-sign link.');
            }

            openShareModal({
                title: 'Music Agreement 2026',
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
            title: 'Music Agreement 2026',
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
    document.getElementById('downloadCompletedPdfBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            const { pdfBlob, filename } = await buildCompletedPDF(producerPad, ownerPad);
            const comm = document.getElementById('commissionNumber')?.value || '';
            const story = document.getElementById('storyName')?.value || '';
            await downloadAndSharePDF(pdfBlob, filename, {
                title: 'Music Agreement 2026',
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
        const form = document.getElementById('musicAgreementForm');

        // 1. Sync ownerSignatory & ownerName
        const sigEl = document.getElementById('ownerSignatory');
        const nameEl = document.getElementById('ownerName');
        if (sigEl && nameEl) {
            if (sigEl.value && !nameEl.value) nameEl.value = sigEl.value;
            if (!sigEl.value && nameEl.value) sigEl.value = nameEl.value;
        }

        // 2. Ensure submitterEmail has a valid fallback so co-signers never get blocked
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

        // 3. Fallback for ownerEntity
        const entityEl = document.getElementById('ownerEntity');
        if (entityEl && !entityEl.value.trim()) {
            entityEl.value = sigEl?.value?.trim() || 'Individual';
        }

        // 4. Fallback for dates
        const oDateEl = document.getElementById('ownerDate');
        if (oDateEl && !oDateEl.value) {
            oDateEl.value = new Date().toISOString().split('T')[0];
        }
        const pDateEl = document.getElementById('producerDate');
        if (pDateEl && !pDateEl.value) {
            pDateEl.value = new Date().toISOString().split('T')[0];
        }

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (!loadedSubmission && ownerPad.isEmpty() && !producerPad.isEmpty()) {
            if (confirm('Music Rights Holder signature is empty. Would you like to create a secure co-signing link with your Producer signature and share it with the rights owner?')) {
                handleSendForCoSign();
                return;
            }
        }

        if (ownerPad.isEmpty()) {
            alert('Please provide the Owner Signatory Signature before submitting.');
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
            const { pdfBlob, filename, metadata } = await buildCompletedPDF(producerPad, ownerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'music_agreement');
            formData.append('formTitle', 'Music Agreement 2026');
            formData.append('storyName', metadata.storyTitle);
            formData.append('storyTitle', metadata.storyTitle);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.producerName);
            formData.append('signatoryName', `${metadata.ownerSignatory} (${metadata.ownerEntity})`);
            formData.append('contributorName', metadata.ownerSignatory || metadata.ownerEntity);
            formData.append('ownerSignatory', metadata.ownerSignatory);
            formData.append('submitterEmail', metadata.submitterEmail);
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
                musicTracks: metadata.musicTracks,
                broadcastDate: metadata.broadcastDate,
                producerDate: metadata.producerDate,
                ownerDate: metadata.ownerDate
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
                title: 'Music Agreement 2026',
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
        await document.fonts.ready;
    }
    const ownerSignatory = document.getElementById('ownerSignatory')?.value.trim() || '';
    const ownerName = document.getElementById('ownerName')?.value.trim() || ownerSignatory;
    const ownerEntity = document.getElementById('ownerEntity')?.value.trim() || 'Individual';
    const musicTracks = document.getElementById('musicTracks')?.value.trim() || '';
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

    const templateUrl = 'templates/Carte_Blanche_Music_Agreement_2026.pdf';
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

    drawBox('musicOwnerName', ownerSignatory, true, { align: 'center' });
    drawBox('musicOwnerCompany', ownerEntity, true, { align: 'center' });
    drawBox('storyTitle', storyTitle, true);
    drawBox('commissionNumber', commNum, true);
    drawBox('broadcastDate', formatDate(broadcastDate));

    if (musicTracks) {
        const trackLines = musicTracks.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (trackLines[0]) drawBox('musicTrackTitle', trackLines[0]);
        if (trackLines[1]) drawBox('musicTrackTitle2', trackLines[1]);
        if (trackLines.length > 2) drawBox('musicTrackTitle3', trackLines.slice(2).join(' ; '));
    }

    drawBox('ownerSignedAt', ownerName || ownerSignatory || 'Johannesburg');
    drawBox('producerSignedAt', producerName || 'Johannesburg');
    drawBox('ownerSignedDate', formatDate(ownerDate));
    drawBox('producerSignedDate', formatDate(producerDate));

    if (!producerPad.isEmpty()) {
        const pSig = await pdfDoc.embedPng(producerPad.toDataURL());
        drawSignatureInFieldBox(page, fieldMap, 'producerSignature', pSig);
    }
    if (!ownerPad.isEmpty()) {
        const oSig = await pdfDoc.embedPng(ownerPad.toDataURL());
        drawSignatureInFieldBox(page, fieldMap, 'ownerSignature', oSig);
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const cleanStory = (storyTitle || 'Carte_Blanche').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Music_Agreement_${cleanStory}_2026.pdf`;

    return {
        pdfBlob,
        filename,
        metadata: {
            ownerSignatory,
            ownerEntity,
            musicTracks,
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
