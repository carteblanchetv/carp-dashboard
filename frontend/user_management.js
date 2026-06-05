import { getIdToken, fetchWithAuth, checkAuth, isSuperAdmin } from './auth.js?v=5.1.1';

checkAuth().then(user => {
    if (user) {
        if (!isSuperAdmin(user)) {
            window.location.href = 'index.html';
        } else {
            window.auth.initNavBar(user);
            
            if (user.role === 'admin' || user.role === 'super-admin') {
                const addUserSection = document.getElementById('addUserSection');
                if (addUserSection) addUserSection.style.display = 'block';
            }
        }
    }
});

const API_BASE = '/api/admin';

/**
 * SEARCH / FILTER USERS
 */
window.filterUsers = (query) => {
    const allUsers = window.allUsersCache || window.userCache || [];
    const q = query.trim().toLowerCase();
    const filtered = q
        ? allUsers.filter(u =>
            (u.name || '').toLowerCase().includes(q) ||
            (u.surname || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.role || '').toLowerCase().includes(q)
          )
        : allUsers;
    renderUsers(filtered, window.loggedInUserCache);
};

/**
 * GLOBAL ACTION HANDLERS
 */
window.openEditModal = (userId) => {
    const user = (window.userCache || []).find(u => u.id === userId);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editName').value = user.name || '';
    document.getElementById('editSurname').value = user.surname || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editRole').value = user.role || 'producer';

    // Populate Notifications
    const notifs = user.notifications || {
        insert_footage: false,
        episode_footage: false,
        control_sheet: false,
        proposal: false,
        proposal_commission: false,
        call_sheet: false
    };
    document.getElementById('notif_insert_footage').checked = notifs.insert_footage;
    document.getElementById('notif_episode_footage').checked = notifs.episode_footage;
    document.getElementById('notif_control_sheet').checked = notifs.control_sheet;
    document.getElementById('notif_proposal').checked = notifs.proposal;
    document.getElementById('notif_proposal_commission').checked = notifs.proposal_commission || false;
    document.getElementById('notif_call_sheet').checked = notifs.call_sheet || false;

    const notifSection = document.getElementById('notifPreferences');
    const roleVal = document.getElementById('editRole').value;
    if (roleVal === 'admin' || roleVal === 'super-admin' || roleVal === 'editorial-production') {
        notifSection.style.display = 'block';
    } else {
        notifSection.style.display = 'none';
    }

    document.getElementById('adminNewPassword').value = '';

    document.getElementById('editUserModal').classList.remove('hidden');
};

window.toggleUserStatus = async (id, email, currentStatus) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'disable' : 'enable'} ${email}?`)) return;
    await window.updateUser(id, { isEnabled: !currentStatus });
};

window.updateUser = async (id, updates) => {
    try {
        const res = await fetchWithAuth(`${API_BASE}/update-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, updates })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        await loadUsers();
    } catch (err) {
        showDialog("Update Failed", err.message, true);
        await loadUsers(); // Refresh to reset UI
    }
};


window.startMasquerade = (uid, name, role, email) => {
    if (!confirm(`Are you sure you want to masquerade as ${name}? You will see the site exactly as they do.`)) return;
    sessionStorage.setItem('cb_masquerade', JSON.stringify({ uid, name, role, email }));
    window.location.href = 'index.html';
};

