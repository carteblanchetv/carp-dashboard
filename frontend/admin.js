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
let currentPages = {
    pending: 1,
    commissioned: 1,
    paid: 1,
    decommissioned: 1
};
const PAGE_SIZE = 10;

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

        // Define Change Page Handler
        window.changePage = (type, delta) => {
            currentPages[type] += delta;
            renderProposals(globalProposals, window.auth.isAdmin(user));
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

        // --- SEARCH LOGIC ---
        const searchInput = document.getElementById('globalSearchInput');
        const toggleBtn = document.getElementById('toggleFiltersBtn');
        const advancedFilters = document.getElementById('advancedFilters');
        const resultsContainer = document.getElementById('searchResults');

        const handleSearch = async () => {
            if (!searchInput) return;
            const params = {
                q: searchInput.value,
                commNum: document.getElementById('filterCommNum')?.value || '',
                uid: document.getElementById('filterUid')?.value || '',
                season: document.getElementById('filterSeason')?.value || '',
                episode: document.getElementById('filterEpisode')?.value || '',
                user: document.getElementById('filterUser')?.value || ''
            };

            if (!params.q && !params.commNum && !params.uid && !params.season && !params.user) {
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

        // Danger Zone Visibility (Super Admin only)
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


let showAllEpisodes = false;

function populateEpisodesSidebar(proposals) {
    const sidebarList = document.getElementById('episodesSidebarList');
    if (!sidebarList) return;

    const txDates = new Set();
    proposals.forEach(p => {
        const allDates = Array.isArray(p.txDates) && p.txDates.length > 0 ? p.txDates : (p.txDate ? [p.txDate] : []);
        if (p.txDate && !allDates.includes(p.txDate)) {
            allDates.unshift(p.txDate);
        }
        allDates.forEach(d => {
            if (d) {
                const formatted = formatDate(d);
                if (formatted !== '—') {
                    txDates.add(formatted);
                }
            }
        });
    });

    const sortedDates = Array.from(txDates).sort((a, b) => new Date(b) - new Date(a));

    sidebarList.innerHTML = '';
    
    if (sortedDates.length === 0) {
        sidebarList.innerHTML = '<li><span style="padding: 0.6rem 0.8rem; display: block; color: var(--text-muted); font-size: 0.9rem;">No episodes yet.</span></li>';
        return;
    }

    const datesToShow = showAllEpisodes ? sortedDates : sortedDates.slice(0, 10);

    datesToShow.forEach(date => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = date;
        btn.onclick = () => window.setTxDateFilter(date);
        li.appendChild(btn);
        sidebarList.appendChild(li);
    });

    if (sortedDates.length > 10) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        if (showAllEpisodes) {
            btn.textContent = 'Show Less';
            btn.onclick = () => {
                showAllEpisodes = false;
                populateEpisodesSidebar(proposals);
            };
        } else {
            btn.textContent = 'View All Episodes';
            btn.onclick = () => {
                showAllEpisodes = true;
                populateEpisodesSidebar(proposals);
            };
        }
        btn.style.color = 'var(--primary)';
        btn.style.fontWeight = '600';
        btn.style.textAlign = 'center';
        li.appendChild(btn);
        sidebarList.appendChild(li);
    }
}

function renderCommNumberHtml(commNum) {
    if (!commNum || commNum === '—') return '—';
    const isLive = commNum.toString().startsWith('CB');
    if (isLive) {
        return `<strong style="color: #f59e0b;">#${commNum}</strong>`;
    }
    return `<strong>#${commNum}</strong>`;
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
        ? proposals.filter(p => {
            if (activeProducerFilter && activeProducerFilter !== 'HISTORICAL_IMPORT' && p.submittedBy === activeProducerFilter) return true;
            const filterName = (document.getElementById('masqueradeBtn')?.dataset?.name || '').toLowerCase().trim();
            if (filterName) {
                const subDisp = ((p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : (p.historicalSubmitterName || p.producerName || p.producer || p.submittedByName || p.submittedByEmail || '')).toLowerCase().trim();
                if (subDisp && subDisp === filterName) return true;
            }
            return false;
        })
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
    const totalPagesPending = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
    if (currentPages.pending > totalPagesPending) currentPages.pending = totalPagesPending;
    if (currentPages.pending < 1) currentPages.pending = 1;

    if (pending.length === 0) {
        propTableBody.innerHTML = `<tr><td colspan="4" class="table-empty-msg">No pending proposals.</td></tr>`;
        document.getElementById('pendingViewMoreContainer').style.display = 'none';
    } else {
        const startIndex = (currentPages.pending - 1) * PAGE_SIZE;
        const toShow = pending.slice(startIndex, startIndex + PAGE_SIZE);
        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const date = formatDate(p.submittedAt);
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : (p.historicalSubmitterName || p.producerName || p.producer || p.submittedByName || p.submittedByEmail);
            tr.innerHTML = `
                <td data-label="Date">${date}</td>
                <td data-label="Story Title" class="col-story-title"><a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a></td>
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
        
        const container = document.getElementById('pendingViewMoreContainer');
        if (container) {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="display: flex; justify-content: ${pending.length <= 10 ? 'center' : 'space-between'}; align-items: center; width: 100%; max-width: 500px; margin: 0 auto; gap: 1rem;">
                    <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${pending.length <= 10 ? 'display: none;' : ''}" ${currentPages.pending === 1 ? 'disabled' : ''} onclick="window.changePage('pending', -1)">&larr; Previous</button>
                    <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.pending} of ${totalPagesPending}</span>
                    <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${pending.length <= 10 ? 'display: none;' : ''}" ${currentPages.pending === totalPagesPending ? 'disabled' : ''} onclick="window.changePage('pending', 1)">Next &rarr;</button>
                </div>
            `;
        }
    }

    // 2. Commissioned Stories (In Production)
    commTableBody.innerHTML = '';
    const accepted = filtered.filter(p => p.status && p.status.toLowerCase() === 'accepted');
    accepted.sort((a, b) => {
        const isCbA = (a.commissionNumber || '').toString().startsWith('CB');
        const isCbB = (b.commissionNumber || '').toString().startsWith('CB');
        
        if (isCbA && !isCbB) return -1;
        if (!isCbA && isCbB) return 1;
        
        if (isCbA && isCbB) {
            const numA = parseInt(a.commissionNumber.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.commissionNumber.replace(/\D/g, '')) || 0;
            if (numA !== numB) return numB - numA;
            return b.commissionNumber.toString().localeCompare(a.commissionNumber.toString());
        }
        
        const numA = parseInt(a.commissionNumber) || 0;
        const numB = parseInt(b.commissionNumber) || 0;
        return numB - numA;
    });
    const totalPagesComm = Math.max(1, Math.ceil(accepted.length / PAGE_SIZE));
    if (currentPages.commissioned > totalPagesComm) currentPages.commissioned = totalPagesComm;
    if (currentPages.commissioned < 1) currentPages.commissioned = 1;

    if (accepted.length === 0) {
        commTableBody.innerHTML = '<tr><td colspan="5" class="table-empty-msg">No commissioned stories.</td></tr>';
        document.getElementById('commissionedViewMoreContainer').style.display = 'none';
    } else {
        const startIndex = (currentPages.commissioned - 1) * PAGE_SIZE;
        const toShow = accepted.slice(startIndex, startIndex + PAGE_SIZE);
        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : (p.historicalSubmitterName || p.producerName || p.producer || p.submittedByName || p.submittedByEmail);
            tr.innerHTML = `
                <td data-label="Comm #">${renderCommNumberHtml(p.commissionNumber)}</td>
                <td data-label="Story Title">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a>
                        <a href="commission_agreement.html?id=${p.id}" target="_blank" title="Commission Agreement" style="text-decoration: none; font-size: 1.1rem; transition: opacity 0.2s; opacity: 0.85;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'">⚖️</a>
                        <button type="button" onclick="window.viewStoryLegalForms('${p.id}', '${p.commissionNumber || ''}', '${(p.story_title || 'Untitled').replace(/'/g, "\\'")}')" title="View contributor releases and legal forms" style="background: none; border: none; font-size: 1.05rem; cursor: pointer; padding: 0; opacity: 0.85; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'">📑</button>
                    </div>
                </td>
                <td data-label="Producer" class="col-producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
                <td data-label="Actions">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: nowrap; align-items: center;">
                        <a href="proposal?id=${p.id}&view=admin" class="btn-admin-cell secondary">Preview</a>
                        <button class="btn-admin-cell info" onclick="window.openEditCommissionModal('${p.id}')">Edit Details</button>
                        <button class="btn-admin-cell success" onclick="window.handleProposalAction('${p.id}', 'pay')">Delivered</button>
                        <button class="btn-admin-cell danger" onclick="window.openDecommissionModal('${p.id}')">Decom</button>
                        <button class="btn-admin-cell warning" onclick="window.handleProposalAction('${p.id}', 'revert-to-pending')">Revert</button>
                    </div>
                </td>
            `;
            commTableBody.appendChild(tr);
        });
        
        const container = document.getElementById('commissionedViewMoreContainer');
        if (container) {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="display: flex; justify-content: ${accepted.length <= 10 ? 'center' : 'space-between'}; align-items: center; width: 100%; max-width: 500px; margin: 0 auto; gap: 1rem;">
                    <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${accepted.length <= 10 ? 'display: none;' : ''}" ${currentPages.commissioned === 1 ? 'disabled' : ''} onclick="window.changePage('commissioned', -1)">&larr; Previous</button>
                    <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.commissioned} of ${totalPagesComm}</span>
                    <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${accepted.length <= 10 ? 'display: none;' : ''}" ${currentPages.commissioned === totalPagesComm ? 'disabled' : ''} onclick="window.changePage('commissioned', 1)">Next &rarr;</button>
                </div>
            `;
        }
    }

    // 3. Paid Stories (Delivered)
    paidTableBody.innerHTML = '';
    const paid = filtered.filter(p => p.status && p.status.toLowerCase() === 'paid');
    paid.sort((a, b) => {
        const hasCommA = a.commissionNumber && a.commissionNumber.toString().trim() !== '—';
        const hasCommB = b.commissionNumber && b.commissionNumber.toString().trim() !== '—';
        
        if (hasCommA && !hasCommB) return -1;
        if (!hasCommA && hasCommB) return 1;

        const getSortDate = (p) => {
            if (p.txDate) {
                const d = new Date(p.txDate);
                if (!isNaN(d.getTime())) return d;
            }
            if (p.paidAt) {
                const d = p.paidAt._seconds ? new Date(p.paidAt._seconds * 1000) : new Date(p.paidAt);
                if (!isNaN(d.getTime())) return d;
            }
            return new Date(0);
        };
        return getSortDate(b) - getSortDate(a);
    });
    const totalPagesPaid = Math.max(1, Math.ceil(paid.length / PAGE_SIZE));
    if (currentPages.paid > totalPagesPaid) currentPages.paid = totalPagesPaid;
    if (currentPages.paid < 1) currentPages.paid = 1;

    if (paid.length === 0) {
        paidTableBody.innerHTML = '<tr><td colspan="5" class="table-empty-msg">No delivered stories.</td></tr>';
        document.getElementById('paidViewMoreContainer').style.display = 'none';
    } else {
        const startIndex = (currentPages.paid - 1) * PAGE_SIZE;
        const toShow = paid.slice(startIndex, startIndex + PAGE_SIZE);
        toShow.forEach(p => {
            const tr = document.createElement('tr');
            const paidDate = formatDate(p.paidAt);
            const rawTxList = [];
            if (p.txDate) rawTxList.push(p.txDate);
            if (Array.isArray(p.txDates)) {
                p.txDates.forEach(d => {
                    if (d && !rawTxList.includes(d)) rawTxList.push(d);
                });
            }
            const formattedTxLinks = rawTxList
                .map(d => formatDate(d))
                .filter(f => f && f !== '—')
                .map((formatted, idx) => `<a href="#" onclick="event.preventDefault(); window.setTxDateFilter('${formatted}')" style="color: var(--primary); text-decoration: underline;" title="${idx > 0 ? 'Repeat broadcast episode' : 'View all stories for this episode'}">${formatted}${idx > 0 ? ' <span style="font-size: 0.75rem; color: var(--text-muted); text-decoration: none;">(Repeat)</span>' : ''}</a>`);
            const txDateDisplay = formattedTxLinks.length > 0
                ? formattedTxLinks.join('<br>')
                : paidDate;
            const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : (p.historicalSubmitterName || p.producerName || p.producer || p.submittedByName || p.submittedByEmail);
            tr.innerHTML = `
                <td data-label="Comm #">${renderCommNumberHtml(p.commissionNumber)}</td>
                <td data-label="Story Title">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a>
                        <a href="commission_agreement.html?id=${p.id}" target="_blank" title="Commission Agreement" style="text-decoration: none; font-size: 1.1rem; transition: opacity 0.2s; opacity: 0.85;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'">⚖️</a>
                    </div>
                </td>
                <td data-label="TX Date">${txDateDisplay}</td>
                <td data-label="Producer" class="col-producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
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
        
        const container = document.getElementById('paidViewMoreContainer');
        if (container) {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="display: flex; justify-content: ${paid.length <= 10 ? 'center' : 'space-between'}; align-items: center; width: 100%; max-width: 500px; margin: 0 auto; gap: 1rem;">
                    <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${paid.length <= 10 ? 'display: none;' : ''}" ${currentPages.paid === 1 ? 'disabled' : ''} onclick="window.changePage('paid', -1)">&larr; Previous</button>
                    <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.paid} of ${totalPagesPaid}</span>
                    <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${paid.length <= 10 ? 'display: none;' : ''}" ${currentPages.paid === totalPagesPaid ? 'disabled' : ''} onclick="window.changePage('paid', 1)">Next &rarr;</button>
                </div>
            `;
        }
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
        const totalPagesDecomp = Math.max(1, Math.ceil(decommissioned.length / PAGE_SIZE));
        if (currentPages.decommissioned > totalPagesDecomp) currentPages.decommissioned = totalPagesDecomp;
        if (currentPages.decommissioned < 1) currentPages.decommissioned = 1;

        if (decommissioned.length === 0) {
            decompTableBody.innerHTML = '<tr><td colspan="6" class="table-empty-msg">No decommissioned stories.</td></tr>';
            document.getElementById('decommissionedViewMoreContainer').style.display = 'none';
        } else {
            const startIndex = (currentPages.decommissioned - 1) * PAGE_SIZE;
            const toShow = decommissioned.slice(startIndex, startIndex + PAGE_SIZE);
            toShow.forEach(p => {
                const tr = document.createElement('tr');
                const decDate = formatDate(p.decommissionedAt);
                const submitterDisplay = (p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : (p.historicalSubmitterName || p.producerName || p.producer || p.submittedByName || p.submittedByEmail);
                const reason = p.decommissionReason ? p.decommissionReason : '<i>No reason provided</i>';
                tr.innerHTML = `
                    <td data-label="Comm #">${renderCommNumberHtml(p.commissionNumber)}</td>
                    <td data-label="Story Title" class="col-story-title"><a href="proposal?id=${p.id}&view=admin" class="story-title-link">${p.story_title}</a></td>
                    <td data-label="Decommissioned Date">${decDate}</td>
                    <td data-label="Reason" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.decommissionReason || ''}">${reason}</td>
                    <td data-label="Producer" class="col-producer"><a href="#" class="producer-filter-link" onclick="event.preventDefault(); window.setProducerFilter('${p.submittedBy}', '${submitterDisplay.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${submitterDisplay}</a></td>
                    <td data-label="Actions">
                        <button class="btn-admin-cell warning" onclick="window.handleProposalAction('${p.id}', 'revert')">Revert to Commissioned</button>
                    </td>
                `;
                decompTableBody.appendChild(tr);
            });
            
            const container = document.getElementById('decommissionedViewMoreContainer');
            if (container) {
                container.style.display = 'block';
                container.innerHTML = `
                    <div style="display: flex; justify-content: ${decommissioned.length <= 10 ? 'center' : 'space-between'}; align-items: center; width: 100%; max-width: 500px; margin: 0 auto; gap: 1rem;">
                        <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${decommissioned.length <= 10 ? 'display: none;' : ''}" ${currentPages.decommissioned === 1 ? 'disabled' : ''} onclick="window.changePage('decommissioned', -1)">&larr; Previous</button>
                        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.decommissioned} of ${totalPagesDecomp}</span>
                        <button class="btn-soft" style="flex: 1; padding: 0.5rem; ${decommissioned.length <= 10 ? 'display: none;' : ''}" ${currentPages.decommissioned === totalPagesDecomp ? 'disabled' : ''} onclick="window.changePage('decommissioned', 1)">Next &rarr;</button>
                    </div>
                `;
            }
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
        const realEmail = (user?.realEmail || user?.email || '').toLowerCase();
        if (masqBtn && realEmail === 'lezanne@carteblanche.co.za') {
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

window.changePage = (type, delta) => {
    currentPages[type] += delta;
    checkAuth().then(user => {
        renderProposals(globalProposals, window.auth.isAdmin(user));
    });
};

window.masqueradeAsFiltered = () => {
    const masqBtn = document.getElementById('masqueradeBtn');
    let uid = masqBtn.dataset.uid || '';
    const name = masqBtn.dataset.name || '';
    let role = 'producer';
    let email = '';

    const nameNorm = name.toLowerCase().trim();
    if (Array.isArray(window.producersCache)) {
        const matchedProd = window.producersCache.find(prod => {
            const pFull = `${prod.name || ''} ${prod.surname || ''}`.toLowerCase().trim();
            return (uid && uid !== 'HISTORICAL_IMPORT' && prod.id === uid) || (nameNorm && pFull === nameNorm);
        });
        if (matchedProd) {
            uid = matchedProd.id || uid;
            email = matchedProd.email || '';
            role = matchedProd.role || 'producer';
        }
    }

    if (!email && Array.isArray(globalProposals)) {
        const matchedProp = globalProposals.find(p => {
            const subDisp = ((p.submittedByName && p.submittedBySurname) ? `${p.submittedByName} ${p.submittedBySurname}` : (p.historicalSubmitterName || p.producerName || p.producer || '')).toLowerCase().trim();
            return (uid && uid !== 'HISTORICAL_IMPORT' && p.submittedBy === uid) || (nameNorm && subDisp === nameNorm);
        });
        if (matchedProp) {
            const candEmail = (matchedProp.producerEmail || matchedProp.submittedByEmail || '').toLowerCase().trim();
            if (candEmail && candEmail !== 'imported@carteblanche.co.za') {
                email = candEmail;
            }
            if ((!uid || uid === 'HISTORICAL_IMPORT') && matchedProp.submittedBy && matchedProp.submittedBy !== 'HISTORICAL_IMPORT') {
                uid = matchedProp.submittedBy;
            }
        }
    }

    window.auth.startMasquerade(uid, name, role, email);
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

        // Fetch stories for this TX Date (including repeat / multi-broadcast dates)
        const matchingStories = globalProposals.filter(p => {
            if (p.txDate && formatDate(p.txDate) === txDate) return true;
            if (Array.isArray(p.txDates) && p.txDates.some(d => d && formatDate(d) === txDate)) return true;
            return false;
        });
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

// --- REVIEWER LOADER HELPER ---
async function loadReviewersList(targetContainerId, selectedUids = [], checkboxName = 'permittedReviewers') {
    const container = document.getElementById(targetContainerId);
    if (!container) return;
    if (!window.reviewersCache) {
        try {
            const token = await window.auth.getIdToken();
            const res = await fetch('/api/list-reviewers', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                window.reviewersCache = data.reviewers || [];
            }
        } catch (e) {
            console.error("Failed to load reviewers:", e);
        }
    }
    const reviewers = window.reviewersCache || [];
    container.innerHTML = reviewers.map(r => `
        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; padding: 0.4rem 0.6rem; background: var(--bg-light); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
            <input type="checkbox" name="${checkboxName}" value="${r.uid}" ${selectedUids.includes(r.uid) ? 'checked' : ''}>
            <span>${r.name} ${r.surname}</span>
        </label>
    `).join('');
}

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
    
    // Reset Live Studio Interview details
    const seasonInput = document.getElementById('acceptanceSeasonNum');
    if (seasonInput) seasonInput.value = '';
    const episodeInput = document.getElementById('acceptanceEpisodeNum');
    if (episodeInput) episodeInput.value = '';
    
    // Default Story Type
    const storyTypeEl = document.getElementById('acceptanceStoryType');
    if (storyTypeEl) {
        storyTypeEl.value = 'Standard';
        if (typeof storyTypeEl.dispatchEvent === 'function') {
            storyTypeEl.dispatchEvent(new Event('change'));
        }
    }
    
    // Pre-populate Presenter and Legal Req from proposal if they exist
    const presenterEl = document.getElementById('acceptancePresenter');
    if (presenterEl) {
        const savedPresenter = (proposal.details && proposal.details.presenter) || '';
        const standardPresenters = ['Catherine Rice', 'Claire Mawisa', 'Erin Bates', 'Govan Whittles', 'Lourensa Eckard', 'Macfarlane Moleli', 'Masa Kekana', 'Nickolaus Bauer', 'No Presenter'];
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
    
    // Populate Sensitivity
    const accSensCheckbox = document.getElementById('acceptanceIsSensitive');
    const accSensWrapper = document.getElementById('acceptanceReviewerWrapper');
    if (accSensCheckbox && accSensWrapper) {
        accSensCheckbox.checked = proposal.isSensitive === true;
        if (accSensCheckbox.checked) {
            accSensWrapper.classList.remove('hidden');
        } else {
            accSensWrapper.classList.add('hidden');
        }
        loadReviewersList('acceptanceReviewerList', proposal.permittedUids || [], 'acceptancePermittedReviewers');
        accSensCheckbox.onchange = () => {
            if (accSensCheckbox.checked) {
                accSensWrapper.classList.remove('hidden');
            } else {
                accSensWrapper.classList.add('hidden');
            }
        };
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
        const isSensitive = document.getElementById('acceptanceIsSensitive')?.checked || false;
        const permittedUids = Array.from(document.querySelectorAll('input[name="acceptancePermittedReviewers"]:checked')).map(cb => cb.value);
        
        const liveStudioInterview = (storyType === 'Studio');
        const liveStudioSeason = liveStudioInterview ? document.getElementById('acceptanceSeasonNum')?.value || null : null;
        const liveStudioEpisode = liveStudioInterview ? document.getElementById('acceptanceEpisodeNum')?.value || null : null;
        
        acceptanceModal.classList.remove('active');
        const res = await executeProposalAction(id, 'accept', { 
            manualCommissionNumber: storyType === 'TFU' ? null : manualCommissionNumber,
            storyType,
            duration, 
            deliveryDate, 
            rate, 
            contractAccepted,
            presenter,
            legal_req,
            liveStudioInterview,
            liveStudioSeason,
            liveStudioEpisode,
            isSensitive,
            permittedUids
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

    // Populate Sensitivity
    const editSensCheckbox = document.getElementById('editCommIsSensitive');
    const editSensWrapper = document.getElementById('editCommReviewerWrapper');
    if (editSensCheckbox && editSensWrapper) {
        editSensCheckbox.checked = proposal.isSensitive === true;
        if (editSensCheckbox.checked) {
            editSensWrapper.classList.remove('hidden');
        } else {
            editSensWrapper.classList.add('hidden');
        }
        loadReviewersList('editCommReviewerList', proposal.permittedUids || [], 'editCommPermittedReviewers');
        editSensCheckbox.onchange = () => {
            if (editSensCheckbox.checked) {
                editSensWrapper.classList.remove('hidden');
            } else {
                editSensWrapper.classList.add('hidden');
            }
        };
    }

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
        const isSensitive = document.getElementById('editCommIsSensitive')?.checked || false;
        const permittedUids = Array.from(document.querySelectorAll('input[name="editCommPermittedReviewers"]:checked')).map(cb => cb.value);

        editCommissionModal.classList.remove('active');
        await executeProposalAction(id, 'edit-commission', { 
            commissionNumber, 
            deliveryDate, 
            duration, 
            rate, 
            presenter, 
            legal_req,
            newProducerId,
            isSensitive,
            permittedUids
        });
    };
}

const ecClose = document.getElementById('editCommModalCloseBtn');
const ecCancel = document.getElementById('editCommModalCancelBtn');
if (ecClose) ecClose.onclick = () => editCommissionModal.classList.remove('active');
if (ecCancel) ecCancel.onclick = () => editCommissionModal.classList.remove('active');

// --- TFU / STORY TYPE LOGIC ---
const acceptanceStoryTypeEl = document.getElementById('acceptanceStoryType');
const acceptanceCommNumGroup = document.getElementById('acceptanceCommNumGroup');
const acceptanceLiveStudioGroupEl = document.getElementById('acceptanceLiveStudioGroup');
const acceptanceSeasonNumEl = document.getElementById('acceptanceSeasonNum');
const acceptanceEpisodeNumEl = document.getElementById('acceptanceEpisodeNum');
const acceptanceCommNumEl = document.getElementById('acceptanceCommNum');
const acceptanceCommFeedbackEl = document.getElementById('acceptanceCommFeedback');

function updateLiveStudioCommNum() {
    const isStudio = (acceptanceStoryTypeEl && acceptanceStoryTypeEl.value === 'Studio');
    if (isStudio) {
        const season = (acceptanceSeasonNumEl ? acceptanceSeasonNumEl.value.trim() : '');
        const episode = (acceptanceEpisodeNumEl ? acceptanceEpisodeNumEl.value.trim() : '');
        if (season || episode) {
            acceptanceCommNumEl.value = `CB${season}${episode}`;
        } else {
            acceptanceCommNumEl.value = '';
        }
        // Trigger validation
        validateCommissionNumber(acceptanceCommNumEl, acceptanceCommFeedbackEl, document.getElementById('acceptanceProposalId').value);
    }
}

if (acceptanceStoryTypeEl) {
    acceptanceStoryTypeEl.addEventListener('change', (e) => {
        const type = e.target.value;
        
        if (type === 'TFU') {
            if (acceptanceCommNumGroup) acceptanceCommNumGroup.style.display = 'none';
            if (acceptanceLiveStudioGroupEl) acceptanceLiveStudioGroupEl.style.display = 'none';
            if (acceptanceCommNumEl) {
                acceptanceCommNumEl.readOnly = false;
                acceptanceCommNumEl.value = '';
                if (acceptanceCommFeedbackEl) acceptanceCommFeedbackEl.textContent = '';
                acceptanceCommNumEl.style.borderColor = 'var(--border)';
            }
        } else if (type === 'Studio') {
            if (acceptanceCommNumGroup) acceptanceCommNumGroup.style.display = 'block';
            if (acceptanceLiveStudioGroupEl) acceptanceLiveStudioGroupEl.style.display = 'grid';
            if (acceptanceCommNumEl) {
                acceptanceCommNumEl.readOnly = true;
                updateLiveStudioCommNum();
            }
        } else {
            if (acceptanceCommNumGroup) acceptanceCommNumGroup.style.display = 'block';
            if (acceptanceLiveStudioGroupEl) acceptanceLiveStudioGroupEl.style.display = 'none';
            if (acceptanceCommNumEl) {
                acceptanceCommNumEl.readOnly = false;
                acceptanceCommNumEl.value = '';
                if (acceptanceCommFeedbackEl) acceptanceCommFeedbackEl.textContent = '';
                acceptanceCommNumEl.style.borderColor = 'var(--border)';
            }
        }
    });
}

if (acceptanceSeasonNumEl) acceptanceSeasonNumEl.addEventListener('input', updateLiveStudioCommNum);
if (acceptanceEpisodeNumEl) acceptanceEpisodeNumEl.addEventListener('input', updateLiveStudioCommNum);


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
                <button type="button" id="closeAdminLegalModalBtn" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
            </div>
            <div id="adminLegalFormsListContainer" style="padding: 1.5rem; overflow-y: auto; flex: 1;">
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div class="spinner-small" style="margin: 0 auto 0.75rem;"></div>
                    Loading signed releases for this story...
                </div>
            </div>
            <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--border, #e2e8f0); background: var(--bg-light, #f8fafc); display: flex; justify-content: space-between; align-items: center;">
                <a href="forms_hub.html?story=${encodeURIComponent(storyTitle)}&comm=${encodeURIComponent(commNum)}" target="_blank" class="btn-soft" style="font-size: 0.85rem; text-decoration: none; padding: 0.5rem 0.9rem; background: var(--primary, #008fbe); color: white; border-radius: 6px;">
                    ➕ Open Forms Hub for Story
                </a>
                <button type="button" id="closeAdminLegalModalBtn2" class="btn-soft" style="font-size: 0.85rem; padding: 0.5rem 0.9rem;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const loadLegalForms = async (isSilent = false) => {
        const container = overlay.querySelector('#adminLegalFormsListContainer');
        if (!container) return;
        if (!isSilent) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div class="spinner-small" style="margin: 0 auto 0.75rem;"></div>
                    Loading signed releases for this story...
                </div>
            `;
        }

        try {
            const token = await window.auth.getIdToken();
            const url = `/api/proposal-legal-forms?proposalId=${encodeURIComponent(proposalId)}&commNum=${encodeURIComponent(commNum)}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();

            if (!data.success || !data.forms || data.forms.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                        <p style="font-size: 2rem; margin: 0 0 0.5rem;">📄</p>
                        <p style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">No legal forms recorded yet</p>
                        <p style="font-size: 0.85rem; max-width: 380px; margin: 0 auto 1.25rem;">Signed contributor and rights releases matching <strong>${commNum || 'this story'}</strong> will appear here automatically.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div id="adminStoryLegalFormsList" style="display: flex; flex-direction: column; gap: 0.75rem;">
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
                                    <button type="button" class="btn-soft btn-delete-legal-form" onclick="window.deleteStoryLegalForm('${f.id}', '${(f.contributorName || 'Form').replace(/'/g, "\\'")}', '${formattedType.replace(/'/g, "\\'")}', this)" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer;" title="Delete this legal form">
                                        🗑️ Delete
                                    </button>
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

    overlay.querySelector('#closeAdminLegalModalBtn').addEventListener('click', close);
    overlay.querySelector('#closeAdminLegalModalBtn2').addEventListener('click', close);
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
        const token = await window.auth.getIdToken();
        const res = await fetch('/api/admin/delete-legal-form', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
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

init();
