import { app, checkAuth, fetchWithAuth, API_BASE } from './auth.js?v=5.1.1';
import { performSearch, renderSearchResults } from './js/search.js?v=5.1.1';
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore(app);
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

let globalProposals = [];
let globalSubmissions = null;
let activeProducerFilter = null;
let activeTxDateFilter = null;
let limits = {
    pending: 10,
    commissioned: 10,
    paid: 10,
    decommissioned: 10
};

async function init() {

// Dynamically inject Episode Modal if not present
if (!document.getElementById('episodeModal')) {
    const modalHTML = `
    <div id="episodeModal" class="modal-backdrop">
        <div class="modal-card" style="max-width: 900px;">
            <div class="modal-header">
                <h3 id="episodeModalTitle">Episode: </h3>
                <button class="close-modal" onclick="document.getElementById('episodeModal').classList.remove('active'); document.body.style.overflow = '';">&times;</button>
            </div>
            <div class="modal-body">
                <ul id="episodeModalList" class="episode-modal-list">
                </ul>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

    try {
        const user = await checkAuth();
        if (!user) return; 

        if (window.auth.isEditorialProduction(user)) {
            // Editorial dashboard specific init could go here
        }

        globalProposals = await loadProposals();
        updateStats(globalProposals);
        loadProducers(); // Load producers for the edit modal dropdown

        // Define View More Global Handler
        window.viewMore = (type) => {
            if (limits[type]) {
                limits[type] += 10;
                renderProposals(globalProposals, window.auth.isAdmin(user));
            }
        };

        // Populate Navigation
        const nameEl = document.getElementById('userNameDisplay');
        const emailEl = document.getElementById('userEmailDisplay');
        if (nameEl) nameEl.textContent = user.displayDisplayName || user.displayName || user.email;
        if (emailEl) emailEl.textContent = user.displayEmail || user.email;

        const gnavAdminBtn = document.getElementById('gnavAdminBtn');
        if (gnavAdminBtn && (window.auth.isAdmin(user) || window.auth.isSuperAdmin(user))) {
            gnavAdminBtn.style.display = 'flex';
        }

        const gnavProgControlBtn = document.getElementById('gnavProgControlBtn');
        // --- SEARCH LOGIC ---
        const searchInput = document.getElementById('globalSearchInput');
        const toggleBtn = document.getElementById('toggleFiltersBtn');
        const advancedFilters = document.getElementById('advancedFilters');
        const resultsContainer = document.getElementById('searchResults');

        const handleSearch = async () => {
            if (!searchInput) return;
            const params = {
                q: searchInput.value,
                uid: document.getElementById('filterUid').value,
                season: document.getElementById('filterSeason').value,
                episode: document.getElementById('filterEpisode').value,
                user: document.getElementById('filterUser').value
            };

            if (!params.q && !params.uid && !params.season && !params.user) {
                if (resultsContainer) resultsContainer.classList.add('hidden');
                return;
            }

            const result = await performSearch(params);
            if (result.success && resultsContainer) {
                renderSearchResults(result.results, resultsContainer);
            }
        };

        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleSearch, 500));
            document.querySelectorAll('.filter-input').forEach(input => {
                input.addEventListener('input', debounce(handleSearch, 500));
            });

            if (toggleBtn && advancedFilters) {
                toggleBtn.addEventListener('click', () => {
                    advancedFilters.classList.toggle('hidden');
                    toggleBtn.classList.toggle('active');
                });
            }

            document.addEventListener('click', (e) => {
                if (resultsContainer && !e.target.closest('.search-container-modern')) {
                    resultsContainer.classList.add('hidden');
                }
            });
        }

        // Danger Zone Visibility (Admin or higher)
        const dangerZone = document.getElementById('dangerZone');
        if (dangerZone && window.auth.isSuperAdmin(user)) {
            dangerZone.style.display = 'block';
        }
    } catch (err) {
        console.error("Initialising failed:", err);
    }
}

async function loadProposals() {
    loadingOverlay.classList.add('active');
    try {
        const user = await window.auth.checkAuth();
        const canDelete = window.auth.isAdmin(user);
        const response = await window.auth.fetchWithAuth(`/api/admin/proposals?_cb=${Date.now()}`);
        const result = await response.json();
        
        if (result.success) {
            globalProposals = result.proposals;
            renderProposals(globalProposals, canDelete);
            return globalProposals;
        } else {
            throw new Error(result.error || "Failed to fetch proposals");
        }
    } catch (err) {
        console.error("Load proposals failed:", err);
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

async function loadProducers() {
    try {
        const response = await fetchWithAuth('/api/list-producers');
        const data = await response.json();
        if (data.success) {
            window.producersCache = data.producers;
        }
    } catch (err) {
        console.error("Failed to load producers:", err);
    }
}


function populateEpisodesSidebar(proposals) {
    const sidebarList = document.getElementById('episodesSidebarList');
    if (!sidebarList) return;

    const txDates = new Set();
    proposals.forEach(p => {
        if (p.txDate) {
            const formatted = formatDate(p.txDate);
            if (formatted !== '—') {
                txDates.add(formatted);
            }
        }
    });

    const sortedDates = Array.from(txDates).sort((a, b) => new Date(b) - new Date(a)).slice(0, 10);

    sidebarList.innerHTML = '';
    
    if (sortedDates.length === 0) {
        sidebarList.innerHTML = '<li><span style="padding: 0.6rem 0.8rem; display: block; color: var(--text-muted); font-size: 0.9rem;">No episodes yet.</span></li>';
        return;
    }

    sortedDates.forEach(date => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = date;
        btn.onclick = () => window.setTxDateFilter(date);
        

        
        li.appendChild(btn);
        sidebarList.appendChild(li);
    });
}

function renderProposals(proposals, canDelete) {
    populateEpisodesSidebar(globalProposals);
    const propTableBody = document.getElementById('proposalTableBody');
    const commTableBody = document.getElementById('commissionedTableBody');
    const paidTableBody = document.getElementById('paidTableBody');
    const decompTableBody = document.getElementById('decommissionedTableBody');

    if (!propTableBody || !commTableBody || !paidTableBody) {
        console.error("One or more table bodies not found in the DOM.");
        return;
    }

    const filtered = activeProducerFilter 
        ? proposals.filter(p => p.submittedBy === activeProducerFilter)
        : proposals;

    // 1. Pending Proposals
    propTableBody.innerHTML = '';
    const pending = filtered.filter(p => p.status && p.status.toLowerCase() === 'pending');
    pending.sort((a, b) => {
        const getSortDate = (p) => {
            if (p.submittedAt) return p.submittedAt._seconds ? new Date(p.submittedAt._seconds * 1000) : new Date(p.submittedAt);
            return new Date(0);
        };
        return getSortDate(b) - getSortDate(a);
    });
    if (pending.length === 0) {
        propTableBody.innerHTML = `<tr><td colspan="4" class="table-empty-msg">No pending proposals.</td></tr>`;
        document.getElementById('pendingViewMoreContainer').style.display = 'none';
    } else {
        const toShow = pending.slice(0, limits.pending);
        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const date = formatDate(p.submittedAt);
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : p.submittedByEmail;
            tr.innerHTML = `
                <td data-label="Date">${date}</td>
                <td data-label="Story Title"><a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a></td>
                <td data-label="Submitted By"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
                <td data-label="Actions">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: nowrap; align-items: center;">
                        <a href="proposal?id=${p.id}&view=admin" class="btn-admin-cell primary">Review</a>
                        <button class="btn-admin-cell success" onclick="window.handleProposalAction('${p.id}', 'accept')">Accept</button>
                        <button class="btn-admin-cell warning" onclick="window.handleProposalAction('${p.id}', 'reject')">Reject</button>
                        ${canDelete ? `<button class="btn-admin-cell danger" onclick="window.deleteProposal('${p.id}', '${p.story_title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">Delete</button>` : ''}
                    </div>
                </td>
            `;
            propTableBody.appendChild(tr);
        });
        document.getElementById('pendingViewMoreContainer').style.display = pending.length > limits.pending ? 'block' : 'none';
    }

    // 2. Commissioned Stories (In Production)
    commTableBody.innerHTML = '';
    const accepted = filtered.filter(p => p.status && p.status.toLowerCase() === 'accepted');
    accepted.sort((a, b) => {
        const numA = parseInt(a.commissionNumber) || 0;
        const numB = parseInt(b.commissionNumber) || 0;
        return numB - numA;
    });
    if (accepted.length === 0) {
        commTableBody.innerHTML = '<tr><td colspan="5" class="table-empty-msg">No commissioned stories.</td></tr>';
        document.getElementById('commissionedViewMoreContainer').style.display = 'none';
    } else {
        const toShow = accepted.slice(0, limits.commissioned);
        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : p.submittedByEmail;
            tr.innerHTML = `
                <td data-label="Comm #"><strong>#${p.commissionNumber || '—'}</strong></td>
                <td data-label="Story Title">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a>
                        <a href="commission_agreement.html?id=${p.id}" target="_blank" title="Commission Agreement" style="text-decoration: none; font-size: 1.1rem; transition: opacity 0.2s; opacity: 0.85;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'">⚖️</a>
                    </div>
                </td>
                <td data-label="Producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
                <td data-label="Actions">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: nowrap; align-items: center;">
                        <a href="proposal?id=${p.id}&view=admin" class="btn-admin-cell secondary">View Proposal</a>
                        <button class="btn-admin-cell info" onclick="window.openEditCommissionModal('${p.id}')">Edit Details</button>
                        <button class="btn-admin-cell success" onclick="window.handleProposalAction('${p.id}', 'pay')">Delivered</button>
                        <button class="btn-admin-cell warning" onclick="window.openDecommissionModal('${p.id}')" style="background: var(--danger); color: white; border-color: var(--danger);">Decommission</button>
                        <button class="btn-admin-cell danger" onclick="window.handleProposalAction('${p.id}', 'revert-to-pending')">Revert</button>
                    </div>
                </td>
            `;
            commTableBody.appendChild(tr);
        });
        document.getElementById('commissionedViewMoreContainer').style.display = accepted.length > limits.commissioned ? 'block' : 'none';
    }

    // 3. Paid Stories (Delivered)
    paidTableBody.innerHTML = '';
    const paid = filtered.filter(p => p.status && p.status.toLowerCase() === 'paid');
    paid.sort((a, b) => {
        const getSortDate = (p) => {
            if (p.txDate) return new Date(p.txDate);
            if (p.paidAt) return p.paidAt._seconds ? new Date(p.paidAt._seconds * 1000) : new Date(p.paidAt);
            return new Date(0);
        };
        return getSortDate(b) - getSortDate(a);
    });
    if (paid.length === 0) {
        paidTableBody.innerHTML = '<tr><td colspan="5" class="table-empty-msg">No delivered stories.</td></tr>';
        document.getElementById('paidViewMoreContainer').style.display = 'none';
    } else {
        const toShow = paid.slice(0, limits.paid);
        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const paidDate = formatDate(p.paidAt);
            const rawFormattedTx = p.txDate ? formatDate(p.txDate) : '—';
            const txDateDisplay = rawFormattedTx !== '—' 
                ? `<a href="#" onclick="event.preventDefault(); window.setTxDateFilter('${rawFormattedTx}')" style="color: var(--primary); text-decoration: underline;" title="View all stories for this episode">${rawFormattedTx}</a>`
                : paidDate;
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : p.submittedByEmail;
            tr.innerHTML = `
                <td data-label="Comm #"><strong>#${p.commissionNumber || '—'}</strong></td>
                <td data-label="Story Title">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a>
                        <a href="commission_agreement.html?id=${p.id}" target="_blank" title="Commission Agreement" style="text-decoration: none; font-size: 1.1rem; transition: opacity 0.2s; opacity: 0.85;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'">⚖️</a>
                    </div>
                </td>
                <td data-label="TX Date">${txDateDisplay}</td>
                <td data-label="Producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
                <td data-label="Actions">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: nowrap; align-items: center;">
                        <a href="proposal?id=${p.id}&view=admin" class="btn-admin-cell secondary">Full Report</a>
                        <button class="btn-admin-cell info" onclick="window.editBroadcastDate('${p.id}', '${p.story_title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">Edit TX Date</button>
                        <button class="btn-admin-cell warning" onclick="window.handleProposalAction('${p.id}', 'revert')">Revert</button>
                    </div>
                </td>
            `;
            paidTableBody.appendChild(tr);
        });
        document.getElementById('paidViewMoreContainer').style.display = paid.length > limits.paid ? 'block' : 'none';
    }

    // 4. Decommissioned Stories
    if (decompTableBody) {
        decompTableBody.innerHTML = '';
        const decommissioned = filtered.filter(p => p.status && p.status.toLowerCase() === 'decommissioned');
        decommissioned.sort((a, b) => {
            const getSortDate = (p) => {
                if (p.decommissionedAt) return p.decommissionedAt._seconds ? new Date(p.decommissionedAt._seconds * 1000) : new Date(p.decommissionedAt);
                return new Date(0);
            };
            return getSortDate(b) - getSortDate(a);
        });
        if (decommissioned.length === 0) {
            decompTableBody.innerHTML = '<tr><td colspan="6" class="table-empty-msg">No decommissioned stories.</td></tr>';
            document.getElementById('decommissionedViewMoreContainer').style.display = 'none';
        } else {
            const toShow = decommissioned.slice(0, limits.decommissioned);
            toShow.forEach(p => {
                const tr = document.createElement('tr');
                const decDate = formatDate(p.decommissionedAt);
                const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : p.submittedByEmail;
                const reason = p.decommissionReason ? p.decommissionReason : '<i>No reason provided</i>';
                tr.innerHTML = `
                    <td data-label="Comm #"><strong>#${p.commissionNumber || '—'}</strong></td>
                    <td data-label="Story Title"><a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a></td>
                    <td data-label="Decommissioned Date">${decDate}</td>
                    <td data-label="Reason" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.decommissionReason || ''}">${reason}</td>
                    <td data-label="Producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
                    <td data-label="Actions">
                        <button class="btn-admin-cell warning" onclick="window.handleProposalAction('${p.id}', 'revert')">Revert to Commissioned</button>
                    </td>
                `;
                decompTableBody.appendChild(tr);
            });
            document.getElementById('decommissionedViewMoreContainer').style.display = decommissioned.length > limits.decommissioned ? 'block' : 'none';
        }
    }
}

window.setProducerFilter = (uid, name) => {
    activeProducerFilter = uid;
    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('filterText').textContent = `Filtering by: ${name}`;
    
    // Show masquerade button only for Super Admin (Lezanne)
    const masqBtn = document.getElementById('masqueradeBtn');
    checkAuth().then(user => {
        if (masqBtn && user && user.email === 'lezanne@carteblanche.co.za') {
            masqBtn.style.display = 'inline-block';
            masqBtn.dataset.uid = uid;
            masqBtn.dataset.name = name;
        } else if (masqBtn) {
            masqBtn.style.display = 'none';
        }
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.viewMore = (type) => {
    limits[type] += 10;
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
};

window.masqueradeAsFiltered = () => {
    const masqBtn = document.getElementById('masqueradeBtn');
    const uid = masqBtn.dataset.uid;
    const name = masqBtn.dataset.name;
    window.auth.startMasquerade(uid, name, 'producer');
};


window.setTxDateFilter = async (txDate) => {
    if (!txDate || txDate === 'undefined') return;

    const modalList = document.getElementById('episodeModalList');
    const modalTitle = document.getElementById('episodeModalTitle');
    
    // Set basic title while loading
    if (modalTitle) {
        modalTitle.textContent = `Episode: ${txDate}`;
    }

    if (modalList) {
        modalList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Fetching document... <span class="spinner" style="display:inline-block; margin-left: 10px;">⏳</span></div>';
    }

    document.getElementById('episodeModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        if (!globalSubmissions) {
            const response = await window.auth.fetchWithAuth('/api/admin/submissions');
            const data = await response.json();
            if (data.success) {
                globalSubmissions = data.submissions;
            } else {
                throw new Error(data.error || 'Failed to fetch submissions');
            }
        }

        // Find the FCC for this date
        const fcc = globalSubmissions.find(s => s.formType === 'control_sheet' && s.txDate && formatDate(s.txDate) === txDate);

        // Fetch stories for this TX Date
        const matchingStories = globalProposals.filter(p => p.txDate && formatDate(p.txDate) === txDate);
        matchingStories.sort((a, b) => {
            const numA = parseInt(a.commissionNumber) || Infinity;
            const numB = parseInt(b.commissionNumber) || Infinity;
            return numA - numB;
        });

        let storiesHtml = '';
        if (matchingStories.length > 0) {
            storiesHtml += '<div style="margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.2rem;">';
            storiesHtml += '<h4 style="margin-bottom: 0.8rem; color: var(--text-main); font-size: 1rem; font-weight: 600;">Stories in this Episode</h4>';
            storiesHtml += '<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">';
            matchingStories.forEach(story => {
                storiesHtml += `<li style="padding: 0.6rem 0.8rem; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; align-items: center; gap: 0.8rem; transition: border-color 0.2s;"><span class="comm-num" style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; min-width: 45px;">#${story.commissionNumber || '—'}</span> <a href="proposal?id=${story.id}&view=admin" target="_blank" class="story-title" style="color: var(--primary); text-decoration: none; font-weight: 500; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--primary-hover)'; this.style.textDecoration='underline'" onmouseout="this.style.color='var(--primary)'; this.style.textDecoration='none'">${story.story_title || 'Untitled'}</a></li>`;
            });
            storiesHtml += '</ul></div>';
        }

        if (fcc) {
            // Update Title with Metadata from FCC
            if (modalTitle) {
                modalTitle.innerHTML = `
                    Episode: ${txDate}
                    <div style="font-size: 0.95rem; color: var(--text-muted); font-weight: 500; margin-top: 0.4rem; letter-spacing: 0.5px;">
                        UID: ${fcc.uid || '—'} &nbsp;&bull;&nbsp; Season: ${fcc.season || '—'} &nbsp;&bull;&nbsp; Episode: ${fcc.episode || '—'}
                    </div>
                `;
            }

            // Inject Stories and then iFrame
            if (modalList) {
                const token = await window.auth.getIdToken();
                modalList.innerHTML = storiesHtml + `<iframe src="/api/admin/get-file?path=${encodeURIComponent(fcc.storagePath)}&inline=true&token=${token}" class="fcc-iframe"></iframe>`;
            }
        } else {
            if (modalList) {
                modalList.innerHTML = storiesHtml + '<div style="padding: 2.5rem; text-align: center; color: var(--text-muted); background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-md); border: 1px dashed var(--border); margin-bottom: 1rem;">No FCC Document has been uploaded for this broadcast yet.</div>';
            }
        }
    } catch (e) {
        if (modalList) {
            modalList.innerHTML = `<div style="padding: 2rem; text-align: center; color: #cc0000;">Error: ${e.message}</div>`;
        }
    }
};

