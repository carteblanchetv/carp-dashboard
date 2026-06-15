import { fetchWithAuth, checkAuth } from './auth.js?v=5.1.1';

const modal = document.getElementById('detailsModal');
const closeBtn = document.getElementById('closeDetailsModalBtn');
const cancelBtn = document.getElementById('cancelDetailsModalBtn');
const loadingSpinner = document.getElementById('tableLoading');

let globalSubmissionsCache = [];
let currentUserCache = null;
const PAGE_SIZE = 10;
const currentPages = {
    investigation: 1,
    submissions: 1,
    resolved: 1
};

// Load saved pages on init
try {
    const saved = sessionStorage.getItem('cb_viewer_submissions_pages');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.investigation) currentPages.investigation = Number(parsed.investigation) || 1;
        if (parsed.submissions) currentPages.submissions = Number(parsed.submissions) || 1;
        if (parsed.resolved) currentPages.resolved = Number(parsed.resolved) || 1;
    }
} catch (e) {
    console.error('Error loading saved pages from sessionStorage:', e);
}

window.changePage = (type, delta) => {
    currentPages[type] += delta;
    try {
        sessionStorage.setItem('cb_viewer_submissions_pages', JSON.stringify(currentPages));
    } catch (e) {
        console.error('Error saving pages to sessionStorage:', e);
    }
    renderSubmissions(globalSubmissionsCache, currentUserCache);
};

checkAuth().then(user => {
    if (user) {
        window.auth.initNavBar(user);
        currentUserCache = user;
        loadSubmissions(user);
        initSearch();
    }
});

let backgroundLoadActive = false;

