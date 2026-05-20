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
                    <td data-label="Actions" style="text-align: center; width: 200px;">
                        <div style="display: flex; gap: 0.75rem; justify-content: center; align-items: center;">
                            <a href="proposal.html?id=${p.id}" class="btn-admin-cell primary" style="text-decoration: none; font-size: 0.75rem; white-space: nowrap; padding: 0.5rem 0.8rem;">
                                ✏️ Edit
                            </a>
                            <a href="proposal.html?id=${p.id}&view=text" class="btn-admin-cell secondary" style="text-decoration: none; font-size: 0.75rem; white-space: nowrap; padding: 0.5rem 0.8rem;">
                                📄 View
                            </a>
                            <button class="btn-admin-cell danger" style="font-size: 0.75rem; white-space: nowrap; padding: 0.5rem 0.8rem;" onclick="window.deleteProposal('${p.id}', '${(p.story_title || 'Untitled').replace(/'/g, "\\'")}')">
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
});
