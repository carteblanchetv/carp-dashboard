import { fetchWithAuth, checkAuth } from './auth.js?v=5.1.1';

const modal = document.getElementById('detailsModal');
const closeBtn = document.getElementById('closeDetailsModalBtn');
const cancelBtn = document.getElementById('cancelDetailsModalBtn');
const loadingSpinner = document.getElementById('tableLoading');

checkAuth().then(user => {
    if (user) {
        window.auth.initNavBar(user);
        loadSubmissions(user);
    }
});

async function loadSubmissions(user) {
    if (loadingSpinner) loadingSpinner.style.display = 'block';

    try {
        const res = await fetchWithAuth('/api/viewer-submissions');
        const result = await res.json();
        
        if (loadingSpinner) loadingSpinner.style.display = 'none';

        if (result.success && result.submissions) {
            renderSubmissions(result.submissions, user);
        } else {
            document.getElementById('submissionsList').innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 3rem; color: var(--danger);">
                        ${result.error || 'Failed to load submissions.'}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error loading submissions:', error);
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        document.getElementById('submissionsList').innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--danger);">
                    An error occurred while loading submissions.
                </td>
            </tr>
        `;
    }
}

function renderSubmissions(submissions, user) {
    const list = document.getElementById('submissionsList');
    if (!list) return;

    if (!submissions || submissions.length === 0) {
        list.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    No viewer submissions found.
                </td>
            </tr>
        `;
        return;
    }

    const canDelete = ['admin', 'super-admin', 'editorial-production'].includes(user?.role);

    list.innerHTML = submissions.map((sub, index) => {
        const type = (sub.formType || 'email_submission').toLowerCase();
        const typeLabel = type === 'dstv_tipoff' ? 'DStv Tip-Off' : 'Email Pitch';
        const typeClass = type === 'dstv_tipoff' ? 'warning' : 'info'; // status badge helper classes
        const subject = sub.subject || '(No Subject)';
        const fromName = sub.submittedByName || sub.submittedByEmail || 'Unknown';
        const fromEmail = sub.submittedByEmail ? ` &lt;${sub.submittedByEmail}&gt;` : '';
        
        let dateText = '—';
        if (sub.submittedAt) {
            const dateObj = sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt);
            dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
        }

        const deleteButtonHtml = canDelete
            ? `<button class="btn-admin-cell danger delete-submission-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin-left: 0.4rem;">🗑️ Delete</button>`
            : '';

        return `
            <tr>
                <td data-label="#" style="font-weight: 700; color: var(--text-muted); text-align: center;">${index + 1}.</td>
                <td data-label="Type" style="text-align: center;">
                    <span class="status-badge-modern ${typeClass}" style="width: 100%; justify-content: center;">
                        ${typeLabel}
                    </span>
                </td>
                <td data-label="Subject" class="col-title" style="font-weight: 700;">
                    <a href="#" class="view-details-link" data-id="${sub.id}" style="color: var(--primary); text-decoration: none;">
                        ${subject}
                    </a>
                </td>
                <td data-label="From" style="font-size: 0.9rem;">
                    <strong>${fromName}</strong><br/>
                    <span style="color: var(--text-muted); font-size: 0.8rem;">${sub.submittedByEmail || ''}</span>
                </td>
                <td data-label="Date Received" style="text-align: center; color: var(--text-muted); font-size: 0.85rem;">${dateText}</td>
                <td data-label="Actions" style="text-align: center;">
                    <div style="display: flex; gap: 0.2rem; justify-content: center; align-items: center;">
                        <button class="btn-admin-cell secondary view-details-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">📄 View</button>
                        ${deleteButtonHtml}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach listeners
    document.querySelectorAll('.view-details-link, .view-details-btn').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            const id = element.getAttribute('data-id');
            const sub = submissions.find(s => s.id === id);
            if (sub) showDetails(sub);
        });
    });

    document.querySelectorAll('.delete-submission-btn').forEach(element => {
        element.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = element.getAttribute('data-id');
            const sub = submissions.find(s => s.id === id);
            if (!sub) return;
            
            if (!confirm(`Are you sure you want to delete the viewer submission: "${sub.subject}"?\n\nThis action cannot be undone.`)) return;

            try {
                const response = await fetchWithAuth('/api/admin/delete-submission', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
                }

                const result = await response.json();
                if (result.success) {
                    loadSubmissions(user);
                } else {
                    throw new Error(result.error || 'Failed to delete submission');
                }
            } catch (err) {
                alert("Delete failed: " + err.message);
            }
        });
    });
}


function showDetails(sub) {
    document.getElementById('modalSubject').textContent = sub.subject || '(No Subject)';
    document.getElementById('modalFrom').textContent = `${sub.submittedByName || 'Unknown'} (${sub.submittedByEmail || 'No Email'})`;
    
    let dateText = '—';
    if (sub.submittedAt) {
        const dateObj = sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt);
        dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short' });
    }
    document.getElementById('modalDate').textContent = dateText;

    const type = (sub.formType || 'email_submission').toLowerCase();
    const typeLabel = type === 'dstv_tipoff' ? 'DStv Tip-Off' : 'Email Pitch';
    const typeClass = type === 'dstv_tipoff' ? 'warning' : 'info';
    
    const typeBadge = document.getElementById('modalType');
    typeBadge.textContent = typeLabel;
    typeBadge.className = `status-badge-modern ${typeClass}`;

    // Tip Details (DStv fields)
    const tipDetailsGroup = document.getElementById('modalTipDetails');
    if (type === 'dstv_tipoff' && sub.tipoffDetails) {
        tipDetailsGroup.style.display = 'block';
        document.getElementById('tipName').textContent = `${sub.tipoffDetails.name || ''} ${sub.tipoffDetails.lastName || ''}`.trim() || '—';
        document.getElementById('tipEmail').textContent = sub.tipoffDetails.email || '—';
        document.getElementById('tipPhone').textContent = sub.tipoffDetails.phone || '—';
        document.getElementById('tipLocation').textContent = sub.tipoffDetails.location || '—';
    } else {
        tipDetailsGroup.style.display = 'none';
    }

    // Message Body
    const bodyEl = document.getElementById('modalBody');
    if (sub.bodyHtml) {
        // Use iframe or sanitized element safely, or just show text for simplicity
        // Showing bodyHtml safely or plain body is better. Let's use plain text body.
        bodyEl.textContent = sub.body || '';
    } else {
        bodyEl.textContent = sub.body || '';
    }

    // Attachments
    const attachmentsGroup = document.getElementById('modalAttachmentsGroup');
    const attachmentsList = document.getElementById('modalAttachmentsList');
    if (Array.isArray(sub.attachments) && sub.attachments.length > 0) {
        attachmentsGroup.style.display = 'block';
        attachmentsList.innerHTML = sub.attachments.map(att => {
            // Encode the path to make it a safe query param
            const downloadUrl = `/api/get-submission-file?path=${encodeURIComponent(att.storagePath)}&inline=false`;
            const viewUrl = `/api/get-submission-file?path=${encodeURIComponent(att.storagePath)}&inline=true`;
            return `
                <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1.25rem;">📎</span>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${att.filename || 'File'}</span>
                        <div style="display: flex; gap: 0.5rem; margin-top: 0.15rem; font-size: 0.75rem;">
                            <a href="${viewUrl}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 700;">👁️ View</a>
                            <span style="color: var(--text-muted);">|</span>
                            <a href="${downloadUrl}" style="color: var(--primary); text-decoration: none; font-weight: 700;">📥 Download</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        attachmentsGroup.style.display = 'none';
        attachmentsList.innerHTML = '';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
};

if (closeBtn) closeBtn.onclick = closeModal;
if (cancelBtn) cancelBtn.onclick = closeModal;
modal.onclick = (e) => {
    if (e.target === modal) {
        closeModal();
    }
};
