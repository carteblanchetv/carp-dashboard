// search.js
// Handles global search logic for the dashboard

export async function performSearch(params) {
    try {
        const queryParams = new URLSearchParams();
        Object.keys(params).forEach(key => {
            if (params[key]) queryParams.append(key, params[key]);
        });

        const token = await window.auth.getIdToken();
        const response = await fetch(`/api/search?${queryParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        return result;
    } catch (err) {
        console.error('Search failed:', err);
        return { success: false, error: err.message };
    }
}

export function renderSearchResults(results, container) {
    if (!results || results.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No results found.</div>';
        container.classList.remove('hidden');
        return;
    }

    container.innerHTML = results.map(res => {
        const date = res.submittedAt ? (res.submittedAt._seconds ? new Date(res.submittedAt._seconds * 1000) : new Date(res.submittedAt)) : null;
        const dateStr = date ? date.toLocaleDateString() : 'Unknown Date';
        
        return `
            <div class="search-result-item" onclick="window.location.href='proposal?id=${res.id}&view=preview'">
                <div>
                    <div class="res-title">${res.story_title || 'Untitled'}</div>
                    <div class="res-meta">
                        ${res.commissionNumber ? `<span class="comm-badge-inline">#${res.commissionNumber}</span> • ` : ''}
                        Submitted: ${dateStr}
                    </div>
                </div>
                <span class="res-status ${res.status || 'pending'}">${res.status || 'pending'}</span>
            </div>
        `;
    }).join('');
    container.classList.remove('hidden');
}
