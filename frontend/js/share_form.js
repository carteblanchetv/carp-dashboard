// share_form.js - Multi-platform Online Form Sharing Utility
// Allows producers to easily share online forms with participants via WhatsApp, Copy Link, Email, or QR Code.

(function () {
    let currentModal = null;

    // Helper to get base URL
    function getBaseUrl() {
        const loc = window.location;
        const port = loc.port ? `:${loc.port}` : '';
        return `${loc.protocol}//${loc.host}${loc.pathname.substring(0, loc.pathname.lastIndexOf('/') + 1)}`;
    }

    // Generate Shareable URL from options
    function buildShareUrl(formPath, params) {
        const base = getBaseUrl() + formPath;
        const url = new URL(base, window.location.origin);
        if (params.story) url.searchParams.set('story', params.story.trim());
        if (params.comm) url.searchParams.set('comm', params.comm.trim());
        if (params.producer) url.searchParams.set('producer', params.producer.trim());
        if (params.producerEmail) url.searchParams.set('producerEmail', params.producerEmail.trim());
        if (params.participantName) url.searchParams.set('name', params.participantName.trim());
        return url.toString();
    }

    // Open Share Modal
    function openModal({ formTitle, formUrl, icon = '📄', defaultStory = '', defaultComm = '' }) {
        if (currentModal) {
            currentModal.remove();
            currentModal = null;
        }

        // Get logged in user info if available for defaults
        let defaultProducer = '';
        let defaultProducerEmail = '';
        try {
            const cachedUserStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
            if (cachedUserStr) {
                const userObj = JSON.parse(localStorage.getItem(cachedUserStr) || '{}');
                defaultProducer = userObj.displayName || `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim();
                defaultProducerEmail = userObj.email || '';
            }
        } catch (e) {}

        // Fallback to currently entered form inputs on page if already filled
        const pageStory = defaultStory || (document.getElementById('storyName') ? document.getElementById('storyName').value : '');
        const pageComm = defaultComm || (document.getElementById('commissionNumber') ? document.getElementById('commissionNumber').value : '');

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'shareFormModalOverlay';
        modalOverlay.className = 'share-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="share-modal-container" role="dialog" aria-modal="true">
                <div class="share-modal-header">
                    <div class="share-modal-title-group">
                        <span class="share-modal-icon">${icon}</span>
                        <div>
                            <h3>Share Online Form</h3>
                            <p class="share-modal-subtitle">${formTitle}</p>
                        </div>
                    </div>
                    <button type="button" class="share-modal-close" id="closeShareModalBtn" aria-label="Close">&times;</button>
                </div>

                <div class="share-modal-body">
                    <p class="share-modal-intro">
                        Send this online form directly to your participant, source, or case study to complete and digitally sign on their mobile phone or computer. <strong>No login required.</strong>
                    </p>

                    <div class="share-fields-grid">
                        <div class="share-field">
                            <label for="shareStoryInput">Story / Project Title</label>
                            <input type="text" id="shareStoryInput" placeholder="e.g. State of Hospitals" value="${escapeHtml(pageStory)}">
                        </div>
                        <div class="share-field">
                            <label for="shareCommInput">Commission # (Optional)</label>
                            <input type="text" id="shareCommInput" placeholder="e.g. CB-2026-089" value="${escapeHtml(pageComm)}">
                        </div>
                        <div class="share-field">
                            <label for="shareProducerInput">Producer Name</label>
                            <input type="text" id="shareProducerInput" placeholder="e.g. Lezanne van Zyl" value="${escapeHtml(defaultProducer)}">
                        </div>
                        <div class="share-field">
                            <label for="shareProducerEmailInput">Producer Email (For Copy)</label>
                            <input type="email" id="shareProducerEmailInput" placeholder="e.g. producer@carteblanche.co.za" value="${escapeHtml(defaultProducerEmail)}">
                        </div>
                        <div class="share-field full-width">
                            <label for="shareParticipantInput">Participant Name (Optional)</label>
                            <input type="text" id="shareParticipantInput" placeholder="e.g. Sipho Dlamini (pre-fills their name)">
                        </div>
                    </div>

                    <div class="share-link-section">
                        <label>Generated Shareable Link</label>
                        <div class="share-link-bar">
                            <input type="text" id="shareUrlDisplay" readonly>
                            <button type="button" id="copyShareLinkBtn" class="btn-copy-link">
                                <span>📋</span> Copy
                            </button>
                        </div>
                        <div id="copyFeedback" class="copy-feedback-toast" style="display: none;">
                            ✓ Link copied to clipboard!
                        </div>
                    </div>

                    <div class="share-actions-row">
                        <button type="button" id="shareWhatsAppBtn" class="share-btn-whatsapp">
                            <span>💬</span> Share via WhatsApp
                        </button>
                        <button type="button" id="shareEmailBtn" class="share-btn-email">
                            <span>✉️</span> Share via Email
                        </button>
                        <button type="button" id="toggleQrBtn" class="share-btn-qr">
                            <span>📱</span> Show QR Code
                        </button>
                    </div>

                    <div id="qrCodeContainer" class="share-qr-container" style="display: none;">
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                            Show this on your screen for the participant to scan with their camera:
                        </p>
                        <img id="qrCodeImg" alt="Scan to open form" class="share-qr-img">
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);
        currentModal = modalOverlay;

        // Interactive logic
        const storyInput = modalOverlay.querySelector('#shareStoryInput');
        const commInput = modalOverlay.querySelector('#shareCommInput');
        const prodInput = modalOverlay.querySelector('#shareProducerInput');
        const emailInput = modalOverlay.querySelector('#shareProducerEmailInput');
        const partInput = modalOverlay.querySelector('#shareParticipantInput');
        const urlDisplay = modalOverlay.querySelector('#shareUrlDisplay');
        const copyBtn = modalOverlay.querySelector('#copyShareLinkBtn');
        const copyFeedback = modalOverlay.querySelector('#copyFeedback');
        const waBtn = modalOverlay.querySelector('#shareWhatsAppBtn');
        const mailBtn = modalOverlay.querySelector('#shareEmailBtn');
        const qrBtn = modalOverlay.querySelector('#toggleQrBtn');
        const qrContainer = modalOverlay.querySelector('#qrCodeContainer');
        const qrImg = modalOverlay.querySelector('#qrCodeImg');
        const closeBtn = modalOverlay.querySelector('#closeShareModalBtn');

        function updateUrl() {
            const link = buildShareUrl(formUrl, {
                story: storyInput.value,
                comm: commInput.value,
                producer: prodInput.value,
                producerEmail: emailInput.value,
                participantName: partInput.value
            });
            urlDisplay.value = link;

            if (qrContainer.style.display !== 'none') {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;
            }
        }

        [storyInput, commInput, prodInput, emailInput, partInput].forEach(inp => {
            inp.addEventListener('input', updateUrl);
        });

        // Initialize display
        updateUrl();

        // Copy Link Action
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(urlDisplay.value);
            } catch (e) {
                urlDisplay.select();
                document.execCommand('copy');
            }
            copyFeedback.style.display = 'block';
            copyBtn.innerHTML = '<span>✓</span> Copied!';
            copyBtn.style.background = '#10b981';
            setTimeout(() => {
                copyFeedback.style.display = 'none';
                copyBtn.innerHTML = '<span>📋</span> Copy';
                copyBtn.style.background = '';
            }, 3000);
        });

        // WhatsApp Share Action
        waBtn.addEventListener('click', () => {
            const story = storyInput.value.trim() || 'our upcoming story';
            const participant = partInput.value.trim();
            const greeting = participant ? `Hi ${participant}` : 'Hi';
            const msg = `${greeting}, please complete and digitally sign the official Carte Blanche ${formTitle} for "${story}" using this secure link:\n\n${urlDisplay.value}\n\nThank you!\nCarte Blanche Production Team`;
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
            window.open(waUrl, '_blank');
        });

        // Email Share Action
        mailBtn.addEventListener('click', () => {
            const story = storyInput.value.trim() || 'Carte Blanche Story';
            const participant = partInput.value.trim();
            const greeting = participant ? `Dear ${participant},` : 'Hello,';
            const subject = `Carte Blanche - ${formTitle} - ${story}`;
            const body = `${greeting}\n\nPlease complete and digitally sign the official Carte Blanche ${formTitle} for "${story}" at your earliest convenience using the link below:\n\n${urlDisplay.value}\n\nThe completed and signed form will be securely transmitted to Carte Blanche Legal and our production team.\n\nWarm regards,\nCarte Blanche Production`;
            window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        });

        // QR Code Toggle
        qrBtn.addEventListener('click', () => {
            if (qrContainer.style.display === 'none') {
                qrContainer.style.display = 'block';
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(urlDisplay.value)}`;
                qrBtn.innerHTML = '<span>❌</span> Hide QR';
            } else {
                qrContainer.style.display = 'none';
                qrBtn.innerHTML = '<span>📱</span> Show QR Code';
            }
        });

        // Close handlers
        closeBtn.addEventListener('click', () => {
            modalOverlay.remove();
            currentModal = null;
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
                currentModal = null;
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    // Auto-parse parameters on Form Pages & Setup Guest Mode
    function autoInitFormPage() {
        const params = new URLSearchParams(window.location.search);
        const form = document.querySelector('form');
        if (!form) return;

        const isSharedMode = params.has('story') || params.has('producer') || params.has('comm') || params.has('name');

        // Pre-fill fields
        if (params.get('story') || params.get('storyName')) {
            const storyVal = params.get('story') || params.get('storyName');
            const storyEl = document.getElementById('storyName');
            if (storyEl) storyEl.value = storyVal;
        }

        if (params.get('name') || params.get('fullName')) {
            const nameVal = params.get('name') || params.get('fullName');
            const nameEl = document.getElementById('fullName') || document.getElementById('travelerName') || document.getElementById('ownerName') || document.getElementById('guardianName') || document.getElementById('artistName');
            if (nameEl) nameEl.value = nameVal;
        }

        if (params.get('minor') || params.get('minorName')) {
            const minorEl = document.getElementById('minorName');
            if (minorEl) minorEl.value = params.get('minor') || params.get('minorName');
        }

        if (params.get('phone')) {
            const phoneEl = document.getElementById('phone');
            if (phoneEl) phoneEl.value = params.get('phone');
        }

        if (params.get('email')) {
            const emailEl = document.getElementById('email');
            if (emailEl) emailEl.value = params.get('email');
        }

        // Hidden input tracking
        function setHidden(name, val) {
            if (!val) return;
            let el = form.querySelector(`input[name="${name}"]`);
            if (!el) {
                el = document.createElement('input');
                el.type = 'hidden';
                el.name = name;
                el.id = name;
                form.appendChild(el);
            }
            el.value = val;
        }

        setHidden('commissionNumber', params.get('comm') || params.get('commissionNumber'));
        setHidden('producerName', params.get('producer') || params.get('producerName'));
        setHidden('producerEmail', params.get('producerEmail'));

        // If viewed on the form page, inject a Top Toolbar with "Share with Participant"
        injectFormToolbar(isSharedMode, params);
    }

    function injectFormToolbar(isSharedMode, params) {
        const formHeader = document.querySelector('.form-header');
        if (!formHeader) return;

        // 1. Participant Welcome Banner if opened via shared link or guest
        if (isSharedMode) {
            const storyName = params.get('story') || params.get('storyName') || 'Carte Blanche Production';
            const producer = params.get('producer') || params.get('producerName');
            const welcomeBanner = document.createElement('div');
            welcomeBanner.className = 'participant-banner';
            welcomeBanner.innerHTML = `
                <div class="participant-banner-icon">🔒</div>
                <div class="participant-banner-content">
                    <h4>Official Carte Blanche Digital Release</h4>
                    <p>You have been invited${producer ? ` by <strong>${escapeHtml(producer)}</strong>` : ''} to complete and sign this form for: <strong>${escapeHtml(storyName)}</strong>. Please review the details, fill in required fields, and add your signature below.</p>
                </div>
            `;
            formHeader.parentNode.insertBefore(welcomeBanner, formHeader);
        }

        // 2. Producer Share Button in Header Toolbar
        const toolBar = document.createElement('div');
        toolBar.className = 'form-top-actions';
        toolBar.innerHTML = `
            <a href="forms_hub.html" class="btn-back-hub" id="backToHubBtn">← Forms Hub</a>
            <button type="button" id="shareThisFormBtn" class="btn-header-share" title="Share this form with a participant to sign">
                <span>🔗</span> Share with Participant
            </button>
        `;
        formHeader.parentNode.insertBefore(toolBar, formHeader);

        // If opened by an external participant via shared link, hide the Forms Hub navigation button
        if (isSharedMode) {
            const hubBtn = toolBar.querySelector('#backToHubBtn');
            if (hubBtn) hubBtn.style.display = 'none';
        }

        const shareBtn = toolBar.querySelector('#shareThisFormBtn');
        if (shareBtn) {
            const pageTitle = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : 'Release Form';
            const currentPath = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
            shareBtn.addEventListener('click', () => {
                openModal({
                    formTitle: pageTitle,
                    formUrl: currentPath,
                    icon: '📝'
                });
            });
        }
    }

    // Export API
    window.shareForm = {
        openModal,
        buildShareUrl,
        autoInitFormPage
    };

    document.addEventListener('DOMContentLoaded', () => {
        autoInitFormPage();
    });
})();
