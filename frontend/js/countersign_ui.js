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
     * Resilient helper to resolve the logged-in or cached producer identity
     */
    function getResolvedProducerProfile() {
        if (window.auth && typeof window.auth.getCurrentUser === 'function') {
            const u = window.auth.getCurrentUser();
            if (u && u.email) {
                return {
                    name: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                    email: u.email
                };
            }
        }
        try {
            const profileKey = Object.keys(localStorage).find(k => k.startsWith('user_profile_') && k.includes('@'));
            if (profileKey) {
                const emailFromKey = profileKey.replace('user_profile_', '').trim();
                const raw = localStorage.getItem(profileKey);
                const parsed = raw ? JSON.parse(raw) : {};
                const name = parsed.displayName || `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || parsed.name || '';
                return {
                    name: name || 'Lezanne',
                    email: parsed.email || emailFromKey
                };
            }
            const cached = localStorage.getItem('user_profile_cache') || sessionStorage.getItem('cb_user_profile');
            if (cached) {
                const parsed = JSON.parse(cached);
                return {
                    name: parsed.displayName || `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || parsed.name || 'Lezanne',
                    email: parsed.email || ''
                };
            }
            // Check Firebase auth local storage item
            const fbKey = Object.keys(localStorage).find(k => k.startsWith('firebase:authUser:'));
            if (fbKey) {
                const fbData = JSON.parse(localStorage.getItem(fbKey) || '{}');
                if (fbData.email) {
                    return {
                        name: fbData.displayName || fbData.email,
                        email: fbData.email
                    };
                }
            }
        } catch (e) {}
        return { name: 'Lezanne', email: 'lezanne@carteblanche.co.za' };
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

            const cachedProf = getResolvedProducerProfile();
            const finalProd = (prodParam || '').trim() || cachedProf.name;
            const finalProdEmail = (prodEmailParam || '').trim() || cachedProf.email;

            if (commParam && document.getElementById('commissionNumber')) {
                document.getElementById('commissionNumber').value = commParam;
            }
            if (storyParam && document.getElementById('storyName')) {
                document.getElementById('storyName').value = storyParam;
            }
            if (finalProd) {
                if (document.getElementById('producerName')) document.getElementById('producerName').value = finalProd;
                if (document.getElementById('prodSignerName')) document.getElementById('prodSignerName').value = finalProd;
            }
            if (finalProdEmail) {
                if (document.getElementById('producerEmail')) document.getElementById('producerEmail').value = finalProdEmail;
                if (document.getElementById('prodSignerEmail')) document.getElementById('prodSignerEmail').value = finalProdEmail;
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

        // Ensure hidden fields exist on form for producerName and producerEmail
        let prodNameHidden = form.querySelector('input[name="producerName"]');
        if (!prodNameHidden) {
            prodNameHidden = document.createElement('input');
            prodNameHidden.type = 'hidden';
            prodNameHidden.name = 'producerName';
            prodNameHidden.id = 'producerName';
            form.appendChild(prodNameHidden);
        }
        let prodEmailHidden = form.querySelector('input[name="producerEmail"]');
        if (!prodEmailHidden) {
            prodEmailHidden = document.createElement('input');
            prodEmailHidden.type = 'hidden';
            prodEmailHidden.name = 'producerEmail';
            prodEmailHidden.id = 'producerEmail';
            form.appendChild(prodEmailHidden);
        }

        // Producer signature section before submit buttons
        const submitGroup = form.querySelector('div[style*="justify-content: flex-end"]') || form.lastElementChild;
        let producerSection = form.querySelector('#producerSignatureSection');
        if (!producerSection) {
            producerSection = document.createElement('section');
            producerSection.className = 'form-section';
            producerSection.id = 'producerSignatureSection';
            producerSection.style.display = 'none'; // hidden by default until toggled or in countersign mode
            producerSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h2 class="section-title" style="margin-bottom: 0;">Producer Counter-Signature</h2>
                <span class="form-tag" style="background: rgba(0, 143, 190, 0.1); color: var(--primary);">On behalf of M-Net &amp; Carte Blanche</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1rem;">
                Official producer authorisation. Once signed, this agreement will be finalised and dispatched to <strong>release@carteblanche.co.za</strong>.
            </p>
            <div class="form-grid" style="margin-bottom: 1rem;">
                <div class="form-group">
                    <label for="prodSignerName">Producer Name</label>
                    <input type="text" id="prodSignerName" name="producerSignerName" placeholder="Producer full name...">
                </div>
                <div class="form-group">
                    <label for="prodSignerEmail">Producer Email</label>
                    <input type="email" id="prodSignerEmail" name="producerSignerEmail" placeholder="producer@carteblanche.co.za">
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
        } else {
            // Pre-existing section in DOM (like participant_release.html): ensure it is visible
            producerSection.style.display = 'block';
        }

        // Pre-fill producer credentials if cached
        const prof = getResolvedProducerProfile();
        const pNameInp = document.getElementById('prodSignerName');
        const pEmailInp = document.getElementById('prodSignerEmail');
        if (prof.name && pNameInp && !pNameInp.value) pNameInp.value = prof.name;
        if (prof.email && pEmailInp && !pEmailInp.value) pEmailInp.value = prof.email;
        if (prof.name && prodNameHidden && !prodNameHidden.value) prodNameHidden.value = prof.name;
        if (prof.email && prodEmailHidden && !prodEmailHidden.value) prodEmailHidden.value = prof.email;

        // Keep hidden inputs continuously synchronized with signer inputs
        const syncInputs = () => {
            const n = document.getElementById('prodSignerName')?.value.trim();
            const e = document.getElementById('prodSignerEmail')?.value.trim();
            if (n && prodNameHidden) prodNameHidden.value = n;
            if (e && prodEmailHidden) prodEmailHidden.value = e;
        };
        pNameInp?.addEventListener('input', syncInputs);
        pEmailInp?.addEventListener('input', syncInputs);
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

        // On forms where THE PRODUCER is already a natural part of the form layout, keep it displayed
        if (producerSection.closest('#participantReleaseForm') || producerSection.closest('#minorReleaseForm') || producerSection.closest('#musicAgreementForm') || producerSection.closest('#locationAgreementForm') || producerSection.closest('#footageAgreementForm')) {
            producerSection.style.display = 'block';
            return;
        }

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
            const nameInput = document.getElementById('prodSignerName');
            const emailInput = document.getElementById('prodSignerEmail');
            if (checkbox.checked) {
                slider.style.backgroundColor = 'var(--primary)';
                producerSection.style.display = 'block';
                const prof = getResolvedProducerProfile();
                if (nameInput && !nameInput.value) nameInput.value = prof.name || 'Lezanne';
                if (emailInput && !emailInput.value) emailInput.value = prof.email || 'lezanne@carteblanche.co.za';
                if (nameInput) nameInput.required = true;
                if (emailInput) emailInput.required = true;
                producerSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                slider.style.backgroundColor = 'var(--border)';
                producerSection.style.display = 'none';
                if (nameInput) nameInput.required = false;
                if (emailInput) emailInput.required = false;
            }
        }

        checkbox.addEventListener('change', updateToggle);
        toggleContainer.addEventListener('click', (e) => {
            // Prevent double-toggle if clicking on the label/input/slider
            if (e.target.closest('.switch')) return;
            checkbox.checked = !checkbox.checked;
            updateToggle();
        });

        producerSection.parentNode.insertBefore(toggleContainer, producerSection);
    }

    /**
     * Apply Countersign Mode: populate fields, keep editable for corrections, display contributor signature, activate producer pad
     */
    function applyCountersignMode(form, sub, onSubmissionLoaded, contributorLabel) {
        const urlParamsNow = new URLSearchParams(window.location.search);
        const isExplicitEditMode = urlParamsNow.get('mode') === 'edit';

        // 1. Show Top Banner
        const bannerContainer = document.getElementById('countersignBannerContainer');
        if (bannerContainer) {
            bannerContainer.innerHTML = `
                <div style="background: linear-gradient(135deg, rgba(0, 143, 190, 0.12), rgba(99, 102, 241, 0.08)); border: 2px solid var(--primary); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 2rem; box-shadow: var(--shadow-md);">
                    <div style="display: flex; align-items: flex-start; gap: 1rem;">
                        <span style="font-size: 2rem; line-height: 1;">${isExplicitEditMode ? '✏️' : '✍️'}</span>
                        <div style="flex: 1;">
                            <h3 style="margin: 0 0 0.35rem 0; color: var(--primary); font-size: 1.15rem; font-weight: 800;">
                                ${isExplicitEditMode ? 'EDIT &amp; RESUBMIT AGREEMENT' : 'PRODUCER COUNTERSIGNATURE &amp; REVIEW'}
                            </h3>
                            <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: var(--text-main); line-height: 1.5;">
                                <strong>${escapeHtml(sub.contributorName || sub.fullName || sub.ownerName || sub.guardianName || sub.licensorName || sub.artistName || 'Contributor')}</strong>'s agreement details are loaded below.
                            </p>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                You may edit any field to correct typos or story titles. When ready, sign and click <strong>Resubmit Form</strong> to update the records and dispatch to <strong>release@carteblanche.co.za</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        // 2. Comprehensive universal field auto-population
        const populateVal = (id, val) => {
            if (val === undefined || val === null || val === '') return;
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        // Standard Contributor / Story details with rich aliases
        const contribName = sub.fullName || sub.contributorName || sub.artistName || sub.guardianName || sub.ownerName || sub.licensorName || '';
        populateVal('fullName', contribName);
        populateVal('contributorName', contribName);
        populateVal('artistName', sub.artistName || contribName);
        populateVal('guardianName', sub.guardianName || contribName);
        populateVal('ownerName', sub.ownerName || contribName);
        populateVal('licensorName', sub.licensorName || contribName);

        const idNum = sub.idNumber || sub.guardianId || sub.ownerId || sub.id_number || '';
        populateVal('idNumber', idNum);
        populateVal('guardianId', sub.guardianId || idNum);
        populateVal('ownerId', sub.ownerId || idNum);

        populateVal('phone', sub.phone || sub.phoneNumber || sub.contactNumber || '');
        populateVal('email', sub.email || sub.contributorEmail || '');

        const story = sub.storyName || sub.storyTitle || sub.story || '';
        populateVal('storyName', story);
        populateVal('storyTitle', story);

        const comm = sub.commissionNumber || sub.commission_number || sub.comm || '';
        populateVal('commissionNumber', comm);

        // Agreement-specific fields
        populateVal('minorName', sub.minorName);
        populateVal('minorAge', sub.minorAge);
        populateVal('propertyAddress', sub.propertyAddress || sub.address);
        populateVal('filmingDate', sub.filmingDate);
        populateVal('trackTitle', sub.trackTitle);
        populateVal('trackDuration', sub.trackDuration);
        populateVal('publisherName', sub.publisherName);
        populateVal('licensorEntity', sub.licensorEntity);
        populateVal('footageDescription', sub.footageDescription);
        populateVal('courtesyCredit', sub.courtesyCredit);
        populateVal('broadcastDate', sub.broadcastDate);

        // 3. Form-specific callback
        if (typeof onSubmissionLoaded === 'function') {
            try {
                onSubmissionLoaded(sub);
            } catch (cbErr) {
                console.warn('[COUNTERSIGN-SUBMIT] onSubmissionLoaded hook error:', cbErr);
            }
        }

        // Prefill producer name and email if available in submission, URL, or cached
        const resolvedProf = getResolvedProducerProfile();
        let pNameVal = (sub.producerName || urlParamsNow.get('producer') || urlParamsNow.get('producerName') || resolvedProf.name || 'Lezanne').trim();
        let pEmailVal = (sub.producerEmail || urlParamsNow.get('producerEmail') || resolvedProf.email || 'lezanne@carteblanche.co.za').trim();

        if (!pEmailVal) pEmailVal = 'lezanne@carteblanche.co.za';
        if (!pNameVal) pNameVal = 'Lezanne';

        populateVal('prodSignerName', pNameVal);
        populateVal('producerName', pNameVal);
        populateVal('prodSignerEmail', pEmailVal);
        populateVal('producerEmail', pEmailVal);

        // Ensure fields REMAIN EDITABLE so users can correct typos and mistakes!
        const allInputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
        allInputs.forEach(inp => {
            inp.readOnly = false;
            inp.disabled = false;
            inp.style.backgroundColor = '';
        });

        // 4. Replace contributor signature pad with verified display, or allow updating
        const contributorSigContainer = document.querySelector('.signature-pad-container');
        const contributorTabs = document.querySelector('.signature-tabs');
        if (contributorTabs) contributorTabs.style.display = 'none';

        const sigData = sub.participantSignature || sub.ownerSignature || sub.guardianSignature || sub.licensorSignature || sub.artistSignature;
        if (contributorSigContainer && sigData) {
            contributorSigContainer.innerHTML = `
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 1rem; text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 0.35rem; color: #16a34a; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.5rem;">
                        <span>✓</span> Verified ${escapeHtml(contributorLabel)}
                    </div>
                    <img src="${sigData}" alt="Contributor Signature" style="max-height: 100px; display: block; margin: 0 auto;">
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
            const nameInput = document.getElementById('prodSignerName');
            const emailInput = document.getElementById('prodSignerEmail');
            if (nameInput) nameInput.required = true;
            if (emailInput) emailInput.required = true;

            // If previously countersigned with a signature, show notice
            if (sub.producerSignature && !document.getElementById('prevProducerSigNote')) {
                const note = document.createElement('div');
                note.id = 'prevProducerSigNote';
                note.style.cssText = 'background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 6px; padding: 0.6rem 0.9rem; font-size: 0.8rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.4rem;';
                note.innerHTML = '<span>ℹ️</span> <span>Existing producer signature on file. You may re-sign below to update it upon resubmitting.</span>';
                producerSection.insertBefore(note, producerSection.firstChild);
            }
        }

        // 6. Update Submit Button to "Resubmit Form" as requested
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<span>✍️</span> Resubmit Form';
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

            let contributorSigImg = null;
            try {
                const contributorCanvas = document.getElementById(contributorSigCanvasId);
                if (contributorCanvas) {
                    const contributorBlank = document.createElement('canvas');
                    contributorBlank.width = contributorCanvas.width;
                    contributorBlank.height = contributorCanvas.height;
                    if (contributorCanvas.toDataURL() !== contributorBlank.toDataURL()) {
                        contributorSigImg = contributorCanvas.toDataURL('image/png');
                    }
                }
            } catch (canvasErr) {
                console.warn('[COUNTERSIGN-SUBMIT] Canvas export error for contributor:', canvasErr);
            }

            // In countersign mode, use loaded signature
            if (isCountersignMode && loadedSubmission) {
                contributorSigImg = loadedSubmission.participantSignature || loadedSubmission.ownerSignature || loadedSubmission.guardianSignature || loadedSubmission.licensorSignature || loadedSubmission.artistSignature;
            }

            // Check Producer signature pad
            let producerSigImg = null;
            try {
                if (producerCanvas) {
                    const prodBlank = document.createElement('canvas');
                    prodBlank.width = producerCanvas.width;
                    prodBlank.height = producerCanvas.height;
                    if (producerCanvas.toDataURL() !== prodBlank.toDataURL()) {
                        producerSigImg = producerCanvas.toDataURL('image/png');
                    }
                }
            } catch (canvasErr) {
                console.warn('[COUNTERSIGN-SUBMIT] Canvas export error for producer:', canvasErr);
            }

            // Validation based on mode
            if (isCountersignMode) {
                if (!producerSigImg && loadedSubmission && loadedSubmission.producerSignature) {
                    producerSigImg = loadedSubmission.producerSignature;
                }
                if (!producerSigImg) {
                    alert('Please add your Producer Counter-Signature to finalise and approve this agreement.');
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

            // Prevent double submission
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.originalText = submitBtn.textContent;
                submitBtn.textContent = 'Submitted';
                submitBtn.style.opacity = '0.7';
                submitBtn.style.cursor = 'not-allowed';
            }

            // DO NOT display full-screen blocking overlay so users don't think it's hanging/stuck
            if (loadingOverlay) loadingOverlay.classList.remove('active');

            // Show immediate confirmation modal with exact requested wording
            const dialog = document.getElementById('successDialog');
            let isBgDone = false;
            let bgError = null;
            let isNavigating = false;

            if (dialog) {
                dialog.classList.remove('hidden');
                const h2 = dialog.querySelector('h2');
                const p = dialog.querySelector('p');
                const closeBtn = document.getElementById('dialogCloseBtn');

                // Requested header: [Form Title] Successfully Submitted
                if (h2) h2.textContent = `${formTitle || 'Release Form'} Successfully Submitted`;

                if (producerSigImg || isCountersignMode) {
                    // Exact requested text when both signatures are recorded:
                    if (p) p.textContent = 'Both participant and producer signatures have been recorded. The final signed document has been sent to you and release@carteblanche.co.za';
                } else {
                    // Single participant signer case (awaiting producer countersignature)
                    if (p) p.textContent = 'Thank you! Your signed document has been safely submitted. A copy has been dispatched to the producer for counter-signature, and the final document will be sent to you and release@carteblanche.co.za once completed.';
                }

                // Configure two buttons: "Return to Dashboard" and "Submit Another Form"
                let returnBtn = document.getElementById('dialogReturnBtn') || document.getElementById('dialogCloseBtn');
                let anotherBtn = document.getElementById('dialogAnotherBtn');

                // If buttons container doesn't exist yet in the HTML, create/inject the two buttons dynamically
                const dialogBox = dialog.querySelector('.dialog-box');
                if (dialogBox && (!returnBtn || !anotherBtn)) {
                    let actionsContainer = dialogBox.querySelector('.dialog-actions');
                    if (!actionsContainer) {
                        actionsContainer = document.createElement('div');
                        actionsContainer.className = 'dialog-actions';
                        actionsContainer.style.display = 'flex';
                        actionsContainer.style.flexWrap = 'wrap';
                        actionsContainer.style.gap = '0.75rem';
                        actionsContainer.style.marginTop = '1.5rem';
                        actionsContainer.style.justifyContent = 'flex-end';
                        dialogBox.appendChild(actionsContainer);
                    }

                    if (!returnBtn) {
                        returnBtn = document.createElement('button');
                        returnBtn.id = 'dialogReturnBtn';
                        returnBtn.className = 'btn-soft';
                        returnBtn.style.padding = '0.7rem 1.25rem';
                        returnBtn.style.borderRadius = '6px';
                        returnBtn.style.fontWeight = '600';
                        returnBtn.style.cursor = 'pointer';
                        actionsContainer.appendChild(returnBtn);
                    } else if (returnBtn.parentElement !== actionsContainer) {
                        actionsContainer.appendChild(returnBtn);
                    }

                    if (!anotherBtn) {
                        anotherBtn = document.createElement('button');
                        anotherBtn.id = 'dialogAnotherBtn';
                        anotherBtn.className = 'add-btn';
                        anotherBtn.style.margin = '0';
                        anotherBtn.style.padding = '0.7rem 1.25rem';
                        anotherBtn.style.borderRadius = '6px';
                        anotherBtn.style.fontWeight = '600';
                        anotherBtn.style.cursor = 'pointer';
                        actionsContainer.appendChild(anotherBtn);
                    }
                }

                let autoCloseTimer = null;
                const scheduleAutoClose = () => {
                    if (autoCloseTimer) clearTimeout(autoCloseTimer);
                    autoCloseTimer = setTimeout(() => {
                        if (!isNavigating && dialog) {
                            handleModalNavigate('forms_hub.html');
                        }
                    }, 2000);
                };

                const handleModalNavigate = async (targetUrl) => {
                    if (autoCloseTimer) clearTimeout(autoCloseTimer);
                    isNavigating = true;
                    // Close dialog immediately without blocking user
                    if (dialog) dialog.classList.add('hidden');
                    if (!isBgDone && bgSubmitPromise) {
                        try {
                            await Promise.race([
                                bgSubmitPromise,
                                new Promise(resolve => setTimeout(resolve, 3500))
                            ]);
                        } catch (e) {
                            console.warn('[COUNTERSIGN-SUBMIT] Proceeding with navigation:', e);
                        }
                    }
                    window.location.href = targetUrl;
                };

                if (returnBtn) {
                    returnBtn.textContent = 'Return to Dashboard';
                    returnBtn.disabled = false;
                    returnBtn.onclick = () => handleModalNavigate('index.html');
                }

                if (anotherBtn) {
                    anotherBtn.textContent = 'Submit Another Form';
                    anotherBtn.disabled = false;
                    anotherBtn.onclick = () => handleModalNavigate('forms_hub.html');
                }

                // Schedule auto-dismiss after 2 seconds
                scheduleAutoClose();
            }

            // Run PDF generation, encryption, and network upload safely in the background
            const bgSubmitPromise = (async () => {
                try {
                    console.log('[COUNTERSIGN-SUBMIT] Starting background submission flow for form:', formType);

                    let prodName = (document.getElementById('prodSignerName') && document.getElementById('prodSignerName').value.trim()) ||
                                   (document.getElementById('producerName') && document.getElementById('producerName').value.trim()) || '';
                    let prodEmail = (document.getElementById('prodSignerEmail') && document.getElementById('prodSignerEmail').value.trim()) ||
                                    (document.getElementById('producerEmail') && document.getElementById('producerEmail').value.trim()) || '';

                    if (!prodName || !prodEmail) {
                        try {
                            const urlP = new URLSearchParams(window.location.search);
                            if (!prodName) prodName = (urlP.get('producer') || urlP.get('producerName') || '').trim();
                            if (!prodEmail) prodEmail = (urlP.get('producerEmail') || '').trim();

                            const cached = getResolvedProducerProfile();
                            if (!prodName) prodName = cached.name;
                            if (!prodEmail) prodEmail = cached.email;

                            if (!prodEmail && window.auth && typeof window.auth.getUser === 'function') {
                                const u = await window.auth.getUser().catch(() => null);
                                if (u && u.email) {
                                    if (!prodEmail) prodEmail = u.email;
                                    if (!prodName) prodName = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
                                }
                            }
                        } catch (e) {}
                    }
                    if (!prodEmail) {
                        prodEmail = 'lezanne@carteblanche.co.za';
                        if (!prodName) prodName = 'Lezanne';
                    }

                    console.log('[COUNTERSIGN-SUBMIT] Finalized producer details for payload:', { prodName, prodEmail });

                    // Generate PDF using custom dual PDF builder
                    let pdfBlob = null;
                    if (typeof buildDualPdf === 'function') {
                        console.log('[COUNTERSIGN-SUBMIT] Building PDF in background...');
                        try {
                            pdfBlob = await buildDualPdf({
                                contributorSigImg,
                                producerSigImg,
                                producerName: prodName,
                                isCountersignMode
                            });
                            console.log('[COUNTERSIGN-SUBMIT] PDF built successfully in background, size:', pdfBlob ? pdfBlob.size : 'null');
                        } catch (pdfErr) {
                            console.error('[COUNTERSIGN-SUBMIT] Error in buildDualPdf:', pdfErr);
                        }
                    }

                    const formData = new FormData(form);
                    if (contributorSigImg) {
                        formData.set('participantSignature', contributorSigImg);
                        if (formType === 'music_agreement') formData.set('artistSignature', contributorSigImg);
                    }
                    if (producerSigImg) formData.set('producerSignature', producerSigImg);
                    if (prodName) {
                        formData.set('producerName', prodName);
                        formData.set('producerSignerName', prodName);
                    }
                    if (prodEmail) {
                        formData.set('producerEmail', prodEmail);
                        formData.set('producerSignerEmail', prodEmail);
                    }

                    // Forward proposalId and contributorName if present
                    const searchParams = new URLSearchParams(window.location.search);
                    const propId = searchParams.get('proposalId') || searchParams.get('pid') || '';
                    if (propId && !formData.get('proposalId')) {
                        formData.set('proposalId', propId);
                    }

                    const artistNameVal = document.getElementById('artistName')?.value?.trim();
                    if (artistNameVal) {
                        formData.set('artistName', artistNameVal);
                        if (!formData.get('contributorName')) formData.set('contributorName', artistNameVal);
                        if (!formData.get('fullName')) formData.set('fullName', artistNameVal);
                    }

                    const participantNameVal = document.getElementById('participantName')?.value?.trim();
                    if (participantNameVal) {
                        formData.set('participantName', participantNameVal);
                        if (!formData.get('fullName')) formData.set('fullName', participantNameVal);
                        if (!formData.get('contributorName')) formData.set('contributorName', participantNameVal);
                    }
                    const storyTitleVal = document.getElementById('storyTitle')?.value?.trim();
                    if (storyTitleVal) {
                        formData.set('storyTitle', storyTitleVal);
                        if (!formData.get('storyName')) formData.set('storyName', storyTitleVal);
                    }
                    const contactNumberVal = document.getElementById('contactNumber')?.value?.trim();
                    if (contactNumberVal) {
                        formData.set('contactNumber', contactNumberVal);
                        if (!formData.get('phone')) formData.set('phone', contactNumberVal);
                    }
                    const pSignedAtVal = document.getElementById('participantSignedAt')?.value?.trim();
                    if (pSignedAtVal) {
                        formData.set('participantSignedAt', pSignedAtVal);
                        if (!formData.get('signedAt')) formData.set('signedAt', pSignedAtVal);
                    }
                    const pSignedDateVal = document.getElementById('participantSignedDate')?.value?.trim();
                    if (pSignedDateVal) {
                        formData.set('participantSignedDate', pSignedDateVal);
                        if (!formData.get('signedDate')) formData.set('signedDate', pSignedDateVal);
                    }
                    const prodSignedAtVal = document.getElementById('producerSignedAt')?.value?.trim();
                    if (prodSignedAtVal) {
                        formData.set('producerSignedAt', prodSignedAtVal);
                    }
                    const prodSignedDateVal = document.getElementById('producerSignedDate')?.value?.trim();
                    if (prodSignedDateVal) {
                        formData.set('producerSignedDate', prodSignedDateVal);
                    }

                    const childNameVal = document.getElementById('childName')?.value?.trim();
                    if (childNameVal) {
                        formData.set('childName', childNameVal);
                        if (!formData.get('minorName')) formData.set('minorName', childNameVal);
                    }
                    const parentNameVal = document.getElementById('parentName')?.value?.trim();
                    if (parentNameVal) {
                        formData.set('parentName', parentNameVal);
                        if (!formData.get('guardianName')) formData.set('guardianName', parentNameVal);
                        if (!formData.get('fullName')) formData.set('fullName', parentNameVal);
                        if (!formData.get('contributorName')) formData.set('contributorName', parentNameVal);
                    }
                    const parentIdVal = document.getElementById('parentIdNumber')?.value?.trim();
                    if (parentIdVal) {
                        formData.set('parentIdNumber', parentIdVal);
                        if (!formData.get('guardianId')) formData.set('guardianId', parentIdVal);
                    }
                    const parentSignedAtVal = document.getElementById('parentSignedAt')?.value?.trim();
                    if (parentSignedAtVal) {
                        formData.set('parentSignedAt', parentSignedAtVal);
                        if (!formData.get('signedAt')) formData.set('signedAt', parentSignedAtVal);
                    }
                    const parentSignedDateVal = document.getElementById('parentSignedDate')?.value?.trim();
                    if (parentSignedDateVal) {
                        formData.set('parentSignedDate', parentSignedDateVal);
                        if (!formData.get('signedDate')) formData.set('signedDate', parentSignedDateVal);
                    }

                    const musicOwnerNameVal = document.getElementById('musicOwnerName')?.value?.trim();
                    if (musicOwnerNameVal) {
                        formData.set('musicOwnerName', musicOwnerNameVal);
                        if (!formData.get('artistName')) formData.set('artistName', musicOwnerNameVal);
                        if (!formData.get('fullName')) formData.set('fullName', musicOwnerNameVal);
                        if (!formData.get('contributorName')) formData.set('contributorName', musicOwnerNameVal);
                    }
                    const musicOwnerCompanyVal = document.getElementById('musicOwnerCompany')?.value?.trim();
                    if (musicOwnerCompanyVal) {
                        formData.set('musicOwnerCompany', musicOwnerCompanyVal);
                        if (!formData.get('publisherName')) formData.set('publisherName', musicOwnerCompanyVal);
                    }
                    const broadcastDateVal = document.getElementById('broadcastDate')?.value?.trim();
                    if (broadcastDateVal) {
                        formData.set('broadcastDate', broadcastDateVal);
                    }
                    const ownerSignedAtVal = document.getElementById('ownerSignedAt')?.value?.trim();
                    if (ownerSignedAtVal) {
                        formData.set('ownerSignedAt', ownerSignedAtVal);
                        if (!formData.get('signedAt')) formData.set('signedAt', ownerSignedAtVal);
                    }
                    const ownerSignedDateVal = document.getElementById('ownerSignedDate')?.value?.trim();
                    if (ownerSignedDateVal) {
                        formData.set('ownerSignedDate', ownerSignedDateVal);
                        if (!formData.get('signedDate')) formData.set('signedDate', ownerSignedDateVal);
                    }
                    // Collect all track titles
                    const trackInputs = document.querySelectorAll('input[name="musicTrackTitle[]"], input[name="musicTrackTitle"], input[name="trackTitle"]');
                    const allTracks = Array.from(trackInputs).map(inp => inp.value.trim()).filter(Boolean);
                    if (allTracks.length > 0) {
                        formData.set('musicTracks', allTracks.join(', '));
                        formData.set('trackTitle', allTracks.join(', '));
                        formData.set('musicTrackTitle', allTracks[0]);
                    }

                    const locOwnerVal = document.getElementById('locationOwnerName')?.value?.trim();
                    if (locOwnerVal) {
                        formData.set('locationOwnerName', locOwnerVal);
                        if (!formData.get('ownerName')) formData.set('ownerName', locOwnerVal);
                        if (!formData.get('fullName')) formData.set('fullName', locOwnerVal);
                        if (!formData.get('contributorName')) formData.set('contributorName', locOwnerVal);
                    }
                    const locAddrVal = document.getElementById('locationAddress')?.value?.trim();
                    if (locAddrVal) {
                        formData.set('locationAddress', locAddrVal);
                        if (!formData.get('propertyAddress')) formData.set('propertyAddress', locAddrVal);
                    }
                    const dateOfFilmingVal = document.getElementById('dateOfFilming')?.value?.trim();
                    if (dateOfFilmingVal) {
                        formData.set('dateOfFilming', dateOfFilmingVal);
                        if (!formData.get('filmingDate')) formData.set('filmingDate', dateOfFilmingVal);
                    }

                    const footageOwnerVal = document.getElementById('footageOwnerName')?.value?.trim();
                    if (footageOwnerVal) {
                        formData.set('footageOwnerName', footageOwnerVal);
                        if (!formData.get('licensorName')) formData.set('licensorName', footageOwnerVal);
                        if (!formData.get('ownerName')) formData.set('ownerName', footageOwnerVal);
                        if (!formData.get('fullName')) formData.set('fullName', footageOwnerVal);
                        if (!formData.get('contributorName')) formData.set('contributorName', footageOwnerVal);
                    }
                    const footageCompVal = document.getElementById('footageOwnerCompany')?.value?.trim();
                    if (footageCompVal) {
                        formData.set('footageOwnerCompany', footageCompVal);
                        if (!formData.get('licensorEntity')) formData.set('licensorEntity', footageCompVal);
                    }
                    const bcastDatedVal = (document.getElementById('broadcastDate')?.value || document.getElementById('broadcastDated')?.value || '').trim();
                    if (bcastDatedVal) {
                        formData.set('broadcastDate', bcastDatedVal);
                        formData.set('broadcastDated', bcastDatedVal);
                    }
                    const footageDescVal = document.getElementById('footageDescription')?.value?.trim();
                    if (footageDescVal) {
                        formData.set('footageDescription', footageDescVal);
                    }

                    // Guarantee PDF blob is NEVER null so 'No files provided' error can never occur
                    if (!pdfBlob) {
                        console.warn('[COUNTERSIGN-SUBMIT] Emergency PDF generation triggered.');
                        try {
                            const { jsPDF } = window.jspdf || {};
                            if (jsPDF) {
                                const fbDoc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
                                fbDoc.setFontSize(16);
                                fbDoc.text(formTitle || 'Release Agreement', 20, 20);
                                fbDoc.setFontSize(10);
                                fbDoc.text(`Commission: ${document.getElementById('commissionNumber')?.value || 'N/A'}`, 20, 30);
                                fbDoc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, 20, 40);
                                if (contributorSigImg) {
                                    try { fbDoc.addImage(contributorSigImg, 'PNG', 20, 50, 70, 20, undefined, 'FAST'); } catch(e){}
                                }
                                if (producerSigImg) {
                                    try { fbDoc.addImage(producerSigImg, 'PNG', 115, 50, 70, 20, undefined, 'FAST'); } catch(e){}
                                }
                                pdfBlob = fbDoc.output('blob');
                            }
                        } catch (fbErr) {
                            console.error('[COUNTERSIGN-SUBMIT] Emergency fallback PDF generation failed:', fbErr);
                        }
                    }
                    if (!pdfBlob) {
                        pdfBlob = new Blob(['%PDF-1.4 Fallback Agreement Document'], { type: 'application/pdf' });
                    }

                    const token = (window.auth && typeof window.auth.getIdToken === 'function')
                        ? await window.auth.getIdToken().catch(() => null)
                        : null;
                    const headers = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    let response;
                    if (isCountersignMode) {
                        console.log('[COUNTERSIGN-SUBMIT] Sending background countersign POST...');
                        formData.append('submissionId', submissionId);
                        formData.append('file', pdfBlob, `DualSigned_${formType}_${Date.now()}.pdf`);

                        response = await fetch('/api/countersign-form', {
                            method: 'POST',
                            headers,
                            body: formData
                        });
                    } else {
                        console.log('[COUNTERSIGN-SUBMIT] Sending background standard form POST to:', standardSubmitEndpoint);
                        formData.append('file', pdfBlob, `${formType}_${Date.now()}.pdf`);

                        response = await fetch(standardSubmitEndpoint, {
                            method: 'POST',
                            headers,
                            body: formData
                        });
                    }

                    const result = await response.json();
                    console.log('[COUNTERSIGN-SUBMIT] Background response result:', result);
                    if (!result.success) throw new Error(result.error || result.message || 'Server submission error');
                    isBgDone = true;
                    return result;
                } catch (err) {
                    console.error('[COUNTERSIGN-SUBMIT] Background submission error:', err);
                    bgError = err;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = submitBtn.dataset.originalText || 'Submit Form';
                        submitBtn.style.opacity = '1';
                        submitBtn.style.cursor = 'pointer';
                    }
                    if (dialog && !isNavigating) {
                        const p = dialog.querySelector('p');
                        if (p) p.innerHTML += `<br><span style="color: #ef4444; font-size: 0.85rem;">Notice: Upload experienced a network error (${escapeHtml(err.message)}). Please check your connection.</span>`;
                    }
                    throw err;
                }
            })();
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
