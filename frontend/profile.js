import { fetchWithAuth, checkAuth } from './auth.js?v=5.1.1';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    
    // Initialize standardized Nav Bar
    window.auth.initNavBar(user);

    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');

    // Load current profile
    try {
        const res = await fetchWithAuth('/api/profile');
        const data = await res.json();
        if (data.success) {
            firstNameInput.value = data.profile.name || '';
            lastNameInput.value = data.profile.surname || '';
            emailInput.value = data.profile.email || '';
        }
    } catch (err) {
        console.error("Failed to load profile:", err);
    }

    // Handle Profile Update
    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveProfileBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const res = await fetchWithAuth('/api/update-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: firstNameInput.value.trim(),
                    surname: lastNameInput.value.trim()
                })
            });
            const result = await res.json();
            if (result.success) {
                showSuccess("Profile Updated", "Your personal information has been saved successfully.");
                // Update nav bar name if visible
                const nameDisplay = document.getElementById('userNameDisplay');
                if (nameDisplay) nameDisplay.textContent = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert("Error updating profile: " + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    // Handle Password Change
    passwordForm.onsubmit = async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;

        if (newPass !== confirmPass) {
            alert("Passwords do not match.");
            return;
        }

        if (newPass.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        if (!confirm("Are you sure you want to change your password? The SuperAdmin will be notified.")) return;

        const btn = document.getElementById('changePasswordBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Updating...';

        try {
            const res = await fetchWithAuth('/api/change-my-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: newPass })
            });
            const result = await res.json();
            if (result.success) {
                showSuccess("Password Updated", "Your password has been changed. An automated security notification has been sent to the SuperAdmin.");
                passwordForm.reset();
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert("Error updating password: " + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    function showSuccess(title, msg) {
        const dialog = document.getElementById('successDialog');
        document.getElementById('successDialogMessage').textContent = msg;
        dialog.classList.remove('hidden');
    }

    document.getElementById('dialogCloseBtn').onclick = () => {
        document.getElementById('successDialog').classList.add('hidden');
    };

    // --- PROPOSAL TABLES LOGIC ---
    const proposalsList = document.getElementById('proposalsList');
    const commissionedList = document.getElementById('commissionedList');
    const tableLoading = document.getElementById('tableLoading');

    function formatStoryDate(dateInput) {
        if (!dateInput) return '—';
        const date = dateInput._seconds ? new Date(dateInput._seconds * 1000) : new Date(dateInput);
        if (isNaN(date.getTime())) return '—';
        const day = date.getDate().toString().padStart(2, '0');
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return `${day} ${month} ${year}`;
    }

    async function loadProposals() {
        try {
            const res = await fetchWithAuth('/api/proposals');
            const data = await res.json();
            if (data.success) {
                renderProposals(data.proposals);
            } else {
                proposalsList.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">${data.error}</td></tr>`;
            }
        } catch (err) {
            console.error("Failed to load proposals:", err);
            proposalsList.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Failed to load proposals</td></tr>`;
        } finally {
            if (tableLoading) tableLoading.style.display = 'none';
        }
    }

    function renderProposals(proposals) {
        if (!proposals || proposals.length === 0) {
            proposalsList.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">No stories found.</td></tr>`;
            return;
        }

        // Sort by last updated (newest first)
        const sorted = [...proposals].sort((a, b) => {
            const dateA = a.lastUpdatedAt?._seconds || a.submittedAt?._seconds || 0;
            const dateB = b.lastUpdatedAt?._seconds || b.submittedAt?._seconds || 0;
            return dateB - dateA;
        });

        proposalsList.innerHTML = sorted.map((p, index) => {
            const lastMod = formatStoryDate(p.lastUpdatedAt || p.submittedAt);
            const delivery = p.acceptanceDetails?.deliveryDate ? formatStoryDate(p.acceptanceDetails.deliveryDate) : '—';
            const commNum = p.commissionNumber || '—';
            
            const status = (p.status || 'pending').toLowerCase();
            let statusLabel = status.toUpperCase();
            let statusClass = status;

            if (status === 'accepted' || status === 'paid') {
                statusLabel = 'COMMISSIONED';
                statusClass = 'accepted';
            }

            return `
                <tr>
                    <td data-label="#" style="text-align: center; font-weight: 600; color: var(--text-muted);">${index + 1}</td>
                    <td data-label="Status" style="text-align: center;"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td data-label="Story" class="col-title" style="font-weight: 600; color: var(--text-main);">${p.story_title || 'Untitled'}</td>
                    <td data-label="Comm #" style="text-align: center; font-weight: 700; color: var(--primary);">${commNum}</td>
                    <td data-label="Delivery" style="text-align: center; font-size: 0.85rem;">${delivery}</td>
                    <td data-label="Last Modified" style="text-align: center; font-size: 0.85rem; color: var(--text-muted);">${lastMod}</td>
                    <td data-label="Actions" style="text-align: center;">
                        <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                            ${status === 'accepted' || status === 'paid' 
                                ? `<a href="proposal.html?id=${p.id}&view=text" class="btn-admin-cell primary" style="text-decoration: none; font-size: 0.7rem; padding: 0.4rem 0.8rem;">Open Project</a>`
                                : `<a href="proposal.html?id=${p.id}" class="btn-admin-cell primary" style="text-decoration: none; font-size: 0.7rem; padding: 0.4rem 0.8rem;">Edit</a>
                                   <a href="proposal.html?id=${p.id}&view=text" class="btn-admin-cell secondary" style="text-decoration: none; font-size: 0.7rem; padding: 0.4rem 0.8rem;">View</a>`
                            }
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    loadProposals();
});
