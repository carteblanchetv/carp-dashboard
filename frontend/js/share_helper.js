// share_helper.js - Universal Sharing Utility for CARP Forms & Legal Agreements

/**
 * Builds the full absolute URL for sharing, retaining story title & commission number if present.
 */
export function buildShareUrl(targetUrl, params = {}) {
    const currentParams = new URLSearchParams(window.location.search);
    const story = params.story || currentParams.get('story') || '';
    const comm = params.comm || currentParams.get('comm') || '';

    const resolved = new URL(targetUrl || window.location.href, window.location.origin);
    if (story && !resolved.searchParams.has('story')) {
        resolved.searchParams.set('story', story);
    }
    if (comm && !resolved.searchParams.has('comm')) {
        resolved.searchParams.set('comm', comm);
    }
    return resolved.toString();
}

/**
 * Displays an interactive Share modal with Copy Link, WhatsApp, Email, and Native Share.
 */
export function openShareModal({
    title = 'Carte Blanche Agreement Form',
    url = '',
    description = 'Official Carte Blanche legal agreement / release form.',
    storyTitle = '',
    commNum = ''
} = {}) {
    // Clean up existing share modal if open
    const existing = document.getElementById('carpShareModal');
    if (existing) existing.remove();

    const currentParams = new URLSearchParams(window.location.search);
    const resolvedStory = storyTitle || currentParams.get('story') || '';
    const resolvedComm = commNum || currentParams.get('comm') || '';
    const shareUrl = buildShareUrl(url, { story: resolvedStory, comm: resolvedComm });

    const subject = `${title}${resolvedStory ? ' - ' + resolvedStory : ''}`;
    const message = `Please complete and sign the ${title}${resolvedStory ? ` for "${resolvedStory}"` : ''}${resolvedComm ? ` (Comm #${resolvedComm})` : ''}:\n${shareUrl}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    const modalHTML = `
    <div id="carpShareModal" class="modal-backdrop active" style="display: flex; opacity: 1; z-index: 999999; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 1rem;">
        <div class="modal-card" style="max-width: 500px; width: 100%; background: var(--bg-card, #ffffff); border-radius: var(--radius-lg, 12px); border: 1px solid var(--border, #cbd5e1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25); overflow: hidden; animation: modalFadeIn 0.2s ease-out;">
            <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border, #e2e8f0); display: flex; justify-content: space-between; align-items: center; background: var(--bg-light, #f8fafc);">
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                    <span style="font-size: 1.35rem;">🔗</span>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main, #0f172a); font-weight: 700;">Share Form</h3>
                        <p style="margin: 0.15rem 0 0; font-size: 0.8rem; color: var(--text-muted, #64748b);">${title}</p>
                    </div>
                </div>
                <button type="button" id="closeShareModalBtn" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted, #64748b); cursor: pointer; line-height: 1; padding: 0.25rem;">&times;</button>
            </div>
            
            <div style="padding: 1.5rem;">
                ${resolvedStory || resolvedComm ? `
                <div style="background: rgba(0, 143, 190, 0.06); border: 1px solid rgba(0, 143, 190, 0.2); border-radius: 6px; padding: 0.6rem 0.85rem; margin-bottom: 1.25rem; font-size: 0.82rem; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 0.5rem;">
                    <span>📌</span>
                    <div>
                        ${resolvedComm ? `<strong>Comm #${resolvedComm}</strong> &bull; ` : ''}
                        <span>${resolvedStory || 'Story Agreement'}</span>
                    </div>
                </div>
                ` : ''}

                <label style="display: block; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #64748b); margin-bottom: 0.4rem;">
                    Shareable Link
                </label>
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
                    <input type="text" id="shareUrlInput" value="${shareUrl}" readonly style="flex: 1; padding: 0.65rem 0.85rem; font-size: 0.85rem; border: 1px solid var(--border, #cbd5e1); border-radius: 6px; background: var(--bg-light, #f8fafc); color: var(--text-main, #0f172a); outline: none;">
                    <button type="button" id="copyShareUrlBtn" class="submit-btn" style="margin-top: 0; padding: 0.65rem 1rem; font-size: 0.85rem; white-space: nowrap; font-weight: 700; background: var(--primary, #008fbe); color: white; border-radius: 6px; border: none; cursor: pointer;">
                        📋 Copy Link
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                    <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #25D366; color: white; border-radius: 6px; font-size: 0.9rem; font-weight: 700; text-decoration: none; transition: opacity 0.2s;">
                        <span>💬</span> Share via WhatsApp
                    </a>

                    <a href="${mailtoUrl}" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: var(--bg-light, #f1f5f9); color: var(--text-main, #1e293b); border: 1px solid var(--border, #cbd5e1); border-radius: 6px; font-size: 0.9rem; font-weight: 600; text-decoration: none; transition: background 0.2s;">
                        <span>✉️</span> Share via Email
                    </a>

                    ${canNativeShare ? `
                    <button type="button" id="nativeShareBtn" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: transparent; color: var(--primary, #008fbe); border: 1px solid var(--primary, #008fbe); border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                        <span>📲</span> More Device Share Options
                    </button>
                    ` : ''}
                </div>
            </div>

            <div style="padding: 0.85rem 1.5rem; border-top: 1px solid var(--border, #e2e8f0); background: var(--bg-light, #f8fafc); display: flex; justify-content: flex-end;">
                <button type="button" id="closeShareModalBtn2" class="btn-soft" style="padding: 0.5rem 1.25rem; font-size: 0.85rem; cursor: pointer; border-radius: 6px; border: 1px solid var(--border, #cbd5e1); background: var(--bg-card, #ffffff); color: var(--text-main, #0f172a);">
                    Done
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('carpShareModal');
    const close = () => modal.remove();

    modal.querySelector('#closeShareModalBtn').addEventListener('click', close);
    modal.querySelector('#closeShareModalBtn2').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Copy Link
    const copyBtn = modal.querySelector('#copyShareUrlBtn');
    const input = modal.querySelector('#shareUrlInput');
    copyBtn.addEventListener('click', async () => {
        try {
            input.select();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                document.execCommand('copy');
            }
            copyBtn.textContent = '✓ Copied!';
            copyBtn.style.background = '#10b981';
            setTimeout(() => {
                copyBtn.textContent = '📋 Copy Link';
                copyBtn.style.background = 'var(--primary, #008fbe)';
            }, 2500);
        } catch (err) {
            console.error('Copy failed:', err);
            prompt('Copy this link:', shareUrl);
        }
    });

    // Native Share
    const nativeBtn = modal.querySelector('#nativeShareBtn');
    if (nativeBtn) {
        nativeBtn.addEventListener('click', async () => {
            try {
                await navigator.share({
                    title: subject,
                    text: `Please complete and sign the ${title}:`,
                    url: shareUrl
                });
            } catch (err) {
                if (err.name !== 'AbortError') console.error('Share error:', err);
            }
        });
    }
}

/**
 * Downloads a generated PDF blob to the user's device and triggers native file sharing
 * if supported (iOS/Android/macOS), or falls back to opening the share modal on desktop.
 */
export async function downloadAndSharePDF(pdfBlob, filename, {
    title = 'Carte Blanche Agreement Form',
    storyTitle = '',
    commNum = ''
} = {}) {
    // 1. Trigger local file download
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

    // 2. Attempt native file share (supported on mobile / iPad / Android / macOS)
    try {
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: filename,
                    text: `Attached is the signed ${title}${storyTitle ? ` for "${storyTitle}"` : ''}.`
                });
                return;
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') return; // User canceled the share sheet
                console.warn('Native file share failed, falling back:', shareErr);
            }
        }
    } catch (e) {
        console.warn('File constructor or canShare not supported:', e);
    }

    // 3. Fallback on devices that don't support native file sharing (e.g. desktop Chrome Windows):
    // Open the share modal so user can share link via WhatsApp, Email, or Copy Link
    openShareModal({
        title,
        url: window.location.href,
        storyTitle,
        commNum
    });
}