async function loadSubmissions(user) {
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    backgroundLoadActive = false; // cancel any in-progress background load

    try {
        // --- First batch: fetch and render immediately ---
        const res = await fetchWithAuth('/api/viewer-submissions?limit=200', { skipCache: true });
        const result = await res.json();

        if (loadingSpinner) loadingSpinner.style.display = 'none';

        if (!result.success || !result.submissions) {
            document.getElementById('submissionsList').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 3rem; color: var(--danger);">
                        ${result.error || 'Failed to load submissions.'}
                    </td>
                </tr>
            `;
            return;
        }

        globalSubmissionsCache = result.submissions;
        currentUserCache = user;
        renderSubmissions(result.submissions, user);

        // --- Background loading: stream remaining records silently ---
        if (result.nextCursor) {
            backgroundLoadActive = true;
            loadMoreInBackground(result.nextCursor, user);
        }

    } catch (error) {
        console.error('Error loading submissions:', error);
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        document.getElementById('submissionsList').innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem; color: var(--danger);">
                    An error occurred while loading submissions.
                </td>
            </tr>
        `;
    }
}

async function loadMoreInBackground(cursor, user) {
    const indicator = document.getElementById('bgLoadIndicator');
    if (indicator) indicator.style.display = 'block';

    try {
        while (cursor && backgroundLoadActive) {
            const res = await fetchWithAuth(`/api/viewer-submissions?limit=200&after=${encodeURIComponent(cursor)}`, { skipCache: true });
            if (!res.ok) break;
            const result = await res.json();
            if (!result.success || !result.submissions || result.submissions.length === 0) break;

            // Merge new records into the cache (avoid duplicates)
            const existingIds = new Set(globalSubmissionsCache.map(s => s.id));
            const newRecords = result.submissions.filter(s => !existingIds.has(s.id));
            if (newRecords.length > 0) {
                globalSubmissionsCache = [...globalSubmissionsCache, ...newRecords];
                // Only re-render if user is not actively searching (avoid disruption)
                const searchVal = document.getElementById('submissionsSearchInput')?.value || '';
                if (!searchVal.trim()) {
                    renderSubmissions(globalSubmissionsCache, user);
                }
            }

            cursor = result.nextCursor || null;
        }
    } catch (err) {
        console.warn('Background load error (non-critical):', err);
    } finally {
        if (indicator) indicator.style.display = 'none';
        backgroundLoadActive = false;
    }
}



function groupAndNestSubmissions(subsList) {
    const groupsByEmail = {};
    subsList.forEach(sub => {
        const key = (sub.submittedByEmail || sub.submittedByName || 'unknown').toLowerCase().trim();
        if (!groupsByEmail[key]) {
            groupsByEmail[key] = [];
        }
        groupsByEmail[key].push(sub);
    });

    const groupedResult = [];

    Object.keys(groupsByEmail).forEach(key => {
        const list = groupsByEmail[key];
        
        list.sort((a, b) => {
            const dateA = a.submittedAt?._seconds ? a.submittedAt._seconds * 1000 : new Date(a.submittedAt).getTime();
            const dateB = b.submittedAt?._seconds ? b.submittedAt._seconds * 1000 : new Date(b.submittedAt).getTime();
            return dateB - dateA;
        });

        let currentGroup = [list[0]];
        for (let i = 1; i < list.length; i++) {
            const prevSub = list[i - 1];
            const currentSub = list[i];
            
            const prevDate = prevSub.submittedAt?._seconds ? prevSub.submittedAt._seconds * 1000 : new Date(prevSub.submittedAt).getTime();
            const currDate = currentSub.submittedAt?._seconds ? currentSub.submittedAt._seconds * 1000 : new Date(currentSub.submittedAt).getTime();
            
            const gapMs = prevDate - currDate;
            const gapDays = gapMs / (1000 * 60 * 60 * 24);

            if (gapDays >= 90) {
                groupedResult.push(currentGroup);
                currentGroup = [currentSub];
            } else {
                currentGroup.push(currentSub);
            }
        }
        groupedResult.push(currentGroup);
    });

    const mappedGroups = groupedResult.map(group => {
        const parent = { ...group[0] };
        parent.nestedSubmissions = group;
        parent.nestedCount = group.length;
        return parent;
    });

    mappedGroups.sort((a, b) => {
        const dateA = a.submittedAt?._seconds ? a.submittedAt._seconds * 1000 : new Date(a.submittedAt).getTime();
        const dateB = b.submittedAt?._seconds ? b.submittedAt._seconds * 1000 : new Date(b.submittedAt).getTime();
        return dateB - dateA;
    });

    return mappedGroups;
}

function getNestedGroupForSubmission(subId) {
    const parentSub = globalSubmissionsCache.find(s => s.id === subId);
    if (!parentSub) return [];

    let categorySubs = [];
    if (parentSub.resolved === true) {
        categorySubs = globalSubmissionsCache.filter(s => s.resolved === true);
    } else if (parentSub.useful === true) {
        categorySubs = globalSubmissionsCache.filter(s => s.useful === true && s.resolved !== true);
    } else {
        categorySubs = globalSubmissionsCache.filter(s => s.useful !== true && s.resolved !== true);
    }

    categorySubs = categorySubs.filter(s => {
        if (s.status === 'spam' || s.reportedSpam === true) return false;
        const fromEmail = (s.submittedByEmail || '').toLowerCase();
        const fromName = (s.submittedByName || '').toLowerCase();
        const subject = (s.subject || '').toLowerCase();
        if (
            fromEmail === 'quarantine@e-purifier.com' || 
            fromEmail === 'postmaster@e-purifier.com' || 
            fromEmail.includes('e-purifier.com') || 
            fromName.includes('e-purifier support')
        ) return false;
        if (
            subject.includes('spam to recipient') || 
            subject.includes('quarantine@e-purifier.com') ||
            subject.includes('quarantine message notification')
        ) return false;
        return true;
    });

    const groups = groupAndNestSubmissions(categorySubs);
    const targetGroup = groups.find(g => g.nestedSubmissions.some(ns => ns.id === subId));
    return targetGroup ? targetGroup.nestedSubmissions : [parentSub];
}

function renderSubmissions(submissions, user) {
    const regularList = document.getElementById('submissionsList');
    const investigationList = document.getElementById('investigationList');
    const resolvedList = document.getElementById('resolvedList');
    if (!regularList || !investigationList || !resolvedList) return;

    let validSubs = submissions.filter(s => {
        if (s.status === 'spam' || s.reportedSpam === true) return false;
        const fromEmail = (s.submittedByEmail || '').toLowerCase();
        const fromName = (s.submittedByName || '').toLowerCase();
        const subject = (s.subject || '').toLowerCase();
        if (
            fromEmail === 'quarantine@e-purifier.com' || 
            fromEmail === 'postmaster@e-purifier.com' || 
            fromEmail.includes('e-purifier.com') || 
            fromName.includes('e-purifier support')
        ) {
            return false;
        }
        if (
            subject.includes('spam to recipient') || 
            subject.includes('quarantine@e-purifier.com') ||
            subject.includes('quarantine message notification')
        ) {
            return false;
        }
        return true;
    });
    
    const searchVal = (document.getElementById('submissionsSearchInput')?.value || '').toLowerCase().trim();
    if (searchVal) {
        validSubs = validSubs.filter(s => {
            const subject = (s.subject || '').toLowerCase();
            const body = (s.bodyPreview || '').toLowerCase();
            const fromEmail = (s.submittedByEmail || '').toLowerCase();
            const fromName = (s.submittedByName || '').toLowerCase();
            
            let tipName = '';
            let tipLastName = '';
            let tipEmail = '';
            let tipPhone = '';
            let tipLocation = '';
            let tipStory = '';
            if (s.tipoffDetails) {
                tipName = (s.tipoffDetails.name || '').toLowerCase();
                tipLastName = (s.tipoffDetails.lastName || '').toLowerCase();
                tipEmail = (s.tipoffDetails.email || '').toLowerCase();
                tipPhone = (s.tipoffDetails.phone || '').toLowerCase();
                tipLocation = (s.tipoffDetails.location || '').toLowerCase();
                tipStory = (s.tipoffDetails.story || '').toLowerCase();
            }
            
            return subject.includes(searchVal) ||
                   body.includes(searchVal) ||
                   fromEmail.includes(searchVal) ||
                   fromName.includes(searchVal) ||
                   tipName.includes(searchVal) ||
                   tipLastName.includes(searchVal) ||
                   tipEmail.includes(searchVal) ||
                   tipPhone.includes(searchVal) ||
                   tipLocation.includes(searchVal) ||
                   tipStory.includes(searchVal);
        });
    }
    
    const resolvedSubs = groupAndNestSubmissions(validSubs.filter(s => s.resolved === true));
    const investigationSubs = groupAndNestSubmissions(validSubs.filter(s => s.useful === true && s.resolved !== true));
    const regularSubs = groupAndNestSubmissions(validSubs.filter(s => s.useful !== true && s.resolved !== true));

    const canDelete = ['admin', 'super-admin', 'editorial-production'].includes(user?.role);

    const totalPagesRegular = Math.max(1, Math.ceil(regularSubs.length / PAGE_SIZE));
    if (currentPages.submissions > totalPagesRegular) currentPages.submissions = totalPagesRegular;
    if (currentPages.submissions < 1) currentPages.submissions = 1;

    if (regularSubs.length === 0) {
        regularList.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    No viewer submissions found.
                </td>
            </tr>
        `;
    } else {
        const startIndex = (currentPages.submissions - 1) * PAGE_SIZE;
        const slice = regularSubs.slice(startIndex, startIndex + PAGE_SIZE);
        regularList.innerHTML = slice.map((sub, index) => {
            const subject = sub.subject || '(No Subject)';
            const fromName = sub.submittedByName || sub.submittedByEmail || 'Unknown';
            const badgeHtml = sub.nestedCount > 1 ? `<span class="nested-count-badge" style="background: var(--bg-card); color: var(--primary); padding: 0.1rem 0.45rem; border-radius: 10px; font-size: 0.75rem; border: 1px solid var(--border); margin-left: 0.35rem; font-weight: 700;" title="${sub.nestedCount} submissions from this sender within 3 months">${sub.nestedCount}</span>` : '';
            
            let dateText = '—';
            if (sub.submittedAt) {
                const dateObj = sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt);
                dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
            }

            const deleteButtonHtml = canDelete
                ? `<button class="btn-admin-cell danger delete-submission-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">🗑️ Delete</button>`
                : '';

            return `
                <tr>
                    <td data-label="#" style="font-weight: 700; color: var(--text-muted); text-align: center;">${startIndex + index + 1}.</td>
                    <td data-label="Subject" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">
                        <a href="#" class="view-details-link" data-id="${sub.id}" style="color: var(--primary); text-decoration: none;" title="${subject.replace(/"/g, '&quot;')}">
                            ${subject}
                        </a>
                    </td>
                    <td data-label="From" style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;" title="${fromName} (${sub.submittedByEmail || ''})">
                        <strong>${fromName}</strong>${badgeHtml}
                    </td>
                    <td data-label="Date Received" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${dateText}</td>
                    <td data-label="Actions" style="text-align: center;">
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                            <button class="btn-admin-cell secondary view-details-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">📄 View</button>
                            ${deleteButtonHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const regPagination = document.getElementById('submissionsPagination');
    if (regPagination) {
        regPagination.style.display = regularSubs.length <= PAGE_SIZE ? 'none' : 'block';
        regPagination.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 500px; margin: 1rem auto 0 auto; gap: 1rem;">
                <button class="btn-soft" ${currentPages.submissions === 1 ? 'disabled' : ''} onclick="window.changePage('submissions', -1)">&larr; Previous</button>
                <span style="font-weight: 600; font-size: 0.8rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.submissions} of ${totalPagesRegular}</span>
                <button class="btn-soft" ${currentPages.submissions === totalPagesRegular ? 'disabled' : ''} onclick="window.changePage('submissions', 1)">Next &rarr;</button>
            </div>
        `;
    }

    const totalPagesInvestigation = Math.max(1, Math.ceil(investigationSubs.length / PAGE_SIZE));
    if (currentPages.investigation > totalPagesInvestigation) currentPages.investigation = totalPagesInvestigation;
    if (currentPages.investigation < 1) currentPages.investigation = 1;

    if (investigationSubs.length === 0) {
        investigationList.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No stories currently under investigation.
                </td>
            </tr>
        `;
    } else {
        const startIndex = (currentPages.investigation - 1) * PAGE_SIZE;
        const slice = investigationSubs.slice(startIndex, startIndex + PAGE_SIZE);
        investigationList.innerHTML = slice.map((sub, index) => {
            const subject = sub.subject || '(No Subject)';
            const fromName = sub.submittedByName || sub.submittedByEmail || 'Unknown';
            const badgeHtml = sub.nestedCount > 1 ? `<span class="nested-count-badge" style="background: var(--bg-card); color: var(--primary); padding: 0.1rem 0.45rem; border-radius: 10px; font-size: 0.75rem; border: 1px solid var(--border); margin-left: 0.35rem; font-weight: 700;" title="${sub.nestedCount} submissions from this sender within 3 months">${sub.nestedCount}</span>` : '';
            const actionedByFirstName = sub.actionedBy ? (sub.actionedBy.name || '').split(' ')[0] : '—';
            
            let dateText = '—';
            if (sub.submittedAt) {
                const dateObj = sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt);
                dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
            }

            const deleteButtonHtml = canDelete
                ? `<button class="btn-admin-cell danger delete-submission-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">🗑️ Delete</button>`
                : '';
            
            const resolveButtonHtml = canDelete
                ? `<button class="btn-admin-cell success resolve-submission-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">✅ Resolve</button>`
                : '';

            return `
                <tr>
                    <td data-label="#" style="font-weight: 700; color: var(--text-muted); text-align: center;">${startIndex + index + 1}.</td>
                    <td data-label="Actioned By" style="text-align: center; color: var(--text); font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${actionedByFirstName}</td>
                    <td data-label="Subject" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">
                        <a href="#" class="view-details-link" data-id="${sub.id}" style="color: var(--primary); text-decoration: none;" title="${subject.replace(/"/g, '&quot;')}">
                            ${subject}
                        </a>
                    </td>
                    <td data-label="From" style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;" title="${fromName} (${sub.submittedByEmail || ''})">
                        <strong>${fromName}</strong>${badgeHtml}
                    </td>
                    <td data-label="Date Received" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${dateText}</td>
                    <td data-label="Actions" style="text-align: center;">
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                            <button class="btn-admin-cell secondary view-details-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">📄 View</button>
                            ${resolveButtonHtml}
                            ${deleteButtonHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const invPagination = document.getElementById('investigationPagination');
    if (invPagination) {
        invPagination.style.display = investigationSubs.length <= PAGE_SIZE ? 'none' : 'block';
        invPagination.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 500px; margin: 1rem auto 0 auto; gap: 1rem;">
                <button class="btn-soft" ${currentPages.investigation === 1 ? 'disabled' : ''} onclick="window.changePage('investigation', -1)">&larr; Previous</button>
                <span style="font-weight: 600; font-size: 0.8rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.investigation} of ${totalPagesInvestigation}</span>
                <button class="btn-soft" ${currentPages.investigation === totalPagesInvestigation ? 'disabled' : ''} onclick="window.changePage('investigation', 1)">Next &rarr;</button>
            </div>
        `;
    }

    const totalPagesResolved = Math.max(1, Math.ceil(resolvedSubs.length / PAGE_SIZE));
    if (currentPages.resolved > totalPagesResolved) currentPages.resolved = totalPagesResolved;
    if (currentPages.resolved < 1) currentPages.resolved = 1;

    if (resolvedSubs.length === 0) {
        resolvedList.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No resolved submissions.
                </td>
            </tr>
        `;
    } else {
        const startIndex = (currentPages.resolved - 1) * PAGE_SIZE;
        const slice = resolvedSubs.slice(startIndex, startIndex + PAGE_SIZE);
        resolvedList.innerHTML = slice.map((sub, index) => {
            const subject = sub.subject || '(No Subject)';
            const fromName = sub.submittedByName || sub.submittedByEmail || 'Unknown';
            const badgeHtml = sub.nestedCount > 1 ? `<span class="nested-count-badge" style="background: var(--bg-card); color: var(--primary); padding: 0.1rem 0.45rem; border-radius: 10px; font-size: 0.75rem; border: 1px solid var(--border); margin-left: 0.35rem; font-weight: 700;" title="${sub.nestedCount} submissions from this sender within 3 months">${sub.nestedCount}</span>` : '';
            const actionedByFirstName = sub.resolvedBy ? (sub.resolvedBy.name || '').split(' ')[0] : (sub.actionedBy ? (sub.actionedBy.name || '').split(' ')[0] : '—');
            
            let dateText = '—';
            if (sub.resolvedAt) {
                const dateObj = sub.resolvedAt._seconds ? new Date(sub.resolvedAt._seconds * 1000) : new Date(sub.resolvedAt);
                dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
            }

            const deleteButtonHtml = canDelete
                ? `<button class="btn-admin-cell danger delete-submission-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">🗑️ Delete</button>`
                : '';

            return `
                <tr>
                    <td data-label="#" style="font-weight: 700; color: var(--text-muted); text-align: center;">${startIndex + index + 1}.</td>
                    <td data-label="Actioned By" style="text-align: center; color: var(--text); font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${actionedByFirstName}</td>
                    <td data-label="Subject" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">
                        <a href="#" class="view-details-link" data-id="${sub.id}" style="color: var(--primary); text-decoration: none;" title="${subject.replace(/"/g, '&quot;')}">
                            ${subject}
                        </a>
                    </td>
                    <td data-label="From" style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;" title="${fromName} (${sub.submittedByEmail || ''})">
                        <strong>${fromName}</strong>${badgeHtml}
                    </td>
                    <td data-label="Date Resolved" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0;">${dateText}</td>
                    <td data-label="Actions" style="text-align: center;">
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                            <button class="btn-admin-cell secondary view-details-btn" data-id="${sub.id}" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">📄 View</button>
                            ${deleteButtonHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const resPagination = document.getElementById('resolvedPagination');
    if (resPagination) {
        resPagination.style.display = resolvedSubs.length <= PAGE_SIZE ? 'none' : 'block';
        resPagination.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 500px; margin: 1rem auto 0 auto; gap: 1rem;">
                <button class="btn-soft" ${currentPages.resolved === 1 ? 'disabled' : ''} onclick="window.changePage('resolved', -1)">&larr; Previous</button>
                <span style="font-weight: 600; font-size: 0.8rem; color: var(--text-muted); min-width: 120px; text-align: center;">Page ${currentPages.resolved} of ${totalPagesResolved}</span>
                <button class="btn-soft" ${currentPages.resolved === totalPagesResolved ? 'disabled' : ''} onclick="window.changePage('resolved', 1)">Next &rarr;</button>
            </div>
        `;
    }

    // Attach listeners for view buttons
    document.querySelectorAll('.view-details-link, .view-details-btn').forEach(element => {
        element.removeEventListener('click', handleViewClick);
        element.addEventListener('click', handleViewClick);
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

    // Attach listeners for resolve buttons
    document.querySelectorAll('.resolve-submission-btn').forEach(element => {
        element.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = element.getAttribute('data-id');
            const sub = submissions.find(s => s.id === id);
            if (!sub) return;

            if (!confirm(`Are you sure you want to mark the story: "${sub.subject}" as Resolved?`)) return;

            try {
                const response = await fetchWithAuth('/api/viewer-submissions/resolve', {
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
                    throw new Error(result.error || 'Failed to resolve submission');
                }
            } catch (err) {
                alert("Resolve failed: " + err.message);
            }
        });
    });
}

async function handleViewClick(e) {
    e.preventDefault();
    const id = e.currentTarget.getAttribute('data-id');
    const viewBtn = e.currentTarget;
    const originalText = viewBtn.innerHTML;
    
    if (viewBtn.tagName === 'BUTTON') {
        viewBtn.disabled = true;
        viewBtn.innerHTML = '⌛ Load...';
    }
    
    try {
        const response = await fetchWithAuth(`/api/viewer-submissions/details?id=${encodeURIComponent(id)}`);
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        const result = await response.json();
        if (result.success && result.submission) {
            showDetails(result.submission, currentUserCache);
        } else {
            alert(result.error || 'Failed to load details.');
        }
    } catch (err) {
        console.error('Error fetching details:', err);
        alert('An error occurred while loading details. Please try again.');
    } finally {
        if (viewBtn.tagName === 'BUTTON') {
            viewBtn.disabled = false;
            viewBtn.innerHTML = originalText;
        }
    }
}

function showDetails(sub, user) {
    const nestedGroup = getNestedGroupForSubmission(sub.id);
    
    let tabsContainer = document.getElementById('modalTabsContainer');
    if (!tabsContainer) {
        tabsContainer = document.createElement('div');
        tabsContainer.id = 'modalTabsContainer';
        tabsContainer.style.cssText = `
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
            white-space: nowrap;
        `;
        
        const modalBody = document.querySelector('.modal-body');
        modalBody.parentNode.insertBefore(tabsContainer, modalBody);
    }
    
    function loadSingleSubDetails(activeSub) {
        document.getElementById('modalSubject').textContent = activeSub.subject || '(No Subject)';
        document.getElementById('modalFrom').textContent = `${activeSub.submittedByName || 'Unknown'} (${activeSub.submittedByEmail || 'No Email'})`;
        
        let dateText = '—';
        if (activeSub.submittedAt) {
            const dateObj = activeSub.submittedAt._seconds ? new Date(activeSub.submittedAt._seconds * 1000) : new Date(activeSub.submittedAt);
            dateText = dateObj.toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short' });
        }
        document.getElementById('modalDate').textContent = dateText;

        const dstvOriginTag = document.getElementById('dstvOriginTag');
        if (dstvOriginTag) {
            if ((activeSub.submittedByEmail || '').toLowerCase() === 'noreplymcleads@gmail.com') {
                dstvOriginTag.style.display = 'block';
            } else {
                dstvOriginTag.style.display = 'none';
            }
        }

        const actionedContainer = document.getElementById('modalActionedByContainer');
        const actionedEl = document.getElementById('modalActionedBy');
        if (activeSub.useful && activeSub.actionedBy) {
            actionedContainer.style.display = 'flex';
            actionedEl.textContent = activeSub.actionedBy.name;
        } else {
            actionedContainer.style.display = 'none';
            actionedEl.textContent = '';
        }

        const contactLink = document.getElementById('modalContactLink');
        if (contactLink) {
            contactLink.href = `mailto:${activeSub.submittedByEmail || ''}?subject=${encodeURIComponent(activeSub.subject || '')}`;
        }

        const bodyEl = document.getElementById('modalBody');
        const type = (activeSub.formType || 'email_submission').toLowerCase();

        if (type === 'dstv_tipoff' && activeSub.tipoffDetails) {
            const details = activeSub.tipoffDetails;
            bodyEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 0.85rem; font-size: 0.95rem; line-height: 1.5;">
                    <div style="border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                        <strong style="color: var(--primary);">Name:</strong> <span style="margin-left: 0.5rem; color: var(--text-main); font-weight: 500;">${details.name || '—'}</span>
                    </div>
                    <div style="border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                        <strong style="color: var(--primary);">Surname:</strong> <span style="margin-left: 0.5rem; color: var(--text-main); font-weight: 500;">${details.lastName || '—'}</span>
                    </div>
                    <div style="border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                        <strong style="color: var(--primary);">Email:</strong> <span style="margin-left: 0.5rem; color: var(--text-main); font-weight: 500;">${details.email || '—'}</span>
                    </div>
                    <div style="border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                        <strong style="color: var(--primary);">Contact Number:</strong> <span style="margin-left: 0.5rem; color: var(--text-main); font-weight: 500;">${details.phone || '—'}</span>
                    </div>
                    <div>
                        <strong style="color: var(--primary);">Summary:</strong>
                        <div style="margin-top: 0.5rem; background: var(--bg-card); border-left: 4px solid var(--primary); padding: 0.75rem 1rem; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-style: italic; color: var(--text-main); line-height: 1.6;">${details.story || '—'}</div>
                    </div>
                </div>
            `;
        } else {
            bodyEl.textContent = stripHtml(activeSub.body || '');
        }

        const attachmentsGroup = document.getElementById('modalAttachmentsGroup');
        const attachmentsList = document.getElementById('modalAttachmentsList');
        if (type !== 'dstv_tipoff' && Array.isArray(activeSub.attachments) && activeSub.attachments.length > 0) {
            attachmentsGroup.style.display = 'block';
            attachmentsList.innerHTML = activeSub.attachments.map(att => {
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

        const markUsefulBtn = document.getElementById('modalMarkUsefulBtn');
        if (markUsefulBtn) {
            markUsefulBtn.textContent = activeSub.useful ? '⭐ Remove from Useful' : '⭐ Mark as Useful';
            const newMarkUsefulBtn = markUsefulBtn.cloneNode(true);
            markUsefulBtn.parentNode.replaceChild(newMarkUsefulBtn, markUsefulBtn);
            newMarkUsefulBtn.addEventListener('click', async () => {
                try {
                    const targetUseful = !activeSub.useful;
                    const res = await fetchWithAuth('/api/viewer-submissions/mark-useful', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: activeSub.id, useful: targetUseful })
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
                        body: JSON.stringify({ id: activeSub.id })
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
    }

    if (nestedGroup.length > 1) {
        tabsContainer.style.display = 'flex';
        tabsContainer.innerHTML = nestedGroup.map((activeSub) => {
            const dateObj = activeSub.submittedAt._seconds ? new Date(activeSub.submittedAt._seconds * 1000) : new Date(activeSub.submittedAt);
            const dateText = dateObj.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
            const timeText = dateObj.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
            const tabSubject = activeSub.subject || '(No Subject)';
            const tabLabel = `${dateText} ${timeText}`;

            const isActive = activeSub.id === sub.id;
            const bgStyle = isActive ? 'var(--primary)' : 'var(--bg-light)';
            const colorStyle = isActive ? '#ffffff' : 'var(--text-main)';
            const borderStyle = isActive ? '1px solid var(--primary)' : '1px solid var(--border)';

            return `
                <button class="nested-sub-tab" data-sub-id="${activeSub.id}" style="
                    background: ${bgStyle};
                    color: ${colorStyle};
                    border: ${borderStyle};
                    padding: 0.4rem 0.8rem;
                    border-radius: var(--radius-sm);
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " title="${tabSubject.replace(/"/g, '&quot;')}">
                    ${tabLabel}
                </button>
            `;
        }).join('');

        tabsContainer.querySelectorAll('.nested-sub-tab').forEach(tabBtn => {
            tabBtn.addEventListener('click', (e) => {
                const selectedId = e.currentTarget.getAttribute('data-sub-id');
                const selectedSub = nestedGroup.find(s => s.id === selectedId);
                
                tabsContainer.querySelectorAll('.nested-sub-tab').forEach(btn => {
                    btn.style.background = 'var(--bg-light)';
                    btn.style.color = 'var(--text-main)';
                    btn.style.border = '1px solid var(--border)';
                });
                e.currentTarget.style.background = 'var(--primary)';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.border = '1px solid var(--primary)';

                loadSingleSubDetails(selectedSub);
            });
        });

    } else {
        tabsContainer.style.display = 'none';
        tabsContainer.innerHTML = '';
    }

    loadSingleSubDetails(sub);

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

function initSearch() {
    const searchInput = document.getElementById('submissionsSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const value = searchInput.value.trim();
        if (clearBtn) {
            clearBtn.style.display = value ? 'block' : 'none';
        }
        // When searching, reset page counters to 1
        currentPages.investigation = 1;
        currentPages.submissions = 1;
        currentPages.resolved = 1;
        
        renderSubmissions(globalSubmissionsCache, currentUserCache);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            
            currentPages.investigation = 1;
            currentPages.submissions = 1;
            currentPages.resolved = 1;
            renderSubmissions(globalSubmissionsCache, currentUserCache);
            searchInput.focus();
        });
    }
}
