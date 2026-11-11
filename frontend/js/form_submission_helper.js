function isExternalGuestOrCoSigner() {
    try {
        const currentUser = window.auth?.getCurrentUser?.() || window.auth?.currentUser;
        if (currentUser) {
            return false;
        }
        const params = new URLSearchParams(window.location.search);
        const isProducerAction = params.get('mode') === 'edit' || params.get('action') === 'approve' || params.get('action') === 'countersign';
        if (isProducerAction && localStorage.getItem('login_timestamp')) {
            return false;
        }
        if (params.has('id')) return true;
        if (document.body?.classList.contains('co-sign-mode') || document.documentElement?.classList.contains('co-sign-mode')) {
            return true;
        }
        if (!currentUser && !localStorage.getItem('login_timestamp') && !localStorage.getItem('cb_auth_user')) {
            return true;
        }
    } catch (e) {}
    return false;
}

export function notifyLegalFormsUpdated(status = 'UPDATED') {
    try {
        localStorage.setItem('carp_legal_form_last_updated', String(Date.now()));
    } catch (e) {}
    try {
        const bc = new BroadcastChannel('carp_legal_forms_sync');
        bc.postMessage({ type: 'LEGAL_FORM_UPDATED', status, timestamp: Date.now() });
        setTimeout(() => { try { bc.close(); } catch (e) {} }, 250);
    } catch (e) {}
}

