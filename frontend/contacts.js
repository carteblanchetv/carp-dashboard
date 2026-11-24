// contacts.js
// Editorial Contacts Directory
// Version: 1.0.0
import { getIdToken, fetchWithAuth, checkAuth, isContactsDirectoryAuthorized } from './auth.js?v=5.1.1';

let allContacts = [];
let currentFilter = 'all';
let currentSearchQuery = '';
let currentViewingContact = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPhoneDisplay(phone) {
    if (!phone) return '—';
    const clean = phone.trim();
    return clean;
}

function getWhatsAppUrl(phone) {
    if (!phone) return '#';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0') && clean.length === 10) {
        clean = '27' + clean.slice(1);
    }
    return `https://wa.me/${clean}`;
}

async function initContactsPage() {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    try {
        const user = await checkAuth(true);
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // STRICT ACCESS CONTROL
        // Only Lezanne, Laura, Stenette, and Ofentse
        if (!isContactsDirectoryAuthorized(user)) {
            if (overlay) overlay.classList.remove('active');
            alert("Access restricted: The Editorial Contacts Directory is strictly reserved for Lezanne, Laura, Stenette, and Ofentse.");
            window.location.href = 'index.html';
            return;
        }

        if (window.auth && window.auth.initNavBar) {
            window.auth.initNavBar(user);
        }

        if (loadingText) loadingText.textContent = "Loading Contacts Directory...";
        await loadContacts();
    } catch (err) {
        console.error("Initialization error:", err);
        alert("Failed to load contacts directory.");
    } finally {
        if (overlay) overlay.classList.remove('active');
    }
}

async function loadContacts() {
    try {
        const res = await fetchWithAuth('/api/contacts');
        const data = await res.json();
        if (data.success) {
            allContacts = data.contacts || [];
            updateStats();
            renderTable();
        } else {
            console.error("Failed to load contacts:", data.error);
        }
    } catch (err) {
        console.error("Error fetching contacts:", err);
    }
}

function updateStats() {
    const total = allContacts.length;
    const experts = allContacts.filter(c => c.type === 'expert').length;
    const caseStudies = allContacts.filter(c => c.type === 'case_study').length;
    const licensors = allContacts.filter(c => c.type === 'footage_licensor').length;
    const releases = allContacts.filter(c => c.hasSignedRelease).length;

    const elTotal = document.getElementById('statTotalContacts');
    const elExperts = document.getElementById('statExperts');
    const elCase = document.getElementById('statCaseStudies');
    const elLicensors = document.getElementById('statLicensors');
    const elReleases = document.getElementById('statReleases');

    if (elTotal) elTotal.textContent = total;
    if (elExperts) elExperts.textContent = experts;
    if (elCase) elCase.textContent = caseStudies;
    if (elLicensors) elLicensors.textContent = licensors;
    if (elReleases) elReleases.textContent = releases;
}

function getFilteredContacts() {
    let list = [...allContacts];

    // Filter chip
    if (currentFilter === 'expert') {
        list = list.filter(c => c.type === 'expert');
    } else if (currentFilter === 'case_study') {
        list = list.filter(c => c.type === 'case_study');
    } else if (currentFilter === 'footage_licensor') {
        list = list.filter(c => c.type === 'footage_licensor');
    } else if (currentFilter === 'confidential') {
        list = list.filter(c => c.confidential);
    } else if (currentFilter === 'has_release') {
        list = list.filter(c => c.hasSignedRelease);
    }

    // Search query
    if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        list = list.filter(c => {
            const nameMatch = (c.fullName || `${c.name || ''} ${c.surname || ''}`).toLowerCase().includes(q);
            const phoneMatch = (c.phone || '').toLowerCase().includes(q);
            const emailMatch = (c.email || '').toLowerCase().includes(q);
            const roleMatch = (c.role || '').toLowerCase().includes(q);
            const orgMatch = (c.organization || '').toLowerCase().includes(q);
            const notesMatch = (c.notes || '').toLowerCase().includes(q);
            const storiesMatch = Array.isArray(c.stories) && c.stories.some(s => 
                (s.storyTitle || '').toLowerCase().includes(q) || 
                (s.commissionNumber || '').toLowerCase().includes(q) ||
                (s.producerName || '').toLowerCase().includes(q)
            );
            return nameMatch || phoneMatch || emailMatch || roleMatch || orgMatch || notesMatch || storiesMatch;
        });
    }

    // Sort alphabetically by full name
    list.sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || ''));
    return list;
}

