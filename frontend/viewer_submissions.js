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
    const regularList = document.getElementById('submissionsList');
    const investigationList = document.getElementById('investigationList');
    if (!regularList || !investigationList) return;

    // Filter out spam submissions if any status is set, and partition useful vs non-useful
    const validSubs = submissions.filter(s => s.status !== 'spam' && s.reportedSpam !== true);
    const investigationSubs = validSubs.filter(s => s.useful === true);
    const regularSubs = validSubs.filter(s => s.useful !== true);

    const canDelete = ['admin', 'super-admin', 'editorial-production'].includes(user?.role);

    // Render regular submissions
    if (regularSubs.length === 0) {
        regularList.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    No viewer submissions found.
                </td>
            </tr>
        `;
    } else {
        regularList.innerHTML = regularSubs.map((sub, index) => {
            const subject = sub.subject || '(No Subject)';
            const fromName = sub.submittedByName || sub.submittedByEmail || 'Unknown';
            
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
                    <td data-label="Subject" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">
                        <a href="#" class="view-details-link" data-id="${sub.id}" style="color: var(--primary); text-decoration: none;" title="${subject.replace(/"/g, '&quot;')}">
                            ${subject}
                        </a>
                    </td>
                    <td data-label="From" style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;" title="${fromName} (${sub.submittedByEmail || ''})">
                        <strong>${fromName}</strong>
                    </td>
                    <td data-label="Date Received" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${dateText}</td>
                    <td data-label="Actions" style="text-align: center;">
                        <div style="display: flex; gap: 0.2rem; justify-content: center; align-items: center;">
                            <button class="btn-admin-cell secondary view-details-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">📄 View</button>
                            ${deleteButtonHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render under investigation submissions
    if (investigationSubs.length === 0) {
        investigationList.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No stories currently under investigation.
                </td>
            </tr>
        `;
    } else {
        investigationList.innerHTML = investigationSubs.map((sub, index) => {
            const subject = sub.subject || '(No Subject)';
            const fromName = sub.submittedByName || sub.submittedByEmail || 'Unknown';
            const actionedByFirstName = sub.actionedBy ? (sub.actionedBy.name || '').split(' ')[0] : '—';
            
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
                    <td data-label="Action By" style="text-align: center; color: var(--warning); font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${actionedByFirstName}</td>
                    <td data-label="Subject" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">
                        <a href="#" class="view-details-link" data-id="${sub.id}" style="color: var(--primary); text-decoration: none;" title="${subject.replace(/"/g, '&quot;')}">
                            ${subject}
                        </a>
                    </td>
                    <td data-label="From" style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;" title="${fromName} (${sub.submittedByEmail || ''})">
                        <strong>${fromName}</strong>
                    </td>
                    <td data-label="Date Received" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${dateText}</td>
                    <td data-label="Actions" style="text-align: center;">
                        <div style="display: flex; gap: 0.2rem; justify-content: center; align-items: center;">
                            <button class="btn-admin-cell secondary view-details-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">📄 View</button>
                            ${deleteButtonHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Attach listeners for view buttons
    document.querySelectorAll('.view-details-link, .view-details-btn').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            const id = element.getAttribute('data-id');
            const sub = submissions.find(s => s.id === id);
            if (sub) showDetails(sub, user);
        });
    });

    // Attach listeners for delete buttons
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

function showDetails(sub, user) {
    document.getElementById('modalSubject').textContent = sub.subject || '(No Subject)';
    document.getElementById('modalFrom').textContent = `${sub.submittedByName || 'Unknown'} (${sub.submittedByEmail || 'No Email'})`;
    
    let dateText = '—';
    if (sub.submittedAt) {
        const dateObj = sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt);
        dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short' });
    }
    document.getElementById('modalDate').textContent = dateText;

    // Toggle Actioned By text display
    const actionedContainer = document.getElementById('modalActionedByContainer');
    const actionedEl = document.getElementById('modalActionedBy');
    if (sub.useful && sub.actionedBy) {
        actionedContainer.style.display = 'flex';
        actionedEl.textContent = sub.actionedBy.name;
    } else {
        actionedContainer.style.display = 'none';
        actionedEl.textContent = '';
    }

    // Set contact individual email prefill details
    const contactLink = document.getElementById('modalContactLink');
    if (contactLink) {
        contactLink.href = `mailto:${sub.submittedByEmail || ''}?subject=${encodeURIComponent(sub.subject || '')}`;
    }

    // Tip Details (DStv fields)
    const tipDetailsGroup = document.getElementById('modalTipDetails');
    const type = (sub.formType || 'email_submission').toLowerCase();
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
    bodyEl.textContent = stripHtml(sub.body || '');

    // Attachments
    const attachmentsGroup = document.getElementById('modalAttachmentsGroup');
    const attachmentsList = document.getElementById('modalAttachmentsList');
    if (Array.isArray(sub.attachments) && sub.attachments.length > 0) {
        attachmentsGroup.style.display = 'block';
        attachmentsList.innerHTML = sub.attachments.map(att => {
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

    // "Mark as Useful" toggle logic
    const markUsefulBtn = document.getElementById('modalMarkUsefulBtn');
    if (markUsefulBtn) {
        markUsefulBtn.textContent = sub.useful ? '⭐ Remove from Useful' : '⭐ Mark as Useful';
        const newMarkUsefulBtn = markUsefulBtn.cloneNode(true);
        markUsefulBtn.parentNode.replaceChild(newMarkUsefulBtn, markUsefulBtn);
        newMarkUsefulBtn.addEventListener('click', async () => {
            try {
                const targetUseful = !sub.useful;
                const res = await fetchWithAuth('/api/viewer-submissions/mark-useful', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: sub.id, useful: targetUseful })
                });
                const data = await res.json();
                if (data.success) {
                    closeModal();
                    loadSubmissions(user);
                } else {
                    alert(data.error || 'Failed to update submission status.');
                }
            } catch (err) {
                console.error(err);
                alert('An error occurred.');
            }
        });
    }

    // "Report as Spam" button trigger logic
    const reportSpamBtn = document.getElementById('modalReportSpamBtn');
    if (reportSpamBtn) {
        const newReportSpamBtn = reportSpamBtn.cloneNode(true);
        reportSpamBtn.parentNode.replaceChild(newReportSpamBtn, reportSpamBtn);
        newReportSpamBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to report this submission as spam? This will notify SuperAdmin (Lezanne) to block the address.')) return;
            try {
                const res = await fetchWithAuth('/api/viewer-submissions/report-spam', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: sub.id })
                });
                const data = await res.json();
                if (data.success) {
                    alert('Submission reported as spam successfully.');
                    closeModal();
                    loadSubmissions(user);
                } else {
                    alert(data.error || 'Failed to report spam.');
                }
            } catch (err) {
                console.error(err);
                alert('An error occurred.');
            }
        });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function stripHtml(html) {
    if (!html) return '';
    if (!html.includes('<') && !html.includes('>')) return html;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    } catch (e) {
        console.error('Error stripping HTML:', e);
        return html;
    }
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
