/**
 * Dispatches form submission to the appropriate API endpoint with auth token fallback
 */
export async function submitLegalForm(formData) {
    const formType = (formData.get('formType') || '').trim();
    const endpointMap = {
        'participant_release': '/api/send-participant-release',
        'minor_release': '/api/send-minor-release',
        'location_agreement': '/api/send-location-agreement',
        'footage_agreement': '/api/send-footage-release-agreement',
        'footage_release_agreement': '/api/send-footage-release-agreement',
        'footage_release': '/api/send-footage-release-agreement',
        'music_agreement': '/api/send-music-agreement',
        'travel_booking': '/api/send-travel-booking',
        'insert_sheet': '/api/send-insert-sheet'
    };

    const targetUrl = endpointMap[formType] || '/api/submit-legal-form';

    let response = null;
    if (window.auth && typeof window.auth.fetchWithAuth === 'function') {
        try {
            response = await window.auth.fetchWithAuth(targetUrl, {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.warn('[submitLegalForm] fetchWithAuth failed, falling back to fetch:', e);
        }
    }
    if (!response) {
        response = await fetch(targetUrl, {
            method: 'POST',
            body: formData
        });
    }
    return response;
}

/**
 * Initiates an agreement where one party (e.g. Producer) signs first and requests co-signature
 */
export async function initCoSignAgreement(formData) {
    let response = null;
    if (window.auth && typeof window.auth.fetchWithAuth === 'function') {
        try {
            response = await window.auth.fetchWithAuth('/api/init-co-sign-agreement', {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.warn('[initCoSignAgreement] fetchWithAuth failed, falling back to fetch:', e);
        }
    }
    if (!response) {
        response = await fetch('/api/init-co-sign-agreement', {
            method: 'POST',
            body: formData
        });
    }
    return response;
}

/**
 * Fetches an agreement record for co-signing / viewing
 */
export async function getAgreementForCoSign(submissionId) {
    const res = await fetch(`/api/get-form-for-countersign/${encodeURIComponent(submissionId)}`);
    if (!res.ok) {
        throw new Error('Failed to load agreement record.');
    }
    const data = await res.json();
    if (!data.success || !data.submission) {
        throw new Error(data.error || 'Agreement not found.');
    }
    return data.submission;
}

/**
 * Submits final co-signed agreement with both signatures
 */
export async function completeCoSignedAgreement(formData) {
    let response = null;
    if (window.auth && typeof window.auth.fetchWithAuth === 'function') {
        try {
            response = await window.auth.fetchWithAuth('/api/countersign-form', {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.warn('[completeCoSignedAgreement] fetchWithAuth failed, falling back to fetch:', e);
        }
    }
    if (!response) {
        response = await fetch('/api/countersign-form', {
            method: 'POST',
            body: formData
        });
    }
    return response;
}

/**
 * Renders a banner indicating the pre-signed co-signing state
 */
export function renderCoSignBanner(targetContainer, { title, subtitle, status = 'info' }) {
    const existing = document.getElementById('carpCoSignBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'carpCoSignBanner';
    banner.className = 'co-sign-banner';
    const isCompleted = status === 'completed';
    const bg = isCompleted ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 143, 190, 0.08)';
    const borderColor = isCompleted ? '#10b981' : 'var(--primary, #008fbe)';
    const icon = isCompleted ? '✓' : '✍️';

    banner.style.cssText = `background: ${bg}; border: 1.5px solid ${borderColor}; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.85rem; animation: modalFadeIn 0.2s ease-out;`;
    banner.innerHTML = `
        <span style="font-size: 1.6rem; line-height: 1;">${icon}</span>
        <div style="flex: 1;">
            <h4 style="margin: 0; font-size: 1rem; color: var(--text-main); font-weight: 700;">${title}</h4>
            ${subtitle ? `<p style="margin: 0.2rem 0 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">${subtitle}</p>` : ''}
        </div>
    `;

    if (targetContainer) {
        targetContainer.prepend(banner);
    }
}

/**
 * Renders an interactive success modal when a form has been submitted and emailed
 */
export function showSubmissionSuccessModal({ title, message, recipients = [], pdfBlob = null, filename = '' }) {
    // Clean up any existing modal
    const existing = document.getElementById('submissionSuccessModal');
    if (existing) existing.remove();

    const isCoSign = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('id')) || (!window.auth?.currentUser && !localStorage.getItem('cb_auth_user'));

    const recipientBadges = recipients.length > 0
        ? recipients.map(r => `
            <span style="display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(0, 143, 190, 0.1); color: var(--primary); padding: 0.3rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; border: 1px solid rgba(0, 143, 190, 0.25);">
                ✉️ ${r}
            </span>
        `).join(' ')
        : `<span style="color: var(--text-muted); font-size: 0.85rem;">Email delivery in progress</span>`;

    const closeBtnText = isCoSign ? '✓ Done' : 'Back to Forms Hub →';
    const noteText = isCoSign 
        ? '🔒 Your signed agreement has been securely submitted and archived.' 
        : '🔒 The submission and PDF have also been securely encrypted and archived in the CARP Dashboard.';

    const modalHTML = `
    <div id="submissionSuccessModal" class="modal-backdrop active" style="display: flex; opacity: 1; z-index: 99999;">
        <div class="modal-card" style="max-width: 520px; text-align: center; padding: 2.25rem 1.75rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: var(--shadow-xl);">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 2.25rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
                ✓
            </div>
            <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">
                ${isCoSign ? 'Agreement Signed Successfully!' : 'Form Submitted Successfully!'}
            </h2>
            <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 1.25rem; line-height: 1.5;">
                A finalized copy of <strong>${title}</strong> has been compiled and emailed to:
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 1.5rem;">
                ${recipientBadges}
            </div>
            <div style="background: rgba(0, 143, 190, 0.04); border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1.75rem; font-size: 0.85rem; color: var(--text-muted);">
                ${noteText}
            </div>
            <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                ${pdfBlob ? `
                <button type="button" id="modalDownloadPdfBtn" class="btn-soft" style="padding: 0.75rem 1.25rem; font-size: 0.9rem; font-weight: 600;">
                    <span>📥</span> Download Copy
                </button>
                ` : ''}
                <button type="button" id="modalCloseBtn" class="submit-btn" style="margin-top: 0; padding: 0.75rem 1.5rem; font-size: 0.9rem;">
                    ${closeBtnText}
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    if (pdfBlob) {
        document.getElementById('modalDownloadPdfBtn')?.addEventListener('click', () => {
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'Completed_Agreement.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
        if (isCoSign) {
            const card = document.querySelector('#submissionSuccessModal .modal-card');
            if (card) {
                card.innerHTML = `
                    <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 2.25rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
                        ✓
                    </div>
                    <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">
                        All Done!
                    </h2>
                    <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.5;">
                        Your co-signed agreement has been completed. You may safely close this browser window or tab.
                    </p>
                    ${pdfBlob ? `
                    <button type="button" id="finalDownloadBtn" class="submit-btn" style="padding: 0.75rem 1.5rem; font-size: 0.9rem; margin-top: 0;">
                        <span>📥</span> Download PDF Copy
                    </button>
                    ` : ''}
                `;
                if (pdfBlob) {
                    document.getElementById('finalDownloadBtn')?.addEventListener('click', () => {
                        const url = URL.createObjectURL(pdfBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename || 'Completed_Agreement.pdf';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    });
                }
            }
            try { window.close(); } catch (e) {}
        } else {
            window.location.href = 'forms_hub.html';
        }
    });
}

/**
 * Sanitizes and cleans text so standard PDF-Lib fonts (WinAnsi / Windows-1252) never throw encoding errors.
 * Automatically strips emojis, normalizes unicode arrows, em-dashes, smart quotes, and unencodable symbols.
 */
export function cleanPdfText(str) {
    if (str == null) return '';
    return String(str)
        .replace(/[➔➜➝➡→]/g, '->')
        .replace(/[—–]/g, '-')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/…/g, '...')
        .replace(/•/g, '*')
        .replace(/©/g, '(c)')
        .replace(/[✈️🚗🏨📝👤🧒📍🎞️🎵📋✍️✓\u2708]/gu, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
        .trim();
}

/**
 * Safely draws text onto a pdf-lib page using cleanPdfText and ASCII fallback to guarantee that WinAnsi encoding never throws.
 */
export function safeDrawField(page, text, x, y, options = {}) {
    if (!text && text !== 0) return;
    const cleaned = cleanPdfText(text);
    if (!cleaned) return;
    try {
        page.drawText(cleaned, { x, y, ...options });
    } catch (e) {
        console.warn('safeDrawField fallback for text:', cleaned, e);
        try {
            const asciiOnly = cleaned.replace(/[^\x20-\x7E]/g, '');
            if (asciiOnly) {
                page.drawText(asciiOnly, { x, y, ...options });
            }
        } catch (fallbackErr) {
            console.error('safeDrawField double-fallback failed:', fallbackErr);
        }
    }
}