window.clearFilters = () => {
    activeProducerFilter = null;
    activeTxDateFilter = null;
    document.getElementById('filterBar').style.display = 'none';
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
};

window.clearProducerFilter = () => {
    activeProducerFilter = null;
    document.getElementById('filterBar').style.display = 'none';
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
};

function formatDate(timestamp) {
    if (!timestamp) return '—';
    const date = timestamp._seconds ? new Date(timestamp._seconds * 1000) : new Date(timestamp);
    if (isNaN(date.getTime())) return '—';

    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
}

function updateStats(proposals) {
    if (!proposals) return;
    
    const pending = proposals.filter(p => p.status && p.status.toLowerCase() === 'pending').length;
    const accepted = proposals.filter(p => p.status && p.status.toLowerCase() === 'accepted').length;
    const paid = proposals.filter(p => p.status && p.status.toLowerCase() === 'paid').length;
    const decommissioned = proposals.filter(p => p.status && p.status.toLowerCase() === 'decommissioned').length;

    const pEl = document.getElementById('proposalCount');
    const aEl = document.getElementById('commissionedCount');
    const dEl = document.getElementById('paidCount');
    const decEl = document.getElementById('decommissionedCount');
    
    if (pEl) pEl.textContent = pending;
    if (aEl) aEl.textContent = accepted;
    if (dEl) dEl.textContent = paid;
    if (decEl) decEl.textContent = decommissioned;
}

