import { fetchWithAuth, checkAuth } from './auth.js?v=5.1.1';

function formatStoryDate(dateInput) {
    if (!dateInput) return '—';
    const date = dateInput._seconds ? new Date(dateInput._seconds * 1000) : new Date(dateInput);
    if (isNaN(date.getTime())) return '—';

    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    
    // Initialize standardized Nav Bar
    window.auth.initNavBar(user);

    const proposalsList = document.getElementById('proposalsList');
    const tableLoading = document.getElementById('tableLoading');

    // 1. Try to load from cache immediately for "Instant" feel
    const cacheKey = `proposals_cache_${user.uid}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            const proposals = JSON.parse(cachedData);
            renderProposals(proposals);
        } catch (e) {
            console.error("Cache parse error:", e);
        }
    }

    try {
        const [propRes, scriptRes] = await Promise.all([
            fetchWithAuth('/api/proposals'),
            fetchWithAuth('/api/list-user-scripts')
        ]);
        
        const propData = await propRes.json();
        const scriptData = await scriptRes.json();

        if (propData.success) {
            const proposals = propData.proposals;
            // Update cache (proposals only for now)
            localStorage.setItem(cacheKey, JSON.stringify(proposals));
            renderProposals(proposals);
        } else {
            if (!cachedData) showError(propData.error || 'Failed to load proposals.');
        }

        if (scriptData.success && scriptData.scripts && scriptData.scripts.length > 0) {
            document.getElementById('scriptsSection').classList.remove('hidden');
            renderScripts(scriptData.scripts);
        }
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        if (!cachedData) showError('An error occurred while loading data.');
    } finally {
        if (tableLoading) tableLoading.style.display = 'none';
    }

    function renderScripts(scripts) {
        const scriptsList = document.getElementById('scriptsList');
        scriptsList.innerHTML = scripts.map((s, index) => {
            const submittedAt = formatStoryDate(s.submittedAt);
            return `
                <tr>
                    <td data-label="#" style="text-align: center; font-weight: 600; color: var(--text-muted); width: 40px;">${index + 1}</td>
                    <td data-label="Status" style="text-align: center; width: 120px;">
                        <span class="status-badge pending">Pending</span>
                    </td>
                    <td data-label="Script Title" class="col-title" style="font-weight: 600; color: var(--text-main);">${s.story_title || 'Untitled Script'}</td>
                    <td data-label="Comm #" style="text-align: center; width: 100px; font-weight: 700; color: var(--primary);">${s.commissionNumber || '—'}</td>
                    <td data-label="Duration" style="text-align: center; width: 120px; font-size: 0.85rem;">${s.duration || '—'}</td>
                    <td data-label="Submitted" style="text-align: center; font-size: 0.85rem; color: var(--text-muted); width: 140px;">${submittedAt}</td>
                    <td data-label="Actions" style="text-align: center; width: 200px;">
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                            <a href="final_script.html?id=${s.id}" class="btn-admin-cell primary" style="text-decoration: none; font-size: 0.75rem; white-space: nowrap; padding: 0.5rem 0.8rem;">
                                ✏️ Edit
                            </a>
                            <button class="btn-admin-cell danger" style="font-size: 0.75rem; white-space: nowrap; padding: 0.5rem 0.8rem;" onclick="window.deleteSubmission('${s.id}', '${(s.storyName || 'Untitled').replace(/'/g, "\\'")}')">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.deleteSubmission = async (id, title) => {
        if (!confirm(`Are you sure you want to delete this script "${title}"?\n\nThis action cannot be undone.`)) return;
        try {
            const response = await fetchWithAuth('/api/delete-submission', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
            }

            const result = await response.json();
            if (result.success) window.location.reload();
            else alert('Failed to delete: ' + result.error);
        } catch (err) {
            alert('An error occurred while deleting: ' + err.message);
        }
    };

    function renderProposals(proposals) {
        if (!proposals || proposals.length === 0) {
            proposalsList.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        No proposals found. Click "New Proposal" to get started.
                    </td>
                </tr>
            `;
            return;
        }

        proposalsList.innerHTML = proposals.map((p, index) => {
            const status = p.status || 'pending';
            let statusLabel = 'Pending';
            let statusClass = 'pending';

            if (status === 'accepted' || status === 'paid') {
                statusLabel = 'Commissioned';
                statusClass = 'accepted';
            } else if (status === 'rejected') {
                statusLabel = 'Rejected';
                statusClass = 'rejected';
            }

            const lastMod = formatStoryDate(p.lastUpdatedAt || p.submittedAt);
            const deliveryDate = p.acceptanceDetails?.deliveryDate ? formatStoryDate(p.acceptanceDetails.deliveryDate) : '—';
            
            return `
                <tr>
                    <td data-label="#" style="text-align: center; font-weight: 600; color: var(--text-muted); width: 40px;">${index + 1}</td>
                    <td data-label="Status" style="text-align: center; width: 120px;">
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </td>
                    <td data-label="Story Title" class="col-title" style="font-weight: 600; color: var(--text-main);">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            ${p.story_title || 'Untitled Story'}
                            ${(status === 'accepted' || status === 'paid') ? `
                                <a href="commission_agreement.html?id=${p.id}" target="_blank" title="Commission Agreement" style="text-decoration: none; filter: grayscale(1); opacity: 0.7; transition: all 0.2s;" onmouseover="this.style.opacity='1'; this.style.filter='none'" onmouseout="this.style.opacity='0.7'; this.style.filter='grayscale(1)'">⚖️</a>
                            ` : ''}
                        </div>
                    </td>
                    <td data-label="Comm #" style="text-align: center; width: 100px; font-weight: 700; color: var(--primary);">${p.commissionNumber || '—'}</td>
                    <td data-label="Delivery" style="text-align: center; width: 120px; font-size: 0.85rem;">${deliveryDate}</td>
                    <td data-label="Last Modified" style="text-align: center; font-size: 0.85rem; color: var(--text-muted); width: 140px;">${lastMod}</td>
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                            <a href="proposal.html?id=${p.id}" class="btn-admin-cell primary" style="text-decoration: none; font-size: 0.75rem; white-space: nowrap; padding: 0.4rem 0.6rem;">
                                ✏️ Edit
                            </a>
                            <a href="proposal.html?id=${p.id}&view=text" class="btn-admin-cell secondary" style="text-decoration: none; font-size: 0.75rem; white-space: nowrap; padding: 0.4rem 0.6rem;">
                                📄 View
                            </a>
                            ${(status === 'accepted' || status === 'paid' || p.commissionNumber) ? `
                                <button class="btn-admin-cell info" style="font-size: 0.75rem; white-space: nowrap; padding: 0.4rem 0.6rem; background: #0284c7; color: white;" onclick="window.viewStoryLegalForms('${p.id}', '${p.commissionNumber || ''}', '${(p.story_title || 'Untitled').replace(/'/g, "\\'")}')" title="View releases & legal forms for this commission number">
                                    📑 Releases
                                </button>
                            ` : ''}
                            <button class="btn-admin-cell danger" style="font-size: 0.75rem; white-space: nowrap; padding: 0.4rem 0.6rem;" onclick="window.deleteProposal('${p.id}', '${(p.story_title || 'Untitled').replace(/'/g, "\\'")}')">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function showError(msg) {
        proposalsList.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem; color: var(--danger);">
                    ${msg}
                </td>
            </tr>
        `;
    }

    window.deleteProposal = async (id, title) => {
        if (!confirm(`Are you sure you want to delete the proposal "${title}"?\n\nThis action cannot be undone.`)) return;

        try {
            const response = await fetchWithAuth('/api/delete-proposal', {
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
                // Refresh the list
                window.location.reload();
            } else {
                alert('Failed to delete proposal: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('An error occurred while deleting the proposal: ' + err.message);
        }
    };

    // Modal to view all releases and legal forms associated with this story
    window.viewStoryLegalForms = async (proposalId, commNum, storyTitle) => {
        const overlay = document.createElement('div');
        overlay.className = 'share-modal-overlay';
        overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1rem;';
        overlay.innerHTML = `
            <div style="background: var(--bg-card, #ffffff); border: 1px solid var(--border, #cbd5e1); border-radius: 12px; max-width: 650px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);">
                <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border, #e2e8f0); display: flex; justify-content: space-between; align-items: center; background: var(--bg-light, #f8fafc);">
                    <div>
                        <h3 style="margin: 0; font-size: 1.15rem; color: var(--text-main, #0f172a); font-weight: 700;">📑 Releases & Legal Forms</h3>
                        <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--text-muted, #64748b);"><strong>${commNum || 'No Comm #'}</strong> &bull; ${storyTitle}</p>
                    </div>
                    <button type="button" id="closeLegalModalBtn" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
                </div>
                <div id="legalFormsListContainer" style="padding: 1.5rem; overflow-y: auto; flex: 1;">
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        <div class="spinner-small" style="margin: 0 auto 0.75rem;"></div>
                        Loading signed releases for this commission...
                    </div>
                </div>
                <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--border, #e2e8f0); background: var(--bg-light, #f8fafc); display: flex; justify-content: space-between; align-items: center;">
                    <a href="forms_hub.html?story=${encodeURIComponent(storyTitle)}&comm=${encodeURIComponent(commNum)}" class="btn-soft" style="font-size: 0.85rem; text-decoration: none; padding: 0.5rem 0.9rem; background: var(--primary, #008fbe); color: white; border-radius: 6px;">
                        ➕ Create New Release
                    </a>
                    <button type="button" id="closeLegalModalBtn2" class="btn-soft" style="font-size: 0.85rem; padding: 0.5rem 0.9rem;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const loadLegalForms = async (isSilent = false) => {
            const container = overlay.querySelector('#legalFormsListContainer');
            if (!container) return;
            if (!isSilent) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        <div class="spinner-small" style="margin: 0 auto 0.75rem;"></div>
                        Loading signed releases for this commission...
                    </div>
                `;
            }

            try {
                const url = `/api/proposal-legal-forms?proposalId=${encodeURIComponent(proposalId)}&commNum=${encodeURIComponent(commNum)}`;
                const res = await fetchWithAuth(url);
                const data = await res.json();
                const token = await (window.auth && window.auth.getIdToken ? window.auth.getIdToken() : (typeof getIdToken === 'function' ? getIdToken() : null));

                const currentUser = window.auth ? (window.auth.getCurrentUser ? window.auth.getCurrentUser() : window.auth.getUser()) : null;
                const canDelete = currentUser && (
                    (window.auth.isAdmin && window.auth.isAdmin(currentUser)) ||
                    (window.auth.isSuperAdmin && window.auth.isSuperAdmin(currentUser)) ||
                    (window.auth.isEditorialProduction && window.auth.isEditorialProduction(currentUser))
                );

                if (!data.success || !data.forms || data.forms.length === 0) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                            <p style="font-size: 2rem; margin: 0 0 0.5rem;">📄</p>
                            <p style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">No legal forms recorded yet</p>
                            <p style="font-size: 0.85rem; max-width: 380px; margin: 0 auto 1.25rem;">When interviewees or contributors sign forms with commission <strong>${commNum || 'N/A'}</strong>, they will automatically appear here.</p>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = `
                    <div id="storyLegalFormsList" style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${data.forms.map(f => {
                            const isCountersignable = ['participant_release', 'minor_release', 'location_agreement', 'music_agreement', 'footage_agreement', 'footage_release_agreement', 'footage_release'].includes(f.formType);
                            const isApprovedOrDone = !isCountersignable ||
                                                     f.status === 'completed' || 
                                                     f.status === 'APPROVED' || 
                                                     f.status === 'approved' || 
                                                     f.status === 'COMPLETED' || 
                                                     !!f.approvedAt || 
                                                     !!f.completedAt;

                            const hasDualFile = (f.files || []).some(file => 
                                file.fieldname === 'dualSignedPdf' || 
                                (file.filename && (file.filename.startsWith('DualSigned_') || file.filename.startsWith('Executed_')))
                            );

                            // Signed by co-signer and awaiting producer review & approval
                            const isAwaitingApproval = !isApprovedOrDone && (
                                hasDualFile ||
                                f.status === 'PENDING_APPROVAL' || 
                                f.status === 'pending_producer_approval' || 
                                f.status === 'pending_approval' || 
                                !!f.hasParticipantSig || 
                                !!f.cosignedAt
                            );

                            let badgeStyle = 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;';
                            let badgeLabel = '⏳ Awaiting Co-Signer';

                            if (isApprovedOrDone || (hasDualFile && f.status !== 'PENDING_APPROVAL')) {
                                badgeStyle = 'background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;';
                                badgeLabel = '✓ Completed';
                            } else if (isAwaitingApproval) {
                                badgeStyle = 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;';
                                badgeLabel = '✍️ Co-Signed • Awaiting Approval';
                            } else {
                                badgeStyle = 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;';
                                badgeLabel = '⏳ Awaiting Co-Signer';
                            }

                            const formattedType = (f.formType || 'release').replace(/_/g, ' ').toUpperCase();
                            const primaryFile = (f.files && f.files.length > 0)
                                ? (f.files.find(file => file.fieldname === 'dualSignedPdf' || (file.filename && file.filename.startsWith('DualSigned_'))) || f.files[f.files.length - 1])
                                : null;
                            const formPageMap = {
                                'participant_release': 'participant_release.html',
                                'minor_release': 'minor_release.html',
                                'location_agreement': 'location_agreement.html',
                                'music_agreement': 'music_agreement.html',
                                'footage_agreement': 'footage_release_agreement.html',
                                'footage_release_agreement': 'footage_release_agreement.html',
                                'footage_release': 'footage_release_agreement.html',
                                'insert_sheet': 'insert_sheet.html',
                                'insert_footage': 'insert_footage_declaration.html',
                                'final_script': 'final_script.html',
                                'episode_footage': 'footage_agreement.html',
                                'control_sheet': 'control_sheet.html',
                                'travel_booking': 'travel_booking.html'
                            };
                            const targetPage = formPageMap[f.formType] || `${f.formType}.html`;
                            if (!window.copyLegalFormShareLink) {
                                window.copyLegalFormShareLink = async (shareUrl, btnEl) => {
                                    try {
                                        await navigator.clipboard.writeText(shareUrl);
                                        if (btnEl) {
                                            const orig = btnEl.innerHTML;
                                            btnEl.innerHTML = '✓ Link Copied!';
                                            setTimeout(() => { btnEl.innerHTML = orig; }, 2200);
                                        }
                                    } catch (e) {
                                        prompt('Copy Co-Signer Link:', shareUrl);
                                    }
                                };
                            }

                            return `
                                <div class="legal-form-item" data-form-id="${f.id}" style="background: var(--bg-card, #ffffff); border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; transition: all 0.2s ease;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
                                            <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${f.contributorName}</span>
                                            <span style="font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 4px; ${badgeStyle}">${badgeLabel}</span>
                                        </div>
                                        <div style="font-size: 0.78rem; color: var(--text-muted);">
                                            <strong>${formattedType}</strong> &bull; Producer: ${f.producerName || '—'}
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 0.4rem; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;">
                                        ${primaryFile ? `
                                            <a href="/api/get-submission-file?path=${encodeURIComponent(primaryFile.storagePath)}&inline=true${token ? `&token=${encodeURIComponent(token)}` : ''}" target="_blank" class="btn-soft" style="font-size: 0.75rem; text-decoration: none; padding: 0.35rem 0.65rem; background: var(--bg-light, #f1f5f9); color: var(--text-main, #334155); border: 1px solid var(--border, #cbd5e1); border-radius: 4px;" title="View signed PDF">
                                                📄 View PDF
                                            </a>
                                        ` : ''}
                                        ${isCountersignable && !isApprovedOrDone ? `
                                            ${isAwaitingApproval ? `
                                                <a href="${targetPage}?id=${f.id}&action=approve" target="_blank" class="btn-soft" style="font-size: 0.75rem; text-decoration: none; padding: 0.35rem 0.65rem; background: #16a34a; color: white; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;" title="Review co-signed agreement and approve for final submission">
                                                    ✅ Review &amp; Approve
                                                </a>
                                            ` : `
                                                <button type="button" class="btn-soft" onclick="window.copyLegalFormShareLink('${(f.shareUrl || `${window.location.origin}/s/${f.shareToken || f.id}`).replace(/'/g, "\\'")}', this)" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; font-weight: 600; cursor: pointer;" title="Copy co-signing link to share with participant/owner">
                                                    🔗 Copy Link
                                                </button>
                                                <a href="${targetPage}?id=${f.id}&action=countersign" target="_blank" class="btn-soft" style="font-size: 0.75rem; text-decoration: none; padding: 0.35rem 0.65rem; background: #008fbe; color: white; border-radius: 4px; font-weight: 600;" title="Open to sign or generate co-signer link">
                                                    ✍️ Countersign
                                                </a>
                                            `}
                                        ` : ''}
                                        <a href="${targetPage}?id=${f.id}&action=countersign&mode=edit" target="_blank" class="btn-soft" style="font-size: 0.75rem; text-decoration: none; padding: 0.35rem 0.65rem; background: var(--bg-light, #f1f5f9); color: var(--text-main, #334155); border: 1px solid var(--border, #cbd5e1); border-radius: 4px;" title="Edit details to fix typos or mistakes">
                                            ✏️ Edit
                                        </a>
                                        ${canDelete ? `
                                            <button type="button" class="btn-soft btn-delete-legal-form" onclick="window.deleteStoryLegalForm('${f.id}', '${(f.contributorName || 'Form').replace(/'/g, "\\'")}', '${formattedType.replace(/'/g, "\\'")}', this)" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer;" title="Delete this legal form">
                                                🗑️ Delete
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } catch (err) {
                if (!isSilent) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 2rem; color: var(--danger);">
                            Error loading legal forms: ${err.message}
                        </div>
                    `;
                }
            }
        };

        // Real-time synchronization: BroadcastChannel, storage event, window focus, and window.opener
        let syncBc = null;
        try {
            syncBc = new BroadcastChannel('carp_legal_forms_sync');
            syncBc.onmessage = (ev) => {
                if (ev && ev.data && (ev.data.type === 'LEGAL_FORM_UPDATED' || ev.data.status)) {
                    loadLegalForms(true);
                }
            };
        } catch (e) {}

        const storageHandler = (e) => {
            if (e.key === 'carp_legal_form_last_updated') {
                loadLegalForms(true);
            }
        };
        window.addEventListener('storage', storageHandler);

        const focusHandler = () => {
            loadLegalForms(true);
        };
        window.addEventListener('focus', focusHandler);

        window.refreshCurrentLegalFormsModal = () => {
            loadLegalForms(true);
        };

        const close = () => {
            try { if (syncBc) syncBc.close(); } catch (e) {}
            window.removeEventListener('storage', storageHandler);
            window.removeEventListener('focus', focusHandler);
            if (window.refreshCurrentLegalFormsModal) {
                window.refreshCurrentLegalFormsModal = null;
            }
            overlay.remove();
        };

        overlay.querySelector('#closeLegalModalBtn').addEventListener('click', close);
        overlay.querySelector('#closeLegalModalBtn2').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Initial load
        loadLegalForms(false);
    };

    window.deleteStoryLegalForm = async (formId, contributorName, formType, btnEl) => {
        const confirmMsg = `Are you sure you want to permanently delete this ${formType} for "${contributorName}"?\n\nThis will remove the submission and all attached signed documents from the server. This action cannot be undone.`;
        if (!confirm(confirmMsg)) return;

        const rowEl = btnEl.closest('.legal-form-item');
        const origContent = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '<span class="spinner-small" style="display:inline-block; vertical-align:middle; width:12px; height:12px; border-width:2px; margin-right:4px;"></span> Deleting...';

        try {
            const res = await fetchWithAuth('/api/admin/delete-legal-form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: formId })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to delete form');
            }

            if (rowEl) {
                rowEl.style.transition = 'all 0.3s ease';
                rowEl.style.opacity = '0';
                rowEl.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    const listContainer = rowEl.parentElement;
                    rowEl.remove();
                    if (listContainer && listContainer.children.length === 0) {
                        const grandParent = listContainer.parentElement;
                        grandParent.innerHTML = `
                            <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                                <p style="font-size: 2rem; margin: 0 0 0.5rem;">📄</p>
                                <p style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">No legal forms recorded</p>
                                <p style="font-size: 0.85rem; max-width: 380px; margin: 0 auto 1.25rem;">All legal release forms for this story have been removed.</p>
                            </div>
                        `;
                    }
                }, 300);
            }
        } catch (err) {
            console.error('Delete legal form failed:', err);
            alert(`Error deleting form: ${err.message}`);
            btnEl.disabled = false;
            btnEl.innerHTML = origContent;
        }
    };
});