function renderTable() {
    const tbody = document.getElementById('contactsTableBody');
    if (!tbody) return;

    const list = getFilteredContacts();

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">📇</div>
                    <div style="font-size: 1rem; font-weight: 700; color: var(--text-main);">No contacts found</div>
                    <p style="font-size: 0.85rem; margin: 0.25rem 0 1rem 0;">Try adjusting your search query or click "Sync from Stories" to populate from existing proposals.</p>
                    <button type="button" class="btn-primary-action" onclick="document.getElementById('btnAddContact').click()" style="margin: 0 auto;">+ Add First Contact</button>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const fullName = c.fullName || `${c.name || ''} ${c.surname || ''}`.trim() || 'Unnamed';
        const typeLabel = c.type === 'expert' ? '🎓 Expert' : (c.type === 'footage_licensor' ? '🎞️ Licensor' : '👥 Case Study');
        const typeClass = c.type === 'expert' ? 'type-expert' : (c.type === 'footage_licensor' ? 'type-footage_licensor' : 'type-case_study');

        // Phone & WhatsApp
        let phoneHtml = '—';
        if (c.phone) {
            const waUrl = getWhatsAppUrl(c.phone);
            phoneHtml = `
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <a href="tel:${escapeHtml(c.phone)}" class="contact-link" title="Call">📞 ${escapeHtml(c.phone)}</a>
                    <a href="${waUrl}" target="_blank" rel="noopener" title="Open WhatsApp" style="text-decoration: none; font-size: 0.9rem;">💬</a>
                </div>
            `;
        }

        // Email
        let emailHtml = '—';
        if (c.email) {
            emailHtml = `<a href="mailto:${escapeHtml(c.email)}" class="contact-link" title="Send Email">✉️ ${escapeHtml(c.email)}</a>`;
        }

        // Linked Stories
        let storiesHtml = '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>';
        if (Array.isArray(c.stories) && c.stories.length > 0) {
            storiesHtml = c.stories.slice(0, 3).map(s => {
                const title = s.storyTitle || 'Story';
                const comm = s.commissionNumber ? ` (#${s.commissionNumber})` : '';
                return `<span class="story-pill" title="${escapeHtml(title + comm)}">${escapeHtml(title.slice(0, 22))}${title.length > 22 ? '…' : ''}</span>`;
            }).join('');
            if (c.stories.length > 3) {
                storiesHtml += `<span class="story-pill" style="font-weight: 700;">+${c.stories.length - 3} more</span>`;
            }
        }

        return `
            <tr data-contact-id="${escapeHtml(c.id)}">
                <td>
                    <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
                        ${escapeHtml(fullName)}
                        ${c.confidential ? '<span class="confidential-badge" title="POPIA Protected / Confidential Whistleblower">🔒 Confidential</span>' : ''}
                    </div>
                    ${c.hasSignedRelease ? '<span class="release-badge-signed" style="margin-top: 0.2rem;" title="Signed legal release agreement on file">✅ Signed Release</span>' : ''}
                </td>
                <td style="text-align: center;">
                    <span class="type-badge ${typeClass}">${escapeHtml(typeLabel)}</span>
                </td>
                <td>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem;">${escapeHtml(c.role || '—')}</div>
                    ${c.organization ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(c.organization)}</div>` : ''}
                </td>
                <td>${phoneHtml}</td>
                <td>${emailHtml}</td>
                <td>${storiesHtml}</td>
                <td style="text-align: center;">
                    <div style="display: inline-flex; gap: 0.35rem;">
                        <button type="button" class="contact-action-btn btn-view" title="View Full Profile">👁️</button>
                        <button type="button" class="contact-action-btn btn-edit" title="Edit Contact">✏️</button>
                        <button type="button" class="contact-action-btn btn-delete" style="color: var(--danger);" title="Delete Contact">&times;</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach row events
    tbody.querySelectorAll('tr').forEach(tr => {
        const id = tr.getAttribute('data-contact-id');
        const contact = allContacts.find(c => c.id === id);
        if (!contact) return;

        const viewBtn = tr.querySelector('.btn-view');
        const editBtn = tr.querySelector('.btn-edit');
        const deleteBtn = tr.querySelector('.btn-delete');

        if (viewBtn) viewBtn.onclick = () => openViewModal(contact);
        if (editBtn) editBtn.onclick = () => openEditModal(contact);
        if (deleteBtn) deleteBtn.onclick = () => confirmDeleteContact(contact);
    });
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = "Add New Contact";
    document.getElementById('editContactId').value = "";
    document.getElementById('inputName').value = "";
    document.getElementById('inputSurname').value = "";
    document.getElementById('inputType').value = "expert";
    document.getElementById('inputRole').value = "";
    document.getElementById('inputOrganization').value = "";
    document.getElementById('inputPhone').value = "";
    document.getElementById('inputEmail').value = "";
    document.getElementById('inputStory').value = "";
    document.getElementById('inputNotes').value = "";
    document.getElementById('inputConfidential').checked = false;

    document.getElementById('contactModal').classList.add('active');
}