window.deleteProposal = async (id, title) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete the proposal: "${title}"?\n\nThis cannot be undone.`)) return;
    
    loadingOverlay.classList.add('active');
    try {
        const response = await window.auth.fetchWithAuth('/api/delete-proposal', {
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
            alert(`Proposal deleted successfully.`);
            await loadProposals();
            updateStats(globalProposals);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        alert("Delete failed: " + err.message);
    } finally {
        loadingOverlay.classList.remove('active');
    }
};

window.handleProposalAction = async (id, action) => {
    if (action === 'pay') {
        window.openDeliveryModal(id);
        return;
    }
    
    if (action === 'accept') {
        window.openAcceptanceModal(id);
        return;
    }
    
    if (action === 'revert-to-pending') {
        if (!confirm(`Are you sure you want to revert this story to Pending?\n\nThis will clear its Commission Number and move it back to Story Proposals.`)) return;
        await executeProposalAction(id, 'revert-to-pending');
        return;
    }
    
    let actionLabel = action === 'pay' ? 'Delivered' : (action === 'accept' ? 'Accept' : action);
    if (action === 'revert') actionLabel = 'Move back to Commissioned';
    
    if (!confirm(`Are you sure you want to ${actionLabel} this story?`)) return;
    
    await executeProposalAction(id, action);
};

window.editBroadcastDate = async (id, currentTitle) => {
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.style.position = 'fixed';
    dateInput.style.opacity = '0';
    dateInput.style.pointerEvents = 'none';
    document.body.appendChild(dateInput);

    dateInput.onchange = async () => {
        const newDate = dateInput.value;
        if (newDate) {
            await executeProposalAction(id, 'update-date', { txDate: newDate });
        }
        document.body.removeChild(dateInput);
    };

    dateInput.onblur = () => {
        setTimeout(() => { if(dateInput.parentNode) document.body.removeChild(dateInput); }, 1000);
    };

    if (typeof dateInput.showPicker === 'function') {
        dateInput.showPicker();
    } else {
        dateInput.focus();
        dateInput.click();
    }
};

async function executeProposalAction(id, action, extraData = {}) {
    loadingOverlay.classList.add('active');
    try {
        const response = await window.auth.fetchWithAuth('/api/admin/handle-proposal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action, ...extraData })
        });
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Server returned error (${response.status}): ${text.substring(0, 100)}`);
        }

        const result = await response.json();
        if (result.success) {
            let actionLabel = action === 'pay' ? 'Delivered' : (action === 'accept' ? 'Accepted' : action + 'ed');
            if (action === 'update-date') actionLabel = 'Updated Date';
            if (action === 'revert') actionLabel = 'Reverted to Commissioned';
            if (action === 'revert-to-pending') actionLabel = `Reverted to Pending${result.freedCommNumber ? ` (Comm #${result.freedCommNumber} freed)` : ''}`;
            if (action === 'edit-commission') actionLabel = 'Commission Details Updated';
            if (action === 'decommission') actionLabel = 'Decommissioned';
            
            alert(`Story ${actionLabel} successfully!`);
            await loadProposals();
            updateStats(globalProposals);
            return result;
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error("Action failed:", err);
        alert("Action failed: " + err.message);
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

window.purgeSystem = async () => {
    if (!confirm("⚠️ WARNING: This will PERMANENTLY delete all proposals, forms, and files. This cannot be undone. \n\nAre you sure you want to proceed?")) return;
    if (!confirm("LAST CHANCE: Are you absolutely certain you want to reset the system to a clean slate?")) return;

    loadingText.textContent = "Purging System Data...";
    loadingOverlay.classList.add('active');

    try {
        const response = await window.auth.fetchWithAuth('/api/admin/purge-data', {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            alert("System purged successfully! All test data has been cleared.");
            await loadProposals();
            updateStats(globalProposals);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        alert("Purge failed: " + err.message);
    } finally {
        loadingOverlay.classList.remove('active');
        loadingText.textContent = "Loading Submissions...";
    }
};

// --- DELIVERY MODAL LOGIC ---
const deliveryModal = document.getElementById('deliveryModal');
const deliveryForm = document.getElementById('deliveryForm');

window.openDeliveryModal = (id) => {
    const proposal = globalProposals.find(p => p.id === id);
    if (!proposal) return;
    
    document.getElementById('deliveryProposalId').value = id;
    
    const acc = proposal.acceptanceDetails || {};
    document.getElementById('deliveryCommDuration').value = acc.duration || '';
    document.getElementById('deliveryDeliveredDuration').value = acc.finalDuration || acc.duration || '';
    document.getElementById('deliveryRate').value = acc.rate || '';
    
    // Default Dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('deliveryDeliveryDate').value = acc.deliveryDate || today;
    document.getElementById('deliveryTxDate').value = proposal.txDate || today;

    // Paid Toggle
    const isPaid = proposal.status === 'paid' || acc.isPaid === 'yes';
    const paidYes = document.querySelector('input[name="deliveryPaidToggle"][value="yes"]');
    const paidNo = document.querySelector('input[name="deliveryPaidToggle"][value="no"]');
    if (isPaid) {
        if (paidYes) paidYes.checked = true;
    } else {
        if (paidNo) paidNo.checked = true;
    }
    
    deliveryModal.classList.add('active');
};

if (deliveryForm) {
    deliveryForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('deliveryProposalId').value;
        const deliveryDate = document.getElementById('deliveryDeliveryDate').value;
        const txDate = document.getElementById('deliveryTxDate').value;
        const commDuration = document.getElementById('deliveryCommDuration').value;
        const deliveredDuration = document.getElementById('deliveryDeliveredDuration').value;
        const rate = document.getElementById('deliveryRate').value;
        const isPaid = document.querySelector('input[name="deliveryPaidToggle"]:checked')?.value || 'no';
        
        deliveryModal.classList.remove('active');
        await executeProposalAction(id, 'pay', { 
            deliveryDate, 
            txDate, 
            commDuration, 
            deliveredDuration, 
            rate, 
            isPaid 
        });
    };
}

const dClose = document.getElementById('deliveryModalCloseBtn');
const dCancel = document.getElementById('deliveryModalCancelBtn');
if (dClose) dClose.onclick = () => deliveryModal.classList.remove('active');
if (dCancel) dCancel.onclick = () => deliveryModal.classList.remove('active');

// --- ACCEPTANCE MODAL LOGIC ---
const acceptanceModal = document.getElementById('acceptanceModal');
const acceptanceForm = document.getElementById('acceptanceForm');

window.openAcceptanceModal = (id) => {
    const proposal = globalProposals.find(p => p.id === id);
    if (!proposal) return;
    
    document.getElementById('acceptanceProposalId').value = id;
    
    // Default values
    document.getElementById('acceptanceCommNum').value = '';
    document.getElementById('acceptanceDuration').value = '05:00';
    document.getElementById('acceptanceRate').value = '';
    document.getElementById('acceptanceAgreement').checked = false;
    document.getElementById('acceptanceCommFeedback').textContent = '';
    document.getElementById('acceptanceCommNum').style.borderColor = 'var(--border)';
    
    // Default Story Type
    const storyTypeEl = document.getElementById('acceptanceStoryType');
    if (storyTypeEl) {
        storyTypeEl.value = 'Standard';
        document.getElementById('acceptanceCommNumGroup').style.display = 'block';
    }
    
    // Pre-populate Presenter and Legal Req from proposal if they exist
    const presenterEl = document.getElementById('acceptancePresenter');
    if (presenterEl) {
        const savedPresenter = (proposal.details && proposal.details.presenter) || '';
        const standardPresenters = ['Catherine Rice', 'Claire Mawisa', 'Erin Bates', 'Govan Whittles', 'Lourensa Eckard', 'Macfarlane Moleli', 'Masa Kekana', 'Nickolaus Bauer'];
        if (savedPresenter && standardPresenters.includes(savedPresenter)) {
            presenterEl.value = savedPresenter;
        } else if (savedPresenter) {
            presenterEl.value = 'Other';
        } else {
            presenterEl.value = '';
        }
    }

    const legalYes = document.querySelector('input[name="acceptanceLegalReq"][value="yes"]');
    const legalNo = document.querySelector('input[name="acceptanceLegalReq"][value="no"]');
    if (proposal.legal_req === 'yes') {
        if (legalYes) legalYes.checked = true;
    } else {
        if (legalNo) legalNo.checked = true;
    }
    
    // Default Delivery Date to +14 days if not set
    const future = new Date();
    future.setDate(future.getDate() + 14);
    const futureStr = future.toISOString().split('T')[0];
    document.getElementById('acceptanceDeliveryDate').value = futureStr;
    
    acceptanceModal.classList.add('active');
};

if (acceptanceForm) {
    acceptanceForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('acceptanceProposalId').value;
        const manualCommissionNumber = document.getElementById('acceptanceCommNum').value;
        const storyType = document.getElementById('acceptanceStoryType')?.value || 'Standard';
        const duration = document.getElementById('acceptanceDuration').value;
        const deliveryDate = document.getElementById('acceptanceDeliveryDate').value;
        const rate = document.getElementById('acceptanceRate').value;
        const contractAccepted = document.getElementById('acceptanceAgreement').checked;
        const presenter = document.getElementById('acceptancePresenter').value;
        const legal_req = document.querySelector('input[name="acceptanceLegalReq"]:checked')?.value || 'no';
        
        acceptanceModal.classList.remove('active');
        const res = await executeProposalAction(id, 'accept', { 
            manualCommissionNumber: storyType === 'TFU' ? null : manualCommissionNumber,
            storyType,
            duration, 
            deliveryDate, 
            rate, 
            contractAccepted,
            presenter,
            legal_req
        });

        if (res && res.success) {
            window.open(`commission_agreement.html?id=${id}`, '_blank');
        }
    };
}

const aClose = document.getElementById('acceptanceModalCloseBtn');
const aCancel = document.getElementById('acceptanceModalCancelBtn');
if (aClose) aClose.onclick = () => acceptanceModal.classList.remove('active');
if (aCancel) aCancel.onclick = () => acceptanceModal.classList.remove('active');

// --- EDIT COMMISSION MODAL LOGIC ---
const editCommissionModal = document.getElementById('editCommissionModal');
const editCommissionForm = document.getElementById('editCommissionForm');

window.openEditCommissionModal = (id) => {
    const proposal = globalProposals.find(p => p.id === id);
    if (!proposal) return;

    const acc = proposal.acceptanceDetails || {};
    document.getElementById('editCommProposalId').value = id;
    document.getElementById('editCommNum').value = proposal.commissionNumber || '';
    document.getElementById('editCommDeliveryDate').value = acc.deliveryDate || '';
    document.getElementById('editCommDuration').value = acc.duration || '';
    document.getElementById('editCommRate').value = acc.rate || '';

    // Pre-populate Presenter and Legal Req
    const presenterEl = document.getElementById('editCommPresenter');
    if (presenterEl) {
        presenterEl.value = acc.presenter || '';
    }
    const legalReq = acc.legal_req || proposal.legal_req || 'no';
    const legalRadio = document.querySelector(`input[name="editCommLegalReq"][value="${legalReq}"]`);
    if (legalRadio) legalRadio.checked = true;

    // Populate Producers Dropdown
    const producerSelect = document.getElementById('editCommProducer');
    if (producerSelect) {
        producerSelect.innerHTML = '<option value="">-- Keep Current Producer --</option>';
        if (window.producersCache) {
            window.producersCache.forEach(prod => {
                const opt = document.createElement('option');
                opt.value = prod.id;
                opt.textContent = `${prod.name} ${prod.surname}`;
                if (prod.id === proposal.submittedBy) {
                    opt.selected = true;
                }
                producerSelect.appendChild(opt);
            });
        }
    }

    editCommissionModal.classList.add('active');
    validateCommissionNumber(document.getElementById('editCommNum'), document.getElementById('editCommFeedback'), id);
};

function validateCommissionNumber(inputEl, feedbackEl, currentId) {
    const val = inputEl.value.trim();
    if (!val) {
        feedbackEl.textContent = '';
        inputEl.style.borderColor = 'var(--border)';
        return;
    }
    
    const duplicate = globalProposals.find(p => p.commissionNumber === val && p.id !== currentId);
    if (duplicate) {
        feedbackEl.textContent = `⚠ Already used for "${duplicate.story_title}"`;
        feedbackEl.style.color = 'var(--danger)';
        inputEl.style.borderColor = 'var(--danger)';
    } else {
        feedbackEl.textContent = '✓ Available';
        feedbackEl.style.color = '#10b981';
        inputEl.style.borderColor = '#10b981';
    }
}

document.getElementById('acceptanceCommNum').addEventListener('input', (e) => {
    validateCommissionNumber(e.target, document.getElementById('acceptanceCommFeedback'), document.getElementById('acceptanceProposalId').value);
});

document.getElementById('editCommNum').addEventListener('input', (e) => {
    validateCommissionNumber(e.target, document.getElementById('editCommFeedback'), document.getElementById('editCommProposalId').value);
});

if (editCommissionForm) {
    editCommissionForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('editCommProposalId').value;
        const commissionNumber = document.getElementById('editCommNum').value.trim();
        const deliveryDate = document.getElementById('editCommDeliveryDate').value;
        const duration = document.getElementById('editCommDuration').value.trim();
        const rate = document.getElementById('editCommRate').value;
        const presenter = document.getElementById('editCommPresenter').value;
        const legal_req = document.querySelector('input[name="editCommLegalReq"]:checked')?.value || 'no';
        const newProducerId = document.getElementById('editCommProducer')?.value || '';

        editCommissionModal.classList.remove('active');
        await executeProposalAction(id, 'edit-commission', { 
            commissionNumber, 
            deliveryDate, 
            duration, 
            rate, 
            presenter, 
            legal_req,
            newProducerId
        });
    };
}

const ecClose = document.getElementById('editCommModalCloseBtn');
const ecCancel = document.getElementById('editCommModalCancelBtn');
if (ecClose) ecClose.onclick = () => editCommissionModal.classList.remove('active');
if (ecCancel) ecCancel.onclick = () => editCommissionModal.classList.remove('active');

// --- TFU / STORY TYPE LOGIC ---
const acceptanceStoryTypeEl = document.getElementById('acceptanceStoryType');
if (acceptanceStoryTypeEl) {
    acceptanceStoryTypeEl.addEventListener('change', (e) => {
        const type = e.target.value;
        const commNumGroup = document.getElementById('acceptanceCommNumGroup');
        if (type === 'TFU') {
            commNumGroup.style.display = 'none';
        } else {
            commNumGroup.style.display = 'block';
        }
    });
}

// --- DECOMMISSION MODAL LOGIC ---
const decommissionModal = document.getElementById('decommissionModal');
const decommissionForm = document.getElementById('decommissionForm');

window.openDecommissionModal = (id) => {
    const proposal = globalProposals.find(p => p.id === id);
    if (!proposal) return;
    
    document.getElementById('decommissionProposalId').value = id;
    document.getElementById('decommissionReason').value = '';
    
    decommissionModal.classList.add('active');
};

if (decommissionForm) {
    decommissionForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('decommissionProposalId').value;
        const decommissionReason = document.getElementById('decommissionReason').value.trim();
        
        decommissionModal.classList.remove('active');
        await executeProposalAction(id, 'decommission', { decommissionReason });
    };
}

