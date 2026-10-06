// countersign_ui.js - Universal Two-Party Signing & Countersigning Flow for Carte Blanche Forms
// Manages contributor signature, in-person producer countersigning, and remote countersign mode (?id=...&action=countersign)

(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    const isCountersignMode = (urlParams.get('action') === 'countersign' || urlParams.get('mode') === 'countersign') && !!submissionId;

    let producerCanvas = null;
    let producerCtx = null;
    let producerSigMethod = 'draw';
    let loadedSubmission = null;

    /**
     * Check if the form is currently in countersign mode
     */
    function isCountersigning() {
        return isCountersignMode;
    }

    /**
     * Get the loaded submission data if in countersign mode
     */
    function getLoadedSubmission() {
        return loadedSubmission;
    }

    /**
     * Initialize the Countersigning UI and flow
     */
    async function initDualSigning({
        formId,
        formType,
        formTitle,
        contributorSigCanvasId = 'signatureCanvas',
        contributorClearBtnId = 'clearSigBtn',
        contributorSigLabel = 'Participant Signature',
        onSubmissionLoaded = null,
        buildDualPdf = null,
        standardSubmitEndpoint = ''
    }) {
        const form = document.getElementById(formId);
        if (!form) return;

        const loadingOverlay = document.getElementById('loadingOverlay');

        // 1. Inject Countersign UI elements
        injectCountersignContainers(form, contributorSigLabel);

        // 2. Setup Producer Signature Pad
        setupProducerSignaturePad();

        // 3. If in Countersign Mode: fetch submission and lock contributor fields
        if (isCountersignMode) {
            try {
                if (loadingOverlay) loadingOverlay.classList.add('active');
                const resp = await fetch(`/api/get-form-for-countersign/${submissionId}`);
                const data = await resp.json();
                if (!data.success || !data.submission) {
                    throw new Error(data.error || 'Failed to load agreement for countersigning');
                }

                loadedSubmission = data.submission;
                applyCountersignMode(form, loadedSubmission, onSubmissionLoaded, contributorSigLabel);

            } catch (err) {
                console.error('Error loading countersign data:', err);
                alert('Could not load agreement: ' + err.message);
            } finally {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
            }
        } else {
            // Normal Mode: Check if logged in user is producer and show optional in-person countersign
            setupInPersonToggle();

            // Pre-fill from URL parameters (when filling online or opening shared link)
            const commParam = urlParams.get('comm') || urlParams.get('commission') || urlParams.get('commissionNumber') || urlParams.get('commission_number');
            const storyParam = urlParams.get('story') || urlParams.get('storyName') || urlParams.get('story_title') || urlParams.get('project');
            const prodParam = urlParams.get('producer') || urlParams.get('producerName');
            const prodEmailParam = urlParams.get('producerEmail');
            const nameParam = urlParams.get('name') || urlParams.get('participantName') || urlParams.get('fullName');

            if (commParam && document.getElementById('commissionNumber')) {
                document.getElementById('commissionNumber').value = commParam;
            }
            if (storyParam && document.getElementById('storyName')) {
                document.getElementById('storyName').value = storyParam;
            }
            if (prodParam) {
                if (document.getElementById('producerName')) document.getElementById('producerName').value = prodParam;
                if (document.getElementById('prodSignerName')) document.getElementById('prodSignerName').value = prodParam;
            }
            if (prodEmailParam) {
                if (document.getElementById('producerEmail')) document.getElementById('producerEmail').value = prodEmailParam;
                if (document.getElementById('prodSignerEmail')) document.getElementById('prodSignerEmail').value = prodEmailParam;
            }
            if (nameParam) {
                const nameInp = document.getElementById('fullName') || document.getElementById('guardianName') || document.getElementById('ownerName') || document.getElementById('licensorName') || document.getElementById('artistName');
                if (nameInp) nameInp.value = nameParam;
            }
        }

        // 4. Intercept form submit to handle dual signing or countersigning
        setupFormSubmitHandler({
            form,
            formType,
            formTitle,
            contributorSigCanvasId,
            buildDualPdf,
            standardSubmitEndpoint,
            loadingOverlay
        });
    }

    /**
     * Inject DOM containers for banners, verified signature, and producer signature pad
     */
    function injectCountersignContainers(form, contributorLabel) {
        // Banner container at top of form
        const bannerContainer = document.createElement('div');
        bannerContainer.id = 'countersignBannerContainer';
        form.parentNode.insertBefore(bannerContainer, form);

        // Producer signature section before submit buttons
        const submitGroup = form.querySelector('div[style*="justify-content: flex-end"]') || form.lastElementChild;
        const producerSection = document.createElement('section');
        producerSection.className = 'form-section';
        producerSection.id = 'producerSignatureSection';
        producerSection.style.display = 'none'; // hidden by default until toggled or in countersign mode
        producerSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h2 class="section-title" style="margin-bottom: 0;">Producer Counter-Signature</h2>
                <span class="form-tag" style="background: rgba(0, 143, 190, 0.1); color: var(--primary);">On behalf of M-Net &amp; Carte Blanche</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1rem;">
                Official producer authorization. Once signed, this agreement will be finalized and dispatched to <strong>release@carteblanche.co.za</strong>.
            </p>
            <div class="form-grid" style="margin-bottom: 1rem;">
                <div class="form-group">
                    <label for="prodSignerName">Producer Name</label>
                    <input type="text" id="prodSignerName" placeholder="Producer full name..." required>
                </div>
                <div class="form-group">
                    <label for="prodSignerEmail">Producer Email</label>
                    <input type="email" id="prodSignerEmail" placeholder="producer@carteblanche.co.za" required>
                </div>
            </div>
            <div class="form-group full-width">
                <label>Producer Signature</label>
                <div class="signature-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <button type="button" id="tabProducerDraw" class="sig-tab active" style="padding: 0.4rem 1rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-card); color: var(--text-main); cursor: pointer; font-size: 0.85rem; font-weight: 600;">Draw Signature</button>
                    <button type="button" id="tabProducerType" class="sig-tab" style="padding: 0.4rem 1rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-card); color: var(--text-main); cursor: pointer; font-size: 0.85rem; font-weight: 600;">Type Signature</button>
                </div>
                <div id="producerTypeSignatureControls" style="margin-bottom: 0.5rem; display: none;">
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="text" id="producerTypeSigInput" placeholder="Type producer name..." style="flex: 1; padding: 0.5rem; border: 1px solid var(--border); border-radius: 4px; font-size: 1rem;">
                        <select id="producerTypeSigFont" style="padding: 0.5rem; border: 1px solid var(--border); border-radius: 4px; font-size: 1rem; cursor: pointer;">
                            <option value="Caveat">Caveat (Cursive)</option>
                            <option value="Dancing Script">Dancing Script (Elegant)</option>
                            <option value="Great Vibes">Great Vibes (Classic)</option>
                            <option value="Pacifico">Pacifico (Retro)</option>
                        </select>
                    </div>
                </div>
                <div class="signature-pad-container">
                    <canvas id="producerSignatureCanvas" class="signature-pad" width="600" height="140"></canvas>
                    <button type="button" id="clearProducerSigBtn" class="clear-sig-btn">Clear</button>
                </div>
            </div>
        `;

        form.insertBefore(producerSection, submitGroup);

        // Pre-fill producer credentials if cached
        try {
            const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
            if (userStr) {
                const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                if (name && document.getElementById('prodSignerName')) document.getElementById('prodSignerName').value = name;
                if (u.email && document.getElementById('prodSignerEmail')) document.getElementById('prodSignerEmail').value = u.email;
            }
        } catch (e) {}
    }

    /**
     * Setup Draw/Type events for producer signature canvas
     */
    function setupProducerSignaturePad() {
        producerCanvas = document.getElementById('producerSignatureCanvas');
        if (!producerCanvas) return;

        producerCtx = producerCanvas.getContext('2d');
        const clearBtn = document.getElementById('clearProducerSigBtn');
        const tabDraw = document.getElementById('tabProducerDraw');
        const tabType = document.getElementById('tabProducerType');
        const typeControls = document.getElementById('producerTypeSignatureControls');
        const typeInput = document.getElementById('producerTypeSigInput');
        const typeFont = document.getElementById('producerTypeSigFont');

        tabDraw.addEventListener('click', () => {
            producerSigMethod = 'draw';
            tabDraw.classList.add('active');
            tabType.classList.remove('active');
            typeControls.style.display = 'none';
            producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
            producerCanvas.style.pointerEvents = 'auto';
        });

        tabType.addEventListener('click', () => {
            producerSigMethod = 'type';
            tabType.classList.add('active');
            tabDraw.classList.remove('active');
            typeControls.style.display = 'block';
            producerCanvas.style.pointerEvents = 'none';
            renderProducerTypedSignature();
        });

        function renderProducerTypedSignature() {
            producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
            const text = typeInput.value.trim();
            if (!text) return;
            const font = typeFont.value;
            producerCtx.font = `italic 38px "${font}", cursive`;
            producerCtx.fillStyle = '#000000';
            producerCtx.textBaseline = 'middle';
            producerCtx.textAlign = 'center';
            producerCtx.fillText(text, producerCanvas.width / 2, producerCanvas.height / 2);
        }

        typeInput.addEventListener('input', renderProducerTypedSignature);
        typeFont.addEventListener('change', renderProducerTypedSignature);

        let drawing = false;
        function getMousePos(canvasDom, e) {
            const rect = canvasDom.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (canvasDom.width / rect.width),
                y: (clientY - rect.top) * (canvasDom.height / rect.height)
            };
        }

        producerCanvas.addEventListener('mousedown', (e) => {
            if (producerSigMethod !== 'draw') return;
            drawing = true;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.beginPath();
            producerCtx.moveTo(pos.x, pos.y);
        });

        producerCanvas.addEventListener('mousemove', (e) => {
            if (producerSigMethod !== 'draw' || !drawing) return;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.lineWidth = 2;
            producerCtx.lineCap = 'round';
            producerCtx.strokeStyle = '#000000';
            producerCtx.lineTo(pos.x, pos.y);
            producerCtx.stroke();
        });

        producerCanvas.addEventListener('mouseup', () => drawing = false);
        producerCanvas.addEventListener('mouseleave', () => drawing = false);

        producerCanvas.addEventListener('touchstart', (e) => {
            if (producerSigMethod !== 'draw') return;
            e.preventDefault();
            drawing = true;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.beginPath();
            producerCtx.moveTo(pos.x, pos.y);
        }, { passive: false });

        producerCanvas.addEventListener('touchmove', (e) => {
            if (producerSigMethod !== 'draw') return;
            e.preventDefault();
            if (!drawing) return;
            const pos = getMousePos(producerCanvas, e);
            producerCtx.lineWidth = 2;
            producerCtx.lineCap = 'round';
            producerCtx.strokeStyle = '#000000';
            producerCtx.lineTo(pos.x, pos.y);
            producerCtx.stroke();
        }, { passive: false });

        producerCanvas.addEventListener('touchend', () => drawing = false);

        clearBtn.addEventListener('click', () => {
            if (producerSigMethod === 'draw') {
                producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
            } else {
                typeInput.value = '';
                renderProducerTypedSignature();
            }
        });
    }

    /**
     * Setup In-person toggle when producer is present with contributor
     */
    function setupInPersonToggle() {
        const producerSection = document.getElementById('producerSignatureSection');
        if (!producerSection) return;

        const toggleContainer = document.createElement('div');
        toggleContainer.style.margin = '1.5rem 0 1rem 0';
        toggleContainer.style.background = 'var(--bg-card)';
        toggleContainer.style.border = '1px dashed var(--border)';
        toggleContainer.style.borderRadius = '8px';
        toggleContainer.style.padding = '0.85rem 1.25rem';
        toggleContainer.style.display = 'flex';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.justifyContent = 'space-between';
        toggleContainer.style.cursor = 'pointer';

        toggleContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.25rem;">✍️</span>
                <div>
                    <strong style="font-size: 0.9rem; color: var(--text-main);">Producer Present? Sign Together Now</strong>
                    <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">
                        If producer and contributor are together in the field, producer can countersign now to immediately dispatch to Legal.
                    </p>
                </div>
            </div>
            <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0;">
                <input type="checkbox" id="producerPresentCheckbox" style="opacity: 0; width: 0; height: 0;">
                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border); transition: .3s; border-radius: 24px;" class="slider"></span>
            </label>
        `;

        const checkbox = toggleContainer.querySelector('#producerPresentCheckbox');
        const slider = toggleContainer.querySelector('.slider');

        function updateToggle() {
            if (checkbox.checked) {
                slider.style.backgroundColor = 'var(--primary)';
                producerSection.style.display = 'block';
                producerSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                slider.style.backgroundColor = 'var(--border)';
                producerSection.style.display = 'none';
            }
        }

        checkbox.addEventListener('change', updateToggle);
        toggleContainer.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                updateToggle();
            }
        });

        producerSection.parentNode.insertBefore(toggleContainer, producerSection);
    }

    /**
     * Apply Countersign Mode: lock fields, display contributor signature, activate producer pad
     */
    function applyCountersignMode(form, sub, onSubmissionLoaded, contributorLabel) {
        // 1. Show Top Banner
        const bannerContainer = document.getElementById('countersignBannerContainer');
        if (bannerContainer) {
            bannerContainer.innerHTML = `
                <div style="background: linear-gradient(135deg, rgba(0, 143, 190, 0.12), rgba(99, 102, 241, 0.08)); border: 2px solid var(--primary); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 2rem; box-shadow: var(--shadow-md);">
                    <div style="display: flex; align-items: flex-start; gap: 1rem;">
                        <span style="font-size: 2rem; line-height: 1;">✍️</span>
                        <div style="flex: 1;">
                            <h3 style="margin: 0 0 0.35rem 0; color: var(--primary); font-size: 1.15rem; font-weight: 800;">ACTION REQUIRED: PRODUCER COUNTERSIGNATURE</h3>
                            <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: var(--text-main); line-height: 1.5;">
                                <strong>${escapeHtml(sub.contributorName || sub.fullName || sub.ownerName || sub.guardianName || sub.licensorName || 'Contributor')}</strong> has completed and signed this agreement.
                            </p>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                Please review the details below. Once you add your signature and click <strong>Approve &amp; Submit to Legal</strong>, the finalized agreement will be dispatched to <strong>release@carteblanche.co.za</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        // 2. Populate fields from sub
        if (typeof onSubmissionLoaded === 'function') {
            onSubmissionLoaded(sub);
        }

        // Prefill producer name and email if available in submission
        if (sub.producerName && document.getElementById('prodSignerName') && !document.getElementById('prodSignerName').value) {
            document.getElementById('prodSignerName').value = sub.producerName;
        }
        if (sub.producerEmail && document.getElementById('prodSignerEmail') && !document.getElementById('prodSignerEmail').value) {
            document.getElementById('prodSignerEmail').value = sub.producerEmail;
        }

        // 3. Lock all contributor inputs to read-only
        const inputs = form.querySelectorAll('input:not(#prodSignerName):not(#prodSignerEmail):not(#producerTypeSigInput), textarea, select');
        inputs.forEach(inp => {
            inp.readOnly = true;
            if (inp.type === 'checkbox') inp.disabled = true;
            inp.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
            inp.style.borderColor = 'var(--border)';
        });

        // 4. Replace contributor signature pad with verified static display
        const contributorSigContainer = document.querySelector('.signature-pad-container');
        const contributorTabs = document.querySelector('.signature-tabs');
        if (contributorTabs) contributorTabs.style.display = 'none';

        if (contributorSigContainer) {
            const sigData = sub.participantSignature || sub.ownerSignature || sub.guardianSignature || sub.licensorSignature || sub.artistSignature;
            contributorSigContainer.innerHTML = `
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 1rem; text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 0.35rem; color: #16a34a; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.5rem;">
                        <span>✓</span> Verified ${escapeHtml(contributorLabel)}
                    </div>
                    ${sigData ? `<img src="${sigData}" alt="Contributor Signature" style="max-height: 100px; display: block; margin: 0 auto;">` : '<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">Digitally Recorded</p>'}
                </div>
            `;
        }

        // 5. Activate Producer Signature section
        const producerSection = document.getElementById('producerSignatureSection');
        if (producerSection) {
            producerSection.style.display = 'block';
            producerSection.style.border = '2px solid var(--primary)';
            producerSection.style.borderRadius = '8px';
            producerSection.style.padding = '1.25rem';
        }

        // 6. Update Submit Button
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<span>✍️</span> Approve &amp; Submit to Legal (release@carteblanche.co.za)';
            submitBtn.style.background = 'var(--primary)';
            submitBtn.style.padding = '0.85rem 2.25rem';
            submitBtn.style.fontSize = '0.95rem';
        }
    }

    /**
     * Intercept form submit: handle dual-signed submission or countersign submission
     */
    function setupFormSubmitHandler({
        form,
        formType,
        formTitle,
        contributorSigCanvasId,
        buildDualPdf,
        standardSubmitEndpoint,
        loadingOverlay
    }) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const contributorCanvas = document.getElementById(contributorSigCanvasId);
            const contributorBlank = document.createElement('canvas');
            let contributorSigImg = null;

            if (contributorCanvas) {
                contributorBlank.width = contributorCanvas.width;
                contributorBlank.height = contributorCanvas.height;
                if (contributorCanvas.toDataURL() !== contributorBlank.toDataURL()) {
                    contributorSigImg = contributorCanvas.toDataURL('image/png');
                }
            }

            // In countersign mode, use loaded signature
            if (isCountersignMode && loadedSubmission) {
                contributorSigImg = loadedSubmission.participantSignature || loadedSubmission.ownerSignature || loadedSubmission.guardianSignature || loadedSubmission.licensorSignature || loadedSubmission.artistSignature;
            }

            // Check Producer signature pad
            let producerSigImg = null;
            if (producerCanvas) {
                const prodBlank = document.createElement('canvas');
                prodBlank.width = producerCanvas.width;
                prodBlank.height = producerCanvas.height;
                if (producerCanvas.toDataURL() !== prodBlank.toDataURL()) {
                    producerSigImg = producerCanvas.toDataURL('image/png');
                }
            }

            // Validation based on mode
            if (isCountersignMode) {
                if (!producerSigImg) {
                    alert('Please add your Producer Counter-Signature to finalize and approve this agreement.');
                    return;
                }
                const pName = document.getElementById('prodSignerName') ? document.getElementById('prodSignerName').value.trim() : '';
                if (!pName) {
                    alert('Please enter your Producer Name.');
                    return;
                }
            } else {
                // Normal Mode: Contributor signature is mandatory
                if (!contributorSigImg) {
                    alert('Please sign the document before submitting.');
                    return;
                }
            }

            try {
                if (loadingOverlay) loadingOverlay.classList.add('active');

                let prodName = document.getElementById('prodSignerName') ? document.getElementById('prodSignerName').value.trim() : (document.getElementById('producerName') ? document.getElementById('producerName').value.trim() : '');
                let prodEmail = document.getElementById('prodSignerEmail') ? document.getElementById('prodSignerEmail').value.trim() : (document.getElementById('producerEmail') ? document.getElementById('producerEmail').value.trim() : '');

                if (!prodName || !prodEmail) {
                    try {
                        const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
                        if (userStr) {
                            const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                            if (!prodName) prodName = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                            if (!prodEmail) prodEmail = u.email || '';
                        }
                    } catch (e) {}
                }

                // Generate PDF using custom dual PDF builder
                let pdfBlob = null;
                if (typeof buildDualPdf === 'function') {
                    pdfBlob = await buildDualPdf({
                        contributorSigImg,
                        producerSigImg,
                        producerName: prodName,
                        isCountersignMode
                    });
                }

                const formData = new FormData(form);
                if (contributorSigImg) formData.append('participantSignature', contributorSigImg);
                if (producerSigImg) formData.append('producerSignature', producerSigImg);
                if (prodName) formData.append('producerName', prodName);
                if (prodEmail) formData.append('producerEmail', prodEmail);

                const token = (window.auth && typeof window.auth.getIdToken === 'function')
                    ? await window.auth.getIdToken().catch(() => null)
                    : null;
                const headers = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                let response;

                if (isCountersignMode) {
                    // Send to countersign endpoint
                    formData.append('submissionId', submissionId);
                    if (pdfBlob) {
                        formData.append('file', pdfBlob, `DualSigned_${formType}_${Date.now()}.pdf`);
                        formData.append('pdf', pdfBlob, `DualSigned_${formType}_${Date.now()}.pdf`);
                        formData.append('release_pdf', pdfBlob, `DualSigned_${formType}_${Date.now()}.pdf`);
                    }

                    response = await fetch('/api/countersign-form', {
                        method: 'POST',
                        headers,
                        body: formData
                    });
                } else {
                    // Normal submission
                    if (pdfBlob) {
                        formData.append('file', pdfBlob, `${formType}_${Date.now()}.pdf`);
                        formData.append('pdf', pdfBlob, `${formType}_${Date.now()}.pdf`);
                        formData.append('release_pdf', pdfBlob, `${formType}_${Date.now()}.pdf`);
                    }

                    response = await fetch(standardSubmitEndpoint, {
                        method: 'POST',
                        headers,
                        body: formData
                    });
                }

                const result = await response.json();
                if (!result.success) throw new Error(result.error || result.message || 'Server submission error');

                if (loadingOverlay) loadingOverlay.classList.remove('active');

                // Display success dialog with distinct message for each case
                const dialog = document.getElementById('successDialog');
                if (dialog) {
                    dialog.classList.remove('hidden');
                    const h2 = dialog.querySelector('h2');
                    const p = dialog.querySelector('p');
                    const closeBtn = document.getElementById('dialogCloseBtn');

                    if (isCountersignMode) {
                        if (h2) h2.textContent = 'Agreement Countersigned & Dispatched';
                        if (p) p.textContent = 'Both signatures have been verified and embedded. The finalized agreement has been emailed to release@carteblanche.co.za and a confirmation copy sent to your inbox.';
                        if (closeBtn) closeBtn.onclick = () => window.location.href = 'forms_hub.html';
                    } else if (result.status === 'pending_countersignature') {
                        if (h2) h2.textContent = 'Form Received & Awaiting Countersignature';
                        if (p) p.textContent = 'Thank you! Your signed form has been safely received. A countersignature notification has been sent to the producer. The agreement will be dispatched to Legal once both parties have signed.';
                        if (closeBtn) {
                            closeBtn.textContent = 'Done / Close Window';
                            closeBtn.onclick = () => { try { window.close(); } catch (e) {} };
                        }
                    } else {
                        // Both signed on the spot
                        if (h2) h2.textContent = 'Agreement Fully Executed';
                        if (p) p.textContent = 'Both participant and producer signatures have been recorded. The finalized agreement has been dispatched to release@carteblanche.co.za.';
                        if (closeBtn) closeBtn.onclick = () => window.location.href = 'forms_hub.html';
                    }
                }

            } catch (err) {
                console.error('Submission error:', err);
                alert('An error occurred during submission: ' + err.message);
            } finally {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // Export API
    window.countersignFlow = {
        initDualSigning,
        isCountersigning,
        getLoadedSubmission
    };
})();
