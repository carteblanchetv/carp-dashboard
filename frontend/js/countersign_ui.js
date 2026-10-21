// countersign_ui.js - Universal Two-Party Signing & Release Form Workflow for Carte Blanche Forms
// Implements the official Carte Blanche 3-step Release Form Workflow:
// 1. Producer fills & signs the document -> clicks Submit -> shareable link generated (modal + email).
// 2. Co-signer opens the link (no CARP account, isolated form view, no dashboard) -> completes & signs.
// 3. Producer receives notification email ONLY -> opens form on CARP -> reviews & approves for final submission -> final PDF dispatched to producer and release@carteblanche.co.za.

(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id') || '';
    const tokenParam = urlParams.get('token') || '';
    const rawAction = (urlParams.get('action') || urlParams.get('mode') || '').toLowerCase();

    // Mode determination
    const isApprovalMode = (rawAction === 'approve' || rawAction === 'countersign' || rawAction === 'edit' || rawAction === 'review') && !!submissionId;
    const isCoSignerMode = (rawAction === 'cosign' || (!rawAction && (!!submissionId || !!tokenParam))) && (!!submissionId || !!tokenParam) && !isApprovalMode;
    const isInitiationMode = !submissionId && !tokenParam;

    let producerCanvas = null;
    let producerCtx = null;
    let producerSigMethod = 'draw';
    let loadedSubmission = null;

    const FORM_PAGE_MAP = {
        participant_release: 'participant_release.html',
        minor_release: 'minor_release.html',
        location_agreement: 'location_agreement.html',
        footage_agreement: 'footage_release_agreement.html',
        footage_release: 'footage_release_agreement.html',
        footage_release_agreement: 'footage_release_agreement.html',
        music_agreement: 'music_agreement.html'
    };

    /**
     * Resilient response parser preventing SyntaxError: JSON.parse on HTML error pages
     */
    async function safeParseJson(resp) {
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await resp.text();
            console.error('[API-NON-JSON-RESPONSE]', resp.status, text.slice(0, 300));
            if (resp.status === 504 || text.includes('Gateway Timeout')) {
                throw new Error('Server request timed out. Please try again.');
            }
            if (!resp.ok) {
                throw new Error(`Server returned error (${resp.status}).`);
            }
            throw new Error(`Unexpected server response format (${resp.status}).`);
        }
        return await resp.json();
    }

    // Isolate co-signer immediately if in co-signer mode (hide any dashboard UI)
    if (isCoSignerMode) {
        isolateCoSignerView();
    }

    // Hide participant signature section immediately if in initiation mode (producer starting document)
    if (isInitiationMode) {
        hideParticipantSignatureSectionInstantly();
    }

    /**
     * Completely remove and hide participant signature section from the producer until they receive co-signed doc to approve
     */
    function hideParticipantSignatureSectionInstantly() {
        const style = document.createElement('style');
        style.id = 'initiation-hide-participant-sig-style';
        style.innerHTML = `
            #participantSignatureSection {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Completely remove and hide all dashboard navigation for co-signers
     */
    function isolateCoSignerView() {
        const style = document.createElement('style');
        style.id = 'cosigner-isolation-styles';
        style.innerHTML = `
            .global-top-nav, 
            .gnav-inner, 
            .back-nav, 
            .btn-back-hub, 
            a[href*="forms_hub"], 
            a[href*="index.html"], 
            a.btn-soft[href],
            #gnavAdminBtn {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
            body.form-body {
                padding-top: 1rem !important;
            }
        `;
        document.head.appendChild(style);

        const cleanDom = () => {
            const nav = document.querySelector('.global-top-nav');
            if (nav) nav.remove();
            const backBtns = document.querySelectorAll('.back-nav, .btn-back-hub, a.btn-soft[href*="hub"], a[href*="index.html"]');
            backBtns.forEach(btn => btn.remove());
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cleanDom);
        } else {
            cleanDom();
        }
    }

    /**
     * Accurately check whether a canvas is completely blank by inspecting its pixel buffer
     */
    function isCanvasBlank(canvas) {
        if (!canvas) return true;
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return true;
            const w = canvas.width || 0;
            const h = canvas.height || 0;
            if (w === 0 || h === 0) return true;
            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] !== 0) return false;
            }
            return true;
        } catch (e) {
            return false;
        }
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
     * Helper to get base URL
     */
    function getBaseUrl() {
        const loc = window.location;
        if (loc.protocol === 'file:' || !loc.host) {
            return 'https://cb-deliverables.web.app';
        }
        return `${loc.protocol}//${loc.host}`;
    }

    /**
     * Initialize the Release Form Signing & Approval Workflow
     */
    async function initDualSigning({
        formId,
        formType,
        formTitle,
        contributorSigCanvasId = 'signatureCanvas',
        contributorClearBtnId = 'clearSigBtn',
        contributorSigLabel = 'Co-Signer Signature',
        onSubmissionLoaded = null,
        buildDualPdf = null,
        standardSubmitEndpoint = ''
    }) {
        const form = document.getElementById(formId);
        if (!form) return;

        const loadingOverlay = document.getElementById('loadingOverlay');

        // 1. Inject Containers (Banners, Producer section, hidden inputs)
        injectContainers(form, contributorSigLabel);

        // 2. Setup Producer Signature Canvas Pad
        setupProducerSignaturePad();

        // 3. Setup UI based on Active Workflow Mode
        if (isCoSignerMode) {
            // STEP 2: Co-Signer signing via shared link
            await setupCoSignerMode(form, contributorSigCanvasId, contributorSigLabel, onSubmissionLoaded, loadingOverlay);
        } else if (isApprovalMode) {
            // STEP 3: Producer reviewing & approving on CARP
            await setupApprovalMode(form, contributorSigLabel, onSubmissionLoaded, loadingOverlay);
        } else {
            // STEP 1: Producer initiating & signing
            setupInitiationMode(form, formTitle, contributorSigCanvasId);
        }

        // 4. Intercept Form Submission
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
     * Inject DOM elements: hidden inputs and ensure producer signature section exists
     */
    function injectContainers(form, contributorLabel) {
        // Banner container at top of form
        let bannerContainer = document.getElementById('countersignBannerContainer');
        if (!bannerContainer) {
            bannerContainer = document.createElement('div');
            bannerContainer.id = 'countersignBannerContainer';
            form.parentNode.insertBefore(bannerContainer, form);
        }

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

        // Ensure producer section exists and is visible
        let producerSection = form.querySelector('#producerSignatureSection');
        if (producerSection) {
            producerSection.style.display = 'block';
        }

        // Pre-fill producer credentials if cached
        const prof = getResolvedProducerProfile();
        const pNameInp = document.getElementById('prodSignerName') || document.getElementById('producerName');
        const pEmailInp = document.getElementById('prodSignerEmail') || document.getElementById('producerEmail');
        if (prof.name && pNameInp && !pNameInp.value) pNameInp.value = prof.name;
        if (prof.email && pEmailInp && !pEmailInp.value) pEmailInp.value = prof.email;
        if (prof.name && prodNameHidden && !prodNameHidden.value) prodNameHidden.value = prof.name;
        if (prof.email && prodEmailHidden && !prodEmailHidden.value) prodEmailHidden.value = prof.email;

        // Auto-fill today's date for producer and contributor date fields if empty
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        ['producerSignedDate', 'participantSignedDate', 'ownerSignedDate', 'parentSignedDate', 'signedDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = todayStr;
        });

        // Auto-fill default Signed At city if empty
        ['producerSignedAt'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = 'Johannesburg';
        });

        const handleProducerNameInput = (e) => {
            const val = e.target.value;
            const other = (e.target.id === 'producerName') ? document.getElementById('prodSignerName') : document.getElementById('producerName');
            if (other && other !== e.target && other.value !== val) {
                other.value = val;
            }
            if (prodNameHidden && prodNameHidden !== e.target && prodNameHidden.value !== val) {
                prodNameHidden.value = val;
            }
        };
        const handleProducerEmailInput = (e) => {
            const val = e.target.value;
            const other = (e.target.id === 'producerEmail') ? document.getElementById('prodSignerEmail') : document.getElementById('producerEmail');
            if (other && other !== e.target && other.value !== val) {
                other.value = val;
            }
            if (prodEmailHidden && prodEmailHidden !== e.target && prodEmailHidden.value !== val) {
                prodEmailHidden.value = val;
            }
        };
        document.getElementById('prodSignerName')?.addEventListener('input', handleProducerNameInput);
        document.getElementById('producerName')?.addEventListener('input', handleProducerNameInput);
        document.getElementById('prodSignerEmail')?.addEventListener('input', handleProducerEmailInput);
        document.getElementById('producerEmail')?.addEventListener('input', handleProducerEmailInput);
    }

    /**
     * Setup Producer Signature Canvas Pad (Draw / Type)
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
        if (typeFont && !typeFont.value) {
            typeFont.value = 'Caveat';
        }

        if (tabDraw) {
            tabDraw.addEventListener('click', (e) => {
                if (e) e.preventDefault();
                producerSigMethod = 'draw';
                tabDraw.classList.add('active');
                if (tabType) tabType.classList.remove('active');
                if (typeControls) typeControls.style.display = 'none';
                producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
                producerCanvas.style.pointerEvents = 'auto';
            });
        }

        if (tabType) {
            tabType.addEventListener('click', (e) => {
                if (e) e.preventDefault();
                producerSigMethod = 'type';
                tabType.classList.add('active');
                if (tabDraw) tabDraw.classList.remove('active');
                if (typeControls) typeControls.style.display = 'block';
                producerCanvas.style.pointerEvents = 'none';
                if (typeInput && !typeInput.value) {
                    const prodName = document.getElementById('producerName')?.value || document.getElementById('prodSignerName')?.value || '';
                    if (prodName) typeInput.value = prodName;
                }
                renderProducerTypedSignature();
            });
        }

        function renderProducerTypedSignature() {
            if (!producerCtx || !typeInput) return;
            producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
            const text = typeInput.value.trim();
            if (!text) return;
            const font = typeFont ? typeFont.value : 'Caveat';
            producerCtx.font = `italic 38px "${font}", cursive`;
            producerCtx.fillStyle = '#000000';
            producerCtx.textBaseline = 'middle';
            producerCtx.textAlign = 'center';
            producerCtx.fillText(text, producerCanvas.width / 2, producerCanvas.height / 2);
        }

        if (typeInput) typeInput.addEventListener('input', renderProducerTypedSignature);
        if (typeFont) typeFont.addEventListener('change', renderProducerTypedSignature);

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

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                if (e) e.preventDefault();
                if (producerSigMethod === 'draw') {
                    producerCtx.clearRect(0, 0, producerCanvas.width, producerCanvas.height);
                } else {
                    if (typeInput) typeInput.value = '';
                    renderProducerTypedSignature();
                }
            });
        }
    }

    /**
     * STEP 1: Initiation Mode (Producer fills & signs on CARP)
     */
    function setupInitiationMode(form, formTitle, contributorSigCanvasId) {
        // Pre-fill URL query params (comm, story, name)
        const commParam = urlParams.get('comm') || urlParams.get('commission') || urlParams.get('commissionNumber') || '';
        const storyParam = urlParams.get('story') || urlParams.get('storyTitle') || urlParams.get('storyName') || '';
        const nameParam = urlParams.get('name') || urlParams.get('participantName') || urlParams.get('fullName') || '';

        if (commParam && document.getElementById('commissionNumber')) {
            document.getElementById('commissionNumber').value = commParam;
        }
        if (storyParam) {
            if (document.getElementById('storyTitle')) document.getElementById('storyTitle').value = storyParam;
            if (document.getElementById('storyName')) document.getElementById('storyName').value = storyParam;
        }
        if (nameParam) {
            const nameEl = document.getElementById('participantName') || document.getElementById('fullName') || document.getElementById('guardianName') || document.getElementById('ownerName') || document.getElementById('footageOwnerName') || document.getElementById('musicOwnerName');
            if (nameEl) nameEl.value = nameParam;
        }

        // Producer signature is mandatory in initiation mode
        const prodNameInp = document.getElementById('producerName') || document.getElementById('prodSignerName');
        if (prodNameInp) prodNameInp.required = true;

        // Hide participant signature section completely from the producer until they receive the co-signed document to approve
        const participantSigSection = document.getElementById('participantSignatureSection') ||
            (contributorSigCanvasId ? document.getElementById(contributorSigCanvasId)?.closest('.form-section') : null);

        if (participantSigSection) {
            participantSigSection.style.display = 'none';
            participantSigSection.setAttribute('aria-hidden', 'true');
            // Remove required constraints from any inputs in the hidden section so browser doesn't block producer submission
            participantSigSection.querySelectorAll('input, select, textarea').forEach(inp => {
                if (inp.hasAttribute('required')) {
                    inp.dataset.wasRequired = 'true';
                    inp.removeAttribute('required');
                }
            });
        }

        // Unblock co-signer specific inputs outside the participant signature section during producer initiation (Phase 1)
        const coSignerExternalFieldIds = [
            'parentIdNumber', 'idNumber', 'contactNumber', 'phone', 'email', 'ownerId',
            'participantName', 'childName', 'parentName', 'locationOwnerName', 'footageOwnerName', 'musicOwnerName'
        ];
        coSignerExternalFieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.removeAttribute('required');
                el.dataset.wasRequired = 'true';
            }
        });

        // Add helpful Step 1 guidance banner above the Producer Signature section
        const producerSection = document.getElementById('producerSignatureSection');
        if (producerSection && !document.getElementById('producerInitiationStepNote')) {
            const note = document.createElement('div');
            note.id = 'producerInitiationStepNote';
            note.style.cssText = 'background: rgba(0, 143, 190, 0.08); border-left: 4px solid var(--primary); padding: 0.85rem 1.15rem; border-radius: 0 6px 6px 0; margin-bottom: 1.25rem; font-size: 0.88rem; color: var(--text-main); line-height: 1.45;';
            note.innerHTML = `
                <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.2rem; display: flex; align-items: center; gap: 0.4rem;">
                    <span>ℹ️</span> Step 1 of 3: Producer Sign &amp; Submit
                </div>
                <div>
                    Sign below and click <strong>Submit &amp; Generate Share Link</strong>. You will receive a secure shareable link for the participant / co-signer. Once they complete and sign, you will be notified on CARP to review and approve the document for final submission.
                </div>
                <div style="margin-top: 0.6rem; padding-top: 0.5rem; border-top: 1px dashed rgba(0, 143, 190, 0.25);">
                    <button type="button" id="inPersonSignToggleBtn" style="background: none; border: none; padding: 0; color: var(--primary); text-decoration: underline; font-size: 0.82rem; cursor: pointer; font-weight: 600;">
                        Participant / Parent is present with you? Click here to sign together in person &rarr;
                    </button>
                </div>
            `;
            producerSection.insertBefore(note, producerSection.firstChild);

            const toggleBtn = document.getElementById('inPersonSignToggleBtn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    const initStyle = document.getElementById('initiation-hide-participant-sig-style');
                    if (initStyle) initStyle.remove();
                    if (participantSigSection) {
                        participantSigSection.style.display = 'block';
                        participantSigSection.removeAttribute('aria-hidden');
                        const pTabs = participantSigSection.querySelector('.signature-tabs');
                        if (pTabs) pTabs.style.display = 'flex';
                    }
                    toggleBtn.parentElement.innerHTML = '<span style="color: #16a34a; font-weight: 600;">✓ In-person signing enabled. Both parties can sign below.</span>';
                    const sBtn = form.querySelector('button[type="submit"]');
                    if (sBtn) {
                        sBtn.innerHTML = '<span>✅</span> Submit Fully Signed Form';
                    }
                });
            }
        }

        // Submit button text
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<span>🚀</span> Submit Partially Signed Document';
            submitBtn.style.background = 'var(--primary)';
            submitBtn.style.padding = '0.85rem 2.25rem';
            submitBtn.style.fontSize = '0.95rem';
            submitBtn.style.fontWeight = '700';
        }
    }

    /**
     * STEP 2: Co-Signer Mode (Co-signer opens shared link, no CARP account, isolated view)
     */
    async function setupCoSignerMode(form, contributorSigCanvasId, contributorSigLabel, onSubmissionLoaded, loadingOverlay) {
        try {
            if (loadingOverlay) loadingOverlay.classList.add('active');

            const fetchId = tokenParam || submissionId;
            const resp = await fetch(`/api/get-form-for-countersign/${encodeURIComponent(fetchId)}`);
            const data = await safeParseJson(resp);
            if (!data.success || !data.submission) {
                throw new Error(data.error || 'Failed to load agreement');
            }

            loadedSubmission = data.submission;

            // Check if document is already locked (already co-signed or approved)
            if (loadedSubmission.isLocked) {
                // If a logged in staff member (producer) visits, switch directly to Approval Mode so they can review and approve!
                const isStaff = (window.auth && typeof window.auth.getUser === 'function' && !!window.auth.getUser());
                if (isStaff) {
                    await setupApprovalMode(form, contributorSigLabel, onSubmissionLoaded, loadingOverlay);
                    return;
                }
                showLockedDocumentView(form, loadedSubmission);
                return;
            }

            // 1. Show Top Co-Signer Welcome Banner
            const bannerContainer = document.getElementById('countersignBannerContainer');
            if (bannerContainer) {
                bannerContainer.innerHTML = `
                    <div style="background: linear-gradient(135deg, rgba(0, 143, 190, 0.1), rgba(16, 185, 129, 0.08)); border: 2px solid var(--primary); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 2rem;">
                        <div style="display: flex; align-items: flex-start; gap: 1rem;">
                            <span style="font-size: 2rem; line-height: 1;">✍️</span>
                            <div style="flex: 1;">
                                <h3 style="margin: 0 0 0.35rem 0; color: var(--primary); font-size: 1.15rem; font-weight: 800;">
                                    CARTE BLANCHE DIGITAL RELEASE AGREEMENT
                                </h3>
                                <p style="margin: 0 0 0.4rem 0; font-size: 0.9rem; color: var(--text-main); line-height: 1.5;">
                                    This agreement has been initiated and signed by Producer <strong>${escapeHtml(loadedSubmission.producerName || 'Carte Blanche')}</strong>.
                                </p>
                                <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                    Please review the details below, confirm your personal information, sign in the signature pad, and click <strong>Submit Form</strong>.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 2. Populate form fields from submission
            populateFormFields(form, loadedSubmission);
            if (typeof onSubmissionLoaded === 'function') {
                try { onSubmissionLoaded(loadedSubmission); } catch (e) {}
            }

            // Lock story, commission, and producer details in read-only state for co-signer
            const readOnlyFieldIds = [
                'storyName', 'storyTitle', 'commissionNumber', 'broadcastDate', 'broadcastDated',
                'producerName', 'prodSignerName', 'producerEmail', 'prodSignerEmail',
                'producerSignedAt', 'producerSignedDate'
            ];
            readOnlyFieldIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.readOnly = true;
                    el.style.backgroundColor = 'var(--bg-card, #f8fafc)';
                    el.style.borderColor = 'var(--border, #cbd5e1)';
                    el.style.cursor = 'not-allowed';
                }
            });

            // 3. Render verified Producer Signature (locked & read-only for co-signer)
            const producerSection = document.getElementById('producerSignatureSection');
            if (producerSection) {
                const pSigImg = loadedSubmission.producerSignature;
                const pName = loadedSubmission.producerName || 'Producer';
                const pSignedAt = loadedSubmission.producerSignedAt || 'Johannesburg';
                const pSignedDate = loadedSubmission.producerSignedDate || '';

                producerSection.style.display = 'block';
                producerSection.innerHTML = `
                    <div style="background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 8px; padding: 1.25rem; text-align: center; margin-top: 1rem;">
                        <div style="display: inline-flex; align-items: center; gap: 0.4rem; color: #16a34a; font-weight: 700; font-size: 0.95rem; margin-bottom: 0.4rem;">
                            <span>✓</span> Verified Producer Authorisation &amp; Signature
                        </div>
                        <p style="margin: 0 0 0.6rem 0; font-size: 0.85rem; color: var(--text-main);">
                            Signed by <strong>${escapeHtml(pName)}</strong> at ${escapeHtml(pSignedAt)} on ${escapeHtml(pSignedDate || 'file')}
                        </p>
                        ${pSigImg ? `<img src="${pSigImg}" alt="Producer Signature" style="max-height: 75px; max-width: 100%; display: block; margin: 0 auto; filter: contrast(120%);">` : ''}
                    </div>
                `;
            }

            // 4. Ensure participant signature section is visible for the co-signer to sign
            const initStyle = document.getElementById('initiation-hide-participant-sig-style');
            if (initStyle) initStyle.remove();

            const participantSigSection = document.getElementById('participantSignatureSection') ||
                (contributorSigCanvasId ? document.getElementById(contributorSigCanvasId)?.closest('.form-section') : null);

            if (participantSigSection) {
                participantSigSection.style.display = 'block';
                participantSigSection.removeAttribute('aria-hidden');
                const coSignerTabs = participantSigSection.querySelector('.signature-tabs');
                if (coSignerTabs) {
                    coSignerTabs.style.display = 'flex';
                }
            }

            // Restore any required attributes that were relaxed during initiation mode
            form.querySelectorAll('[data-was-required="true"]').forEach(inp => {
                inp.setAttribute('required', '');
            });

            // 5. Co-signer fields are active & required for Phase 2 (only for visible inputs, ignoring hidden aliases)
            const contribName = [
                document.getElementById('participantName'),
                document.getElementById('footageOwnerName'),
                document.getElementById('locationOwnerName'),
                document.getElementById('musicOwnerName'),
                document.getElementById('ownerName'),
                document.getElementById('parentName'),
                document.getElementById('guardianName'),
                document.getElementById('fullName')
            ].find(el => el && el.type !== 'hidden');
            if (contribName) contribName.required = true;

            const contribSignedAt = [
                document.getElementById('participantSignedAt'),
                document.getElementById('ownerSignedAt'),
                document.getElementById('parentSignedAt'),
                document.getElementById('signedAt')
            ].find(el => el && el.type !== 'hidden');
            if (contribSignedAt) contribSignedAt.required = true;

            const idField = [
                document.getElementById('idNumber'),
                document.getElementById('parentIdNumber')
            ].find(el => el && el.type !== 'hidden');
            if (idField) idField.required = true;

            const contactField = [
                document.getElementById('contactNumber'),
                document.getElementById('phone')
            ].find(el => el && el.type !== 'hidden');
            if (contactField) contactField.required = true;

            // Ensure co-signer typed signature font defaults to Great Vibes
            const coSignerFontSelect = document.getElementById('typeSigFont');
            if (coSignerFontSelect) {
                coSignerFontSelect.value = 'Great Vibes';
                if (typeof window.renderParticipantTypedSignature === 'function') {
                    window.renderParticipantTypedSignature();
                } else if (typeof window.renderParentTypedSignature === 'function') {
                    window.renderParentTypedSignature();
                } else if (typeof window.renderOwnerTypedSignature === 'function') {
                    window.renderOwnerTypedSignature();
                }
            }

            // Submit button
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<span>✍️</span> Submit Form';
                submitBtn.style.background = '#16a34a';
                submitBtn.style.padding = '0.85rem 2.5rem';
                submitBtn.style.fontSize = '1rem';
                submitBtn.style.fontWeight = '700';
            }

        } catch (err) {
            console.error('[CO-SIGNER-MODE] Error loading agreement:', err);
            alert('Could not load agreement: ' + err.message);
        } finally {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        }
    }

    /**
     * STEP 3: Producer Approval Mode (Producer reviewing on CARP)
     */
    async function setupApprovalMode(form, contributorSigLabel, onSubmissionLoaded, loadingOverlay) {
        try {
            if (loadingOverlay) loadingOverlay.classList.add('active');

            const resp = await fetch(`/api/get-form-for-countersign/${submissionId}`);
            const data = await safeParseJson(resp);
            if (!data.success || !data.submission) {
                throw new Error(data.error || 'Failed to load agreement');
            }

            loadedSubmission = data.submission;

            const isAlreadyApproved = loadedSubmission.status === 'APPROVED' || 
                                      loadedSubmission.status === 'approved' || 
                                      loadedSubmission.status === 'completed' || 
                                      !!loadedSubmission.approvedAt || 
                                      !!loadedSubmission.completedAt;

            const executedFile = (loadedSubmission.files || []).find(f => 
                f.fieldname === 'dualSignedPdf' || 
                (f.filename && (f.filename.startsWith('DualSigned_') || f.filename.startsWith('Executed_')))
            ) || (loadedSubmission.files && loadedSubmission.files.length > 0 ? loadedSubmission.files[0] : null);

            const contribName = loadedSubmission.contributorName || loadedSubmission.fullName || loadedSubmission.participantName || loadedSubmission.ownerName || 'Co-signer';
            const cosignedDate = loadedSubmission.participantSignedDate || loadedSubmission.ownerSignedDate || loadedSubmission.signedDate || 'recently';

            // Top Banner for Producer
            const bannerContainer = document.getElementById('countersignBannerContainer');
            if (bannerContainer) {
                const isEditMode = urlParams.get('mode') === 'edit';
                if (isAlreadyApproved && !isEditMode) {
                    bannerContainer.innerHTML = `
                        <div style="background: linear-gradient(135deg, rgba(22, 163, 74, 0.12), rgba(16, 185, 129, 0.08)); border: 2px solid #16a34a; border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 2rem;">
                            <div style="display: flex; align-items: flex-start; gap: 1rem;">
                                <span style="font-size: 2.2rem; line-height: 1;">✅</span>
                                <div style="flex: 1;">
                                    <h3 style="margin: 0 0 0.35rem 0; color: #15803d; font-size: 1.15rem; font-weight: 800;">
                                        AGREEMENT OFFICIALLY APPROVED &amp; EXECUTED
                                    </h3>
                                    <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: var(--text-main); line-height: 1.5;">
                                        This agreement between <strong>${escapeHtml(contribName)}</strong> and Producer <strong>${escapeHtml(loadedSubmission.producerName || 'Carte Blanche')}</strong> has been approved and executed. Official copies were dispatched to <strong>release@carteblanche.co.za</strong> and the producer.
                                    </p>
                                    <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 0.75rem; flex-wrap: wrap;">
                                        ${executedFile ? `
                                            <a href="/api/get-submission-file?path=${encodeURIComponent(executedFile.storagePath)}&inline=true" target="_blank" class="add-btn" style="margin: 0; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; background: #16a34a;">
                                                <span>📄</span> View Executed PDF
                                            </a>
                                        ` : ''}
                                        <a href="?id=${encodeURIComponent(submissionId)}&action=countersign&mode=edit" class="btn-soft" style="padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
                                            <span>✏️</span> Edit Details
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    bannerContainer.innerHTML = `
                        <div style="background: linear-gradient(135deg, rgba(0, 143, 190, 0.12), rgba(99, 102, 241, 0.08)); border: 2px solid var(--primary); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 2rem;">
                            <div style="display: flex; align-items: flex-start; gap: 1rem;">
                                <span style="font-size: 2rem; line-height: 1;">${isEditMode ? '✏️' : '📋'}</span>
                                <div style="flex: 1;">
                                    <h3 style="margin: 0 0 0.35rem 0; color: var(--primary); font-size: 1.15rem; font-weight: 800;">
                                        ${isEditMode ? 'EDIT AGREEMENT DETAILS &bull; PRODUCER REVIEW' : 'CO-SIGNER SIGNATURE RECORDED &bull; PRODUCER FINAL APPROVAL'}
                                    </h3>
                                    <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: var(--text-main); line-height: 1.5;">
                                        <strong>${escapeHtml(contribName)}</strong> completed and signed this agreement on ${escapeHtml(cosignedDate)}.
                                        ${loadedSubmission.producerSignature ? '<span style="display: inline-flex; align-items: center; gap: 0.25rem; margin-left: 0.5rem; background: rgba(22, 163, 74, 0.12); color: #15803d; border: 1px solid rgba(22, 163, 74, 0.3); padding: 0.15rem 0.55rem; border-radius: 4px; font-size: 0.78rem; font-weight: 700;">✓ Producer Signature on Record</span>' : ''}
                                    </p>
                                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                        ${isEditMode 
                                            ? 'Review and modify any fields below (e.g. typos, participant info, locations, dates). When satisfied, click <strong>Save &amp; Update Agreement</strong> to re-generate and record the updated official agreement.'
                                            : 'Please review all fields below (editable if you need to correct typos). When satisfied, click <strong>Approve</strong> to execute and dispatch the official document to <strong>release@carteblanche.co.za</strong> and your email.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }

            // Populate all fields
            populateFormFields(form, loadedSubmission);
            if (typeof onSubmissionLoaded === 'function') {
                try { onSubmissionLoaded(loadedSubmission); } catch (e) {}
            }

            // Remove any initiation hidden styles
            const initStyle = document.getElementById('initiation-hide-participant-sig-style');
            if (initStyle) initStyle.remove();

            // Ensure participant signature section is visible for the producer to review the recorded co-signature
            const participantSigSection = document.getElementById('participantSignatureSection') ||
                document.querySelector('.signature-pad-container')?.closest('.form-section');

            if (participantSigSection) {
                participantSigSection.style.display = 'block';
                participantSigSection.removeAttribute('aria-hidden');
            }

            // Ensure no HTML5 required restrictions block producer approval
            form.querySelectorAll('input, select, textarea').forEach(inp => {
                if (inp.id !== 'producerName' && inp.id !== 'prodSignerName') {
                    inp.removeAttribute('required');
                }
            });

            // Display verified co-signer signature
            const isEditMode = urlParams.get('mode') === 'edit';

            const contributorSigContainer = participantSigSection 
                ? participantSigSection.querySelector('.signature-pad-container') 
                : document.querySelector('.signature-pad-container');

            const contributorTabs = participantSigSection 
                ? participantSigSection.querySelector('.signature-tabs') 
                : document.querySelector('.signature-tabs');

            const sigData = loadedSubmission.parentSignature || 
                            loadedSubmission.guardianSignature || 
                            loadedSubmission.participantSignature || 
                            loadedSubmission.ownerSignature || 
                            loadedSubmission.artistSignature || 
                            loadedSubmission.licensorSignature || 
                            loadedSubmission.contributorSignature || null;

            if (sigData && !isEditMode) {
                if (contributorTabs) contributorTabs.style.display = 'none';
                if (contributorSigContainer) {
                    contributorSigContainer.innerHTML = `
                        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 1rem; text-align: center;">
                            <div style="display: inline-flex; align-items: center; gap: 0.35rem; color: #16a34a; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.4rem;">
                                <span>✓</span> Verified ${escapeHtml(contributorSigLabel)} (${escapeHtml(contribName)})
                            </div>
                            <img src="${sigData}" alt="Co-Signer Signature" style="max-height: 90px; display: block; margin: 0 auto; filter: contrast(120%);">
                        </div>
                    `;
                }
            } else {
                if (contributorTabs) contributorTabs.style.display = 'flex';
            }

            // When Reviewing and Approving, hide the producer signature section if it's already been signed
            const producerSection = document.getElementById('producerSignatureSection');
            if (producerSection) {
                if (loadedSubmission.producerSignature) {
                    producerSection.style.display = 'none';
                    producerSection.setAttribute('aria-hidden', 'true');
                } else {
                    producerSection.style.display = 'block';
                    producerSection.removeAttribute('aria-hidden');
                }
            }

            // Submit Button
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                const isEditMode = urlParams.get('mode') === 'edit';
                if (isAlreadyApproved && !isEditMode) {
                    submitBtn.style.display = 'none';
                } else if (isEditMode) {
                    submitBtn.style.display = 'inline-block';
                    submitBtn.innerHTML = '<span>💾</span> Save &amp; Update Agreement';
                    submitBtn.style.background = '#0284c7';
                    submitBtn.style.padding = '0.85rem 2.25rem';
                    submitBtn.style.fontSize = '0.95rem';
                    submitBtn.style.fontWeight = '700';
                } else {
                    submitBtn.style.display = 'inline-block';
                    submitBtn.innerHTML = '<span>✅</span> Approve';
                    submitBtn.style.background = '#0284c7';
                    submitBtn.style.padding = '0.85rem 2.25rem';
                    submitBtn.style.fontSize = '0.95rem';
                    submitBtn.style.fontWeight = '700';
                }
            }

        } catch (err) {
            console.error('[APPROVAL-MODE] Error loading agreement:', err);
            alert('Could not load agreement: ' + err.message);
        } finally {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        }
    }

    /**
     * Populate form input fields from loaded Firestore submission document
     */
    function populateFormFields(form, sub) {
        const populateVal = (id, val) => {
            if (val === undefined || val === null || val === '') return;
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        const contribName = sub.fullName || sub.contributorName || sub.artistName || sub.guardianName || sub.ownerName || sub.licensorName || sub.footageOwnerName || sub.musicOwnerName || sub.participantName || '';
        populateVal('fullName', contribName);
        populateVal('participantName', contribName);
        populateVal('contributorName', contribName);
        populateVal('artistName', sub.artistName || contribName);
        populateVal('guardianName', sub.guardianName || contribName);
        populateVal('parentName', sub.parentName || contribName);
        populateVal('ownerName', sub.ownerName || contribName);
        populateVal('locationOwnerName', sub.locationOwnerName || contribName);
        populateVal('footageOwnerName', sub.footageOwnerName || contribName);
        populateVal('musicOwnerName', sub.musicOwnerName || contribName);
        populateVal('licensorName', sub.licensorName || contribName);

        const idNum = sub.idNumber || sub.guardianId || sub.parentIdNumber || sub.ownerId || sub.id_number || '';
        populateVal('idNumber', idNum);
        populateVal('guardianId', sub.guardianId || idNum);
        populateVal('parentIdNumber', sub.parentIdNumber || idNum);
        populateVal('ownerId', sub.ownerId || idNum);

        const phoneVal = sub.phone || sub.phoneNumber || sub.contactNumber || '';
        populateVal('phone', phoneVal);
        populateVal('contactNumber', phoneVal);
        populateVal('email', sub.email || sub.contributorEmail || '');

        const story = sub.storyName || sub.storyTitle || sub.story || '';
        populateVal('storyName', story);
        populateVal('storyTitle', story);

        const comm = sub.commissionNumber || sub.commission_number || sub.comm || '';
        populateVal('commissionNumber', comm);

        // Agreement-specific fields
        populateVal('minorName', sub.minorName || sub.childName);
        populateVal('childName', sub.childName || sub.minorName);
        populateVal('minorAge', sub.minorAge);
        populateVal('propertyAddress', sub.propertyAddress || sub.locationAddress || sub.address);
        populateVal('locationAddress', sub.locationAddress || sub.propertyAddress);
        populateVal('filmingDate', sub.filmingDate || sub.dateOfFilming);
        populateVal('dateOfFilming', sub.dateOfFilming || sub.filmingDate);
        populateVal('trackTitle', sub.trackTitle || sub.musicTracks);
        populateVal('trackDuration', sub.trackDuration);
        populateVal('publisherName', sub.publisherName || sub.musicOwnerCompany);
        populateVal('musicOwnerCompany', sub.musicOwnerCompany || sub.publisherName);
        populateVal('licensorEntity', sub.licensorEntity || sub.footageOwnerCompany);
        populateVal('footageOwnerCompany', sub.footageOwnerCompany || sub.licensorEntity);
        populateVal('footageDescription', sub.footageDescription);
        populateVal('courtesyCredit', sub.courtesyCredit);
        populateVal('broadcastDate', sub.broadcastDate || sub.broadcastDated);
        populateVal('broadcastDated', sub.broadcastDated || sub.broadcastDate);

        // Dates & Locations
        populateVal('participantSignedAt', sub.participantSignedAt || sub.signedAt);
        populateVal('participantSignedDate', sub.participantSignedDate || sub.signedDate);
        populateVal('ownerSignedAt', sub.ownerSignedAt || sub.signedAt);
        populateVal('ownerSignedDate', sub.ownerSignedDate || sub.signedDate);
        populateVal('parentSignedAt', sub.parentSignedAt || sub.signedAt);
        populateVal('parentSignedDate', sub.parentSignedDate || sub.signedDate);
        populateVal('producerSignedAt', sub.producerSignedAt || 'Johannesburg');
        populateVal('producerSignedDate', sub.producerSignedDate);

        // Producer details
        const prodName = sub.producerName || 'Producer';
        const prodEmail = sub.producerEmail || 'lezanne@carteblanche.co.za';
        populateVal('prodSignerName', prodName);
        populateVal('producerName', prodName);
        populateVal('prodSignerEmail', prodEmail);
        populateVal('producerEmail', prodEmail);
    }

    /**
     * Intercept form submit and route according to Workflow Mode
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

            // Extract Contributor / Co-signer signature
            let contributorSigImg = null;
            if (isCoSignerMode) {
                try {
                    const contributorCanvas = document.getElementById(contributorSigCanvasId);
                    if (contributorCanvas && !isCanvasBlank(contributorCanvas)) {
                        contributorSigImg = contributorCanvas.toDataURL('image/png');
                    }
                } catch (err) {}
            } else if (isApprovalMode && loadedSubmission) {
                try {
                    const contributorCanvas = document.getElementById(contributorSigCanvasId);
                    if (contributorCanvas && !isCanvasBlank(contributorCanvas)) {
                        contributorSigImg = contributorCanvas.toDataURL('image/png');
                    }
                } catch (err) {}
                if (!contributorSigImg) {
                    contributorSigImg = loadedSubmission.parentSignature || 
                                       loadedSubmission.guardianSignature || 
                                       loadedSubmission.participantSignature || 
                                       loadedSubmission.ownerSignature || 
                                       loadedSubmission.artistSignature || 
                                       loadedSubmission.licensorSignature || 
                                       loadedSubmission.contributorSignature || null;
                }
            } else {
                // In Step 1 (Initiation Mode), check if contributor canvas has a signature (in-person signing)
                try {
                    const contributorCanvas = document.getElementById(contributorSigCanvasId);
                    if (contributorCanvas && !isCanvasBlank(contributorCanvas)) {
                        contributorSigImg = contributorCanvas.toDataURL('image/png');
                    }
                } catch (err) {}
            }

            // Extract Producer signature from canvas
            let producerSigImg = null;
            try {
                if (producerCanvas && !isCanvasBlank(producerCanvas)) {
                    producerSigImg = producerCanvas.toDataURL('image/png');
                }
            } catch (err) {}

            if (isCoSignerMode && loadedSubmission && loadedSubmission.producerSignature) {
                producerSigImg = loadedSubmission.producerSignature;
            }
            if (isApprovalMode && !producerSigImg && loadedSubmission && loadedSubmission.producerSignature) {
                producerSigImg = loadedSubmission.producerSignature;
            }

            // Mode-specific validation
            if (isInitiationMode) {
                // STEP 1: Producer MUST sign
                if (!producerSigImg) {
                    alert('Please add your Producer Signature before submitting to generate the co-signer link.');
                    const prodSec = document.getElementById('producerSignatureSection');
                    if (prodSec) prodSec.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
            } else if (isCoSignerMode) {
                // STEP 2: Co-signer MUST sign
                if (!contributorSigImg) {
                    alert('Please provide your digital signature before submitting.');
                    const cSec = document.getElementById(contributorSigCanvasId);
                    if (cSec) cSec.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
                const nameInp = [
                    document.getElementById('participantName'),
                    document.getElementById('footageOwnerName'),
                    document.getElementById('locationOwnerName'),
                    document.getElementById('musicOwnerName'),
                    document.getElementById('ownerName'),
                    document.getElementById('parentName'),
                    document.getElementById('guardianName'),
                    document.getElementById('fullName')
                ].find(el => el && el.type !== 'hidden');

                if (nameInp && !nameInp.value.trim()) {
                    alert('Please enter your full name & surname.');
                    nameInp.focus();
                    return;
                }

                // ID number: only validate if an actual visible ID field exists on this specific form
                const idInp = [
                    document.getElementById('idNumber'),
                    document.getElementById('parentIdNumber')
                ].find(el => el && el.type !== 'hidden');

                if (idInp && !idInp.value.trim()) {
                    alert('Please enter your ID number.');
                    idInp.focus();
                    return;
                }

                // Contact number: only validate if an actual visible contact field exists on this specific form
                const contactInp = [
                    document.getElementById('contactNumber'),
                    document.getElementById('phone')
                ].find(el => el && el.type !== 'hidden');

                if (contactInp && !contactInp.value.trim()) {
                    alert('Please enter your contact number.');
                    contactInp.focus();
                    return;
                }
            } else if (isApprovalMode) {
                // STEP 3: Producer approving
                if (!producerSigImg) {
                    alert('Please ensure your Producer Signature is recorded to approve this agreement.');
                    return;
                }
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.originalText = submitBtn.textContent;
                submitBtn.textContent = 'Submitting...';
                submitBtn.style.opacity = '0.7';
                submitBtn.style.cursor = 'not-allowed';
            }

            if (loadingOverlay) loadingOverlay.classList.add('active');

            try {
                if (isCoSignerMode) {
                    // -------------------------------------------------------------
                    // STEP 2: Co-Signer Submitting Co-Signature
                    // -------------------------------------------------------------
                    const formData = new FormData(form);
                    formData.set('submissionId', (loadedSubmission && loadedSubmission.id) || submissionId);
                    if (tokenParam || (loadedSubmission && loadedSubmission.shareToken)) {
                        formData.set('shareToken', tokenParam || loadedSubmission.shareToken);
                    }
                    formData.set('participantSignature', contributorSigImg);

                    const response = await fetch('/api/cosign-form', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await safeParseJson(response);
                    if (!result.success) throw new Error(result.error || result.message || 'Failed to submit co-signature');

                    // Show Co-Signer Thank You Modal
                    showCoSignerSuccessModal();

                } else if (isApprovalMode) {
                    // -------------------------------------------------------------
                    // STEP 3: Producer Approving on CARP (Final Dispatch)
                    // -------------------------------------------------------------
                    let pdfBlob = null;
                    if (typeof buildDualPdf === 'function') {
                        try {
                            pdfBlob = await buildDualPdf({
                                contributorSigImg,
                                producerSigImg,
                                producerName: document.getElementById('producerName')?.value || 'Producer',
                                isCountersignMode: true
                            });
                        } catch (err) {
                            console.error('[APPROVAL] Error generating dual PDF:', err);
                        }
                    }

                    if (!pdfBlob) {
                        pdfBlob = new Blob(['%PDF-1.4 Fallback Executed Agreement'], { type: 'application/pdf' });
                    }

                    const formData = new FormData(form);
                    formData.set('submissionId', submissionId);
                    formData.set('producerSignature', producerSigImg);
                    formData.append('file', pdfBlob, `Executed_${formType}_${Date.now()}.pdf`);

                    const token = (window.auth && typeof window.auth.getIdToken === 'function')
                        ? await window.auth.getIdToken().catch(() => null)
                        : null;
                    const headers = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const response = await fetch('/api/countersign-form', {
                        method: 'POST',
                        headers,
                        body: formData
                    });
                    const result = await safeParseJson(response);
                    if (!result.success) throw new Error(result.error || result.message || 'Failed to approve agreement');

                    const pEmail = document.getElementById('producerEmail')?.value || 'your email';
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                    showProducerApprovalSuccessModal(formTitle, pEmail);

                } else {
                    // -------------------------------------------------------------
                    // STEP 1: Producer Initiating & Signing (Generate Share Link)
                    // -------------------------------------------------------------
                    let pdfBlob = null;
                    if (typeof buildDualPdf === 'function') {
                        try {
                            pdfBlob = await buildDualPdf({
                                contributorSigImg,
                                producerSigImg,
                                producerName: document.getElementById('producerName')?.value || 'Producer',
                                isCountersignMode: false
                            });
                        } catch (err) {
                            console.error('[INITIATION] Error generating draft PDF:', err);
                        }
                    }

                    if (!pdfBlob) {
                        pdfBlob = new Blob(['%PDF-1.4 Fallback Release Document'], { type: 'application/pdf' });
                    }

                    const formData = new FormData(form);
                    if (producerSigImg) formData.set('producerSignature', producerSigImg);

                    // Support in-person signing when contributor signed together with producer
                    if (contributorSigImg) {
                        formData.set('participantSignature', contributorSigImg);
                        if (formType === 'location_agreement') formData.set('ownerSignature', contributorSigImg);
                        if (formType === 'minor_release') {
                            formData.set('parentSignature', contributorSigImg);
                            formData.set('guardianSignature', contributorSigImg);
                        }
                        if (formType === 'music_agreement') {
                            formData.set('artistSignature', contributorSigImg);
                            formData.set('ownerSignature', contributorSigImg);
                        }
                        if (formType === 'footage_agreement' || formType === 'footage_release_agreement' || formType === 'footage_release') {
                            formData.set('licensorSignature', contributorSigImg);
                            formData.set('ownerSignature', contributorSigImg);
                        }
                    } else {
                        // Crucial: Step 1 without in-person participant signature must NEVER submit participant signatures to the server
                        formData.delete('participantSignature');
                        formData.delete('ownerSignature');
                        formData.delete('guardianSignature');
                        formData.delete('licensorSignature');
                        formData.delete('artistSignature');
                    }

                    formData.append('file', pdfBlob, `${contributorSigImg ? 'Executed' : 'Initiated'}_${formType}_${Date.now()}.pdf`);

                    const token = (window.auth && typeof window.auth.getIdToken === 'function')
                        ? await window.auth.getIdToken().catch(() => null)
                        : null;
                    const headers = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const response = await fetch(standardSubmitEndpoint, {
                        method: 'POST',
                        headers,
                        body: formData
                    });
                    const result = await safeParseJson(response);
                    if (!result.success) throw new Error(result.error || result.message || 'Failed to submit agreement');

                    const pEmail = document.getElementById('producerEmail')?.value || getResolvedProducerProfile().email;
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                    if (result.status === 'APPROVED' || result.status === 'completed') {
                        showProducerApprovalSuccessModal(formTitle, pEmail);
                    } else {
                        // Step 1: ALWAYS generate and display shareable link!
                        const formPage = FORM_PAGE_MAP[formType] || `${formType}.html`;
                        const shareUrl = result.shareUrl || `${getBaseUrl()}/${formPage}?id=${result.firestoreDocId}&action=cosign`;
                        const storyTitle = document.getElementById('storyTitle')?.value || document.getElementById('storyName')?.value || 'Story';
                        showShareLinkModal({
                            formTitle,
                            storyTitle,
                            shareUrl,
                            producerEmail: pEmail
                        });
                    }
                }
            } catch (err) {
                console.error('[FORM-SUBMIT-ERROR]', err);
                alert(`Error: ${err.message}`);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = submitBtn.dataset.originalText || 'Submit';
                    submitBtn.style.opacity = '1';
                    submitBtn.style.cursor = 'pointer';
                }
            } finally {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
            }
        });
    }

    /**
     * Show Modal with the shareable link for the Producer (Step 1)
     */
    function showShareLinkModal({ formTitle, storyTitle, shareUrl, producerEmail }) {
        let existing = document.getElementById('producerShareLinkModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'producerShareLinkModal';
        modal.className = 'dialog-overlay';
        modal.innerHTML = `
            <div class="dialog-box" style="max-width: 600px; padding: 2rem; border-radius: 12px; background: var(--bg-card); color: var(--text-main); box-shadow: var(--shadow-xl); border: 1px solid var(--border);">
                <div style="text-align: center; margin-bottom: 1.25rem;">
                    <div style="font-size: 2.5rem; margin-bottom: 0.25rem;">🔗</div>
                    <h2 style="color: var(--primary); font-size: 1.35rem; font-weight: 800; margin: 0 0 0.25rem 0;">
                        ${escapeHtml(formTitle)} Ready to Share
                    </h2>
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin: 0;">
                        Story: <strong>${escapeHtml(storyTitle)}</strong>
                    </p>
                </div>

                <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-main); margin-bottom: 1rem;">
                    Your producer signature has been recorded. Share the link below with your co-signer to collect their digital signature. <strong>They do not need a CARP account</strong>:
                </p>

                <!-- Link Input & Copy Button -->
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
                    <input type="text" id="shareUrlCopyInput" readonly value="${escapeHtml(shareUrl)}" style="flex: 1; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.88rem; background: var(--bg-main); color: var(--text-main); font-family: monospace;">
                    <button type="button" id="btnCopyShareUrl" class="add-btn" style="margin: 0; padding: 0.75rem 1.25rem; font-weight: 700; white-space: nowrap; border-radius: 6px; cursor: pointer;">
                        📋 Copy Link
                    </button>
                </div>

                <!-- Instant Share Shortcuts -->
                <div style="display: flex; gap: 0.6rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                    <a href="https://wa.me/?text=${encodeURIComponent(`Please complete and sign the Carte Blanche ${formTitle} for story "${storyTitle}":\n${shareUrl}`)}" target="_blank" rel="noopener" style="flex: 1 1 160px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem 1rem; background: #25D366; color: white; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
                        <span>📱</span> WhatsApp
                    </a>
                    <a href="mailto:?subject=${encodeURIComponent(`Please sign: Carte Blanche ${formTitle} - ${storyTitle}`)}&body=${encodeURIComponent(`Dear Co-Signer,\n\nPlease review and digitally sign the Carte Blanche ${formTitle} using the secure link below:\n\n${shareUrl}\n\nThank you,\nCarte Blanche Production Team`)}" style="flex: 1 1 160px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.65rem 1rem; background: #0284c7; color: white; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
                        <span>✉️</span> Email
                    </a>
                </div>

                <!-- Notice -->
                <div style="background: rgba(0, 143, 190, 0.08); border-left: 4px solid var(--primary); padding: 0.85rem 1rem; border-radius: 0 6px 6px 0; margin-bottom: 1.5rem; font-size: 0.82rem; color: var(--text-muted); line-height: 1.45;">
                    ℹ️ A copy of this link has been emailed to you (<strong>${escapeHtml(producerEmail)}</strong>). Once the co-signer completes and signs, you will receive an email notification on CARP to review and approve for final submission.
                </div>

                <!-- Dialog Actions -->
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                    <a href="forms_hub.html" class="btn-soft" style="padding: 0.7rem 1.25rem; border-radius: 6px; font-weight: 600; text-decoration: none;">Return to Forms Hub</a>
                    <button type="button" id="btnCloseShareModal" class="btn-soft" style="padding: 0.7rem 1.25rem; border-radius: 6px; font-weight: 600; cursor: pointer;">Done</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const copyBtn = modal.querySelector('#btnCopyShareUrl');
        const copyInput = modal.querySelector('#shareUrlCopyInput');
        copyBtn.addEventListener('click', () => {
            copyInput.select();
            navigator.clipboard.writeText(shareUrl).then(() => {
                copyBtn.textContent = '✓ Copied!';
                copyBtn.style.background = '#16a34a';
                showToast('Link copied to clipboard!');
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Link';
                    copyBtn.style.background = '';
                }, 2500);
            }).catch(() => {
                copyInput.select();
                document.execCommand('copy');
                copyBtn.textContent = '✓ Copied!';
                showToast('Link copied to clipboard!');
            });
        });

        modal.querySelector('#btnCloseShareModal').addEventListener('click', () => {
            window.location.href = 'forms_hub.html';
        });
    }

    /**
     * Show clean confirmation modal for Co-Signer (Step 2)
     */
    function showCoSignerSuccessModal() {
        let existing = document.getElementById('cosignerSuccessModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'cosignerSuccessModal';
        modal.className = 'dialog-overlay';
        modal.innerHTML = `
            <div class="dialog-box" style="max-width: 500px; text-align: center; padding: 2.25rem; border-radius: 12px; background: var(--bg-card); color: var(--text-main); box-shadow: var(--shadow-xl); border: 1px solid var(--border);">
                <div style="font-size: 3rem; margin-bottom: 0.5rem; color: #16a34a;">✅</div>
                <h2 style="color: #16a34a; font-size: 1.4rem; font-weight: 800; margin: 0 0 0.75rem 0;">
                    Agreement Successfully Submitted
                </h2>
                <p style="font-size: 0.95rem; line-height: 1.5; color: var(--text-main); margin-bottom: 1rem;">
                    Thank you! Your signed agreement has been safely submitted.
                </p>
                <p style="font-size: 0.85rem; line-height: 1.45; color: var(--text-muted); margin-bottom: 1.75rem;">
                    The Carte Blanche producer has been notified for final review and approval. No further action is required from you.
                </p>
                <div style="display: flex; justify-content: center;">
                    <button type="button" id="btnCloseCoSignerModal" class="add-btn" style="padding: 0.75rem 2.25rem; border-radius: 6px; font-weight: 700; cursor: pointer;">
                        Done
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btnCloseCoSignerModal').addEventListener('click', () => {
            modal.innerHTML = `
                <div class="dialog-box" style="max-width: 500px; text-align: center; padding: 2.5rem; border-radius: 12px; background: var(--bg-card); color: var(--text-main);">
                    <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔒</div>
                    <h3 style="color: var(--primary); margin-bottom: 0.5rem;">Document Completed</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">You may now safely close this browser window or tab.</p>
                </div>
            `;
        });
    }

    /**
     * Show final success modal for Producer upon final approval (Step 3)
     */
    function showProducerApprovalSuccessModal(formTitle, producerEmail) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');

        let dialog = document.getElementById('successDialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'successDialog';
            dialog.className = 'dialog-overlay';
            document.body.appendChild(dialog);
        }

        dialog.classList.remove('hidden');
        dialog.style.display = 'flex';
        dialog.style.zIndex = '9999';
        dialog.innerHTML = `
            <div class="dialog-box" style="max-width: 560px; padding: 2rem; border-radius: 12px; background: var(--bg-card); color: var(--text-main); box-shadow: var(--shadow-xl); border: 1px solid var(--border);">
                <div style="font-size: 2.5rem; text-align: center; margin-bottom: 0.5rem;">🎉</div>
                <h2 style="color: #0284c7; text-align: center; margin-bottom: 0.5rem;">${escapeHtml(formTitle || 'Release Form')} Approved &amp; Dispatched</h2>
                <p style="text-align: center; line-height: 1.5; color: var(--text-main); font-size: 0.95rem; margin-bottom: 1.5rem;">
                    Both participant and producer signatures have been recorded. The final signed document has been dispatched to <strong>${escapeHtml(producerEmail)}</strong> and <strong>release@carteblanche.co.za</strong>.
                </p>
                <div class="dialog-actions" style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                    <a href="index.html" class="btn-soft" style="padding: 0.7rem 1.25rem; border-radius: 6px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center;">Return to Dashboard</a>
                    <a href="forms_hub.html" class="add-btn" style="padding: 0.7rem 1.25rem; border-radius: 6px; font-weight: 600; text-decoration: none; margin: 0; display: inline-flex; align-items: center;">Submit Another Form</a>
                </div>
            </div>
        `;
    }

    /**
     * Show clean locked view when document has already been co-signed or approved
     */
    function showLockedDocumentView(form, sub) {
        populateFormFields(form, sub);

        // Disable all form inputs
        form.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
            el.readOnly = true;
        });

        const isApprovedOrDone = sub.isApproved || 
                                 sub.status === 'completed' || 
                                 sub.status === 'approved' || 
                                 sub.status === 'APPROVED' || 
                                 sub.status === 'COMPLETED' || 
                                 !!sub.approvedAt || 
                                 !!sub.completedAt;

        const executedFile = (sub.files || []).find(f => 
            f.fieldname === 'dualSignedPdf' || 
            (f.filename && (f.filename.startsWith('DualSigned_') || f.filename.startsWith('Executed_')))
        ) || (sub.files && sub.files.length > 0 ? sub.files[sub.files.length - 1] : null);

        const bannerContainer = document.getElementById('countersignBannerContainer');
        if (bannerContainer) {
            bannerContainer.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.08); border: 2px solid ${isApprovedOrDone ? '#16a34a' : '#ef4444'}; border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 2rem;">
                    <div style="display: flex; align-items: flex-start; gap: 1rem;">
                        <span style="font-size: 2rem; line-height: 1;">${isApprovedOrDone ? '✅' : '🔒'}</span>
                        <div style="flex: 1;">
                            <h3 style="margin: 0 0 0.35rem 0; color: ${isApprovedOrDone ? '#15803d' : '#dc2626'}; font-size: 1.15rem; font-weight: 800;">
                                ${isApprovedOrDone ? 'DOCUMENT COMPLETED &bull; ALREADY APPROVED' : 'DOCUMENT LOCKED &bull; ALREADY SIGNED'}
                            </h3>
                            <p style="margin: 0 0 0.4rem 0; font-size: 0.9rem; color: var(--text-main); line-height: 1.5;">
                                ${isApprovedOrDone 
                                    ? 'This agreement has already been fully signed, approved, and executed. Edits and additional submissions via this link are locked.'
                                    : 'This agreement has already been co-signed and submitted for Producer review and approval. Edits and additional submissions via this link are locked.'}
                            </p>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                                If you need to make changes or have questions, please contact the Carte Blanche production team directly.
                            </p>
                            ${!isApprovedOrDone ? `
                                <div style="margin-top: 0.85rem; padding-top: 0.65rem; border-top: 1px dashed rgba(239, 68, 68, 0.3);">
                                    <a href="${FORM_PAGE_MAP[sub.formType] || 'forms_hub.html'}?id=${sub.id}&action=approve" style="display: inline-flex; align-items: center; gap: 0.4rem; background: #16a34a; color: white; text-decoration: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
                                        <span>✅</span> Are you the Producer? Review &amp; Approve Document &rarr;
                                    </a>
                                </div>
                            ` : (executedFile ? `
                                <div style="margin-top: 0.85rem; padding-top: 0.65rem; border-top: 1px dashed rgba(22, 163, 74, 0.3);">
                                    <a href="/api/get-submission-file?path=${encodeURIComponent(executedFile.storagePath)}&inline=true" target="_blank" style="display: inline-flex; align-items: center; gap: 0.4rem; background: #16a34a; color: white; text-decoration: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.85rem;">
                                        <span>📄</span> View Executed PDF
                                    </a>
                                </div>
                            ` : '')}
                        </div>
                    </div>
                </div>
            `;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.display = 'none';
        }
    }

    /**
     * Floating toast notification confirmation
     */
    function showToast(message) {
        let toast = document.getElementById('countersignToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'countersignToast';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #16a34a;
                color: #ffffff;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 0.9rem;
                font-weight: 700;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
                z-index: 99999;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span>✓</span> <span>${escapeHtml(message)}</span>`;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
        }, 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // Export API
    window.countersignFlow = {
        initDualSigning,
        isCountersigning: () => isApprovalMode,
        isCoSigner: () => isCoSignerMode,
        isApproval: () => isApprovalMode,
        getLoadedSubmission: () => loadedSubmission
    };
    window.CountersignUI = window.countersignFlow;
})();