const decClose = document.getElementById('decommissionModalCloseBtn');
const decCancel = document.getElementById('decommissionModalCancelBtn');
if (decClose) decClose.onclick = () => decommissionModal.classList.remove('active');
if (decCancel) decCancel.onclick = () => decommissionModal.classList.remove('active');

window.previewAgreement = () => {
    const id = document.getElementById('acceptanceProposalId').value;
    const manualCommNum = document.getElementById('acceptanceCommNum').value;
    const duration = document.getElementById('acceptanceDuration').value;
    const rate = document.getElementById('acceptanceRate').value;
    const presenter = document.getElementById('acceptancePresenter').value;
    const deliveryDate = document.getElementById('acceptanceDeliveryDate').value;
    
    let url = `commission_agreement.html?id=${id}&preview=true`;
    if (manualCommNum) url += `&commNum=${encodeURIComponent(manualCommNum)}`;
    if (duration) url += `&duration=${encodeURIComponent(duration)}`;
    if (rate) url += `&rate=${encodeURIComponent(rate)}`;
    if (presenter) url += `&presenter=${encodeURIComponent(presenter)}`;
    if (deliveryDate) url += `&deliveryDate=${encodeURIComponent(deliveryDate)}`;
    
    window.open(url, '_blank');
};

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

init();