function openEditModal(c) {
    document.getElementById('modalTitle').textContent = "Edit Contact";
    document.getElementById('editContactId').value = c.id;
    document.getElementById('inputName').value = c.name || "";
    document.getElementById('inputSurname').value = c.surname || "";
    document.getElementById('inputType').value = c.type || "expert";
    document.getElementById('inputRole').value = c.role || "";
    document.getElementById('inputOrganization').value = c.organization || "";
    document.getElementById('inputPhone').value = c.phone || "";
    document.getElementById('inputEmail').value = c.email || "";
    document.getElementById('inputNotes').value = c.notes || "";
    document.getElementById('inputConfidential').checked = !!c.confidential;

    // First story preview if present
    const firstStory = Array.isArray(c.stories) && c.stories[0];
    document.getElementById('inputStory').value = firstStory ? `${firstStory.storyTitle || ''} (${firstStory.commissionNumber || ''})` : "";

    document.getElementById('contactModal').classList.add('active');
}

function openViewModal(c) {
    currentViewingContact = c;
    const nameEl = document.getElementById('viewContactName');
    const bodyEl = document.getElementById('viewContactBody');

    const fullName = c.fullName || `${c.name || ''} ${c.surname || ''}`.trim();
    if (nameEl) nameEl.textContent = fullName;

    let storiesListHtml = '<p style="color: var(--text-muted); font-size: 0.85rem;">No linked stories recorded.</p>';
    if (Array.isArray(c.stories) && c.stories.length > 0) {
        storiesListHtml = `
            <div style="display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.5rem;">
                ${c.stories.map(s => `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.75rem 1rem; border-radius: 8px;">
                        <div style="font-weight: 700; color: var(--primary);">${escapeHtml(s.storyTitle || 'Untitled Story')}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem;">
                            ${s.commissionNumber ? `<span>Comm #${escapeHtml(s.commissionNumber)}</span> • ` : ''}
                            ${s.producerName ? `<span>Producer: ${escapeHtml(s.producerName)}</span> • ` : ''}
                            ${s.role ? `<span>Role: ${escapeHtml(s.role)}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (bodyEl) {
        bodyEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border);">
                <div>
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Category</span>
                    <div style="font-weight: 600; font-size: 0.95rem; margin-top: 0.2rem;">${escapeHtml(c.type || 'General')}</div>
                </div>
                <div>
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Role / Title</span>
                    <div style="font-weight: 600; font-size: 0.95rem; margin-top: 0.2rem;">${escapeHtml(c.role || '—')}</div>
                </div>
                <div>
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Cell Nr</span>
                    <div style="font-weight: 600; font-size: 0.95rem; margin-top: 0.2rem;">${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color: var(--primary);">📞 ${escapeHtml(c.phone)}</a>` : '—'}</div>
                </div>
                <div>
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Email Address</span>
                    <div style="font-weight: 600; font-size: 0.95rem; margin-top: 0.2rem;">${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color: var(--primary);">✉️ ${escapeHtml(c.email)}</a>` : '—'}</div>
                </div>
                <div style="grid-column: span 2;">
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Organization</span>
                    <div style="font-weight: 600; font-size: 0.95rem; margin-top: 0.2rem;">${escapeHtml(c.organization || '—')}</div>
                </div>
                <div style="grid-column: span 2;">
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">POPIA / Confidentiality</span>
                    <div style="margin-top: 0.2rem;">
                        ${c.confidential ? '<span class="confidential-badge">🔒 CONFIDENTIAL SOURCE / WHISTLEBLOWER</span>' : '<span style="color: var(--text-muted); font-size: 0.85rem;">Standard Broadcast Participant</span>'}
                    </div>
                </div>
            </div>

            ${c.notes ? `
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.02); border: 1px solid var(--border); border-radius: 8px;">
                <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.35rem;">Editorial Notes</span>
                <div style="white-space: pre-wrap; font-size: 0.9rem;">${escapeHtml(c.notes)}</div>
            </div>` : ''}

            <div>
                <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--primary); font-weight: 800; display: block; margin-bottom: 0.5rem;">Associated Story History</span>
                ${storiesListHtml}
            </div>
        `;
    }

    document.getElementById('viewContactModal').classList.add('active');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editContactId').value;
    const name = document.getElementById('inputName').value.trim();
    const surname = document.getElementById('inputSurname').value.trim();
    const type = document.getElementById('inputType').value;
    const role = document.getElementById('inputRole').value.trim();
    const organization = document.getElementById('inputOrganization').value.trim();
    const phone = document.getElementById('inputPhone').value.trim();
    const email = document.getElementById('inputEmail').value.trim();
    const notes = document.getElementById('inputNotes').value.trim();
    const confidential = document.getElementById('inputConfidential').checked;
    const storyInput = document.getElementById('inputStory').value.trim();

    const saveBtn = document.getElementById('saveContactBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const payload = {
            name,
            surname,
            type,
            role,
            organization,
            phone,
            email,
            notes,
            confidential
        };

        if (storyInput) {
            payload.stories = [{ storyTitle: storyInput }];
        }

        let res;
        if (id) {
            res = await fetchWithAuth(`/api/contacts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetchWithAuth('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const data = await res.json();
        if (data.success) {
            document.getElementById('contactModal').classList.remove('active');
            await loadContacts();
        } else {
            alert(data.error || "Failed to save contact.");
        }
    } catch (err) {
        console.error("Save contact failed:", err);
        alert("Network error while saving contact.");
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function confirmDeleteContact(c) {
    const fullName = c.fullName || `${c.name || ''} ${c.surname || ''}`.trim();
    if (!confirm(`Are you sure you want to remove "${fullName}" from the contacts directory?`)) return;

    try {
        const res = await fetchWithAuth(`/api/contacts/${c.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            await loadContacts();
        } else {
            alert(data.error || "Failed to delete contact.");
        }
    } catch (err) {
        console.error("Delete failed:", err);
        alert("Network error while deleting contact.");
    }
}

async function triggerHarvest() {
    const syncBtn = document.getElementById('btnSyncContacts');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = "🔄 Scanning Stories...";
    }

    try {
        const res = await fetchWithAuth('/api/contacts/harvest', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert(`Sync complete! ${data.count} contacts updated from story proposals and legal releases.`);
            await loadContacts();
        } else {
            alert(data.error || "Harvest failed.");
        }
    } catch (err) {
        console.error("Harvest error:", err);
        alert("Failed to sync contacts from stories.");
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = `<span>🔄</span><span>Sync from Stories</span>`;
        }
    }
}

function exportContactsCsv() {
    const list = getFilteredContacts();
    if (list.length === 0) {
        alert("No contacts to export.");
        return;
    }

    const headers = ['Full Name', 'First Name', 'Surname', 'Category', 'Role', 'Organization', 'Cell Nr', 'Email', 'Confidential', 'Has Release', 'Stories'];
    const rows = list.map(c => [
        `"${(c.fullName || '').replace(/"/g, '""')}"`,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.surname || '').replace(/"/g, '""')}"`,
        `"${(c.type || '').replace(/"/g, '""')}"`,
        `"${(c.role || '').replace(/"/g, '""')}"`,
        `"${(c.organization || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        c.confidential ? 'YES' : 'NO',
        c.hasSignedRelease ? 'YES' : 'NO',
        `"${(Array.isArray(c.stories) ? c.stories.map(s => s.storyTitle).join('; ') : '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Carte_Blanche_Editorial_Contacts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initContactsPage();

    // Search
    const searchInput = document.getElementById('contactsSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value.trim();
            renderTable();
        });
    }

    // Filter Chips
    const chips = document.querySelectorAll('.chip-btn');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.getAttribute('data-filter') || 'all';
            renderTable();
        });
    });

    // Buttons
    const btnAdd = document.getElementById('btnAddContact');
    if (btnAdd) btnAdd.addEventListener('click', openAddModal);

    const btnSync = document.getElementById('btnSyncContacts');
    if (btnSync) btnSync.addEventListener('click', triggerHarvest);

    const btnExport = document.getElementById('btnExportContacts');
    if (btnExport) btnExport.addEventListener('click', exportContactsCsv);

    // Modal closes
    const closeContactModal = () => document.getElementById('contactModal').classList.remove('active');
    const closeViewModal = () => document.getElementById('viewContactModal').classList.remove('active');

    document.getElementById('closeContactModalBtn')?.addEventListener('click', closeContactModal);
    document.getElementById('cancelModalBtn')?.addEventListener('click', closeContactModal);
    document.getElementById('closeViewModalBtn')?.addEventListener('click', closeViewModal);
    document.getElementById('closeViewBtn')?.addEventListener('click', closeViewModal);

    document.getElementById('editFromViewBtn')?.addEventListener('click', () => {
        closeViewModal();
        if (currentViewingContact) openEditModal(currentViewingContact);
    });

    // Form
    document.getElementById('contactForm')?.addEventListener('submit', handleFormSubmit);
});