window.resetUserPassword = async (userId, email) => {
    if (!confirm(`Are you sure you want to reset the password for ${email}? This will set a new temporary password.`)) return;
    
    try {
        const res = await fetchWithAuth(`${API_BASE}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, email })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        showDialog("Password Reset", `The password for ${email} has been reset successfully.\n\nNew Temporary Password: ${data.tempPassword}\n\nPlease share this with the user.`, false);
    } catch (err) {
        showDialog("Reset Failed", err.message, true);
    }
};

window.changeUserPassword = async () => {
    const userId = document.getElementById('editUserId').value;
    const email = document.getElementById('editEmail').value;
    const newPassword = document.getElementById('adminNewPassword').value.trim();

    if (!newPassword) {
        alert("Please enter a new password.");
        return;
    }

    if (newPassword.length < 6) {
        alert("Password must be at least 6 characters long.");
        return;
    }

    if (!confirm(`Are you sure you want to manually change the password for ${email}?`)) return;

    const btn = document.getElementById('adminSetPasswordBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        const res = await fetchWithAuth(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, email, newPassword })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showDialog("Password Changed", `The password for ${email} has been updated successfully.`, false);
        document.getElementById('adminNewPassword').value = '';
    } catch (err) {
        showDialog("Change Failed", err.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
};


/**
 * CORE LOGIC
 */
async function loadUsers() {
    const overlay = document.getElementById('loadingOverlay');
    const cacheKey = 'mgmt_user_list_cache';
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            const sortedCache = parsed.sort((a, b) => {
                const nameA = (a.name || '').toUpperCase();
                const nameB = (b.name || '').toUpperCase();
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });
            renderUsers(sortedCache);
        } catch (e) { localStorage.removeItem(cacheKey); }
    } else {
        overlay.style.display = 'flex';
    }
    
    try {
        const res = await fetchWithAuth(`${API_BASE}/users`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        const loggedInUser = await window.auth.checkAuth(false);
        window.loggedInUserCache = loggedInUser; // Persist for use in filterUsers

        if (loggedInUser) {
            // Populate Navigation
            const emailEl = document.getElementById('userEmailDisplay');
            if (emailEl) emailEl.textContent = loggedInUser.displayEmail || loggedInUser.email;
        }

        // Sort users alphabetically by First Name (case-insensitive)
        const sortedUsers = data.users.sort((a, b) => {
            const nameA = (a.name || '').toUpperCase();
            const nameB = (b.name || '').toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        renderUsers(sortedUsers, loggedInUser);
        console.log("[UserMgmt] Rendered with identity:", { 
            email: loggedInUser?.email, 
            role: loggedInUser?.role, 
            isSuperAdmin: loggedInUser?.role === 'super-admin' || loggedInUser?.email?.toLowerCase() === 'lezanne@carteblanche.co.za'
        });
        window.allUsersCache = sortedUsers; // Master list — never overwritten by filters
        localStorage.setItem(cacheKey, JSON.stringify(sortedUsers));
        
    } catch (err) {
        console.error("Failed to load users:", err);
        alert("Error loading users: " + err.message);
    } finally {
        overlay.style.display = 'none';
        window.userCache = window.userCache || []; // Global cache
    }
}

function renderUsers(users, loggedInUser) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';
    window.userCache = users; // Track current rendered list
    // allUsersCache is only set by loadUsers — never overwritten by filtered renders
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        const roles = [
            { id: 'producer', label: 'Producer' },
            { id: 'editorial-production', label: 'Editorial' },
            { id: 'admin', label: 'Admin' }
        ];

        const roleOptions = roles.map(r => 
            `<option value="${r.id}" ${user.role === r.id ? 'selected' : ''}>${r.label}</option>`
        ).join('');

        const statusLabel = user.isEnabled ? 
            '<span class="status-badge-modern active">ENABLED</span>' :
            '<span class="status-badge-modern disabled">DISABLED</span>';

        const isLezanne = user.email === 'lezanne@carteblanche.co.za';

        tr.innerHTML = `
            <td data-label="Name"><div class="user-cell"><span class="user-init">${(user.name||'N')[0]}</span> ${user.name || 'N/A'}</div></td>
            <td data-label="Surname">${user.surname || ''}</td>
            <td data-label="Email"><div style="color: var(--text-main); font-weight: 500;">${user.email}</div></td>
            <td data-label="Role" style="min-width: 160px;">
                <div class="select-wrapper">
                    <select class="role-select" data-id="${user.id}" ${isLezanne ? 'disabled' : ''}>
                        ${roleOptions}
                        ${isLezanne ? '<option value="super-admin" selected>SUPER ADMIN</option>' : ''}
                    </select>
                </div>
            </td>
            <td data-label="Notifications">
                <div class="notif-dropdown-container">
                    <button class="btn-admin-cell notif-trigger" data-id="${user.id}">
                        <span>🔔</span>
                        <span>${Object.values(user.notifications || {}).filter(v => v === true).length} Active</span>
                    </button>
                    <div class="notif-dropdown-menu hidden" id="menu-${user.id}" onclick="event.stopPropagation()">
                        <label class="notif-item">
                            <input type="checkbox" class="notif-toggle" data-id="${user.id}" data-type="proposal" ${user.notifications?.proposal ? 'checked' : ''}>
                            New Story Proposal
                        </label>
                        <label class="notif-item">
                            <input type="checkbox" class="notif-toggle" data-id="${user.id}" data-type="proposal_commission" ${user.notifications?.proposal_commission ? 'checked' : ''}>
                            New Commission
                        </label>
                        <label class="notif-item">
                            <input type="checkbox" class="notif-toggle" data-id="${user.id}" data-type="insert_footage" ${user.notifications?.insert_footage ? 'checked' : ''}>
                            Story Footage Declaration
                        </label>
                        <label class="notif-item">
                            <input type="checkbox" class="notif-toggle" data-id="${user.id}" data-type="episode_footage" ${user.notifications?.episode_footage ? 'checked' : ''}>
                            Master FDL
                        </label>
                        <label class="notif-item">
                            <input type="checkbox" class="notif-toggle" data-id="${user.id}" data-type="control_sheet" ${user.notifications?.control_sheet ? 'checked' : ''}>
                            FCC
                        </label>
                        <label class="notif-item">
                            <input type="checkbox" class="notif-toggle" data-id="${user.id}" data-type="call_sheet" ${user.notifications?.call_sheet ? 'checked' : ''}>
                            Submit Call Sheet
                        </label>
                    </div>
                </div>
            </td>
            <td data-label="Status" style="text-align: center;">${statusLabel}</td>
            <td data-label="Actions" style="min-width: 140px;">
                ${isLezanne ? '<span style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">System Protected</span>' : `
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                    <button class="btn-admin-cell" title="Edit Profile"
                        onclick="window.openEditModal('${user.id}')">
                        ✏️
                    </button>
                    <button class="btn-admin-cell ${user.isEnabled ? 'danger' : 'success'}" title="${user.isEnabled ? 'Disable' : 'Enable'}"
                        onclick="window.toggleUserStatus('${user.id}', '${user.email}', ${user.isEnabled})">
                        ${user.isEnabled ? '❌' : '✅'}
                    </button>
                    ${(loggedInUser && (loggedInUser.role === 'super-admin' || (loggedInUser.email && loggedInUser.email.toLowerCase().includes('lezanne')))) ? `
                    <button class="btn-admin-cell" title="Reset Password" style="background: #f59e0b; color: white; border: 1px solid #d97706; font-weight: bold;"
                        onclick="window.resetUserPassword('${user.id}', '${user.email}')">
                        🔑 RESET
                    </button>
                    <button class="btn-admin-cell" title="View As User" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.2);"
                        onclick="window.startMasquerade('${user.id}', '${user.name} ${user.surname}', '${user.role}', '${user.email}')">
                        👁️
                    </button>
                    ` : ''}
                </div>
                `}
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const newRole = e.target.value;
            await window.updateUser(id, { role: newRole });
        });
    });

    document.querySelectorAll('.notif-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const menu = document.getElementById(`menu-${id}`);
            
            // Close all other menus
            document.querySelectorAll('.notif-dropdown-menu').forEach(m => {
                if (m.id !== `menu-${id}`) m.classList.add('hidden');
            });
            
            menu.classList.toggle('hidden');
            e.stopPropagation();
        });
    });

    // Close on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.notif-dropdown-menu').forEach(m => m.classList.add('hidden'));
    });

    document.querySelectorAll('.notif-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const type = e.target.dataset.type;
            const checked = e.target.checked;
            
            // Find user in BOTH caches to be safe
            const user = (window.userCache || []).find(u => u.id === id);
            const masterUser = (window.allUsersCache || []).find(u => u.id === id);
            
            if (!user) return;
            
            // Update local state immediately
            user.notifications = user.notifications || {};
            user.notifications[type] = checked;
            if (masterUser) {
                masterUser.notifications = masterUser.notifications || {};
                masterUser.notifications[type] = checked;
            }
            
            // Update UI count
            const menu = e.target.closest('.notif-dropdown-menu');
            const trigger = menu.previousElementSibling;
            const activeCount = Object.values(user.notifications).filter(v => v === true).length;
            trigger.querySelector('span:last-child').textContent = `${activeCount} Active`;

            try {
                await window.updateUser(id, { notifications: user.notifications });
            } catch (err) {
                // Revert UI on failure
                e.target.checked = !checked;
                user.notifications[type] = !checked;
                showDialog("Save Failed", err.message, true);
            }
        });
    });
}

