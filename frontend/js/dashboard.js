import { checkAuth, isAdmin, isSuperAdmin, isEditorialProduction, getIdToken } from '../auth.js?v=5.1.1';
import { performSearch, renderSearchResults } from './search.js?v=5.1.1';

const searchInput = document.getElementById('globalSearchInput');
const toggleBtn = document.getElementById('toggleFiltersBtn');
const advancedFilters = document.getElementById('advancedFilters');
const resultsContainer = document.getElementById('searchResults');

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function renderDashboardUI(user) {
    if (!user) return;
    console.log("[Dashboard] Rendering UI for role:", user.role);

    // Show restricted search filters
    if (window.auth.isEditorialProduction(user)) {
        const userFilter = document.getElementById('userFilterGroup');
        if (userFilter) userFilter.classList.remove('hidden');
    }

    // Admin/Editorial Cards
    if (window.auth.isEditorialProduction(user)) {
        if (document.getElementById('adminCard')) document.getElementById('adminCard').classList.remove('hidden');
        if (document.getElementById('programmeControlCard')) document.getElementById('programmeControlCard').classList.remove('hidden');
        if (document.getElementById('footageAgreementCard')) document.getElementById('footageAgreementCard').classList.remove('hidden');
    } else {
        if (document.getElementById('adminCard')) document.getElementById('adminCard').classList.add('hidden');
        if (document.getElementById('programmeControlCard')) document.getElementById('programmeControlCard').classList.add('hidden');
        if (document.getElementById('footageAgreementCard')) document.getElementById('footageAgreementCard').classList.add('hidden');
    }

    // Show Submit Invoice card for all roles
    if (document.getElementById('invoiceActionCard')) {
        document.getElementById('invoiceActionCard').classList.remove('hidden');
    }

    // Reveal Grid smoothly
    const mainGrid = document.getElementById('mainCardsGrid');
    if (mainGrid) mainGrid.style.opacity = '1';
    
    // Reveal Quick Links smoothly
    const quickLinks = document.getElementById('quickLinksSection');
    if (quickLinks) quickLinks.style.opacity = '1';
}

checkAuth().then(user => {
    if (user) {
        console.log("[Dashboard] Identity Check:", { email: user.displayEmail, role: user.role, isMasquerading: !!user.isMasquerading });
        
        // Initialize standardized Nav Bar
        window.auth.initNavBar(user);

        // Initial UI Render
        renderDashboardUI(user);

        // --- SEARCH LOGIC ---
        const handleSearch = async () => {
            const params = {
                q: searchInput.value,
                uid: document.getElementById('filterUid').value,
                season: document.getElementById('filterSeason').value,
                episode: document.getElementById('filterEpisode').value,
                user: document.getElementById('filterUser').value
            };

            if (!params.q && !params.uid && !params.season && !params.user) {
                resultsContainer.classList.add('hidden');
                return;
            }

            const result = await performSearch(params);
            if (result.success) {
                renderSearchResults(result.results, resultsContainer);
            }
        };

        if (searchInput) searchInput.addEventListener('input', debounce(handleSearch, 500));
        document.querySelectorAll('.filter-input').forEach(input => {
            input.addEventListener('input', debounce(handleSearch, 500));
        });

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                advancedFilters.classList.toggle('hidden');
                toggleBtn.classList.toggle('active');
            });
        }

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container-modern')) {
                resultsContainer.classList.add('hidden');
            }
        });

        // --- INITIAL DATA LOAD ---
        loadProposals(user);

        // --- LISTEN FOR PROFILE UPDATES (Safari Resilience) ---
        window.addEventListener('authProfileUpdated', (e) => {
            console.log("[Dashboard] Profile Refined. Re-rendering UI...");
            renderDashboardUI(e.detail);
        });

        // --- DELETE HANDLER ---
        window.deleteProposal = async (id, title) => {
            if (!confirm(`Are you sure you want to delete the proposal "${title}"?\n\nThis action cannot be undone.`)) return;
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
                    // Update cache manually to remove the item immediately
                    const cacheKey = `proposals_cache_${user.uid}`;
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) {
                        const proposals = JSON.parse(cachedData).filter(p => p.id !== id);
                        localStorage.setItem(cacheKey, JSON.stringify(proposals));
                        renderProposalsData(proposals);
                    }
                    loadProposals(user); // Still fetch fresh data
                } else {
                    throw new Error(result.error);
                }
            } catch (err) {
                alert("Delete failed: " + err.message);
            }
        };
    }
});