export function normalizeDateForInput(val) {
    if (!val || typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (iso) return iso[1];
    return '';
}

export function getActiveProducerEmail(fallback = '') {
    try {
        const u = window.auth?.getCurrentUser?.() || window.auth?.currentUser;
        if (u && u.email) return u.email.trim();
    } catch (e) {}
    const trimmed = (fallback || '').trim();
    if (trimmed && trimmed !== 'release@carteblanche.co.za') return trimmed;
    return '';
}

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
    if (!isExternalGuestOrCoSigner() && window.auth && typeof window.auth.fetchWithAuth === 'function') {
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
    if (response && response.ok) {
        notifyLegalFormsUpdated('SUBMITTED');
    }
    return response;
}

/**
 * Initiates an agreement where one party (e.g. Producer) signs first and requests co-signature.
 * Uses the form-specific legal submission endpoint (which natively creates PARTIALLY_SIGNED
 * co-sign records and returns shareUrl), with fallback to /api/init-co-sign-agreement.
 */
export async function initCoSignAgreement(formData) {
    const response = await submitLegalForm(formData);
    if (response && response.status !== 404) {
        notifyLegalFormsUpdated('PARTIALLY_SIGNED');
        return response;
    }

    let fallbackResponse = null;
    if (!isExternalGuestOrCoSigner() && window.auth && typeof window.auth.fetchWithAuth === 'function') {
        try {
            fallbackResponse = await window.auth.fetchWithAuth('/api/init-co-sign-agreement', {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.warn('[initCoSignAgreement] fetchWithAuth fallback failed:', e);
        }
    }
    if (!fallbackResponse) {
        fallbackResponse = await fetch('/api/init-co-sign-agreement', {
            method: 'POST',
            body: formData
        });
    }
    if (fallbackResponse && fallbackResponse.ok) {
        notifyLegalFormsUpdated('PARTIALLY_SIGNED');
    }
    return fallbackResponse;
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
    // External co-signers submit directly via fetch without waiting for Firebase Auth initialization
    if (!isExternalGuestOrCoSigner() && window.auth && typeof window.auth.fetchWithAuth === 'function') {
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
    if (response && response.ok) {
        notifyLegalFormsUpdated('COMPLETED');
    }
    return response;
}

/**
 * Renders a banner indicating the pre-signed co-signing state
 */
export function renderCoSignBanner(targetContainer, { title, subtitle, status = 'info', actionBtn = null }) {
    const existing = document.getElementById('carpCoSignBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'carpCoSignBanner';
    banner.className = 'co-sign-banner';
    const isCompleted = status === 'completed';
    const bg = isCompleted ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 143, 190, 0.08)';
    const borderColor = isCompleted ? '#10b981' : 'var(--primary, #008fbe)';
    const icon = isCompleted ? '✓' : '✍️';

    banner.style.cssText = `background: ${bg}; border: 1.5px solid ${borderColor}; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.85rem; animation: modalFadeIn 0.2s ease-out;`;
    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1; min-width: 240px;">
            <span style="font-size: 1.6rem; line-height: 1;">${icon}</span>
            <div style="flex: 1;">
                <h4 style="margin: 0; font-size: 1rem; color: var(--text-main); font-weight: 700;">${title}</h4>
                ${subtitle ? `<p style="margin: 0.2rem 0 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">${subtitle}</p>` : ''}
            </div>
        </div>
        ${actionBtn ? `<button type="button" id="carpBannerActionBtn" class="btn-soft" style="padding: 0.55rem 1rem; font-size: 0.85rem; font-weight: 700; background: var(--primary, #008fbe); color: #ffffff; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap;">${actionBtn.label}</button>` : ''}
    `;

    if (targetContainer) {
        targetContainer.prepend(banner);
        if (actionBtn && typeof actionBtn.onClick === 'function') {
            banner.querySelector('#carpBannerActionBtn')?.addEventListener('click', actionBtn.onClick);
        }
    }
}

/**
 * Renders an interactive success modal when a form has been submitted and emailed
 */
export function showSubmissionSuccessModal({ title, message, recipients = [], pdfBlob = null, filename = '' }) {
    // Clean up any existing modal
    const existing = document.getElementById('submissionSuccessModal');
    if (existing) existing.remove();

    notifyLegalFormsUpdated('COMPLETED');
    const isCoSign = isExternalGuestOrCoSigner();

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

/**
 * Extracts a map of fieldName -> { x, y, width, height } from the PDF's AcroForm widgets,
 * and then strips all interactive AcroForm widget annotations so their opaque backgrounds
 * never cover up text or signature images drawn onto the page content stream.
 */
export function prepareTemplatePdf(pdfDoc) {
    const fieldMap = {};
    const { PDFName } = (typeof window !== 'undefined' && window.PDFLib) || {};

    try {
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        for (const field of fields) {
            const name = field.getName();
            const widgets = field.acroField.getWidgets();
            for (const w of widgets) {
                const rect = w.getRectangle();
                if (rect && rect.width > 0 && rect.height > 0) {
                    fieldMap[name] = {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    };
                    break;
                }
            }
        }
        for (const field of fields) {
            try { form.removeField(field); } catch (e) {}
        }
    } catch (e) {
        console.warn('[prepareTemplatePdf] Notice extracting AcroForm fields:', e);
    }

    if (PDFName) {
        try {
            for (const pg of pdfDoc.getPages()) {
                pg.node.set(PDFName.of('Annots'), pdfDoc.context.obj([]));
            }
        } catch (e) {}
        try {
            if (pdfDoc.catalog.has(PDFName.of('AcroForm'))) {
                pdfDoc.catalog.delete(PDFName.of('AcroForm'));
            }
        } catch (e) {}
    }

    return fieldMap;
}

/**
 * Draws text neatly inside a named template field box extracted by prepareTemplatePdf().
 * Automatically shrinks font size if needed to prevent horizontal overflow, and supports
 * centered alignment and multiline wrapping.
 */
export function drawInFieldBox(page, fieldMap, fieldName, text, options = {}) {
    if (!text && text !== 0) return;
    const cleaned = cleanPdfText(text);
    if (!cleaned) return;

    const box = (fieldMap && fieldMap[fieldName]) || options.fallbackRect;
    if (!box) {
        console.warn(`[drawInFieldBox] Field "${fieldName}" not found in template fieldMap.`);
        return;
    }

    const font = options.font;
    const color = options.color;
    const padX = options.padX !== undefined ? options.padX : 6;
    const maxW = Math.max(20, box.width - padX * 2);
    let size = options.size || 9.5;

    if (options.multiline) {
        const lineSize = options.size || 8.5;
        const lineGap = lineSize + 2.5;
        const rawParagraphs = String(text).split(/\r?\n/);
        const lines = [];

        for (const para of rawParagraphs) {
            const cleanPara = cleanPdfText(para);
            if (!cleanPara) continue;
            const words = cleanPara.split(/\s+/);
            let currentLine = '';
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                if (font && font.widthOfTextAtSize(testLine, lineSize) <= maxW) {
                    currentLine = testLine;
                } else {
                    if (currentLine) lines.push(currentLine);
                    currentLine = word;
                }
            }
            if (currentLine) lines.push(currentLine);
        }

        let curY = box.y + box.height - lineSize - 3;
        for (const line of lines) {
            if (curY < box.y + 2) break;
            safeDrawField(page, line, box.x + padX, curY, { size: lineSize, font, color });
            curY -= lineGap;
        }
        return;
    }

    let textToDraw = cleaned;
    if (font) {
        while (size > 6.5 && font.widthOfTextAtSize(textToDraw, size) > maxW) {
            size -= 0.5;
        }
        if (font.widthOfTextAtSize(textToDraw, size) > maxW) {
            while (textToDraw.length > 3 && font.widthOfTextAtSize(textToDraw + '...', size) > maxW) {
                textToDraw = textToDraw.slice(0, -1);
            }
            textToDraw = textToDraw.trim() + '...';
        }
    }

    let drawX = box.x + padX;
    if (options.align === 'center' && font) {
        const textW = font.widthOfTextAtSize(textToDraw, size);
        drawX = box.x + Math.max(padX, (box.width - textW) / 2);
    }

    const drawY = box.y + (box.height - size * 0.72) / 2;
    safeDrawField(page, textToDraw, drawX, drawY, { size, font, color });
}

/**
 * Safely embeds a signature data URL (PNG or JPEG) into a pdf-lib PDFDocument without throwing.
 */
export async function embedSignatureSafe(pdfDoc, dataUrl) {
    if (!pdfDoc || !dataUrl || typeof dataUrl !== 'string') return null;
    try {
        if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
            return await pdfDoc.embedJpg(dataUrl);
        }
        return await pdfDoc.embedPng(dataUrl);
    } catch (e) {
        console.warn('[embedSignatureSafe] Direct embed failed, attempting canvas conversion:', e);
        try {
            const converted = await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const c = document.createElement('canvas');
                        c.width = img.naturalWidth || img.width || 400;
                        c.height = img.naturalHeight || img.height || 140;
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(c.toDataURL('image/png'));
                    } catch (err) {
                        resolve(null);
                    }
                };
                img.onerror = () => resolve(null);
                img.src = dataUrl;
            });
            if (converted) {
                return await pdfDoc.embedPng(converted);
            }
        } catch (fallbackErr) {
            console.warn('[embedSignatureSafe] Fallback embed failed:', fallbackErr);
        }
        return null;
    }
}

/**
 * Draws an embedded PNG signature image proportionally scaled and centered inside a named template signature box.
 */
export function drawSignatureInFieldBox(page, fieldMap, fieldName, sigImage, options = {}) {
    if (!sigImage || !page) return;
    const box = (fieldMap && fieldMap[fieldName]) || options.fallbackRect;
    if (!box) {
        console.warn(`[drawSignatureInFieldBox] Signature field "${fieldName}" not found in template fieldMap.`);
        return;
    }

    try {
        const padX = options.padX !== undefined ? options.padX : 6;
        const padY = options.padY !== undefined ? options.padY : 3;
        const maxW = Math.max(20, box.width - padX * 2);
        const maxH = Math.max(10, box.height - padY * 2);

        const dims = sigImage.scaleToFit(maxW, maxH);
        const drawX = box.x + (box.width - dims.width) / 2;
        const drawY = box.y + (box.height - dims.height) / 2;

        page.drawImage(sigImage, {
            x: drawX,
            y: drawY,
            width: dims.width,
            height: dims.height
        });
    } catch (e) {
        console.warn(`[drawSignatureInFieldBox] Failed to draw signature in "${fieldName}":`, e);
    }
}

