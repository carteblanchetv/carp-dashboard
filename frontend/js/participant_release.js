import {
    submitLegalForm,
    initCoSignAgreement,
    getAgreementForCoSign,
    completeCoSignedAgreement,
    renderCoSignBanner,
    showSubmissionSuccessModal,
    normalizeDateForInput,
    getActiveProducerEmail,
    safeDrawField,
    cleanPdfText,
    prepareTemplatePdf,
    drawInFieldBox,
    drawSignatureInFieldBox,
    embedSignatureSafe
} from './form_submission_helper.js?v=5.4.3';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.4.3';

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
    const actionParam = urlParams.get('action') || '';
    const isEditMode = urlParams.get('mode') === 'edit';
    const isProducerAction = isEditMode || actionParam === 'approve' || actionParam === 'countersign';
    const isExternalCoSign = Boolean(submissionId && !isProducerAction);
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

    // Check if loading an existing agreement for co-signing, approval, or editing
    if (submissionId) {
        if (isExternalCoSign) {
            document.documentElement.classList.add('co-sign-mode');
            document.body?.classList.add('co-sign-mode');
            document.querySelector('.global-top-nav')?.remove();
            document.getElementById('masqueradeBanner')?.remove();
            document.getElementById('resetFormBtn')?.remove();
            document.getElementById('downloadBlankPdfBtn')?.remove();
            document.getElementById('shareForCosignBtn')?.remove();
            document.getElementById('shareFormBtn')?.remove();
        }
        const dlBtn = document.getElementById('downloadCompletedPdfBtn');
        if (dlBtn) {
            dlBtn.innerHTML = '<span>📥</span> Download PDF Copy';
        }

        (async () => {
            try {
                loadedSubmission = await getAgreementForCoSign(submissionId);
                const container = document.querySelector('.form-card-container') || document.querySelector('.form-container') || document.querySelector('form');

                let parsedMeta = {};
                if (loadedSubmission.metadata) {
                    try {
                        parsedMeta = typeof loadedSubmission.metadata === 'string'
                            ? JSON.parse(loadedSubmission.metadata)
                            : loadedSubmission.metadata;
                    } catch (e) {}
                }

                if (loadedSubmission.commissionNumber || parsedMeta.commissionNumber) {
                    const el = document.getElementById('commissionNumber');
                    el.value = loadedSubmission.commissionNumber || parsedMeta.commissionNumber;
                    el.readOnly = isExternalCoSign;
                }
                if (loadedSubmission.storyName || loadedSubmission.storyTitle || parsedMeta.storyName || parsedMeta.storyTitle) {
                    const el = document.getElementById('storyName');
                    el.value = loadedSubmission.storyName || loadedSubmission.storyTitle || parsedMeta.storyName || parsedMeta.storyTitle;
                    el.readOnly = isExternalCoSign;
                }
                if (loadedSubmission.producerName || parsedMeta.producerName) {
                    const el = document.getElementById('producerName');
                    el.value = loadedSubmission.producerName || parsedMeta.producerName;
                    el.readOnly = isExternalCoSign;
                }
                const resolvedPlace = loadedSubmission.place || loadedSubmission.participantSignedAt || loadedSubmission.producerSignedAt || parsedMeta.place;
                if (resolvedPlace) {
                    document.getElementById('placeOfSignature').value = resolvedPlace;
                }
                const resolvedDate = normalizeDateForInput(loadedSubmission.dateVal || loadedSubmission.participantSignedDate || loadedSubmission.producerSignedDate || parsedMeta.dateVal);
                if (resolvedDate && dateInput) {
                    dateInput.value = resolvedDate;
                }
                const resolvedName = loadedSubmission.fullName || loadedSubmission.participantName || loadedSubmission.contributorName || parsedMeta.participantName;
                if (resolvedName && !resolvedName.includes('Pending') && resolvedName !== 'Co-Signer') {
                    document.getElementById('participantName').value = resolvedName;
                }
                const resolvedId = loadedSubmission.idNumber || loadedSubmission.participantId || parsedMeta.participantId || parsedMeta.idNumber;
                if (resolvedId) {
                    document.getElementById('participantId').value = resolvedId;
                }
                const resolvedContact = loadedSubmission.phone || loadedSubmission.contactNumber || loadedSubmission.participantContact || parsedMeta.participantContact || parsedMeta.phone || parsedMeta.contactNumber;
                if (resolvedContact) {
                    document.getElementById('participantContact').value = resolvedContact;
                }
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && (!emailEl.value || emailEl.value === 'release@carteblanche.co.za')) {
                    const candidateEmail = (loadedSubmission.producerEmail && loadedSubmission.producerEmail !== 'lezanne@carteblanche.co.za')
                        ? loadedSubmission.producerEmail
                        : (loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || '');
                    emailEl.value = getActiveProducerEmail(candidateEmail) || 'release@carteblanche.co.za';
                }

                const hasProdSig = Boolean(loadedSubmission.producerSignature);
                const hasPartSig = Boolean(loadedSubmission.participantSignature);

                if (hasProdSig) {
                    producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                    if (!isEditMode) {
                        producerPad.lock(`Signed by Producer: ${loadedSubmission.producerName || ''}`);
                    }
                }
                if (hasPartSig) {
                    participantPad.loadDataURL(loadedSubmission.participantSignature, loadedSubmission.participantName || loadedSubmission.fullName);
                    if (!isEditMode) {
                        participantPad.lock(`Signed by Participant: ${loadedSubmission.participantName || loadedSubmission.fullName || ''}`);
                    }
                }

                const submitBtn = document.getElementById('submitFormBtn');
                const shareCosignBtn = document.getElementById('shareForCosignBtn');

                if (isEditMode) {
                    renderCoSignBanner(container, {
                        title: '✏️ Edit Mode — Modify Agreement Details',
                        subtitle: hasPartSig
                            ? 'Update any fields or signatures below and click "Save Updated Agreement" to regenerate the signed PDF.'
                            : 'Update any fields below, then click "Save & Share Co-Sign Link" to send to the participant, or complete both signatures to finalize.',
                        status: 'info',
                        actionBtn: !hasPartSig ? { label: '🔗 Share Co-Signer Link', onClick: () => handleSendForCoSign() } : null
                    });
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.style.display = '';
                        submitBtn.innerHTML = hasPartSig
                            ? '<span>💾</span> Save Updated Agreement'
                            : '<span>✍️</span> Co-Sign & Complete Agreement';
                    }
                    if (shareCosignBtn) {
                        if (hasPartSig) {
                            shareCosignBtn.remove();
                        } else {
                            shareCosignBtn.innerHTML = '<span>🔗</span> Save & Share Co-Sign Link';
                        }
                    }
                    return;
                }

                if (loadedSubmission.status === 'completed' || loadedSubmission.status === 'APPROVED' || (isExternalCoSign && loadedSubmission.isLocked)) {
                    renderCoSignBanner(container, {
                        title: 'Agreement Completed',
                        subtitle: 'This agreement has already been fully signed by both parties.',
                        status: 'completed'
                    });
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.style.display = 'none';
                    }
                    shareCosignBtn?.remove();
                    return;
                }

                if (hasProdSig && hasPartSig) {
                    renderCoSignBanner(container, {
                        title: '✅ Co-Signed by Participant — Ready for Producer Approval',
                        subtitle: 'Both signatures are recorded. Please review the details below and click "Approve & Finalize Agreement" to complete and email the executed PDF.',
                        status: 'info'
                    });
                    if (submitBtn) {
                        submitBtn.innerHTML = '<span>✅</span> Approve & Finalize Agreement';
                    }
                    shareCosignBtn?.remove();
                } else if (hasProdSig && !hasPartSig) {
                    if (isProducerAction) {
                        renderCoSignBanner(container, {
                            title: `⏳ Pre-Signed by Producer (${loadedSubmission.producerName || 'Producer'}) — Awaiting Participant`,
                            subtitle: 'Click "Share Co-Signer Link" to send the signing link to the participant, or have them complete their details and sign below in person.',
                            status: 'info',
                            actionBtn: { label: '🔗 Share Co-Signer Link', onClick: () => handleSendForCoSign() }
                        });
                        if (shareCosignBtn) {
                            shareCosignBtn.innerHTML = '<span>🔗</span> Share Co-Signer Link';
                        }
                        if (submitBtn) {
                            submitBtn.innerHTML = '<span>✍️</span> Co-Sign & Complete Agreement';
                        }
                    } else {
                        renderCoSignBanner(container, {
                            title: `Pre-signed by Producer: ${loadedSubmission.producerName || 'Producer'}`,
                            subtitle: 'Please review the agreement, complete your participant details, and sign below to finalize.',
                            status: 'info'
                        });
                        if (submitBtn) {
                            submitBtn.innerHTML = '<span>✍️</span> Co-Sign & Complete Agreement';
                        }
                        shareCosignBtn?.remove();
                        setTimeout(() => {
                            document.getElementById('participantName')?.focus();
                        }, 400);
                    }
                } else if (!hasProdSig && hasPartSig) {
                    renderCoSignBanner(container, {
                        title: `Pre-signed by Participant: ${loadedSubmission.participantName || loadedSubmission.fullName || 'Participant'}`,
                        subtitle: 'Please review the agreement and sign as Producer to complete.',
                        status: 'info'
                    });
                    if (submitBtn) {
                        submitBtn.innerHTML = '<span>✍️</span> Countersign & Complete Agreement';
                    }
                    shareCosignBtn?.remove();
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
            producerPad.autoSignFromName(producer);
        }

        if (producerPad.isEmpty()) {
            alert('Please sign your Producer Signature pad before sending for co-signing.');
            producerPad.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const btn = document.getElementById('shareForCosignBtn') || document.getElementById('shareFormBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<span>⏳</span> Creating Co-Sign Link...';
            btn.disabled = true;
        }

        try {
            const { pdfBlob, filename } = await buildCompletedPDF(participantPad, producerPad);
            const participantId = document.getElementById('participantId')?.value.trim() || '';
            const participantContact = document.getElementById('participantContact')?.value.trim() || '';
            const submitterEmail = getActiveProducerEmail(document.getElementById('submitterEmail')?.value.trim());

            const formData = new FormData();
            const targetSubId = (loadedSubmission && loadedSubmission.id) || submissionId;
            if (targetSubId) {
                formData.append('submissionId', targetSubId);
                if (loadedSubmission?.shareToken || urlParams.get('token')) {
                    formData.append('shareToken', loadedSubmission?.shareToken || urlParams.get('token'));
                }
            }
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'participant_release');
            formData.append('formTitle', 'Participant Release Form 2026');
            formData.append('storyName', story);
            formData.append('storyTitle', story);
            formData.append('commissionNumber', comm);
            formData.append('producerName', producer);
            formData.append('producerEmail', submitterEmail);
            formData.append('submitterEmail', submitterEmail);
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('contributorName', participant);
            formData.append('participantName', participant);
            formData.append('fullName', participant);
            formData.append('idNumber', participantId);
            formData.append('participantId', participantId);
            formData.append('contactNumber', participantContact);
            formData.append('phone', participantContact);
            formData.append('participantContact', participantContact);
            formData.append('place', place);
            formData.append('producerSignedAt', place);
            formData.append('dateVal', dateVal);
            formData.append('producerSignedDate', dateVal);
            formData.append('metadata', JSON.stringify({
                participantId,
                participantContact
            }));

            const res = await initCoSignAgreement(formData);
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Server error creating co-sign link.');
            }

            const finalShareUrl = result.shareUrl || loadedSubmission?.shareUrl || `${window.location.origin}/s/${result.shareToken || loadedSubmission?.shareToken || targetSubId}`;
            openShareModal({
                title: 'Participant Release Form 2026',
                url: finalShareUrl,
                storyTitle: story,
                commNum: comm
            });
        } catch (err) {
            console.error('Send for co-sign failed:', err);
            alert('Error creating co-sign link: ' + err.message);
        } finally {
            if (btn) {
                btn.innerHTML = origText;
                btn.disabled = false;
            }
        }
    }

    // Share Form Handler (Top Button)
    document.getElementById('shareFormBtn')?.addEventListener('click', () => {
        // If producer has signed, offer co-signing link with signature
        if (!producerPad.isEmpty() && (!loadedSubmission || (loadedSubmission.status !== 'completed' && loadedSubmission.status !== 'APPROVED'))) {
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
    document.getElementById('resetFormBtn')?.addEventListener('click', () => {
        if (!loadedSubmission || !loadedSubmission.participantSignature || isEditMode) participantPad.clear();
        if (!loadedSubmission || !loadedSubmission.producerSignature || isEditMode) producerPad.clear();
    });

    // 5. Download & Share Completed PDF Handler
    document.getElementById('downloadCompletedPdfBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            if (isExternalCoSign && participantPad.isEmpty()) {
                const candidateName = document.getElementById('participantName')?.value.trim() || '';
                if (candidateName) participantPad.autoSignFromName(candidateName);
            }
            const { pdfBlob, filename } = await buildCompletedPDF(participantPad, producerPad);
            if (isExternalCoSign) {
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'Participant_Release_2026.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const comm = document.getElementById('commissionNumber')?.value || '';
                const story = document.getElementById('storyName')?.value || '';
                await downloadAndSharePDF(pdfBlob, filename, {
                    title: 'Participant Release Form 2026',
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
        const form = document.getElementById('participantReleaseForm');

        const emailEl = document.getElementById('submitterEmail');
        if (emailEl && (!emailEl.value.trim() || emailEl.value.trim() === 'release@carteblanche.co.za')) {
            const activeEmail = getActiveProducerEmail(
                loadedSubmission?.producerEmail !== 'lezanne@carteblanche.co.za'
                    ? (loadedSubmission?.producerEmail || loadedSubmission?.submittedByEmail)
                    : (loadedSubmission?.submittedByEmail || loadedSubmission?.producerEmail)
            );
            emailEl.value = activeEmail || 'release@carteblanche.co.za';
        }

        if (submissionId || loadedSubmission) {
            const commEl = document.getElementById('commissionNumber');
            if (commEl && !commEl.value.trim()) commEl.value = loadedSubmission?.commissionNumber || urlParams.get('comm') || 'N/A';
            const storyEl = document.getElementById('storyName');
            if (storyEl && !storyEl.value.trim()) storyEl.value = loadedSubmission?.storyName || loadedSubmission?.storyTitle || urlParams.get('story') || 'Carte Blanche Story';
            const prodEl = document.getElementById('producerName');
            if (prodEl && !prodEl.value.trim()) prodEl.value = loadedSubmission?.producerName || urlParams.get('producer') || 'Carte Blanche Producer';
        }

        const placeEl = document.getElementById('placeOfSignature');
        if (placeEl && !placeEl.value.trim()) placeEl.value = 'Johannesburg';
        const dateEl = document.getElementById('dateOfSignature');
        if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

        // If producer is on CARP and participant has not yet signed, offer to save & share the co-signing link
        if (!isExternalCoSign && participantPad.isEmpty() && !producerPad.isEmpty()) {
            if (confirm('Participant signature is empty.\n\nClick OK to save changes and open the secure Co-Signer Share Link to send to the participant.\nClick Cancel if the participant is with you in person and ready to sign now.')) {
                handleSendForCoSign();
                return;
            }
        }

        if (!form.checkValidity()) {
            const firstInvalid = form.querySelector(':invalid');
            if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            form.reportValidity();
            return;
        }

        if (isExternalCoSign && participantPad.isEmpty()) {
            const candidatePart = document.getElementById('participantName')?.value?.trim() || '';
            if (candidatePart) participantPad.autoSignFromName(candidatePart);
        }
        if (producerPad.isEmpty()) {
            const candidateProd = document.getElementById('producerName')?.value?.trim() || loadedSubmission?.producerName || '';
            if (candidateProd) producerPad.autoSignFromName(candidateProd);
        }

        if (participantPad.isEmpty()) {
            participantPad.container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert('Please provide the Participant Signature (Draw or Type) before submitting, or click "Send to Co-Signer" to share a signing link.');
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
            const { pdfBlob, filename, metadata } = await buildCompletedPDF(participantPad, producerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'participant_release');
            formData.append('formTitle', 'Participant Release Form 2026');
            formData.append('storyName', metadata.storyName);
            formData.append('storyTitle', metadata.storyName);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.producerName);
            formData.append('producerEmail', metadata.submitterEmail);
            formData.append('signatoryName', metadata.participantName);
            formData.append('contributorName', metadata.participantName);
            formData.append('participantName', metadata.participantName);
            formData.append('fullName', metadata.participantName);
            formData.append('idNumber', metadata.participantId);
            formData.append('participantId', metadata.participantId);
            formData.append('contactNumber', metadata.participantContact);
            formData.append('phone', metadata.participantContact);
            formData.append('participantContact', metadata.participantContact);
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
            const targetSubId = (loadedSubmission && loadedSubmission.id) || submissionId;
            if (targetSubId) {
                formData.append('submissionId', targetSubId);
                formData.append('shareToken', urlParams.get('token') || loadedSubmission?.shareToken || '');
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
        try {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
        } catch (e) {}
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
        const pSigImage = await embedSignatureSafe(pdfDoc, pSigData);
        if (pSigImage) drawSignatureInFieldBox(page, fieldMap, 'participantSignature', pSigImage);
    }

    if (!producerPad.isEmpty()) {
        const prSigData = producerPad.toDataURL();
        const prSigImage = await embedSignatureSafe(pdfDoc, prSigData);
        if (prSigImage) drawSignatureInFieldBox(page, fieldMap, 'producerSignature', prSigImage);
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