// --- LOAD PROPOSALS ---
async function loadProposals(user) {
    if (!user) return;
    const cacheKey = `proposals_cache_${user.uid}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    // 1. Initial render from cache if available
    if (cachedData) {
        try {
            const proposals = JSON.parse(cachedData);
            renderProposalsData(proposals);
        } catch (e) {}
    }

    try {
        // Fetch proposals and footage declarations in parallel for better performance
        const [propRes, footRes] = await Promise.all([
            window.auth.fetchWithAuth('/api/proposals'),
            window.auth.fetchWithAuth('/api/list-user-footage')
        ]);

        const result = await propRes.json();
        const footResult = await footRes.json();
        const footageMap = footResult.success ? footResult.mapping : {};
        const projectMap = footResult.success ? footResult.projectMapping : {};
        
        if (result.success && result.proposals) {
            // 2. Cache the new data
            localStorage.setItem(cacheKey, JSON.stringify(result.proposals));
            
            // 3. Render fresh data
            renderProposalsData(result.proposals, footageMap, projectMap);
        }
    } catch (err) { console.error("Proposals fetch failed:", err); }
}

function renderProposalsData(proposals) {
    const proposalsSection = document.getElementById('storiesSection');
    const list = document.getElementById('storiesList');
    if (!list) return;

    if (!proposals || proposals.length === 0) {
        proposalsSection.classList.add('hidden');
        return;
    }

    proposalsSection.classList.remove('hidden');
    
    // Sort by last updated (newest first)
    const sorted = [...proposals].sort((a, b) => {
        const dateA = a.lastUpdatedAt?._seconds || a.submittedAt?._seconds || 0;
        const dateB = b.lastUpdatedAt?._seconds || b.submittedAt?._seconds || 0;
        return dateB - dateA;
    });

    list.innerHTML = sorted.map((p, index) => {
        const status = (p.status || 'pending').toLowerCase();
        const isAccepted = status === 'accepted' || status === 'paid';
        const isDraft = status === 'draft';
        const isRejected = status === 'rejected';
        const title = p.story_title || 'Untitled Story';
        
        let dateText = '-';
        const ts = p.lastUpdatedAt || p.submittedAt;
        if (ts) {
            const dateObj = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
            dateText = dateObj.toLocaleDateString();
        }

        let statusLabel = 'PENDING';
        let statusClass = 'pending';
        if (isAccepted) {
            statusLabel = 'COMMISSIONED';
            statusClass = 'accepted';
        } else if (isRejected) {
            statusLabel = 'REJECTED';
            statusClass = 'rejected';
        } else if (isDraft) {
            statusLabel = 'DRAFT';
            statusClass = 'draft';
        }

        const rawDelivery = p.acceptanceDetails?.deliveryDate;
        const dObj = rawDelivery ? (rawDelivery._seconds ? new Date(rawDelivery._seconds * 1000) : new Date(rawDelivery)) : null;
        const deliveryText = (dObj && !isNaN(dObj.getTime())) ? dObj.toLocaleDateString() : '—';

        return `
            <tr>
                <td data-label="#" style="font-weight: 700; color: var(--text-muted); width: 40px; text-align: center;">${index + 1}.</td>
                <td data-label="Status" style="width: 120px; text-align: center;">
                    <span class="status-badge-modern ${statusClass}" style="width: 100%; justify-content: center;">
                        ${statusLabel}
                    </span>
                </td>
                <td data-label="Story" class="col-title" style="font-weight: 700;">
                    <a href="proposal.html?id=${p.id}&view=preview" style="color: var(--primary); text-decoration: none; cursor: pointer;" class="story-link">
                        ${title}
                    </a>
                </td>
                <td data-label="Comm #" style="width: 90px; text-align: center; font-weight: 700; color: var(--primary);">${p.commissionNumber || '—'}</td>
                <td data-label="Delivery" style="width: 110px; text-align: center; font-size: 0.85rem;">${deliveryText}</td>
                <td data-label="Date" style="width: 130px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">${dateText}</td>
                <td data-label="Actions" style="width: 180px; text-align: center;">
                    <div style="display: flex; gap: 0.4rem; justify-content: center; align-items: center;">
                        <a href="proposal.html?id=${p.id}" class="btn-admin-cell primary" style="font-size: 0.7rem;">✏️ Edit</a>
                        <a href="proposal.html?id=${p.id}&view=preview" class="btn-admin-cell secondary" style="font-size: 0.7rem;">📄 View</a>
                        <button onclick="window.deleteProposal('${p.id}', '${title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" class="btn-admin-cell danger" style="font-size: 0.7rem;">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