function showDialog(title, message, isError = false) {
    const dialog = document.getElementById('successDialog');
    const titleEl = dialog.querySelector('.dialog-title');
    const messageEl = document.getElementById('successDialogMessage');
    titleEl.textContent = title;
    messageEl.textContent = message;
    if (isError) titleEl.style.color = 'var(--danger)';
    else titleEl.style.color = 'var(--primary)';
    dialog.classList.remove('hidden');
    document.getElementById('dialogCloseBtn').onclick = () => dialog.classList.add('hidden');
}


// EDIT MODAL LISTENERS
document.getElementById('cancelEditBtn').onclick = () => document.getElementById('editUserModal').classList.add('hidden');
document.getElementById('adminSetPasswordBtn').onclick = () => window.changeUserPassword();

document.getElementById('editRole').addEventListener('change', (e) => {
    const role = e.target.value;
    const notifSection = document.getElementById('notifPreferences');
    if (role === 'admin' || role === 'super-admin' || role === 'editorial-production') {
        notifSection.style.display = 'block';
    } else {
        notifSection.style.display = 'none';
    }
});

document.getElementById('editUserForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const updates = {
        name: document.getElementById('editName').value.trim(),
        surname: document.getElementById('editSurname').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        role: document.getElementById('editRole').value,
        notifications: {
            insert_footage: document.getElementById('notif_insert_footage').checked,
            episode_footage: document.getElementById('notif_episode_footage').checked,
            control_sheet: document.getElementById('notif_control_sheet').checked,
            proposal: document.getElementById('notif_proposal').checked,
            proposal_commission: document.getElementById('notif_proposal_commission').checked,
            call_sheet: document.getElementById('notif_call_sheet').checked
        }
    };
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
        await window.updateUser(id, updates);
        document.getElementById('editUserModal').classList.add('hidden');
        showDialog("Profile Updated", "The user's profile information has been securely updated.");
    } catch (err) {
        showDialog("Update Failed", err.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
};

document.getElementById('addUserForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('addName').value.trim();
    const surname = document.getElementById('addSurname').value.trim();
    const email = document.getElementById('addEmail').value.trim();
    const role = document.getElementById('addRole').value;
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Adding...';
    
    try {
        const res = await fetchWithAuth(`${API_BASE}/create-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, surname, email, role })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        e.target.reset();
        showDialog("User Created", `A new profile for ${name} ${surname} has been added to the system.`);
        await loadUsers();
    } catch (err) {
        showDialog("Create Failed", err.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add User';
    }
};

// Start
loadUsers();



















