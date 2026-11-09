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
    const parentPad = new DualSignaturePad('#parentSigContainer', {
        nameSourceId: 'parentName',
        role: 'cosigner'
    });
    const producerPad = new DualSignaturePad('#producerSigContainer', {
        nameSourceId: 'producerName',
        role: 'producer'
    });

    // 2. Set default date to today
    const dateInput = document.getElementById('signedOn');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Set default place
    const placeInput = document.getElementById('signedAt');
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
                    document.getElementById('signedAt').value = loadedSubmission.place;
                }
                let parsedMeta = {};
                if (loadedSubmission.metadata) {
                    try {
                        parsedMeta = typeof loadedSubmission.metadata === 'string'
                            ? JSON.parse(loadedSubmission.metadata)
                            : loadedSubmission.metadata;
                    } catch (e) {}
                }
                if (loadedSubmission.guardianName || loadedSubmission.parentName || parsedMeta.parentName) {
                    document.getElementById('parentName').value = loadedSubmission.guardianName || loadedSubmission.parentName || parsedMeta.parentName;
                }
                if (loadedSubmission.minorName || loadedSubmission.childName || parsedMeta.childName) {
                    document.getElementById('childName').value = loadedSubmission.minorName || loadedSubmission.childName || parsedMeta.childName;
                }
                if (loadedSubmission.guardianId || loadedSubmission.parentId || loadedSubmission.parentIdNumber || parsedMeta.parentId) {
                    document.getElementById('parentId').value = loadedSubmission.guardianId || loadedSubmission.parentId || loadedSubmission.parentIdNumber || parsedMeta.parentId;
                }
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && !emailEl.value) {
                    emailEl.value = loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || 'release@carteblanche.co.za';
                }

                if (loadedSubmission.status === 'completed' || loadedSubmission.status === 'APPROVED' || loadedSubmission.isLocked) {
                    renderCoSignBanner(container, {
                        title: 'Agreement Completed',
                        subtitle: 'This agreement has already been fully signed by both parties.',
                        status: 'completed'
                    });
                    if (loadedSubmission.producerSignature) {
                        producerPad.loadDataURL(loadedSubmission.producerSignature, loadedSubmission.producerName);
                        producerPad.lock('Signed by Producer');
                    }
                    if (loadedSubmission.parentSignature || loadedSubmission.guardianSignature) {
                        parentPad.loadDataURL(loadedSubmission.parentSignature || loadedSubmission.guardianSignature, loadedSubmission.parentName || loadedSubmission.guardianName);
                        parentPad.lock('Signed by Parent / Guardian');
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
                        subtitle: 'Please review the agreement, complete the parent/guardian details, and sign below to finalize.',
                        status: 'info'
                    });

                    const submitBtn = document.getElementById('submitFormBtn');
                    submitBtn.innerHTML = '<span>✍️</span> Co-Sign & Complete Agreement';
                    document.getElementById('shareForCosignBtn')?.remove();

                    setTimeout(() => {
                        document.getElementById('childName')?.focus();
                    }, 400);
                } else if (loadedSubmission.parentSignature) {
                    parentPad.loadDataURL(loadedSubmission.parentSignature);
                    parentPad.lock(`Signed by Parent/Guardian: ${loadedSubmission.parentName || ''}`);
                    
                    renderCoSignBanner(container, {
                        title: `Pre-signed by Parent/Guardian: ${loadedSubmission.parentName || 'Parent'}`,
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
        const place = document.getElementById('signedAt')?.value.trim() || '';
        const dateVal = document.getElementById('signedOn')?.value || '';
        const childName = document.getElementById('childName')?.value.trim() || '';
        const parentName = document.getElementById('parentName')?.value.trim() || '';

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
            const { pdfBlob, filename } = await buildCompletedPDF(parentPad, producerPad);
            const parentId = document.getElementById('parentId')?.value.trim() || '';
            const submitterEmail = document.getElementById('submitterEmail')?.value.trim() || (window.auth?.getCurrentUser?.()?.email) || (window.auth?.currentUser?.email) || '';

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'minor_release');
            formData.append('formTitle', 'Minor Release Form 2026');
            formData.append('storyName', story);
            formData.append('storyTitle', story);
            formData.append('commissionNumber', comm);
            formData.append('producerName', producer);
            formData.append('producerEmail', submitterEmail);
            formData.append('submitterEmail', submitterEmail);
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('contributorName', parentName ? `${parentName} (Parent of ${childName || 'Minor'})` : 'Parent / Guardian');
            formData.append('childName', childName);
            formData.append('minorName', childName);
            formData.append('parentName', parentName);
            formData.append('guardianName', parentName);
            formData.append('parentIdNumber', parentId);
            formData.append('guardianId', parentId);
            formData.append('place', place);
            formData.append('producerSignedAt', place);
            formData.append('dateVal', dateVal);
            formData.append('producerSignedDate', dateVal);
            formData.append('metadata', JSON.stringify({
                childName: childName,
                parentName: parentName,
                parentId: parentId
            }));

            const res = await initCoSignAgreement(formData);
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Server error creating co-sign link.');
            }

            openShareModal({
                title: 'Minor Release Form 2026',
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
        const story = document.getElementById('storyName')?.value || '';
        openShareModal({
            title: 'Minor Release Form 2026',
            url: window.location.href,
            storyTitle: story,
            commNum: comm
        });
    });

    // Send to Co-Signer Button Handler (Bottom Button)
    document.getElementById('shareForCosignBtn')?.addEventListener('click', handleSendForCoSign);

    // 4. Reset Form Event
    document.getElementById('resetFormBtn').addEventListener('click', () => {
        if (!loadedSubmission || !loadedSubmission.parentSignature) parentPad.clear();
        if (!loadedSubmission || !loadedSubmission.producerSignature) producerPad.clear();
    });

    // 5. Download & Share Completed PDF Handler
    document.getElementById('downloadCompletedPdfBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            if (submissionId && parentPad.isEmpty()) {
                const candidateName = document.getElementById('parentName')?.value.trim() || '';
                if (candidateName) parentPad.autoSignFromName(candidateName);
            }
            const { pdfBlob, filename } = await buildCompletedPDF(parentPad, producerPad);
            if (submissionId) {
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'Minor_Release_2026.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const comm = document.getElementById('commissionNumber')?.value || '';
                const story = document.getElementById('storyName')?.value || '';
                await downloadAndSharePDF(pdfBlob, filename, {
                    title: 'Minor Release Form 2026',
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
        const form = document.getElementById('minorReleaseForm');

        const emailEl = document.getElementById('submitterEmail');
        if (emailEl && !emailEl.value.trim()) {
            if (loadedSubmission) {
                emailEl.value = loadedSubmission.submittedByEmail || loadedSubmission.producerEmail || 'release@carteblanche.co.za';
            } else if (window.auth?.getCurrentUser?.()?.email || window.auth?.currentUser?.email) {
                emailEl.value = window.auth?.getCurrentUser?.()?.email || window.auth?.currentUser?.email;
            } else {
                emailEl.value = 'release@carteblanche.co.za';
            }
        }

        if (submissionId || loadedSubmission) {
            const commEl = document.getElementById('commissionNumber');
            if (commEl && !commEl.value.trim()) commEl.value = loadedSubmission?.commissionNumber || urlParams.get('comm') || 'N/A';
            const storyEl = document.getElementById('storyName');
            if (storyEl && !storyEl.value.trim()) storyEl.value = loadedSubmission?.storyName || loadedSubmission?.storyTitle || urlParams.get('story') || 'Carte Blanche Story';
            const prodEl = document.getElementById('producerName');
            if (prodEl && !prodEl.value.trim()) prodEl.value = loadedSubmission?.producerName || urlParams.get('producer') || 'Carte Blanche Producer';
        }

        const placeEl = document.getElementById('signedAt');
        if (placeEl && !placeEl.value.trim()) placeEl.value = 'Johannesburg';
        const dateEl = document.getElementById('signedOn');
        if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

        if (!loadedSubmission && !submissionId && parentPad.isEmpty() && !producerPad.isEmpty()) {
            if (confirm('Parent / Guardian signature is empty. Would you like to create a secure co-signing link with your Producer signature and share it with the parent?')) {
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

        if (parentPad.isEmpty()) {
            const candidateParent = document.getElementById('parentName')?.value?.trim() || '';
            if (candidateParent) parentPad.autoSignFromName(candidateParent);
        }
        if (producerPad.isEmpty()) {
            const candidateProd = document.getElementById('producerName')?.value?.trim() || loadedSubmission?.producerName || '';
            if (candidateProd) producerPad.autoSignFromName(candidateProd);
        }

        if (parentPad.isEmpty()) {
            parentPad.container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert('Please provide the Parent / Guardian Signature before submitting.');
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
            const { pdfBlob, filename, metadata } = await buildCompletedPDF(parentPad, producerPad);

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'minor_release');
            formData.append('formTitle', 'Minor Release Form 2026');
            formData.append('storyName', metadata.storyName);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.producerName);
            formData.append('signatoryName', `${metadata.childName} (Parent: ${metadata.parentName})`);
            formData.append('contributorName', `${metadata.parentName} (Parent of ${metadata.childName})`);
            formData.append('guardianName', metadata.parentName);
            formData.append('minorName', metadata.childName);
            formData.append('submitterEmail', metadata.submitterEmail);
            formData.append('email', metadata.submitterEmail);
            formData.append('place', metadata.place);
            formData.append('dateVal', metadata.formattedDate);
            formData.append('parentSignature', parentPad.toDataURL());
            formData.append('producerSignature', producerPad.toDataURL());
            formData.append('metadata', JSON.stringify({
                childName: metadata.childName,
                parentName: metadata.parentName,
                parentId: metadata.parentId
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
                title: 'Minor Release Form 2026',
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

async function buildCompletedPDF(parentPad, producerPad) {
    if (document.fonts && document.fonts.ready) {
        try {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
        } catch (e) {}
    }
    const commNum = document.getElementById('commissionNumber').value.trim();
    const storyName = document.getElementById('storyName').value.trim();
    const producerName = document.getElementById('producerName').value.trim();
    const submitterEmail = document.getElementById('submitterEmail').value.trim();
    const childName = document.getElementById('childName').value.trim();
    const parentName = document.getElementById('parentName').value.trim();
    const parentId = document.getElementById('parentId').value.trim();
    const place = document.getElementById('signedAt').value.trim();
    const dateVal = document.getElementById('signedOn').value;

    let formattedDate = dateVal;
    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        formattedDate = `${d}/${m}/${y}`;
    }

    const templateUrl = 'templates/Carte_Blanche_Minor_Release_Form_2026.pdf';
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
    drawBox('childName', childName, true);
    drawBox('parentName', parentName, true);
    drawBox('parentIdNumber', parentId);
    drawBox('parentSignedAt', place);
    drawBox('producerSignedAt', place);
    drawBox('parentSignedDate', formattedDate);
    drawBox('producerSignedDate', formattedDate);

    if (!parentPad.isEmpty()) {
        const parentSigData = parentPad.toDataURL();
        const parentSigImage = await embedSignatureSafe(pdfDoc, parentSigData);
        if (parentSigImage) drawSignatureInFieldBox(page, fieldMap, 'parentSignature', parentSigImage);
    }

    if (!producerPad.isEmpty()) {
        const prodSigData = producerPad.toDataURL();
        const prodSigImage = await embedSignatureSafe(pdfDoc, prodSigData);
        if (prodSigImage) drawSignatureInFieldBox(page, fieldMap, 'producerSignature', prodSigImage);
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const cleanChild = (childName || 'Minor').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanStory = (storyName || 'Carte_Blanche').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Minor_Release_${cleanStory}_${cleanChild}_2026.pdf`;

    return {
        pdfBlob,
        filename,
        metadata: {
            commNum,
            storyName,
            producerName,
            submitterEmail,
            childName,
            parentName,
            parentId,
            place,
            formattedDate
        }
    };
}
