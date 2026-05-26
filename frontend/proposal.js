// proposal.js
// VERSION: 5.1.2
import { getIdToken, fetchWithAuth, checkAuth, isAdmin, isSuperAdmin, isEditorialProduction } from './auth.js?v=5.1.1';

function formatStoryDate(dateInput) {
    if (!dateInput) return '—';
    const date = dateInput._seconds ? new Date(dateInput._seconds * 1000) : new Date(dateInput);
    if (isNaN(date.getTime())) return '—';

    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
}


const urlParams = new URLSearchParams(window.location.search);
const isReadOnlyMode = urlParams.get('view') === 'text';

checkAuth(!isReadOnlyMode).then(user => {
    if (user) {
        window.auth.initNavBar(user);
    }
});

window.formatDoc = function(cmd, value) {
    if (cmd === 'createLink') {
        const url = prompt("Enter the URL:");
        if (url) document.execCommand(cmd, false, url);
    } else {
        document.execCommand(cmd, false, value);
    }
};

window.toggleSection = function(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('collapsed');
    }
};

window.toggleSummaryHtml = function() {
    const editor = document.getElementById('summaryEditor');
    const htmlEditor = document.getElementById('summaryHtmlEditor');
    const btn = document.getElementById('toggleHtmlBtn');
    const summaryTextarea = document.getElementById('summary');

    if (htmlEditor.classList.contains('hidden')) {
        // Switch to HTML mode
        htmlEditor.value = editor.innerHTML;
        editor.classList.add('hidden');
        htmlEditor.classList.remove('hidden');
        btn.textContent = 'ðŸ‘ï¸ VIEW';
        btn.style.color = 'var(--success)';
        htmlEditor.focus();
    } else {
        // Switch to Rich mode
        editor.innerHTML = htmlEditor.value;
        htmlEditor.classList.add('hidden');
        editor.classList.remove('hidden');
        btn.textContent = '</> HTML';
        btn.style.color = 'var(--primary)';
        summaryTextarea.value = editor.innerHTML; // Final sync
        editor.focus();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded: proposal.js');
    const form = document.getElementById('proposalForm');
    let loggedInUser = null;
    const presenterSelect = document.getElementById('presenter');
    const otherPresenterWrapper = document.getElementById('otherPresenterWrapper');
    const otherPresenterInput = document.getElementById('otherPresenter');
    const commNumBadgeTop = document.getElementById('commNumBadgeTop');

    function toggleOtherPresenter() {
        if (presenterSelect.value === 'Other') {
            otherPresenterWrapper.classList.remove('hidden');
            otherPresenterInput.setAttribute('required', 'true');
        } else {
            otherPresenterWrapper.classList.add('hidden');
            otherPresenterInput.removeAttribute('required');
        }
    }

    if (presenterSelect) {
        presenterSelect.onchange = toggleOtherPresenter;
    }

    const summaryEditor = document.getElementById('summaryEditor');
    const summaryHtmlEditor = document.getElementById('summaryHtmlEditor');
    const summaryTextarea = document.getElementById('summary');
    const summaryCount = document.getElementById('summaryCount');

    if (summaryEditor && summaryTextarea) {
        summaryEditor.addEventListener('input', () => {
            summaryTextarea.value = summaryEditor.innerHTML;
            // Update word count
            const text = summaryEditor.innerText.trim();
            const words = text ? text.split(/\s+/).length : 0;
            if (summaryCount) summaryCount.textContent = `${words} / 5000 words`;
        });

        // Handle keyboard shortcuts
        summaryEditor.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                let cmd = null;
                if (e.key.toLowerCase() === 'b') cmd = 'bold';
                else if (e.key.toLowerCase() === 'i') cmd = 'italic';
                else if (e.key.toLowerCase() === 'u') cmd = 'underline';
                
                if (cmd) {
                    e.preventDefault();
                    if (typeof window.formatDoc === 'function') {
                        window.formatDoc(cmd);
                    } else {
                        document.execCommand(cmd, false, null);
                        // Manually trigger input to sync textarea
                        summaryEditor.dispatchEvent(new Event('input'));
                    }
                }
            }
        });
    }

    if (summaryHtmlEditor && summaryTextarea) {
        summaryHtmlEditor.addEventListener('input', () => {
            summaryTextarea.value = summaryHtmlEditor.value;
            const temp = document.createElement('div');
            temp.innerHTML = summaryHtmlEditor.value;
            const text = temp.innerText.trim();
            const words = text ? text.split(/\s+/).length : 0;
            if (summaryCount) summaryCount.textContent = `${words} / 5000 words`;
        });
    }

    const csPresenterSelect = document.getElementById('cs_presenter_name');
    const csPresenterOtherWrapper = document.getElementById('csPresenterOtherWrapper');
    const csPresenterOtherInput = document.getElementById('cs_presenter_other');

    function toggleCsOtherPresenter() {
        if (csPresenterSelect.value === 'Other') {
            csPresenterOtherWrapper.classList.remove('hidden');
        } else {
            csPresenterOtherWrapper.classList.add('hidden');
        }
    }

    if (csPresenterSelect) {
        csPresenterSelect.onchange = toggleCsOtherPresenter;
    }
    const loadingOverlay = document.getElementById('loadingOverlay');

    const urlParams = new URLSearchParams(window.location.search);
    let proposalId = urlParams.get('id');
    const viewMode = urlParams.get('view'); 
    let isEditMode = !!proposalId;
    const isAdminView = viewMode === 'admin';
    const isPreviewView = viewMode === 'preview';
    const isTextView = viewMode === 'text';
    const isReadOnly = isAdminView || isPreviewView || isTextView;

    // --- STANDALONE CALL SHEET MODE ---
    function checkStandaloneMode() {
        console.log("[DEBUG] checkStandaloneMode - Hash:", window.location.hash);
        
        // Redirect legacy hash if needed
        if (window.location.hash === '#callSheetSection') {
            window.location.hash = '#CallSheet';
            return; // Hash change will trigger another event
        }

        const isCallSheetMode = window.location.hash === '#CallSheet';
        const proposalContent = document.getElementById('proposalFormContent');
        const callSheetSec = document.getElementById('callSheetSection');
        const mainTitle = document.getElementById('pageMainTitle');
        const csTitle = document.getElementById('pageCallSheetTitle');
        const productionBar = document.getElementById('productionPhaseBar');
        const form = document.getElementById('proposalForm');

        const backBtn = document.getElementById('backToProposalBtn');

        if (isCallSheetMode) {
            console.log("[DEBUG] Activating Call Sheet View");
            if (proposalContent) proposalContent.classList.add('hidden');
            if (form) form.classList.remove('hidden'); // Ensure parent form is visible
            if (callSheetSec) {
                callSheetSec.classList.remove('hidden');
                callSheetSec.style.borderTop = 'none';
                callSheetSec.style.marginTop = '0';
            }
            if (mainTitle) mainTitle.classList.add('hidden');
            if (csTitle) csTitle.classList.remove('hidden');
            if (backBtn) {
                console.log("[DEBUG] Unhiding Back to Proposal button");
                backBtn.classList.remove('hidden');
                backBtn.style.display = 'inline-block';
                backBtn.href = `proposal.html?id=${proposalId}&view=preview`;
            }
            if (productionBar) productionBar.classList.remove('hidden'); // Keep the tools visible
            const floatingBar = document.getElementById('floatingAdminBar');
            if (floatingBar) floatingBar.style.display = 'none'; // Hide admin bar in Call Sheet mode
            const assetsSec = document.getElementById('projectAssetsSection');
            if (assetsSec) assetsSec.classList.add('hidden');
            document.title = "Call Sheet - Carte Blanche";
        } else {
            console.log("[DEBUG] Activating Proposal View");
            if (proposalContent) proposalContent.classList.remove('hidden');
            if (callSheetSec) {
                callSheetSec.classList.add('hidden');
                callSheetSec.style.borderTop = '2px solid var(--success)';
                callSheetSec.style.marginTop = '3rem';
            }
            if (mainTitle) mainTitle.classList.remove('hidden');
            if (csTitle) csTitle.classList.add('hidden');
            if (backBtn) backBtn.classList.add('hidden');
            document.title = (isEditMode ? "Edit Proposal" : "New Proposal") + " - Carte Blanche";
        }
    }
    window.addEventListener('hashchange', checkStandaloneMode);
    checkStandaloneMode();

    console.log("[DEBUG] View Mode:", viewMode, "isAdmin:", isAdminView, "isReadOnly:", isReadOnly);

    // Global Error Handler for debugging
    window.onerror = function(msg, url, lineNo, columnNo, error) {
        const errorMsg = `Error: ${msg} at ${lineNo}:${columnNo}`;
        console.error(errorMsg);
        const content = document.getElementById('proposalSummary');
        if (content) {
            content.innerHTML = `<div style="padding: 2rem; color: var(--danger); background: rgba(220, 53, 69, 0.1); border: 1px solid var(--danger); border-radius: 8px;">
                <h3>âš ï¸ JavaScript Error Detected</h3>
                <p>${errorMsg}</p>
                <p><small>${url}</small></p>
            </div>`;
            content.classList.remove('hidden');
        }
        return false;
    };

    // --- AUTO-COLLAPSE FOR EDIT MODE ---
    if (isEditMode) {
        const sectionsToCollapse = ['budgetSection', 'caseStudiesSection', 'expertsSection', 'additionalInfoSection'];
        sectionsToCollapse.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('collapsed');
        });
    }

    // --- COUNTERS ---
    // --- COUNTERS ---
    const oneLiner = document.getElementById('one_liner');
    const oneLinerCount = document.getElementById('oneLinerCount');
    
    // summaryTextarea and summaryCount are already declared at the top

    oneLiner.addEventListener('input', () => {
        const count = oneLiner.value.length;
        oneLinerCount.textContent = `${count} / 300 characters`;
        oneLinerCount.style.color = count >= 300 ? 'var(--danger)' : 'var(--text-muted)';
    });

    if (summaryTextarea) {
        summaryTextarea.addEventListener('input', () => {
            const words = summaryTextarea.value.trim().split(/\s+/).filter(w => w.length > 0);
            const count = words.length;
            if (summaryCount) {
                summaryCount.textContent = `${count} / 5000 words`;
                summaryCount.style.color = count >= 5000 ? 'var(--danger)' : 'var(--text-muted)';
            }
        });
    }

    // --- TOGGLE BUDGET ---
    const budgetToggle = document.getElementById('extra_budget_toggle');
    const budgetContainer = document.getElementById('budgetItemsContainer');
    budgetToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            budgetContainer.classList.remove('hidden');
            if (document.getElementById('budgetTableBody').children.length === 0) addBudgetRow();
        } else {
            budgetContainer.classList.add('hidden');
        }
    });

    // --- SENSITIVITY TOGGLE ---
    const sensitivityToggle = document.getElementById('isSensitive');
    const reviewerWrapper = document.getElementById('reviewerSelectionWrapper');
    const reviewerList = document.getElementById('reviewerList');
    
    sensitivityToggle.addEventListener('change', async (e) => {
        if (e.target.checked) {
            reviewerWrapper.classList.remove('hidden');
            await loadReviewers();
        } else {
            reviewerWrapper.classList.add('hidden');
        }
    });

    // --- FOREIGN SPECIAL TOGGLE (Removed) ---
    const isForeignSpecial = false; 
    const sectionsToHide = ['budgetSection', 'caseStudiesSection', 'expertsSection', 'additionalInfoSection', 'sensitivitySection'];

    async function loadReviewers() {
        try {
            const token = await window.auth.getIdToken();
            const response = await fetch('/api/list-reviewers', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (result.success) {
                reviewerList.innerHTML = result.reviewers.map(r => `
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; padding: 0.5rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                        <input type="checkbox" name="permittedReviewers" value="${r.uid}">
                        <span>${r.name} ${r.surname} <small style="color:var(--text-muted);">(${r.role})</small></span>
                    </label>
                `).join('');
            }
        } catch (err) {
            reviewerList.innerHTML = '<div style="color:var(--danger);">Failed to load reviewers.</div>';
        }
    }

    // --- DYNAMIC TABLES ---
    function createGenericRow(tableId, html) {
        const tbody = document.getElementById(tableId);
        const tr = document.createElement('tr');
        tr.innerHTML = html + `<td><button type="button" class="remove-btn" title="Remove">&times;</button></td>`;
        tr.querySelector('.remove-btn').onclick = () => tr.remove();
        tbody.appendChild(tr);
        return tr;
    }

    function addBudgetRow() {
        return createGenericRow('budgetTableBody', `
            <td><input type="text" name="b_item[]" class="table-input" placeholder="Item..."></td>
            <td><input type="text" name="b_reason[]" class="table-input" placeholder="Reason..."></td>
            <td><input type="text" name="b_cost[]" class="table-input" placeholder="R 00.00"></td>
        `);
    }

    function addCaseStudyRow() {
        return createGenericRow('caseStudiesTableBody', `
            <td><input type="text" name="cs_name[]" class="table-input"></td>
            <td><input type="text" name="cs_surname[]" class="table-input"></td>
            <td><input type="text" name="cs_role[]" class="table-input"></td>
        `);
    }

    function addExpertRow() {
        return createGenericRow('expertsTableBody', `
            <td><input type="text" name="ex_name[]" class="table-input"></td>
            <td><input type="text" name="ex_surname[]" class="table-input"></td>
            <td><input type="text" name="ex_role[]" class="table-input"></td>
        `);
    }

    function addShootScheduleRow(data = {}) {
        return createGenericRow('shootScheduleTableBody', `
            <td><input type="date" name="ss_date[]" class="table-input" value="${data.date || ''}"></td>
            <td><input type="text" name="ss_time[]" class="table-input" value="${data.time || ''}" placeholder="e.g. 09:00"></td>
            <td><input type="text" name="ss_from[]" class="table-input" value="${data.from || ''}"></td>
            <td><input type="text" name="ss_to[]" class="table-input" value="${data.to || ''}"></td>
            <td><input type="text" name="ss_transport[]" class="table-input" value="${data.transport || ''}" placeholder="Car/Flight..."></td>
            <td><input type="text" name="ss_owner[]" class="table-input" value="${data.owner || ''}"></td>
            <td><input type="text" name="ss_driver[]" class="table-input" value="${data.driver || ''}"></td>
            <td><input type="text" name="ss_what[]" class="table-input" value="${data.what || ''}"></td>
        `);
    }

    function addMovementRow(data = {}) {
        return createGenericRow('movementOrderTableBody', `
            <td><input type="text" name="mo_time[]" class="table-input" value="${data.time || ''}" placeholder="e.g. 09:00"></td>
            <td><input type="text" name="mo_what[]" class="table-input" value="${data.what || ''}" placeholder="What's happening?"></td>
            <td><input type="text" name="mo_location[]" class="table-input" value="${data.location || ''}"></td>
        `);
    }

    function addCsCrewRow(data = {}) {
        const container = document.getElementById('dynamicAdditionalCrew');
        if (!container) return;
        const rowId = 'cs_crew_' + Date.now();
        const div = document.createElement('div');
        div.id = rowId;
        div.className = 'form-grid-3-col';
        div.style.marginTop = '1.5rem';
        div.style.borderTop = '1px dashed var(--border)';
        div.style.paddingTop = '1.5rem';
        div.innerHTML = `
            <div class="form-group">
                <label>Additional Name</label>
                <input type="text" name="cs_add_name[]" value="${data.name || ''}">
            </div>
            <div class="form-group">
                <label>Additional Phone Number</label>
                <input type="text" name="cs_add_phone[]" value="${data.phone || ''}" placeholder="+27 82 123 4567" oninput="this.value = formatSA(this.value)">
            </div>
            <div class="form-group">
                <label>Additional ID Number</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" name="cs_add_id[]" value="${data.id || ''}" placeholder="13 Digits" maxlength="13" minlength="13" pattern="\\d{13}" style="flex: 1;">
                    <button type="button" class="btn-soft" onclick="document.getElementById('${rowId}').remove()" style="padding: 0.5rem; color: var(--danger);">âœ•</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    }

    window.formatSA = function(val) {
        if (val.startsWith('0')) return '+27' + val.substring(1);
        return val;
    };

    const REGIONS = {
        "South Africa": ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"],
        "Botswana": ["Central", "Chobe", "Ghanzi", "Kgalagadi", "Kgatleng", "Kweneng", "North-East", "North-West", "South-East", "Southern"],
        "Eswatini": ["Hhohho", "Lubombo", "Manzini", "Shiselweni"],
        "Lesotho": ["Berea", "Butha-Buthe", "Leribe", "Mafeteng", "Maseru", "Mohale's Hoek", "Mokhotlong", "Qacha's Nek", "Quthing", "Thaba-Tseka"],
        "Mozambique": ["Cabo Delgado", "Gaza", "Inhambane", "Manica", "Maputo City", "Maputo Province", "Nampula", "Niassa", "Sofala", "Tete", "Zambezia"],
        "Namibia": ["Erongo", "Hardap", "//Karas", "Kavango East", "Kavango West", "Khomas", "Kunene", "Ohangwena", "Omaheke", "Omusati", "Oshana", "Oshikoto", "Otjozondjupa", "Zambezi"],
        "Zimbabwe": ["Bulawayo", "Harare", "Manicaland", "Mashonaland Central", "Mashonaland East", "Mashonaland West", "Masvingo", "Matabeleland North", "Matabeleland South", "Midlands"],
        "Angola": ["Bengo", "Benguela", "BiÃ©", "Cabinda", "Cuando Cubango", "Cuanza Norte", "Cuanza Sul", "Cunene", "Huambo", "HuÃ­la", "Luanda", "Lunda Norte", "Lunda Sul", "Malanje", "Moxico", "Namibe", "UÃ­ge", "Zaire"],
        "Zambia": ["Central", "Copperbelt", "Eastern", "Luapula", "Lusaka", "Muchinga", "Northern", "North-Western", "Southern", "Western"],
        "Malawi": ["Northern Region", "Central Region", "Southern Region"],
        "Kenya": ["Central", "Coast", "Eastern", "Nairobi", "North Eastern", "Nyanza", "Rift Valley", "Western"],
        "Nigeria": ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"],
        "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
        "United States": ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"],
        "Australia": ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Australian Capital Territory", "Northern Territory"]
    };

    const COMMON_COUNTRIES = Object.keys(REGIONS).concat(["Other"]);

    function addLocationRow(country = 'South Africa', province = '') {
        const container = document.getElementById('locationList');
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; gap: 0.5rem; width: 100%; align-items: center;';
        
        const countryContainer = document.createElement('div');
        countryContainer.style.flex = '1';
        countryContainer.style.display = 'flex';
        countryContainer.style.gap = '0.5rem';

        const countrySelect = document.createElement('select');
        countrySelect.style.flex = '1';
        countrySelect.style.padding = '0.75rem';
        countrySelect.style.border = '1px solid var(--border)';
        countrySelect.style.borderRadius = 'var(--radius-sm)';
        countrySelect.style.background = 'var(--bg-input)';
        countrySelect.style.color = 'var(--text)';
        
        const customCountryInput = document.createElement('input');
        customCountryInput.type = 'text';
        customCountryInput.placeholder = 'Specify Country';
        customCountryInput.style.flex = '1';
        customCountryInput.style.display = 'none';
        
        // Ensure name attributes are correct so form submission works
        function setCountryNames() {
            if (countrySelect.value === 'Other') {
                countrySelect.removeAttribute('name');
                customCountryInput.name = 'loc_country[]';
            } else {
                countrySelect.name = 'loc_country[]';
                customCountryInput.removeAttribute('name');
            }
        }

        let initialCountryIsCustom = country && !COMMON_COUNTRIES.includes(country);

        COMMON_COUNTRIES.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (country === c || (initialCountryIsCustom && c === 'Other')) {
                opt.selected = true;
            }
            countrySelect.appendChild(opt);
        });

        if (initialCountryIsCustom) {
            customCountryInput.value = country;
            customCountryInput.style.display = 'block';
        }

        countryContainer.appendChild(countrySelect);
        countryContainer.appendChild(customCountryInput);
        setCountryNames();

        const provinceContainer = document.createElement('div');
        provinceContainer.style.flex = '1';
        provinceContainer.style.display = 'flex';

        function updateProvinceInput(currentProv) {
            provinceContainer.innerHTML = '';
            
            let currentCountry = countrySelect.value;
            if (currentCountry === 'Other') {
                currentCountry = customCountryInput.value;
            }
            
            // Check if we have predefined regions for the exact selected/typed country
            const matchKey = Object.keys(REGIONS).find(k => k.toLowerCase() === currentCountry.trim().toLowerCase());
            
            if (matchKey) {
                const select = document.createElement('select');
                select.name = 'loc_province[]';
                select.style.flex = '1';
                select.style.padding = '0.75rem';
                select.style.border = '1px solid var(--border)';
                select.style.borderRadius = 'var(--radius-sm)';
                select.style.background = 'var(--bg-input)';
                select.style.color = 'var(--text)';
                
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'Select Province / State';
                defaultOption.disabled = true;
                defaultOption.selected = !currentProv;
                select.appendChild(defaultOption);

                const regionList = REGIONS[matchKey];
                regionList.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p;
                    opt.textContent = p;
                    if (currentProv === p) opt.selected = true;
                    select.appendChild(opt);
                });
                
                if (currentProv && !regionList.includes(currentProv)) {
                    const opt = document.createElement('option');
                    opt.value = currentProv;
                    opt.textContent = currentProv;
                    opt.selected = true;
                    select.appendChild(opt);
                }

                provinceContainer.appendChild(select);
            } else {
                const input = document.createElement('input');
                input.type = 'text';
                input.name = 'loc_province[]';
                input.value = currentProv;
                input.placeholder = 'Province / State (e.g. Gauteng)';
                input.style.flex = '1';
                input.style.width = '100%';
                provinceContainer.appendChild(input);
            }
        }

        countrySelect.addEventListener('change', () => {
            if (countrySelect.value === 'Other') {
                customCountryInput.style.display = 'block';
            } else {
                customCountryInput.style.display = 'none';
            }
            setCountryNames();
            updateProvinceInput('');
        });
        
        customCountryInput.addEventListener('input', () => {
            updateProvinceInput('');
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.style.cssText = 'margin-top: 0; padding: 0.2rem 0.5rem; min-width: 30px;';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => div.remove();

        div.appendChild(countryContainer);
        div.appendChild(provinceContainer);
        div.appendChild(removeBtn);

        updateProvinceInput(province);
        container.appendChild(div);
    }

    function addResearcherRow(name = '', surname = '') {
        const container = document.getElementById('researcherList');
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; gap: 0.5rem; width: 100%;';
        div.innerHTML = `
            <input type="text" name="res_name[]" value="${name}" placeholder="Name" style="flex: 1;">
            <input type="text" name="res_surname[]" value="${surname}" placeholder="Surname" style="flex: 1;">
            <button type="button" class="remove-btn" style="margin-top: 0; padding: 0.2rem 0.5rem; min-width: 30px;">&times;</button>
        `;
        div.querySelector('.remove-btn').onclick = () => div.remove();
        container.appendChild(div);
    }

    function addCameraRow(name = '', surname = '') {
        const container = document.getElementById('cameraList');
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; gap: 0.5rem; width: 100%;';
        div.innerHTML = `
            <input type="text" name="cam_name[]" value="${name}" placeholder="Name" style="flex: 1;">
            <input type="text" name="cam_surname[]" value="${surname}" placeholder="Surname" style="flex: 1;">
            <button type="button" class="remove-btn" style="margin-top: 0; padding: 0.2rem 0.5rem; min-width: 30px;">&times;</button>
        `;
        div.querySelector('.remove-btn').onclick = () => div.remove();
        container.appendChild(div);
    }

    function addCrewRow(name = '', surname = '', role = '') {
        const container = document.getElementById('crewList');
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; gap: 0.5rem; width: 100%;';
        div.innerHTML = `
            <input type="text" name="crew_name[]" value="${name}" placeholder="Name" style="flex: 1;">
            <input type="text" name="crew_surname[]" value="${surname}" placeholder="Surname" style="flex: 1;">
            <input type="text" name="crew_role[]" value="${role}" placeholder="Role" style="flex: 1;">
            <button type="button" class="remove-btn" style="margin-top: 0; padding: 0.2rem 0.5rem; min-width: 30px;">&times;</button>
        `;
        div.querySelector('.remove-btn').onclick = () => div.remove();
        container.appendChild(div);
    }

    document.getElementById('addBudgetBtn').onclick = addBudgetRow;
    document.getElementById('addCaseStudyBtn').onclick = addCaseStudyRow;
    document.getElementById('addExpertBtn').onclick = addExpertRow;
    document.getElementById('addLocationBtn').onclick = () => addLocationRow();
    document.getElementById('addResearcherBtn').onclick = () => addResearcherRow();
    document.getElementById('addCameraBtn').onclick = () => addCameraRow();
    document.getElementById('addCrewBtn').onclick = () => addCrewRow();
    
    const addMovementRowBtn = document.getElementById('addMovementRowBtn');
    if (addMovementRowBtn) addMovementRowBtn.onclick = () => addMovementRow();
    
    const addCsCrewBtn = document.getElementById('addCsCrewBtn');
    if (addCsCrewBtn) addCsCrewBtn.onclick = () => addCsCrewRow();

    // Phone Formatting Listeners
    ['cs_producer_phone', 'cs_presenter_phone', 'cs_dop_phone', 'cs_cam_assistant_phone', 'cs_security_phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = (e) => { e.target.value = formatSA(e.target.value); };
    });

    // File Upload Listeners
    const travelFlightFile = document.getElementById('travel_flight_file');
    const travelTransFile = document.getElementById('travel_trans_file');

    const handleCallSheetFileUpload = async (inputEl, pathHiddenEl, nameHiddenEl, displayEl) => {
        const file = inputEl.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            alert('Only PDF files are allowed.');
            inputEl.value = '';
            return;
        }

        try {
            if (loadingOverlay) loadingOverlay.classList.add('active');
            document.getElementById('loadingHeading').textContent = 'Uploading File...';
            document.getElementById('loadingSubtext').textContent = 'Please wait while your PDF is uploaded and encrypted.';

            const formData = new FormData();
            formData.append('file', file);

            const token = await window.auth.getIdToken();
            const response = await fetch('/api/upload-call-sheet-file', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const result = await response.json();
            if (result.success) {
                pathHiddenEl.value = result.storagePath;
                nameHiddenEl.value = result.filename;
                displayEl.textContent = `✓ ${result.filename}`;
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('File upload failed:', err);
            alert('Upload failed: ' + err.message);
            inputEl.value = '';
        } finally {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        }
    };

    if (travelFlightFile) {
        travelFlightFile.addEventListener('change', () => {
            handleCallSheetFileUpload(
                travelFlightFile,
                document.getElementById('travel_flight_file_path'),
                document.getElementById('travel_flight_filename'),
                document.getElementById('travel_flight_file_name_display')
            );
        });
    }

    if (travelTransFile) {
        travelTransFile.addEventListener('change', () => {
            handleCallSheetFileUpload(
                travelTransFile,
                document.getElementById('travel_trans_file_path'),
                document.getElementById('travel_trans_filename'),
                document.getElementById('travel_trans_file_name_display')
            );
        });
    }

    // Initial rows
    if (!isEditMode) {
        addCaseStudyRow();
        addExpertRow();
        addLocationRow(); // Default one location
        addResearcherRow();
        addCameraRow();
        
        form.classList.remove('hidden');
    }

    // --- ROLE BASED UI & AUTH ---
    checkAuth(false).then(user => {
        loggedInUser = user;
        if (user) {
            const canSeeFS = isSuperAdmin(user) || isAdmin(user) || isEditorialProduction(user);
            const fsToggle = document.getElementById('foreignSpecialToggleWrapper');
            if (canSeeFS && fsToggle) fsToggle.classList.remove('hidden');
            
            const toggleHtmlBtn = document.getElementById('toggleHtmlBtn');
            if ((isAdmin(user) || isSuperAdmin(user)) && toggleHtmlBtn) {
                toggleHtmlBtn.classList.remove('hidden');
            }
        }
        if (isEditMode) loadProposalData();
    });

    // --- DATA LOADING (EDIT MODE) ---
    async function loadProposalData() {
        if (!isEditMode) return;
        try {
            const heading = (isPreviewView || isAdminView) ? "Loading Proposal..." : "Loading Draft...";
            document.getElementById('loadingHeading').textContent = heading;
            document.getElementById('loadingSubtext').textContent = "Retrieving your saved data...";
            loadingOverlay.classList.add('active');

            // Safety timeout: remove overlay after 10s no matter what
            setTimeout(() => {
                if (loadingOverlay.classList.contains('active')) {
                    console.warn("[DEBUG] Loading safety timeout triggered.");
                    loadingOverlay.classList.remove('active');
                }
            }, 10000);

            const response = await fetchWithAuth(`/api/get-submission/${proposalId}?_cb=${Date.now()}`);
            const result = await response.json();
            console.log("[DEBUG] loadProposalData result:", result);
            if (result.success) {
                const sub = result.submission;
                window.currentProposal = sub;
                const linkedAssets = result.linkedAssets || [];
                console.log("[DEBUG] Submission loaded:", sub);
                console.log("[DEBUG] Linked assets:", linkedAssets);

                // Render Assets
                renderProjectAssets(linkedAssets, sub);
                
                const isCallSheetMode = window.location.hash === '#CallSheet';
                if (isReadOnly) {
                    if (isCallSheetMode) {
                        console.log("[DEBUG] Entering Read-Only Call Sheet mode");
                        showCallSheetPreview(sub, linkedAssets);
                        return;
                    } else {
                        console.log("[DEBUG] Entering Read-Only (Preview) mode");
                        showProposalPreview(sub, linkedAssets);
                        return;
                    }
                }
                // Show form for editing
                form.classList.remove('hidden');

                // Setup Story Deliverables Bar
                const isCommissioned = (sub.status || '').toLowerCase() === 'accepted' || (sub.status || '').toLowerCase() === 'paid';
                setupDeliverablesBar(sub, linkedAssets, isReadOnly);

                // Update Header to Story Title (with Commission # if available)
                if (sub.story_title) {
                    const headerH1 = document.querySelector('.form-header h1');
                    if (headerH1) {
                        const commNumText = sub.commissionNumber ? ` - #${sub.commissionNumber}` : '';
                        headerH1.textContent = sub.story_title + commNumText;
                    }
                }
                
                // Form Fields
                form.story_title.value = sub.story_title;
                form.one_liner.value = sub.one_liner;
                if (summaryEditor) {
                    summaryEditor.innerHTML = sub.summary || '';
                    summaryTextarea.value = sub.summary || '';
                    if (summaryHtmlEditor) summaryHtmlEditor.value = sub.summary || '';
                } else {
                    form.summary.value = sub.summary;
                }

                // Locations
                const locContainer = document.getElementById('locationList');
                if (locContainer) {
                    locContainer.innerHTML = '';
                    const locs = sub.locations || (sub.country ? [{ country: sub.country, province: sub.province }] : []);
                    if (locs.length > 0) {
                        locs.forEach(l => addLocationRow(l.country || '', l.province || ''));
                    } else {
                        addLocationRow();
                    }
                }
                
                // Radios
                const setToggle = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.checked = (val === 'yes');
                };
                setToggle('extra_budget_toggle', sub.extra_budget);
                if (sub.extra_budget === 'yes') budgetContainer.classList.remove('hidden');
                setToggle('third_party', sub.third_party);
                setToggle('hidden_camera', sub.hidden_camera);
                setToggle('legal_req', sub.legal_req);
                
                const fsToggle = document.getElementById('isForeignSpecial');
                if (fsToggle && sub.isForeignSpecial) {
                    fsToggle.checked = true;
                    fsToggle.dispatchEvent(new Event('change'));
                }

                // Counters
                oneLiner.dispatchEvent(new Event('input'));
                if (summaryTextarea) summaryTextarea.dispatchEvent(new Event('input'));

                // Tables
                const populateTable = (tableId, data, addFn, mapFn) => {
                    const tbody = document.getElementById(tableId);
                    tbody.innerHTML = '';
                    if (data && data.length > 0) {
                        data.forEach(item => {
                            const row = addFn();
                            mapFn(row, item);
                        });
                    }
                };

                populateTable('budgetTableBody', sub.budgetItems, addBudgetRow, (row, item) => {
                    row.querySelector('[name="b_item[]"]').value = item.item;
                    row.querySelector('[name="b_reason[]"]').value = item.reason;
                    row.querySelector('[name="b_cost[]"]').value = item.cost;
                });

                populateTable('caseStudiesTableBody', sub.caseStudies, addCaseStudyRow, (row, item) => {
                    row.querySelector('[name="cs_name[]"]').value = item.name;
                    row.querySelector('[name="cs_surname[]"]').value = item.surname;
                    row.querySelector('[name="cs_role[]"]').value = item.role;
                });

                populateTable('expertsTableBody', sub.experts, addExpertRow, (row, item) => {
                    row.querySelector('[name="ex_name[]"]').value = item.name;
                    row.querySelector('[name="ex_surname[]"]').value = item.surname;
                    row.querySelector('[name="ex_role[]"]').value = item.role;
                });

                // Phase 2 visibility
                if (isCommissioned) {
                    document.getElementById('phase2Container').classList.remove('hidden');
                    // Commission number is now part of the title - hide the separate badge
                    if (commNumBadgeTop) commNumBadgeTop.classList.add('hidden');
                    const sensSection = document.getElementById('sensitivitySection');
                    if (sensSection) sensSection.classList.add('hidden');
                    document.getElementById('displayCommNum').textContent = sub.commissionNumber;
                    form.submitBtn.textContent = 'Update Details';
                    
                    if (sub.details) {
                        const standardPresenters = ['Catherine Rice', 'Claire Mawisa', 'Erin Bates', 'Govan Whittles', 'Lourensa Eckard', 'Macfarlane Moleli', 'Masa Kekana', 'Nickolaus Bauer'];
                        if (sub.details.presenter) {
                            if (standardPresenters.includes(sub.details.presenter)) {
                                form.presenter.value = sub.details.presenter;
                                otherPresenterWrapper.classList.add('hidden');
                            } else {
                                form.presenter.value = 'Other';
                                otherPresenterInput.value = sub.details.presenter;
                                otherPresenterWrapper.classList.remove('hidden');
                            }
                        }
                        
                        // Populate Researchers
                        const resList = document.getElementById('researcherList');
                        resList.innerHTML = '';
                        const researchers = Array.isArray(sub.details.researcher) ? sub.details.researcher : [sub.details.researcher || ''];
                        if (researchers.length === 0 || (researchers.length === 1 && !researchers[0])) {
                             addResearcherRow();
                        } else {
                             researchers.forEach(r => {
                                 if (typeof r === 'object' && r !== null) {
                                     addResearcherRow(r.name || '', r.surname || '');
                                 } else {
                                     addResearcherRow(r, ''); // Backward compatibility
                                 }
                             });
                        }

                        // Populate Cameras
                        const camList = document.getElementById('cameraList');
                        camList.innerHTML = '';
                        const cameras = Array.isArray(sub.details.camera) ? sub.details.camera : [sub.details.camera || ''];
                        if (cameras.length === 0 || (cameras.length === 1 && !cameras[0])) {
                            addCameraRow();
                        } else {
                            cameras.forEach(c => {
                                if (typeof c === 'object' && c !== null) {
                                    addCameraRow(c.name || '', c.surname || '');
                                } else {
                                    addCameraRow(c, ''); // Backward compatibility
                                }
                            });
                        }

                        // Single Person Fields (DOP, Sound, etc.)
                        const setSplitField = (fieldId, value) => {
                            const nameInput = document.getElementById(`${fieldId}_name`);
                            const surnameInput = document.getElementById(`${fieldId}_surname`);
                            if (!nameInput || !surnameInput) return;
                            
                            if (typeof value === 'object' && value !== null) {
                                nameInput.value = value.name || '';
                                surnameInput.value = value.surname || '';
                            } else {
                                nameInput.value = value || '';
                                surnameInput.value = ''; // Backward compatibility
                            }
                        };

                        setSplitField('camera_assistant', sub.details.camera_assistant);
                        setSplitField('dop', sub.details.dop);
                        setSplitField('sound', sub.details.sound);
                        setSplitField('offline_editor', sub.details.offline_editor);
                        setSplitField('online_editor', sub.details.online_editor);
                        setSplitField('audio_final_mix', sub.details.audio_final_mix);

                        // Populate Additional Crew
                        const crewList = document.getElementById('crewList');
                        if (crewList) {
                            crewList.innerHTML = '';
                            const crew = Array.isArray(sub.details.additionalCrew) ? sub.details.additionalCrew : [];
                            if (crew.length === 0) {
                                addCrewRow();
                            } else {
                                crew.forEach(c => addCrewRow(c.name || '', c.surname || '', c.role || ''));
                            }
                        }
                    }

                    // --- CALL SHEET POPULATION ---
                    document.getElementById('cs_comm_num').value = sub.commissionNumber || '';
                    document.getElementById('cs_story_name').value = sub.story_title || '';
                    
                    // Sync Presenter Options
                    const csPresenter = document.getElementById('cs_presenter_name');
                    if (csPresenter && presenterSelect) {
                        csPresenter.innerHTML = presenterSelect.innerHTML;
                    }

                    // Producer Name: Use current user if possible, fallback to submitter
                    let producerName = "";
                    if (loggedInUser) {
                        producerName = (loggedInUser.firstName && loggedInUser.lastName) ? `${loggedInUser.firstName} ${loggedInUser.lastName}` : loggedInUser.displayName;
                    }
                    if (!producerName) {
                        producerName = (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail;
                    }
                    document.getElementById('cs_producer_name').value = producerName || '';

                    const cs = (sub.details && sub.details.callSheet) || {};
                    const setVal = (id, val) => { if(document.getElementById(id)) document.getElementById(id).value = val || ''; };
                    
                    // Fallbacks for Crew from main Proposal if Call Sheet fields are empty/new
                    const propPresenter = sub.details ? sub.details.presenter : '';
                    let propDop = '';
                    if (sub.details && sub.details.dop) {
                        if (typeof sub.details.dop === 'object') {
                            propDop = `${sub.details.dop.name || ''} ${sub.details.dop.surname || ''}`.trim();
                        } else {
                            propDop = sub.details.dop;
                        }
                    }
                    let propAC = '';
                    if (sub.details && sub.details.camera_assistant) {
                        if (typeof sub.details.camera_assistant === 'object') {
                            propAC = `${sub.details.camera_assistant.name || ''} ${sub.details.camera_assistant.surname || ''}`.trim();
                        } else {
                            propAC = sub.details.camera_assistant;
                        }
                    }

                    const presenterVal = cs.presenter_name || propPresenter || '';
                    const dopNameVal = cs.dop_name || propDop || '';
                    const camAssistantNameVal = cs.cam_assistant_name || propAC || '';

                    setVal('cs_producer_phone', cs.producer_phone);
                    setVal('cs_producer_id', cs.producer_id);
                    
                    const savedPresenter = presenterVal;
                    const standardPresenters = ['Catherine Rice', 'Claire Mawisa', 'Erin Bates', 'Govan Whittles', 'Lourensa Eckard', 'Macfarlane Moleli', 'Masa Kekana', 'Nickolaus Bauer'];
                    if (savedPresenter) {
                        if (standardPresenters.includes(savedPresenter)) {
                            if (document.getElementById('cs_presenter_name')) document.getElementById('cs_presenter_name').value = savedPresenter;
                            if (document.getElementById('csPresenterOtherWrapper')) document.getElementById('csPresenterOtherWrapper').classList.add('hidden');
                        } else {
                            if (document.getElementById('cs_presenter_name')) document.getElementById('cs_presenter_name').value = 'Other';
                            if (document.getElementById('cs_presenter_other')) document.getElementById('cs_presenter_other').value = savedPresenter;
                            if (document.getElementById('csPresenterOtherWrapper')) document.getElementById('csPresenterOtherWrapper').classList.remove('hidden');
                        }
                    }
                    
                    setVal('cs_presenter_phone', cs.presenter_phone);
                    setVal('cs_presenter_id', cs.presenter_id);
                    setVal('cs_dop_name', dopNameVal);
                    setVal('cs_dop_phone', cs.dop_phone);
                    setVal('cs_dop_id', cs.dop_id);
                    setVal('cs_cam_assistant_name', camAssistantNameVal);
                    setVal('cs_cam_assistant_phone', cs.cam_assistant_phone);
                    setVal('cs_cam_assistant_id', cs.cam_assistant_id);
                    setVal('cs_security_status', cs.security_status || 'not_required');
                    setVal('cs_security_name', cs.security_name);
                    setVal('cs_security_phone', cs.security_phone);
                    setVal('cs_shoot_day', cs.shoot_day);
                    setVal('cs_shoot_date', cs.shoot_date);
                    
                    // Kit
                    if (cs.kit) {
                        setVal('kit_camera', cs.kit.camera);
                        setVal('kit_audio', cs.kit.audio);
                        setVal('kit_lenses', cs.kit.lenses);
                        setVal('kit_lighting', cs.kit.lighting);
                        setVal('kit_rigs', cs.kit.rigs);
                        setVal('kit_other', cs.kit.other);
                    }

                    // Travel
                    if (cs.travel) {
                        setVal('travel_flight_name', cs.travel.flight_name);
                        setVal('travel_flight_details', cs.travel.flight_details);
                        setVal('travel_flight_file_path', cs.travel.flight_file_path);
                        setVal('travel_flight_filename', cs.travel.flight_filename);
                        if (document.getElementById('travel_flight_file_name_display')) {
                            document.getElementById('travel_flight_file_name_display').textContent = cs.travel.flight_filename ? `✓ ${cs.travel.flight_filename}` : '';
                        }

                        setVal('travel_accom_name', cs.travel.accom_name);
                        setVal('travel_accom_location', cs.travel.accom_location);
                        setVal('travel_accom_from', cs.travel.accom_from);
                        setVal('travel_accom_to', cs.travel.accom_to);

                        setVal('travel_trans_name', cs.travel.trans_name);
                        setVal('travel_trans_from_loc', cs.travel.trans_from_loc);
                        setVal('travel_trans_to_loc', cs.travel.trans_to_loc);
                        setVal('travel_trans_from_date', cs.travel.trans_from_date);
                        setVal('travel_trans_to_date', cs.travel.trans_to_date);
                        setVal('travel_trans_from_time', cs.travel.trans_from_time);
                        setVal('travel_trans_to_time', cs.travel.trans_to_time);
                        setVal('travel_trans_file_path', cs.travel.trans_file_path);
                        setVal('travel_trans_filename', cs.travel.trans_filename);
                        if (document.getElementById('travel_trans_file_name_display')) {
                            document.getElementById('travel_trans_file_name_display').textContent = cs.travel.trans_filename ? `✓ ${cs.travel.trans_filename}` : '';
                        }
                    }

                    // Additional Crew
                    const csCrewContainer = document.getElementById('dynamicAdditionalCrew');
                    if (csCrewContainer) {
                        csCrewContainer.innerHTML = '';
                        if (cs.additionalCrew && cs.additionalCrew.length > 0) {
                            cs.additionalCrew.forEach(c => addCsCrewRow(c));
                        }
                    }

                    setVal('cs_story_description', cs.story_description);

                    // Populate Movement Order Table
                    const ssBody = document.getElementById('movementOrderTableBody');
                    if (ssBody) {
                        ssBody.innerHTML = '';
                        if (cs.movementOrder && cs.movementOrder.length > 0) {
                            cs.movementOrder.forEach(row => addMovementRow(row));
                        } else {
                            for (let i = 0; i < 5; i++) addMovementRow();
                        }
                    }

                    // Always ensure at least one row exists if empty after loading
                    if (document.getElementById('researcherList').children.length === 0) addResearcherRow();
                    if (document.getElementById('cameraList').children.length === 0) addCameraRow();
                    if (document.getElementById('crewList').children.length === 0) addCrewRow();
                }
            } else {
                // If the API call itself was not successful
                throw new Error(result.error || "Failed to load proposal data.");
            }
        } catch (err) {
            console.error("Load failed:", err);
            const content = document.getElementById('proposalSummary');
            if (content) {
                content.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--danger); background: rgba(220, 53, 69, 0.05); border: 1px solid var(--danger); border-radius: 8px; margin: 2rem 0;">
                    <h3 style="margin-bottom: 1rem;">âš ï¸ Failed to load proposal</h3>
                    <p>${err.message || 'An unexpected error occurred.'}</p>
                    <div style="margin-top: 1.5rem;">
                        <a href="index.html" class="btn-soft" style="text-decoration: none;">Return to Dashboard</a>
                    </div>
                </div>`;
                content.classList.remove('hidden');
            }
            document.getElementById('proposalForm').classList.add('hidden');
        } finally {
            loadingOverlay.classList.remove('active');
        }
    }

    // if (isEditMode) loadProposalData(); // Moved to checkAuth.then

    // --- GATHER DATA ---
    function getProposalData() {
        // Force sync rich editor to textarea before gathering data
        if (summaryEditor && summaryTextarea) {
            summaryTextarea.value = summaryEditor.innerHTML;
        }
        const formData = new FormData(form);
        const data = {
            story_title: formData.get('story_title'),
            show: formData.get('show'),
            one_liner: formData.get('one_liner'),
            summary: summaryEditor ? summaryEditor.innerHTML : (formData.get('summary') || ''),
            extra_budget: (document.getElementById('extra_budget_toggle')?.checked) ? 'yes' : 'no',
            locations: (() => {
                const countries = Array.from(document.querySelectorAll('[name="loc_country[]"]')).map(i => i.value);
                const provinces = Array.from(document.querySelectorAll('[name="loc_province[]"]')).map(i => i.value);
                return countries.map((c, i) => ({ country: c, province: provinces[i] })).filter(l => l.country || l.province);
            })(),
            third_party: (document.getElementById('third_party')?.checked) ? 'yes' : 'no',
            hidden_camera: (document.getElementById('hidden_camera')?.checked) ? 'yes' : 'no',
            legal_req: (document.getElementById('legal_req')?.checked) ? 'yes' : 'no',
            isSensitive: document.getElementById('isSensitive')?.checked || false,
            isForeignSpecial: document.getElementById('isForeignSpecial')?.checked || false,
            permittedUids: Array.from(document.querySelectorAll('input[name="permittedReviewers"]:checked')).map(cb => cb.value),
            budgetItems: [],
            caseStudies: [],
            experts: []
        };

        // Grab budget items
        if (data.extra_budget === 'yes') {
            const items = formData.getAll('b_item[]');
            const reasons = formData.getAll('b_reason[]');
            const costs = formData.getAll('b_cost[]');
            items.forEach((item, i) => {
                if (item) data.budgetItems.push({ item, reason: reasons[i], cost: costs[i] });
            });
        }

        // Grab case studies
        const cs_names = formData.getAll('cs_name[]');
        const cs_surnames = formData.getAll('cs_surname[]');
        const cs_roles = formData.getAll('cs_role[]');
        cs_names.forEach((name, i) => {
            if (name) data.caseStudies.push({ name, surname: cs_surnames[i], role: cs_roles[i] });
        });

        // Grab experts
        const ex_names = formData.getAll('ex_name[]');
        const ex_surnames = formData.getAll('ex_surname[]');
        const ex_roles = formData.getAll('ex_role[]');
        ex_names.forEach((name, i) => {
            if (name) data.experts.push({ name, surname: ex_surnames[i], role: ex_roles[i] });
        });

        return data;
    }

    function gatherShootSchedule() {
        const dates = Array.from(document.querySelectorAll('input[name="ss_date[]"]')).map(i => i.value);
        const times = Array.from(document.querySelectorAll('input[name="ss_time[]"]')).map(i => i.value);
        const froms = Array.from(document.querySelectorAll('input[name="ss_from[]"]')).map(i => i.value);
        const tos = Array.from(document.querySelectorAll('input[name="ss_to[]"]')).map(i => i.value);
        const transports = Array.from(document.querySelectorAll('input[name="ss_transport[]"]')).map(i => i.value);
        const owners = Array.from(document.querySelectorAll('input[name="ss_owner[]"]')).map(i => i.value);
        const drivers = Array.from(document.querySelectorAll('input[name="ss_driver[]"]')).map(i => i.value);
        const whats = Array.from(document.querySelectorAll('input[name="ss_what[]"]')).map(i => i.value);

        return dates.map((date, i) => ({
            date,
            time: times[i],
            from: froms[i],
            to: tos[i],
            transport: transports[i],
            owner: owners[i],
            driver: drivers[i],
            what: whats[i]
        })).filter(row => row.date || row.what || row.from || row.to);
    }

    async function handleSubmissionSync(status) {
        const heading = document.getElementById('loadingHeading');
        const subtext = document.getElementById('loadingSubtext');
        
        if (heading) heading.textContent = status === 'draft' ? "Saving Draft..." : "Submitting Proposal...";
        if (subtext) subtext.textContent = status === 'draft' ? "Please wait while your draft is securely saved." : "Please wait, this might take a moment.";
        
        loadingOverlay.classList.add('active');
        const submitBtn = document.getElementById('submitBtn');
        const saveBtn = document.getElementById('saveDraftBtn');
        if (submitBtn) submitBtn.disabled = true;
        if (saveBtn) saveBtn.disabled = true;

        try {
            const data = getProposalData();
            data.status = status;
            if (proposalId) data.id = proposalId;

            const response = await fetchWithAuth('/api/submit-proposal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (result.success) {
                // Update URL and state if this is the first save for a draft
                if (result.id && !proposalId) {
                    proposalId = result.id;
                    isEditMode = true;
                    window.history.replaceState({}, '', `proposal.html?id=${proposalId}`);
                }

                const dialog = document.getElementById('successDialog');
                const dTitle = dialog.querySelector('.dialog-title');
                const dMsg = dialog.querySelector('.dialog-message');
                const dialogActions = document.getElementById('dialogActions');

                // Optimistically update the dashboard cache
                try {
                    const cacheKey = `proposals_cache_${loggedInUser.uid}`;
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) {
                        let proposals = JSON.parse(cachedData);
                        const newProp = {
                            id: proposalId,
                            story_title: data.story_title || 'Untitled Story',
                            status: status,
                            submittedAt: new Date().toISOString(),
                            lastUpdatedAt: new Date().toISOString()
                        };
                        
                        const idx = proposals.findIndex(p => p.id === proposalId);
                        if (idx !== -1) {
                            proposals[idx] = { ...proposals[idx], ...newProp };
                        } else {
                            proposals.unshift(newProp);
                        }
                        localStorage.setItem(cacheKey, JSON.stringify(proposals));
                    }
                } catch (e) {
                    console.error("Cache update error:", e);
                }

                if (status === 'draft') {
                    dTitle.textContent = "Draft Saved";
                    dMsg.textContent = "Your progress has been saved successfully.";
                    dialogActions.innerHTML = `
                        <button class="btn-soft" id="draftContinueBtn" style="padding: 0.75rem 1.5rem;">Continue Editing</button>
                        <button class="submit-btn" id="draftDashboardBtn">Return to Dashboard</button>
                    `;
                    document.getElementById('draftContinueBtn').onclick = () => dialog.classList.add('hidden');
                    document.getElementById('draftDashboardBtn').onclick = () => window.location.href = 'index.html';
                } else {
                    dTitle.textContent = "Submitted";
                    dMsg.textContent = "Your proposal has been successfully submitted.";
                    dialogActions.innerHTML = `<button class="submit-btn" id="dialogCloseBtn">OK</button>`;
                    document.getElementById('dialogCloseBtn').onclick = () => window.location.href = `proposal.html?id=${proposalId}&view=preview`;
                }
                dialog.classList.remove('hidden');
            } else {
                throw new Error(result.error || 'Submission failed');
            }
        } catch (error) {
            console.error("Submission error:", error);
            alert("Error: " + error.message);
        } finally {
            loadingOverlay.classList.remove('active');
            if (submitBtn) submitBtn.disabled = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    }


    // --- SAVE DRAFT HANDLER ---
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.onclick = async () => {
            if (!form.story_title.value.trim() || !form.one_liner.value.trim()) {
                alert("Please provide at least a Story Title and One-liner to save a draft.");
                return;
            }
            await handleSubmissionSync('draft');
        };
    }

    // --- SUBMISSION ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Force sync rich editor to textarea before validation
        if (summaryEditor && summaryTextarea) summaryTextarea.value = summaryEditor.innerHTML;

        // Word count check
        const words = summaryTextarea.value.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length > 5000) {
            alert("Story summary exceeds 5000 words.");
            return;
        }

        // Phase 2 check (Details update for accepted proposals)
        const container2 = document.getElementById('phase2Container');
        if (isEditMode && !container2.classList.contains('hidden')) {
            loadingOverlay.classList.add('active');
            try {
                const formData = new FormData(form);
                let finalPresenter = formData.get('presenter');
                if (finalPresenter === 'Other') {
                    finalPresenter = formData.get('otherPresenter');
                }

                const data = getProposalData();
                console.log("[UPDATE] Sending payload with summary length:", data.summary ? data.summary.length : 0);
                
                const payload = {
                    ...data,
                    id: proposalId,
                    details: {
                        presenter: finalPresenter,
                        researcher: formData.getAll('res_name[]').map((name, i) => ({
                            name: name.trim(),
                            surname: formData.getAll('res_surname[]')[i]?.trim() || ''
                        })).filter(r => r.name !== '' || r.surname !== ''),
                        camera: formData.getAll('cam_name[]').map((name, i) => ({
                            name: name.trim(),
                            surname: formData.getAll('cam_surname[]')[i]?.trim() || ''
                        })).filter(c => c.name !== '' || c.surname !== ''),
                        camera_assistant: { name: formData.get('camera_assistant_name'), surname: formData.get('camera_assistant_surname') },
                        dop: { name: formData.get('dop_name'), surname: formData.get('dop_surname') },
                        sound: { name: formData.get('sound_name'), surname: formData.get('sound_surname') },
                        offline_editor: { name: formData.get('offline_editor_name'), surname: formData.get('offline_editor_surname') },
                        online_editor: { name: formData.get('online_editor_name'), surname: formData.get('online_editor_surname') },
                        audio_final_mix: { name: formData.get('audio_final_mix_name'), surname: formData.get('audio_final_mix_surname') },
                        additionalCrew: formData.getAll('crew_name[]').map((name, i) => ({
                            name: name.trim(),
                            surname: formData.getAll('crew_surname[]')[i]?.trim() || '',
                            role: formData.getAll('crew_role[]')[i]?.trim() || ''
                        })).filter(c => c.name !== '' || c.surname !== ''),
                        callSheet: {
                            producer_phone: formData.get('cs_producer_phone'),
                            producer_id: formData.get('cs_producer_id'),
                            presenter_name: formData.get('cs_presenter_name') === 'Other' ? formData.get('cs_presenter_other') : formData.get('cs_presenter_name'),
                            presenter_phone: formData.get('cs_presenter_phone'),
                            presenter_id: formData.get('cs_presenter_id'),
                            dop_name: formData.get('cs_dop_name'),
                            dop_phone: formData.get('cs_dop_phone'),
                            dop_id: formData.get('cs_dop_id'),
                            cam_assistant_name: formData.get('cs_cam_assistant_name'),
                            cam_assistant_phone: formData.get('cs_cam_assistant_phone'),
                            cam_assistant_id: formData.get('cs_cam_assistant_id'),
                            security_status: formData.get('cs_security_status'),
                            security_name: formData.get('cs_security_name'),
                            security_phone: formData.get('cs_security_phone'),
                            shoot_day: formData.get('cs_shoot_day'),
                            shoot_date: formData.get('cs_shoot_date'),
                            movementOrder: Array.from(document.querySelectorAll('#movementOrderTableBody tr')).map(row => ({
                                time: row.querySelector('input[name="mo_time[]"]')?.value || '',
                                what: row.querySelector('input[name="mo_what[]"]')?.value || '',
                                location: row.querySelector('input[name="mo_location[]"]')?.value || ''
                            })).filter(row => row.time || row.what || row.location),
                            kit: {
                                camera: formData.get('kit_camera'),
                                audio: formData.get('kit_audio'),
                                lenses: formData.get('kit_lenses'),
                                lighting: formData.get('kit_lighting'),
                                rigs: formData.get('kit_rigs'),
                                other: formData.get('kit_other')
                            },
                            travel: {
                                flight_name: formData.get('travel_flight_name'),
                                flight_details: formData.get('travel_flight_details'),
                                flight_file_path: formData.get('travel_flight_file_path'),
                                flight_filename: formData.get('travel_flight_filename'),
                                accom_name: formData.get('travel_accom_name'),
                                accom_location: formData.get('travel_accom_location'),
                                accom_from: formData.get('travel_accom_from'),
                                accom_to: formData.get('travel_accom_to'),
                                trans_name: formData.get('travel_trans_name'),
                                trans_from_loc: formData.get('travel_trans_from_loc'),
                                trans_to_loc: formData.get('travel_trans_to_loc'),
                                trans_from_date: formData.get('travel_trans_from_date'),
                                trans_to_date: formData.get('travel_trans_to_date'),
                                trans_from_time: formData.get('travel_trans_from_time'),
                                trans_to_time: formData.get('travel_trans_to_time'),
                                trans_file_path: formData.get('travel_trans_file_path'),
                                trans_filename: formData.get('travel_trans_filename')
                            },
                            additionalCrew: formData.getAll('cs_add_name[]').map((name, i) => ({
                                name: name.trim(),
                                phone: formData.getAll('cs_add_phone[]')[i]?.trim() || '',
                                id: formData.getAll('cs_add_id[]')[i]?.trim() || ''
                            })).filter(c => c.name !== ''),
                            story_description: formData.get('cs_story_description')
                        }
                    }
                };
                const response = await fetchWithAuth('/api/update-proposal-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    const dialog = document.getElementById('successDialog');
                    dialog.querySelector('.dialog-title').textContent = "Submitted";
                    dialog.querySelector('.dialog-message').textContent = "Your proposal has been successfully submitted.";
                    dialog.classList.remove('hidden');
                    document.getElementById('dialogCloseBtn').onclick = () => window.location.href = `proposal.html?id=${proposalId}&view=preview`;

                }
            } catch (err) {
                alert("Update failed: " + err.message);
            } finally {
                loadingOverlay.classList.remove('active');
            }
            return;
        }

        // Standard Submission (Pending)
        await handleSubmissionSync('pending');
    });

    // --- PROPOSAL PREVIEW LOGIC (Read-only) ---
    function showProposalPreview(sub, linkedAssets = []) {
        console.log("[DEBUG] showProposalPreview - ID:", sub.id, "Status:", sub.status, "isAdminView:", isAdminView);

        // Setup Story Deliverables Bar (Visible in Preview too)
        setupDeliverablesBar(sub, linkedAssets, isReadOnly);
        
        // Setup Floating Admin Bar (Admin Only) - Only for PENDING proposals
        const isActuallyPending = sub.status && sub.status.toLowerCase() === 'pending';
        const floatingBar = document.getElementById('floatingAdminBar');
        
        if ((isAdminView || (isPreviewView && window.auth.isAdmin(loggedInUser))) && isActuallyPending) {
            if (floatingBar) {
                console.log("[DEBUG] Activating floatingAdminBar (Direct Display)");
                floatingBar.style.display = 'block';
                
                const approveBtn = document.getElementById('adminApproveBtn');
                const rejectBtn = document.getElementById('adminRejectBtn');
                const manualCommFloating = document.getElementById('manualCommSectionFloating');
                const statusStr = (sub.status || '').toLowerCase();
                const isCommissioned = statusStr === 'accepted' || statusStr === 'paid';

                if (approveBtn) {
                    approveBtn.onclick = () => openPModal(sub.id, sub.acceptanceDetails);
                }

                if (rejectBtn) {
                    rejectBtn.onclick = () => handleAdminAction(sub.id, 'reject');
                }

                if (manualCommFloating) {
                    manualCommFloating.style.display = isCommissioned ? 'none' : 'block';
                }
            }
        } else if (floatingBar) {
            floatingBar.style.display = 'none';
        }

        // Update Page Title to Story Title
        document.title = `${sub.story_title || 'Proposal'} - Carte Blanche`;

        // Update Header and Breadcrumb
        const breadcrumb = document.getElementById('formContentToPDF')?.querySelector('.breadcrumb');
        if (breadcrumb) {
            const backUrl = isAdminView ? 'admin_dashboard.html' : 'index.html';
            let backText = isAdminView ? 'Back to Admin Dashboard' : 'Back to Dashboard';
            if (sub._isRestrictedView) backText = 'Back to Home Page';
            breadcrumb.innerHTML = `<a href="${backUrl}">${backText}</a> / ${sub.story_title}`;
        }
        
        const h1 = document.querySelector('.form-header h1');
        if (h1) {
            h1.textContent = sub.story_title;
        }

        document.getElementById('proposalForm').classList.add('hidden');
        const banner = document.getElementById('viewModeBanner');
        
        // Hide banner for all read-only views as requested (redundant with breadcrumbs/comm card)
        if (banner) banner.classList.add('hidden');
        
        // Update Banner Text and Back Button
        const bannerLabel = banner.querySelector('span');
        const backBtn = document.getElementById('backToAdminBtn');
        
        if (isAdminView) {
            if (bannerLabel) bannerLabel.innerHTML = `<span style="letter-spacing: 0.05em;">ADMIN VIEW MODE</span> <small>(READ-ONLY)</small> <span class="status-badge-modern ${sub.status}" style="margin-left: 1rem; transform: scale(0.9);">${sub.status.toUpperCase()}</span>`;
            if (backBtn) {
                backBtn.textContent = 'Back to Admin Dashboard';
                backBtn.onclick = () => window.location.href = 'admin_dashboard.html';
            }
        } else if (sub._isRestrictedView) {
            if (bannerLabel) bannerLabel.innerHTML = `<span style="letter-spacing: 0.05em;">RESTRICTED PRODUCER VIEW</span> <small>(READ-ONLY)</small>`;
            if (backBtn) {
                backBtn.textContent = 'Back to Home Page';
                backBtn.onclick = () => window.location.href = 'index.html';
            }
            const topPdfBtn = document.getElementById('topDownloadProposalBtn');
            if (topPdfBtn) topPdfBtn.style.display = 'none';
        } else {
            if (bannerLabel) bannerLabel.innerHTML = `<span style="letter-spacing: 0.05em;">PROPOSAL PREVIEW</span> <small>(READ-ONLY)</small> <span class="status-badge-modern ${sub.status}" style="margin-left: 1rem; transform: scale(0.9);">${sub.status.toUpperCase()}</span>`;
            if (backBtn) {
                backBtn.textContent = 'Back to Home Page';
                backBtn.onclick = () => window.location.href = 'index.html';
            }
        }
        
        if (!document.getElementById('printReportBtn') && !sub._isRestrictedView) {
            const printBtn = document.createElement('button');
            printBtn.id = 'printReportBtn';
            printBtn.className = 'btn-soft btn-soft-primary';
            printBtn.style.cssText = 'padding: 0.4rem 1rem; font-size: 0.75rem; margin-right: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem;';
            printBtn.innerHTML = 'Download PDF';
            printBtn.onclick = () => window.print();
            if (banner) banner.insertBefore(printBtn, backBtn);
        }

        const summaryDiv = document.getElementById('proposalSummary');
        if (summaryDiv) {
            summaryDiv.classList.remove('hidden');
            try {
                renderProposalReport(sub);
                summaryDiv.classList.remove('hidden');
                summaryDiv.style.display = 'block';
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) loadingOverlay.classList.remove('active');
            } catch (renderErr) {
                console.error("[CRITICAL] renderProposalReport failed:", renderErr);
                summaryDiv.innerHTML = `<div style="padding: 2rem; color: var(--danger); background: rgba(220, 53, 69, 0.1); border: 1px solid var(--danger); border-radius: 8px;">
                    <h3>Error Rendering Report</h3>
                    <p>${renderErr.message}</p>
                    <pre style="font-size: 0.7rem; margin-top: 1rem; white-space: pre-wrap;">${renderErr.stack}</pre>
                </div>`;
            }
        }

        if (isAdminView) {
            const statusStr = (sub.status || '').toLowerCase();
            const isCommissioned = statusStr === 'accepted' || statusStr === 'paid';
            
            if (isCommissioned) {
                // Show Commission Number Badge if already commissioned
                const commBadge = document.getElementById('commNumBadgeTop');
                const displayCommNum = document.getElementById('displayCommNum');
                const editBtn = document.getElementById('adminEditCommBtn');

                if (commBadge && displayCommNum) {
                    commBadge.classList.remove('hidden');
                    displayCommNum.textContent = sub.commissionNumber || '—';
                    
                    if (window.auth.isAdmin(loggedInUser)) {
                        editBtn.style.display = 'inline-block';
                        editBtn.onclick = () => {
                            const current = sub.commissionNumber || '';
                            const newVal = prompt("Enter new Commission Number:", current);
                            if (newVal !== null && newVal !== current) {
                                updateCommissionNumber(sub.id, newVal);
                            }
                        };
                    }
                }
            }
        }
    }

    function renderPlainTextView(sub) {
        const summaryDiv = document.getElementById('proposalSummary');
        const date = sub.submittedAt ? (sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt)) : new Date();
        const submitterDisplay = (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail;
        
        const status = sub.status || 'pending';
        let statusLabel = 'Pending';
        let statusClass = 'pending';
        const statusStr = (sub.status || '').toLowerCase();
        if (statusStr === 'accepted' || statusStr === 'paid') {
            statusLabel = 'Commissioned';
            statusClass = 'accepted';
        } else if (status === 'rejected') {
            statusLabel = 'Rejected';
            statusClass = 'rejected';
        }

        const acc = sub.acceptanceDetails || {};
        const deliveryDate = acc.deliveryDate ? formatStoryDate(acc.deliveryDate) : '';
        const rate = acc.rate ? (isNaN(acc.rate) ? acc.rate : `R ${parseFloat(acc.rate).toLocaleString()}`) : '';

        let locationDisplay = '—';
        const rawLocations = sub.locations || sub.location || sub.story_location || sub.location_details || (sub.data && (sub.data.locations || sub.data.location));
        const rawCountry = sub.country || (sub.data && sub.data.country);
        const rawProvince = sub.province || (sub.data && sub.data.province);

        if (Array.isArray(rawLocations) && rawLocations.length > 0) {
            locationDisplay = rawLocations.map(l => {
                if (!l) return null;
                if (typeof l === 'string') return l.trim();
                const parts = [];
                const c = l.country || l.country_name || l.c;
                const p = l.province || l.state || l.p;
                if (c) parts.push(c.toString().trim());
                if (p) parts.push(p.toString().trim());
                return parts.join(' / ');
            }).filter(s => s && s !== '—' && s !== '/').join(', ');
        } else if (rawCountry || rawProvince) {
            const parts = [];
            if (rawCountry && rawCountry !== '—') parts.push(rawCountry.toString().trim());
            if (rawProvince && rawProvince !== '—') parts.push(rawProvince.toString().trim());
            locationDisplay = parts.join(' / ');
        } else if (typeof rawLocations === 'string' && rawLocations !== '—' && rawLocations.trim() !== '') {
            locationDisplay = rawLocations.trim();
        }

        if (!locationDisplay || locationDisplay.trim() === '—' || locationDisplay.trim() === '/' || locationDisplay.trim() === '') {
            locationDisplay = '—';
        }

        // REDACTION FOR RESTRICTED VIEW
        if (sub._isRestrictedView) {
            locationDisplay = '—';
            if (sub.isSensitive) {
                sub.summary = '[REDACTED]';
            }
            sub.details = null;
            sub.extra_budget = 'no';
            sub.caseStudies = [];
        }

        // Process summary links to open in new tab
        if (sub.summary && typeof sub.summary === 'string') {
            sub.summary = sub.summary.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
        }

        let detailsHtml = '';
        if (sub.details) {
            const d = sub.details;
            const getName = (obj) => {
                if (!obj) return null;
                if (typeof obj === 'string') return obj !== '—' ? obj : null;
                const full = `${obj.name || ''} ${obj.surname || ''}`.trim();
                return full || null;
            };

            const formatArray = (arr) => {
                if (!arr) return null;
                const a = Array.isArray(arr) ? arr : [arr];
                const res = a.map(item => getName(item)).filter(name => name).join(', ');
                return res || null;
            };

            const fields = [
                { label: 'Presenter', value: d.presenter },
                { label: 'Researcher(s)', value: formatArray(d.researcher) },
                { label: 'Camera(s)', value: formatArray(d.camera) },
                { label: 'DOP', value: getName(d.dop) },
                { label: 'Sound', value: getName(d.sound) },
                { label: 'Offline Editor', value: getName(d.offline_editor) },
                { label: 'Online Editor', value: getName(d.online_editor) },
                { label: 'Audio Final Mix', value: getName(d.audio_final_mix) }
            ];

            const populated = fields.filter(f => f.value && f.value !== '—');
            
            if (populated.length > 0 || (d.additionalCrew && d.additionalCrew.length > 0)) {
                detailsHtml = `
                <div style="margin-bottom: 3rem;">
                    <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700;">Production Details</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; font-size: 0.95rem;">
                        ${populated.map(f => `
                            <div>
                                <span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">${f.label}</span>
                                <span style="font-weight: 600;">${f.value}</span>
                            </div>
                        `).join('')}
                        ${(d.additionalCrew || []).map(c => `
                            <div>
                                <span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">${c.role || 'Crew'}</span>
                                <span style="font-weight: 600;">${c.name} ${c.surname || ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
        }

        let budgetHtml = sub.extra_budget === 'yes' ? `
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; font-weight: 700;">Extra Budget Items</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border);"><th style="text-align: left; padding: 0.75rem 0.5rem;">Item</th><th style="text-align: left; padding: 0.75rem 0.5rem;">Reason</th><th style="text-align: right; padding: 0.75rem 0.5rem;">Est. Cost</th></tr>
                    </thead>
                    <tbody>
                        ${(sub.budgetItems || []).map(b => `<tr><td style="padding: 0.75rem 0.5rem;">${b.item}</td><td style="padding: 0.75rem 0.5rem;">${b.reason}</td><td style="padding: 0.75rem 0.5rem; text-align: right; font-weight: 700;">${b.cost}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        ` : '';

        let caseStudiesHtml = sub.caseStudies && sub.caseStudies.length > 0 ? `
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; font-weight: 700;">Case Studies</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
                    ${(sub.caseStudies || []).map(cs => `
                        <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px; background: rgba(0,0,0,0.02);">
                            <div style="font-weight: 700; font-size: 1rem;">${cs.name} ${cs.surname || ''}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${cs.role || 'Case Study'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        let expertsHtml = sub.experts && sub.experts.length > 0 ? `
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; font-weight: 700;">Experts</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
                    ${(sub.experts || []).map(ex => `
                        <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px; background: rgba(0,0,0,0.02);">
                            <div style="font-weight: 700; font-size: 1rem;">${ex.name} ${ex.surname || ''}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${ex.role || 'Expert'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        let additionalInfoHtml = '';
        if (!sub._isRestrictedView) {
            additionalInfoHtml = `
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; font-weight: 700;">Additional Info</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem;">
                    <div>
                        <span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Third Party Footage</span>
                        <span style="font-weight: 600;">${sub.third_party === 'yes' ? '✅ Yes' : '❌ No'}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Hidden Camera</span>
                        <span style="font-weight: 600;">${sub.hidden_camera === 'yes' ? '✅ Yes' : '❌ No'}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Legal Required</span>
                        <span style="font-weight: 600;">${sub.legal_req === 'yes' ? '✅ Yes' : '❌ No'}</span>
                    </div>
                </div>
            </div>
        `;
        }
        
        if (sub._isRestrictedView) {
            detailsHtml = '';
            budgetHtml = '';
            caseStudiesHtml = '';
            additionalInfoHtml = ''; 
        }

        summaryDiv.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding: 3rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); color: var(--text-main); font-family: 'Inter', sans-serif;">
                <div style="border-bottom: 2px solid var(--primary); padding-bottom: 1.5rem; margin-bottom: 2.5rem; display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h1 style="font-size: 2.25rem; margin: 0; color: var(--text-main); line-height: 1.2;">${sub.story_title}</h1>
                        <p style="margin: 0.75rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">
                            Submitted by <b style="color: var(--primary);">${submitterDisplay}</b> on ${date.toLocaleDateString()}
                        </p>
                    </div>
                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.75rem;">
                        <span class="status-badge-modern ${statusClass}" style="padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 700;">${statusLabel.toUpperCase()}</span>
                        ${(sub.commissionNumber && !sub._isRestrictedView) ? `
                    <div style="text-align: right;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: var(--primary); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.25rem;">Commission Number</div>
                        <div style="background: rgba(0, 143, 190, 0.1); border: 2px solid var(--primary); color: var(--primary); padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 900; font-size: 1.75rem; display: inline-block;">
                            #${sub.commissionNumber}
                        </div>
                    </div>
                ` : ''}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem; margin-bottom: 3rem; background: rgba(0,0,0,0.02); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                    <div><span style="color: var(--text-muted); font-size: 0.7rem; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Location</span><span style="font-weight: 700;">${locationDisplay}</span></div>
                    ${acc.duration ? `<div><span style="color: var(--text-muted); font-size: 0.7rem; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Duration</span><span style="font-weight: 700;">${acc.duration}</span></div>` : ''}
                    ${(deliveryDate && !sub._isRestrictedView) ? `<div><span style="color: var(--text-muted); font-size: 0.7rem; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Delivery Date</span><span style="font-weight: 700;">${deliveryDate}</span></div>` : ''}
                </div>
                
                <div style="margin-bottom: 3rem; text-align: center;" class="no-print">
                    ${sub._isRestrictedView ? '' : `<a href="proposal.html?id=${sub.id}" class="submit-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; padding: 1rem 3.5rem; font-weight: 700; border-radius: 50px; font-size: 1rem; box-shadow: var(--shadow-md); transition: transform 0.2s;">Edit Proposal</a>`}
                </div>

                ${sub.one_liner ? `
                <div style="margin-bottom: 3rem;">
                    <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; font-weight: 700;">One Liner</h3>
                    <p style="font-size: 1.4rem; font-style: italic; color: var(--text-main); font-weight: 400; line-height: 1.4;">"${sub.one_liner}"</p>
                </div>` : ''}

                ${sub.summary ? `
                <div style="margin-bottom: 3rem;">
                    <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; font-weight: 700;">Story Summary</h3>
                    <div class="story-summary-content" style="color: var(--text-main); line-height: 1.6; font-size: 1.05rem; text-align: left; white-space: pre-wrap;">${sub.summary}</div>
                </div>` : ''}

                ${detailsHtml}
                ${budgetHtml}
                ${caseStudiesHtml}
                ${expertsHtml}
                ${additionalInfoHtml}
                <div style="margin-top: 5rem; padding-top: 2.5rem; border-top: 1px solid var(--border); text-align: center;" class="no-print">
                    <p style="margin-top: 0;"><a href="index.html" style="color: var(--text-muted); font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">← ${sub._isRestrictedView ? 'Back to Home Page' : 'Back to Dashboard'}</a></p>
                </div>
            </div>
        `;
    }

    function renderProposalReport(sub) {
        // Use the beautiful themed summary for both Text View and Admin Review
        if (urlParams.get('view') === 'text' || urlParams.get('view') === 'admin' || urlParams.get('view') === 'preview') {
            return renderPlainTextView(sub);
        }
        const summaryDiv = document.getElementById('proposalSummary');
        
        // --- COMMISSION DETAILS CARD ---
        let commissionDetailsHtml = '';
        if (sub.status === 'accepted' || sub.status === 'paid') {
            const acc = sub.acceptanceDetails || {};
            const formattedDate = formatStoryDate(acc.deliveryDate);
            
            let formattedRate = '—';
            if (acc.rate) {
                const numRate = parseFloat(acc.rate);
                formattedRate = isNaN(numRate) ? acc.rate : `R ${numRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }

            // Safer date formatting for Accepted At
            let acceptedAtHtml = '';
            if (sub.acceptedAt) {
                const dateStr = formatStoryDate(sub.acceptedAt);
                if (dateStr !== '—') {
                    acceptedAtHtml = `<span>Date: <b>${dateStr}</b></span>`;
                }
            }
            
            commissionDetailsHtml = `
                <div class="commission-summary-square" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-sm); margin-bottom: 2.5rem;">
                    <div style="background: rgba(0, 143, 190, 0.05); border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: var(--primary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Commission Details</span>
                        <span class="status-badge success" style="font-size: 0.7rem;">COMMISSIONED</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; padding: 1.5rem;">
                        <div class="comm-data-item">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Duration</div>
                            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${acc.duration || 'â€”'}</div>
                        </div>
                        <div class="comm-data-item">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Delivery Date</div>
                            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${formattedDate}</div>
                        </div>
                        <div class="comm-data-item">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Agreed Rate</div>
                            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${formattedRate}</div>
                        </div>
                        <div class="comm-data-item">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Contract Agreement</div>
                            <div style="font-size: 1.1rem; font-weight: 700; color: ${acc.contractAccepted ? 'var(--success)' : 'var(--danger)'};">
                                ${acc.contractAccepted ? 'âœ… Accepted' : 'âŒ Pending'}
                            </div>
                        </div>
                    </div>
                    ${(acc.acceptedBy || isAdminView) ? `
                        <div style="padding: 0.75rem 1.5rem; background: var(--bg-light); border-top: 1px solid var(--border); font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                ${acc.acceptedBy ? `<span>Accepted By: <b>${acc.acceptedBy}</b></span>` : ''}
                                ${acceptedAtHtml ? `<span style="margin-left: 1rem;">${acceptedAtHtml}</span>` : ''}
                            </div>
                            ${isAdminView ? `
                                <button onclick="window.openPModal('${sub.id}', ${JSON.stringify(sub.acceptanceDetails).replace(/"/g, '&quot;')})" class="btn-soft btn-soft-primary" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; cursor: pointer; border-radius: 4px; border: 1px solid var(--primary); font-weight: 600;">
                                    âš™ï¸ Update Production Details
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        const budgetHtml = sub.extra_budget === 'yes' ? `
            <div class="report-section">
                <div class="report-section-title"><span>ðŸ’°</span> Extra Budget Items</div>
                <table class="report-table">
                    <thead>
                        <tr><th>Item</th><th>Reason</th><th style="text-align: right;">Est. Cost</th></tr>
                    </thead>
                    <tbody>
                        ${(sub.budgetItems || []).map(b => `<tr><td>${b.item}</td><td>${b.reason}</td><td style="text-align: right; font-weight: 700;">${b.cost}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        ` : '';

        const caseStudiesHtml = sub.caseStudies && sub.caseStudies.length > 0 ? `
            <div class="report-section">
                <div class="report-section-title"><span>ðŸ‘¥</span> Case Studies</div>
                <div class="report-grid">
                    ${(sub.caseStudies || []).map(cs => `
                        <div class="profile-card">
                            <span class="profile-name">${cs.name} ${cs.surname}</span>
                            <span class="profile-role">${cs.role || 'Case Study'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const expertsHtml = sub.experts && sub.experts.length > 0 ? `
            <div class="report-section">
                <div class="report-section-title"><span>ðŸŽ“</span> Experts</div>
                <div class="report-grid">
                    ${(sub.experts || []).map(ex => `
                        <div class="profile-card">
                            <span class="profile-name">${ex.name} ${ex.surname}</span>
                            <span class="profile-role">${ex.role || 'Expert'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        let insertDetailsHtml = '';
        if (sub.details) {
            const getFullName = (obj) => {
                if (typeof obj === 'object' && obj !== null) {
                    const str = `${obj.name || ''} ${obj.surname || ''}`.trim();
                    return str || '';
                }
                return (obj || '').toString().trim();
            };
            const formatArray = (arr) => {
                if (!arr) return '';
                const a = Array.isArray(arr) ? arr : [arr];
                const res = a.map(item => getFullName(item)).filter(name => name && name !== 'â€”').join(', ');
                return res || '';
            };

            const hasData = sub.details.presenter || 
                            formatArray(sub.details.researcher) || 
                            formatArray(sub.details.camera) || 
                            getFullName(sub.details.dop) ||
                            getFullName(sub.details.sound) ||
                            getFullName(sub.details.offline_editor);

            if (hasData) {
                insertDetailsHtml = `
                    <div class="report-section" style="margin-top: 2rem;">
                        <div class="report-section-title"><span>ðŸŽ¬</span> Insert Details</div>
                        <div class="report-meta" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                            <div class="meta-item"><span class="meta-label">Presenter</span><span class="meta-value">${sub.details.presenter || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Researcher(s)</span><span class="meta-value">${formatArray(sub.details.researcher) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Camera(s)</span><span class="meta-value">${formatArray(sub.details.camera) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">DOP</span><span class="meta-value">${getFullName(sub.details.dop) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Sound</span><span class="meta-value">${getFullName(sub.details.sound) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Offline Editor</span><span class="meta-value">${getFullName(sub.details.offline_editor) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Online Editor</span><span class="meta-value">${getFullName(sub.details.online_editor) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Audio Final Mix</span><span class="meta-value">${getFullName(sub.details.audio_final_mix) || 'â€”'}</span></div>
                            <div class="meta-item"><span class="meta-label">Additional Crew</span><span class="meta-value">${(sub.details.additionalCrew && sub.details.additionalCrew.length > 0) ? sub.details.additionalCrew.map(c => `${c.name} ${c.surname} (${c.role})`).join(', ') : 'â€”'}</span></div>
                        </div>
                    </div>
                `;
            }
        }


        const date = sub.submittedAt ? (sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt)) : new Date();
        const submitterDisplay = (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail;

        summaryDiv.innerHTML = `
            <div class="report-header" style="text-align: left; display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; margin-bottom: 2rem;">
                <div style="flex: 1;">
                    <h2 style="font-size: 2.25rem; margin-bottom: 0.5rem; color: var(--text-main); text-align: left; line-height: 1.1;">${sub.story_title}</h2>
                    <div class="breadcrumb" style="margin-top: 0; color: var(--text-muted); font-size: 0.85rem; text-align: left;">
                        Submitted by <strong style="color: var(--primary);">${submitterDisplay}</strong> on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}
                    </div>
                </div>
                ${sub.commissionNumber ? `
                    <div style="text-align: right;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: var(--primary); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.25rem;">Commission Number</div>
                        <div style="background: rgba(0, 143, 190, 0.1); border: 2px solid var(--primary); color: var(--primary); padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 900; font-size: 1.75rem; display: inline-block;">
                            #${sub.commissionNumber}
                        </div>
                    </div>
                ` : ''}
            </div>

            ${commissionDetailsHtml}

            <div class="report-meta">
                <div class="meta-item">
                    <span class="meta-label">Location</span>
                    <span class="meta-value">${(sub.locations && sub.locations.length > 0) ? sub.locations.map(l => `${l.country || ''}${l.province ? ` / ${l.province}` : ''}`).join(', ') : `${sub.country || 'â€”'} / ${sub.province || 'â€”'}`}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Third Party Footage</span>
                    <span class="meta-value">${sub.third_party === 'yes' ? 'âœ… Yes' : 'âŒ No'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Hidden Camera</span>
                    <span class="meta-value">${sub.hidden_camera === 'yes' ? 'âœ… Yes' : 'âŒ No'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Legal Required</span>
                    <span class="meta-value">${sub.legal_req === 'yes' ? 'âœ… Yes' : 'âŒ No'}</span>
                </div>
            </div>

            <div style="margin-bottom: 3.5rem; text-align: center;" class="no-print">
                ${sub._isRestrictedView ? '' : `<a href="proposal.html?id=${sub.id}" class="submit-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; padding: 0.9rem 3rem; font-weight: 700; border-radius: 50px; font-size: 1rem; box-shadow: var(--shadow-md);">Edit Proposal</a>`}
            </div>

            <div class="report-section">
                <div class="report-section-title"><span>ðŸ“ </span> One Liner</div>
                <div class="one-liner-callout">
                    "${sub.one_liner}"
                </div>
            </div>

            <div class="report-section">
                <div class="report-section-title"><span>ðŸ“–</span> Story Summary</div>
                <div class="report-text-block" style="line-height: 1.8; white-space: pre-wrap;">${sub.summary}</div>
            </div>

            ${budgetHtml}
            ${caseStudiesHtml}
            ${expertsHtml}
            ${insertDetailsHtml}
            <div id="footageDeclarationPlaceholder"></div>

            ${(isPreviewView && !isAdminView) ? `
                <div class="report-section no-print" style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); display: flex; gap: 1.5rem; justify-content: center;">
                    ${sub.status !== 'accepted' ? `<button type="button" class="btn-soft btn-soft-danger" style="padding: 0.75rem 2rem; font-size: 1rem; min-width: 180px;" onclick="window.handleDelete('${sub.id}', '${(sub.story_title || 'Untitled').replace(/'/g, "\\'")}')">Delete Draft</button>` : ''}
                </div>
            ` : ''}

            ${((isAdminView || (isPreviewView && window.auth.isAdmin(loggedInUser))) && sub.status !== 'accepted' && sub.status !== 'paid') ? `
                <div class="report-section no-print" style="margin-top: 6rem; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 2px solid var(--primary); box-shadow: var(--shadow-lg); text-align: center;">
                    <h3 style="margin-bottom: 2rem; color: var(--primary); letter-spacing: 0.1rem; font-weight: 800; font-size: 1rem; text-transform: uppercase;">ADMIN REVIEW ACTION REQUIRED</h3>
                    <div style="display: flex; gap: 1.5rem; justify-content: center; width: 100%; max-width: 900px; margin: 0 auto;">
                        <button type="button" class="submit-btn" style="flex: 1; padding: 1.5rem; font-size: 1.25rem; font-weight: 800; cursor: pointer; background: var(--success); border: none; text-transform: uppercase; letter-spacing: 0.05em;" onclick="window.openPModal('${sub.id}', ${JSON.stringify(sub.acceptanceDetails || {}).replace(/"/g, '&quot;')})">ACCEPT PROPOSAL</button>
                        <button type="button" class="btn-soft btn-soft-danger" style="flex: 1; padding: 1.5rem; font-size: 1.25rem; font-weight: 800; cursor: pointer; border: 2px solid var(--danger); text-transform: uppercase; letter-spacing: 0.05em; color: var(--danger) !important;" onclick="window.handleAdminAction('${sub.id}', 'reject')">REJECT PROPOSAL</button>
                    </div>
                </div>
            ` : ''}
        `;
    }

    window.handleDelete = async (id, title) => {
        if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
        loadingOverlay.classList.add('active');
        try {
            const token = await window.auth.getIdToken();
            const response = await fetch('/api/delete-proposal', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id })
            });
            const result = await response.json();
            if (result.success) {
                alert(`"${title}" deleted successfully.`);
                window.location.href = 'index.html';
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert("Delete failed: " + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    };

    window.handleAdminAction = handleAdminAction;
    async function handleAdminAction(id, action, metadata = null) {
        if (!metadata && !confirm(`Are you sure you want to ${action} this proposal?`)) return;
        
        const manualCommEl = document.getElementById('manualCommissionNumber');
        const manualComm = manualCommEl ? manualCommEl.value.trim() : '';

        loadingOverlay.classList.add('active');
        try {
            const token = await window.auth.getIdToken();
            const response = await fetch('/api/admin/handle-proposal', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    id, 
                    action,
                    manualCommissionNumber: manualComm || null,
                    ...metadata
                })
            });
            const result = await response.json();
            if (result.success) {
                alert(`Proposal ${action}ed successfully!${result.commissionNumber ? ` (Comm #${result.commissionNumber})` : ''}`);
                window.location.href = 'admin_dashboard.html';
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert("Action failed: " + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    }

    // --- COMMISSION MODAL (pModal) ---
    window.openPModal = openPModal;
    function openPModal(id, existingData) {
        document.getElementById('pModalProposalId').value = id;
        // Default delivery date = today + 14 days
        const future = new Date();
        future.setDate(future.getDate() + 14);
        const futureStr = future.toISOString().split('T')[0];
        document.getElementById('pModalDeliveryDate').value = (existingData && existingData.deliveryDate) ? existingData.deliveryDate : futureStr;
        document.getElementById('pModalDuration').value = (existingData && existingData.duration) ? existingData.duration : '05:00';
        document.getElementById('pModalRate').value = (existingData && existingData.rate) ? existingData.rate : '';
        document.getElementById('pModalCommNum').value = '';
        document.getElementById('pModalContract').checked = !!(existingData && existingData.contractAccepted);
        const backdrop = document.getElementById('pModalBackdrop');
        backdrop.style.display = 'flex';
    }
    function closePModal() {
        const backdrop = document.getElementById('pModalBackdrop');
        if (backdrop) backdrop.style.display = 'none';
        const form = document.getElementById('pModalForm');
        if (form) form.reset();
    }
    document.getElementById('pModalCloseBtn').onclick = closePModal;
    document.getElementById('pModalCancelBtn').onclick = closePModal;
    document.getElementById('pModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('pModalProposalId').value;
        const metadata = {
            manualCommissionNumber: document.getElementById('pModalCommNum').value.trim() || null,
            duration: document.getElementById('pModalDuration').value,
            deliveryDate: document.getElementById('pModalDeliveryDate').value,
            rate: document.getElementById('pModalRate').value,
            contractAccepted: document.getElementById('pModalContract').checked
        };
        closePModal();
        await handleAdminAction(id, 'accept', metadata);
    });
    // --- DOWNLOAD HELPERS ---
    window.downloadFootagePDF = async (submissionId, files) => {
        const declarationFile = (files || []).find(f => f.fieldname === 'declaration');
        if (!declarationFile) {
            alert('No PDF declaration found for this submission.');
            return;
        }

        try {
            loadingOverlay.classList.add('active');
            document.getElementById('loadingHeading').textContent = "Downloading PDF...";
            const token = await window.auth.getIdToken();
            const response = await fetch(`/api/get-file?id=${submissionId}&path=${encodeURIComponent(declarationFile.storagePath)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) throw new Error('File access denied or not found');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = declarationFile.filename || 'Footage_Declaration.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert('Download failed: ' + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    };

    window.downloadFootageExcel = (footage, storyTitle) => {
        if (!footage || footage.length === 0) {
            alert('No footage data to export.');
            return;
        }

        const headers = ["Type", "Clip Name", "Description", "Source", "Contact", "Agreement", "TC In", "TC Out", "Duration", "Licence Required", "Licence Period", "Resale Allowed"];
        const rows = footage.map(f => [
            f.type,
            f.clip_name,
            f.description,
            f.source,
            f.contact,
            f.agreement,
            f.tc_in,
            f.tc_out,
            f.duration,
            f.licence_req,
            f.licence_period,
            f.resale
        ]);

        let csvContent = "\ufeff" // BOM for Excel
            + headers.join(",") + "\n"
            + rows.map(e => e.map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const comm = document.getElementById('displayCommNum').textContent || 'N/A';
        const safeStory = storyTitle.replace(/[\\/:*?"<>|]/g, '');
        link.setAttribute("download", `${comm} - ${safeStory} - Footage Declaration.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!urlParams.get('id')) {
        addResearcherRow();
        addCameraRow();
    }


    function setupDeliverablesBar(sub, linkedAssets, isReadOnly) {
        const statusStr = (sub.status || '').toLowerCase();
        const isCommissioned = statusStr === 'accepted' || statusStr === 'paid';
        const phaseBar = document.getElementById('productionPhaseBar');
        
        if (phaseBar && isCommissioned) {
            phaseBar.classList.remove('hidden');
            
            // Hide Footage Dec and Call Sheet if restricted
            if (sub._isRestrictedView) {
                const fdec = document.getElementById('btnFootageDec');
                const csheet = document.getElementById('btnCallSheet');
                if (fdec) fdec.style.display = 'none';
                if (csheet) csheet.style.display = 'none';
            }

            document.getElementById('btnFootageDec').onclick = () => {
                const comm = sub.commissionNumber || '';
                const story = encodeURIComponent(sub.story_title || '');
                const producerName = (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail;
                const producer = encodeURIComponent(producerName || '');
                const delivery = sub.acceptanceDetails?.deliveryDate || '';
                
                const existingFootage = linkedAssets.find(a => a.formType === 'insert_footage');
                let url = `insert_footage_declaration.html?comm=${comm}&story=${story}&delivery=${delivery}&producer=${producer}&project=${sub.id}`;
                if (existingFootage) url += `&id=${existingFootage.id}`;
                window.location.href = url;
            };
            
            document.getElementById('btnCallSheet').onclick = () => {
                window.location.hash = '#CallSheet';
                checkStandaloneMode();
                if (isReadOnly) {
                    showCallSheetPreview(sub, linkedAssets);
                } else {
                    window.scrollTo(0,0);
                }
            };
            
            document.getElementById('btnFinalScript').onclick = () => {
                const existingScript = linkedAssets.find(a => a.formType === 'final_script');
                const url = existingScript 
                    ? `final_script.html?id=${sub.id}&assetId=${existingScript.id}` 
                    : `final_script.html?id=${sub.id}`;
                window.location.href = url;
            };
        } else if (phaseBar) {
            phaseBar.classList.add('hidden');
        }
    }

function renderProjectAssets(assets, proposal) {
    const section = document.getElementById('projectAssetsSection');
    const list = document.getElementById('projectAssetsList');
    if (!section || !list) return;
    const urlParams = new URLSearchParams(window.location.search);
    const viewMode = urlParams.get('view');
    const isCallSheet = window.location.hash === '#CallSheet';
    const isAllowedView = viewMode === 'preview' || viewMode === 'admin';
    const hasFinalScript = proposal.details && proposal.details.finalScript;
    const csData = proposal.details && proposal.details.callSheet;
    const hasCallSheetData = csData && (csData.producer_name || csData.shoot_date || csData.shoot_city);
    
    let hasAnyVisibleAsset = hasCallSheetData || hasFinalScript || (assets && assets.length > 0);
    
    if (proposal._isRestrictedView) {
        // In restricted view, only Final Script is allowed
        const hasAssetFinalScript = assets && assets.some(a => a.formType === 'final_script');
        hasAnyVisibleAsset = hasFinalScript || hasAssetFinalScript;
    }
    
    if (!hasAnyVisibleAsset) {
        section.classList.add('hidden');
        return;
    }
    if (!isAllowedView || isCallSheet) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    list.innerHTML = '';
    if (hasFinalScript) {
        const card = document.createElement('div');
        card.style.cssText = `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; transition: all 0.2s; box-shadow: var(--shadow-sm); border-left: 4px solid #7c3aed;`;
        const date = proposal.lastUpdatedAt ? formatStoryDate(proposal.lastUpdatedAt) : (proposal.submittedAt ? formatStoryDate(proposal.submittedAt) : 'N/A');
        const comm = proposal.commissionNumber || 'N/A';
        const story = proposal.story_title || 'N/A';
        const finalName = `${comm} - ${story} - Final Script`;
        const downloadBtn = proposal._isRestrictedView ? '' : `<button onclick="window.downloadFinalScriptPDF('${proposal.id}')" class="btn-soft" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; flex: 1; border: 1px solid #7c3aed !important; color: #7c3aed;">Download PDF</button>`;
        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: flex-start;"><span style="font-size: 0.7rem; font-weight: 800; color: #7c3aed; letter-spacing: 0.05em;">FINAL SCRIPT</span><span style="font-size: 0.7rem; color: var(--text-muted);">${date}</span></div><div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${finalName}">${finalName}</div><div style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.5rem;">${downloadBtn}<button onclick="window.location.href='final_script.html?id=${proposal.id}&mode=view'" class="btn-soft" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; flex: 1; border: 1px solid var(--border) !important;">View Details</button></div>`;
        list.appendChild(card);
    }
    if (hasCallSheetData && !proposal._isRestrictedView) {
        const card = document.createElement('div');
        card.style.cssText = `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; transition: all 0.2s; box-shadow: var(--shadow-sm); border-left: 4px solid var(--success);`;
        const date = proposal.lastUpdatedAt ? formatStoryDate(proposal.lastUpdatedAt) : (proposal.submittedAt ? formatStoryDate(proposal.submittedAt) : 'N/A');
        const comm = proposal.commissionNumber || 'N/A';
        const story = proposal.story_title || 'N/A';
        const finalName = `${comm} - ${story} - Call Sheet`;
        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: flex-start;"><span style="font-size: 0.7rem; font-weight: 800; color: var(--success); letter-spacing: 0.05em;">CALL SHEET</span><span style="font-size: 0.7rem; color: var(--text-muted);">${date}</span></div><div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${finalName}">${finalName}</div><div style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.5rem;"><button onclick="window.location.hash='#CallSheet'; setTimeout(() => window.print(), 500);" class="btn-soft" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; flex: 1; border: 1px solid var(--success) !important; color: var(--success);">Download PDF</button><a href="#CallSheet" class="btn-soft" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; text-decoration: none; text-align: center; border: 1px solid var(--border) !important;">View Details</a></div>`;
        list.appendChild(card);
    }
    assets.forEach(asset => {
        // Restricted View: Only show final_script
        if (proposal._isRestrictedView && asset.formType !== 'final_script') return;
        
        const card = document.createElement('div');
        card.style.cssText = `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; transition: all 0.2s; box-shadow: var(--shadow-sm);`;
        let date = 'N/A';
        if (asset.submittedAt) {
            const d = asset.submittedAt._seconds ? new Date(asset.submittedAt._seconds * 1000) : new Date(asset.submittedAt);
            date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        const typeLabel = asset.formType.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const displayType = asset.formType === 'insert_footage' ? 'Footage Declaration' : typeLabel;
        const comm = proposal.commissionNumber || 'N/A';
        const story = proposal.story_title || 'N/A';
        const finalName = `${comm} - ${story} - ${displayType}`;
        let typeColor = 'var(--primary)';
        if (asset.formType === 'insert_footage') typeColor = '#f59e0b';
        if (asset.formType === 'final_script') typeColor = '#7c3aed';
        if (asset.formType === 'music_cue_sheet') typeColor = '#ec4899';
        const mainFile = asset.files && asset.files[0];
        const downloadBtn = proposal._isRestrictedView ? '' : `<button onclick="window.downloadAsset('${asset.id}', '${mainFile?.storagePath || ''}', '${finalName.replace(/'/g, "\\'")}.pdf')" class="btn-soft" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; flex: 1; border: 1px solid ${typeColor} !important; color: ${typeColor};">Download PDF</button>`;
        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: flex-start;"><span style="font-size: 0.7rem; font-weight: 800; color: ${typeColor}; letter-spacing: 0.05em;">${displayType.toUpperCase()}</span><span style="font-size: 0.7rem; color: var(--text-muted);">${date}</span></div><div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${finalName}">${finalName}</div><div style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.5rem;">${downloadBtn}<a href="${asset.formType === 'insert_footage' ? 'insert_footage_declaration.html' : (asset.formType === 'final_script' ? 'final_script.html' : 'music_cue_sheet.html')}?id=${asset.id}&project=${proposal.id}" class="btn-soft" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; text-decoration: none; text-align: center; border: 1px solid var(--border) !important;">View Details</a></div>`;
        list.appendChild(card);
    });
}

window.downloadAsset = async (assetId, storagePath, customName) => {
    const sub = window.currentProposal;
    if (sub && sub._isRestrictedView) {
        alert("Download is disabled for this view.");
        return;
    }
    if (!assetId || !storagePath) {
        alert("Invalid file path.");
        return;
    }
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.add('active');
        const response = await fetchWithAuth(`/api/get-file?id=${assetId}&path=${encodeURIComponent(storagePath)}`);
        if (!response.ok) throw new Error('Failed to download file');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = customName || storagePath.split('/').pop() || 'download.pdf';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (err) {
        console.error('Download failed:', err);
        alert('Failed to download file: ' + err.message);
    } finally {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }
};

window.downloadFinalScriptPDF = async (id) => {
    const sub = window.currentProposal;
    if (!sub) {
        alert("No proposal data loaded.");
        return;
    }
    if (sub._isRestrictedView) {
        alert("Download is disabled for this view.");
        return;
    }

    const fs = sub.details && sub.details.finalScript;
    if (!fs) {
        alert("No Final Script data found for this project.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (loadingOverlay) {
        loadingOverlay.classList.add('active');
        document.getElementById('loadingHeading').textContent = 'Generating PDF';
        document.getElementById('loadingSubtext').textContent = 'Please wait while we prepare your document...';
    }

    const normalizeParagraphs = (text) => {
        if (!text) return '';
        let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const paragraphs = normalized.split(/\n{2,}/);
        return paragraphs
            .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(p => p !== '')
            .join('\n\n');
    };

    try {
        let currentY = 20;
        const margin = 20;

        // 1. BRANDING LOGOS
        // Top Left: CAP Logo BLACK
        if (typeof CAP_LOGO_B64 !== 'undefined' && CAP_LOGO_B64) {
            const props = doc.getImageProperties(CAP_LOGO_B64);
            const width = 45;
            const height = width * (props.height / props.width);
            doc.addImage(CAP_LOGO_B64, 'PNG', margin, currentY, width, height);
        }

        // Top Right: CB Logo NEW
        if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
            const props = doc.getImageProperties(CB_LOGO_B64);
            const width = 35;
            const height = width * (props.height / props.width);
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - width, currentY, width, height);
        }
        
        currentY += 25;

        doc.setFontSize(22);
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.text('FINAL SCRIPT', pageWidth / 2, currentY, { align: 'center' });
        currentY += 12;

        const duration = sub.acceptanceDetails?.duration || sub.details?.duration || sub.duration || '—';
        const metadata = [
            ['Commission No', sub.commissionNumber || 'N/A'],
            ['Story Name', sub.story_title || 'Untitled'],
            ['Duration', duration]
        ];

        doc.autoTable({
            startY: currentY,
            body: metadata,
            theme: 'striped',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            margin: { left: margin, right: margin }
        });
        currentY = doc.lastAutoTable.finalY + 12;

        // Promo Lines
        const promoLines = fs.promoLines || [];
        if (promoLines.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text('PROMO LINES', margin, currentY);
            currentY += 8;
            
            doc.autoTable({
                startY: currentY,
                body: promoLines.map(line => [line]),
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 1 },
                margin: { left: margin, right: margin }
            });
            currentY = doc.lastAutoTable.finalY + 12;
        }

        const renderTextSection = (title, text) => {
            if (!text) return;
            const cleanContent = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '');
            const normalized = normalizeParagraphs(cleanContent);
            if (!normalized) return;

            if (currentY > 260) { doc.addPage(); currentY = 20; }
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text(title.toUpperCase(), margin, currentY);
            currentY += 8;
            
            doc.setFontSize(10);
            doc.setTextColor(33, 33, 33);
            doc.setFont('helvetica', 'normal');
            
            const paragraphs = normalized.split('\n\n');
            const bottomMargin = 270;
            const lineHeight = 5.5;

            for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
                const lines = doc.splitTextToSize(paragraphs[pIdx], pageWidth - (margin * 2));
                for (let lIdx = 0; lIdx < lines.length; lIdx++) {
                    if (currentY > bottomMargin) {
                        doc.addPage();
                        currentY = 20;
                        doc.setFontSize(10);
                        doc.setTextColor(33, 33, 33);
                        doc.setFont('helvetica', 'normal');
                    }
                    doc.text(lines[lIdx], margin, currentY);
                    currentY += lineHeight;
                }
                currentY += 4;
            }
            currentY += 6;
        };

        // Press Release
        renderTextSection('PRESS RELEASE', fs.pressRelease);

        // Script Content
        renderTextSection('SCRIPT CONTENT', fs.content);

        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Final_Script_${sub.commissionNumber || id}_${Date.now()}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    } catch (err) {
        console.error('Final Script PDF generation failed:', err);
        alert('Failed to generate Final Script PDF.');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }
};


window.downloadCallSheetFile = async (id, path, filename) => {
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.add('active');
        const token = await window.auth.getIdToken();
        const response = await fetch(`/api/get-call-sheet-file?id=${id}&path=${encodeURIComponent(path)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('File download failed');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        alert('Download failed: ' + err.message);
    } finally {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }
};

function showCallSheetPreview(sub, assets) {
    console.log("[DEBUG] showCallSheetPreview");
    const form = document.getElementById('proposalForm');
    if (form) form.classList.add('hidden');
    const summaryDiv = document.getElementById('proposalSummary');
    if (summaryDiv) {
        summaryDiv.classList.remove('hidden');
        summaryDiv.style.display = 'block';
        renderCallSheetReport(sub);
    }
    setupDeliverablesBar(sub, assets, true);
    document.title = "Call Sheet - Carte Blanche";
    
    // Setup header action button
    const pdfBtn = document.getElementById('topDownloadProposalBtn');
    if (pdfBtn) {
        pdfBtn.textContent = 'Download Call Sheet PDF';
        pdfBtn.onclick = () => window.downloadCallSheetPDF();
        pdfBtn.style.display = 'inline-block';
    }
    const backBtn = document.getElementById('backToProposalBtn');
    if (backBtn) {
        backBtn.classList.remove('hidden');
        backBtn.style.display = 'inline-block';
        backBtn.href = `proposal.html?id=${sub.id}&view=preview`;
    }
}

function renderCallSheetReport(sub) {
    const summaryDiv = document.getElementById('proposalSummary');
    if (!summaryDiv) return;
    
    const cs = (sub.details && sub.details.callSheet) || {};
    
    // Prepare Crew HTML
    const crewFields = [
        { label: 'Presenter', name: cs.presenter_name || '—', phone: cs.presenter_phone || '—', id: cs.presenter_id || '—' },
        { label: 'Producer / Director', name: (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail, phone: cs.producer_phone || '—', id: cs.producer_id || '—' },
        { label: 'DOP', name: cs.dop_name || '—', phone: cs.dop_phone || '—', id: cs.dop_id || '—' },
        { label: 'Camera Assistant', name: cs.cam_assistant_name || '—', phone: cs.cam_assistant_phone || '—', id: cs.cam_assistant_id || '—' },
        { label: 'Security', name: cs.security_name || '—', phone: cs.security_phone || '—', id: 'Status: ' + (cs.security_status === 'required' ? 'Required' : 'Not Required') }
    ];
    
    let flightFileHtml = '—';
    if (cs.travel && cs.travel.flight_file_path) {
        flightFileHtml = `<button type="button" class="btn-soft" onclick="window.downloadCallSheetFile('${sub.id}', '${cs.travel.flight_file_path}', '${cs.travel.flight_filename || 'Flight_Booking.pdf'}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Download PDF Attachment</button>`;
    }
    
    let transFileHtml = '—';
    if (cs.travel && cs.travel.trans_file_path) {
        transFileHtml = `<button type="button" class="btn-soft" onclick="window.downloadCallSheetFile('${sub.id}', '${cs.travel.trans_file_path}', '${cs.travel.trans_filename || 'Transport_Booking.pdf'}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Download PDF Attachment</button>`;
    }

    const t = cs.travel || {};
    const k = cs.kit || {};

    summaryDiv.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; padding: 3rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); color: var(--text-main); font-family: 'Inter', sans-serif;">
            <div style="border-bottom: 2px solid var(--success); padding-bottom: 1.5rem; margin-bottom: 2.5rem; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h1 style="font-size: 2.25rem; margin: 0; color: var(--text-main); line-height: 1.2;">CALL SHEET</h1>
                    <p style="margin: 0.75rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">
                        Story: <b style="color: var(--text-main);">${sub.story_title}</b>
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.7rem; font-weight: 800; color: var(--success); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.25rem;">Commission Number</div>
                    <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid var(--success); color: var(--success); padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 900; font-size: 1.75rem; display: inline-block;">
                        #${sub.commissionNumber || 'N/A'}
                    </div>
                </div>
            </div>

            <!-- CREW DETAILS -->
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700;">Crew Details</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                            <th style="text-align: left; padding: 0.5rem;">Role</th>
                            <th style="text-align: left; padding: 0.5rem;">Name & Surname</th>
                            <th style="text-align: left; padding: 0.5rem;">Cell Number</th>
                            <th style="text-align: left; padding: 0.5rem;">ID Number / Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${crewFields.map(f => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem 0.5rem; font-weight: 600;">${f.label}</td>
                                <td style="padding: 0.75rem 0.5rem;">${f.name}</td>
                                <td style="padding: 0.75rem 0.5rem;">${f.phone}</td>
                                <td style="padding: 0.75rem 0.5rem;">${f.id}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- MOVEMENT ORDER -->
            <div style="margin-bottom: 3rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                    <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); margin: 0; font-weight: 700;">Movement Order</h3>
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Shoot Day ${cs.shoot_day || '—'} (${formatStoryDate(cs.shoot_date)})</span>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 1.5rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                            <th style="text-align: left; padding: 0.5rem; width: 150px;">Time [24H]</th>
                            <th style="text-align: left; padding: 0.5rem;">What's Happening?</th>
                            <th style="text-align: left; padding: 0.5rem;">Location</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cs.movementOrder && cs.movementOrder.length > 0 ? cs.movementOrder.map(r => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem 0.5rem; font-weight: 600;">${r.time}</td>
                                <td style="padding: 0.75rem 0.5rem;">${r.what}</td>
                                <td style="padding: 0.75rem 0.5rem;">${r.location}</td>
                            </tr>
                        `).join('') : `<tr><td colspan="3" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No movement items scheduled.</td></tr>`}
                    </tbody>
                </table>

                <div style="margin-top: 1.5rem; background: rgba(0,0,0,0.02); padding: 1.25rem; border-radius: 8px; border: 1px dashed var(--border);">
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin: 0 0 0.5rem 0;">Story Description (Risk Assessment)</h4>
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap;">${cs.story_description || 'No description / risk assessment provided.'}</p>
                </div>
            </div>

            <!-- KIT / EQUIPMENT -->
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700;">Kit / Equipment</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; font-size: 0.9rem;">
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Camera (Cam A-F)</span><span style="font-weight: 600;">${k.camera || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Audio (Mic 1-6)</span><span style="font-weight: 600;">${k.audio || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Lenses</span><span style="font-weight: 600;">${k.lenses || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Lighting Kit</span><span style="font-weight: 600;">${k.lighting || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Rigs</span><span style="font-weight: 600;">${k.rigs || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Other</span><span style="font-weight: 600;">${k.other || '—'}</span></div>
                </div>
            </div>

            <!-- TRAVEL & VEHICLES -->
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700;">Travel & Vehicles</h3>
                
                <div style="margin-bottom: 1.5rem; background: rgba(0,0,0,0.01); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="font-size: 0.85rem; color: var(--success); margin: 0 0 1rem 0;">Flight Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Passenger Name</span><span style="font-weight: 600;">${t.flight_name || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Flight Details</span><span style="font-weight: 600;">${t.flight_details || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Travel Booking PDF</span>${flightFileHtml}</div>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem; background: rgba(0,0,0,0.01); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="font-size: 0.85rem; color: var(--success); margin: 0 0 1rem 0;">Accommodation Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Guest Name</span><span style="font-weight: 600;">${t.accom_name || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Location / Address</span><span style="font-weight: 600;">${t.accom_location || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Duration Dates</span><span style="font-weight: 600;">${t.accom_from ? `${formatStoryDate(t.accom_from)} to ${formatStoryDate(t.accom_to)}` : '—'}</span></div>
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.01); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="font-size: 0.85rem; color: var(--success); margin: 0 0 1rem 0;">Transport Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem; margin-bottom: 1rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Name / Surname</span><span style="font-weight: 600;">${t.trans_name || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">From Location</span><span style="font-weight: 600;">${t.trans_from_loc || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">To Location</span><span style="font-weight: 600;">${t.trans_to_loc || '—'}</span></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Dates</span><span style="font-weight: 600;">${t.trans_from_date ? `${formatStoryDate(t.trans_from_date)} to ${formatStoryDate(t.trans_to_date)}` : '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Time Slot</span><span style="font-weight: 600;">${t.trans_from_time || '—'} to ${t.trans_to_time || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Rental Booking PDF</span>${transFileHtml}</div>
                    </div>
                </div>
            </div>

            <div style="margin-top: 5rem; padding-top: 2.5rem; border-top: 1px solid var(--border); text-align: center;" class="no-print">
                <p style="margin-top: 0;"><a href="proposal.html?id=${sub.id}&view=preview" style="color: var(--text-muted); font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">← Back to Proposal Preview</a></p>
            </div>
        </div>
    `;
}

window.downloadCallSheetPDF = async () => {
    const sub = window.currentProposal;
    if (!sub) {
        alert("No proposal data loaded.");
        return;
    }
    const cs = (sub.details && sub.details.callSheet) || {};

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (loadingOverlay) {
        loadingOverlay.classList.add('active');
        document.getElementById('loadingHeading').textContent = 'Generating PDF';
        document.getElementById('loadingSubtext').textContent = 'Please wait while we prepare your Call Sheet PDF...';
    }

    try {
        let currentY = 20;
        const margin = 20;

        // Branding Logos
        if (typeof CAP_LOGO_B64 !== 'undefined' && CAP_LOGO_B64) {
            const props = doc.getImageProperties(CAP_LOGO_B64);
            const width = 45;
            const height = width * (props.height / props.width);
            doc.addImage(CAP_LOGO_B64, 'PNG', margin, currentY, width, height);
        }
        if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
            const props = doc.getImageProperties(CB_LOGO_B64);
            const width = 35;
            const height = width * (props.height / props.width);
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - width, currentY, width, height);
        }
        currentY += 25;

        doc.setFontSize(22);
        doc.setTextColor(16, 185, 129); // Green accent
        doc.setFont('helvetica', 'bold');
        doc.text('CALL SHEET', pageWidth / 2, currentY, { align: 'center' });
        currentY += 10;

        // Core details table
        const metadata = [
            ['Story Title', sub.story_title || 'Untitled'],
            ['Commission No', sub.commissionNumber || 'N/A'],
            ['Shoot Day', cs.shoot_day || '—'],
            ['Shoot Date', cs.shoot_date ? formatStoryDate(cs.shoot_date) : '—']
        ];
        doc.autoTable({
            startY: currentY,
            body: metadata,
            theme: 'striped',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            margin: { left: margin, right: margin }
        });
        currentY = doc.lastAutoTable.finalY + 10;

        // Crew table
        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('CREW DETAILS', margin, currentY);
        currentY += 6;

        const producerName = (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail;
        const crewData = [
            ['Presenter', cs.presenter_name || '—', cs.presenter_phone || '—', cs.presenter_id || '—'],
            ['Producer / Director', producerName, cs.producer_phone || '—', cs.producer_id || '—'],
            ['DOP', cs.dop_name || '—', cs.dop_phone || '—', cs.dop_id || '—'],
            ['Camera Assistant', cs.cam_assistant_name || '—', cs.cam_assistant_phone || '—', cs.cs_cam_assistant_id || cs.cam_assistant_id || '—'],
            ['Security', cs.security_name || '—', cs.security_phone || '—', cs.security_status === 'required' ? 'Required' : 'Not Required']
        ];
        doc.autoTable({
            startY: currentY,
            head: [['Role', 'Name & Surname', 'Cell Number', 'ID Number / Status']],
            body: crewData,
            theme: 'striped',
            headStyles: { fillColor: [16, 185, 129], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            margin: { left: margin, right: margin }
        });
        currentY = doc.lastAutoTable.finalY + 10;

        // Movement Order
        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('MOVEMENT ORDER', margin, currentY);
        currentY += 6;

        const moData = (cs.movementOrder || []).map(r => [r.time || '', r.what || '', r.location || '']);
        doc.autoTable({
            startY: currentY,
            head: [['Time', 'What\'s Happening?', 'Location']],
            body: moData.length > 0 ? moData : [['—', 'No movement slots scheduled.', '—']],
            theme: 'striped',
            headStyles: { fillColor: [16, 185, 129], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            margin: { left: margin, right: margin }
        });
        currentY = doc.lastAutoTable.finalY + 10;

        // Risk Assessment
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('RISK ASSESSMENT / STORY DESCRIPTION', margin, currentY);
        currentY += 6;
        doc.setFontSize(9);
        doc.setTextColor(33, 33, 33);
        doc.setFont('helvetica', 'normal');
        const splitDesc = doc.splitTextToSize(cs.story_description || 'No description provided.', pageWidth - margin * 2);
        doc.text(splitDesc, margin, currentY);
        currentY += (splitDesc.length * 5) + 10;

        // Kit
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('KIT / EQUIPMENT', margin, currentY);
        currentY += 6;
        const k = cs.kit || {};
        const kitData = [
            ['Camera', k.camera || '—'],
            ['Audio', k.audio || '—'],
            ['Lenses', k.lenses || '—'],
            ['Lighting Kit', k.lighting || '—'],
            ['Rigs', k.rigs || '—'],
            ['Other', k.other || '—']
        ];
        doc.autoTable({
            startY: currentY,
            body: kitData,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            margin: { left: margin, right: margin }
        });
        currentY = doc.lastAutoTable.finalY + 10;

        // Travel & Vehicles
        if (currentY > 220) { doc.addPage(); currentY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('TRAVEL & VEHICLES', margin, currentY);
        currentY += 6;
        
        const t = cs.travel || {};
        const travelData = [
            ['Flight Guest', t.flight_name || '—', 'Flight Info', t.flight_details || '—'],
            ['Accom Guest', t.accom_name || '—', 'Accom Address', t.accom_location || '—'],
            ['Accom From', t.accom_from || '—', 'Accom To', t.accom_to || '—'],
            ['Driver', t.trans_name || '—', 'Transport route', `From ${t.trans_from_loc || '—'} to ${t.trans_to_loc || '—'}`],
            ['Transport From', t.trans_from_date || '—', 'Transport To', t.trans_to_date || '—'],
            ['Trans Times', `From ${t.trans_from_time || '—'} to ${t.trans_to_time || '—'}`, '', '']
        ];
        doc.autoTable({
            startY: currentY,
            body: travelData,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { fontStyle: 'bold', cellWidth: 35 } },
            margin: { left: margin, right: margin }
        });

        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Call_Sheet_${sub.commissionNumber || sub.id}_${Date.now()}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    } catch (err) {
        console.error('Call Sheet PDF generation failed:', err);
        alert('Failed to generate Call Sheet PDF.');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }
};


window.downloadProposalPDF = async () => {
    const sub = window.currentProposal;
    if (!sub) {
        alert("No proposal data loaded.");
        return;
    }
    if (sub._isRestrictedView) {
        alert("Download is disabled for this view.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (loadingOverlay) {
        loadingOverlay.classList.add('active');
        document.getElementById('loadingHeading').textContent = 'Generating PDF';
        document.getElementById('loadingSubtext').textContent = 'Please wait while we prepare your document...';
    }

    const normalizeParagraphs = (text) => {
        if (!text) return '';
        let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const paragraphs = normalized.split(/\n{2,}/);
        return paragraphs
            .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(p => p !== '')
            .join('\n\n');
    };

    try {
        let currentY = 20;
        const margin = 20;

        // 1. BRANDING LOGOS
        // Top Left: CAP Logo BLACK
        if (typeof CAP_LOGO_B64 !== 'undefined' && CAP_LOGO_B64) {
            const props = doc.getImageProperties(CAP_LOGO_B64);
            const width = 45;
            const height = width * (props.height / props.width);
            doc.addImage(CAP_LOGO_B64, 'PNG', margin, currentY, width, height);
        }

        // Top Right: CB Logo NEW
        if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
            const props = doc.getImageProperties(CB_LOGO_B64);
            const width = 35;
            const height = width * (props.height / props.width);
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - width, currentY, width, height);
        }
        
        currentY += 25;

        doc.setFontSize(22);
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.text('STORY PROPOSAL', pageWidth / 2, currentY, { align: 'center' });
        currentY += 12;

        // Metadata table
        const date = sub.submittedAt ? (sub.submittedAt._seconds ? new Date(sub.submittedAt._seconds * 1000) : new Date(sub.submittedAt)) : new Date();
        const submitter = (sub.submittedByName && sub.submittedBySurname) ? `${sub.submittedByName} ${sub.submittedBySurname}` : sub.submittedByEmail;
        
        const metadata = [
            ['Story Title', sub.story_title || 'Untitled'],
            ['Commission No', sub.commissionNumber || 'N/A'],
            ['Producer', submitter],
            ['Submitted Date', date.toLocaleDateString()],
            ['Location', sub._isRestrictedView ? '—' : ((sub.locations && sub.locations.length > 0) ? sub.locations.map(l => `${l.country || ''}${l.province ? ` / ${l.province}` : ''}`).join(', ') : `${sub.country || '—'} / ${sub.province || '—'}`)]
        ];

        doc.autoTable({
            startY: currentY,
            body: metadata,
            theme: 'striped',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            margin: { left: margin, right: margin }
        });
        currentY = doc.lastAutoTable.finalY + 12;

        // Sections
        const addSection = (title, content) => {
            if (!content) return;
            
            // Clean HTML tags and normalize paragraphs
            const cleanContent = content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '');
            const normalized = normalizeParagraphs(cleanContent);
            if (!normalized) return;

            if (currentY > 260) { doc.addPage(); currentY = 20; }
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text(title.toUpperCase(), margin, currentY);
            currentY += 8;

            doc.setFontSize(10);
            doc.setTextColor(33, 33, 33);
            doc.setFont('helvetica', 'normal');
            
            const paragraphs = normalized.split('\n\n');
            const bottomMargin = 270;
            const lineHeight = 5.5;

            for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
                const lines = doc.splitTextToSize(paragraphs[pIdx], pageWidth - (margin * 2));
                for (let lIdx = 0; lIdx < lines.length; lIdx++) {
                    if (currentY > bottomMargin) {
                        doc.addPage();
                        currentY = 20;
                        doc.setFontSize(10);
                        doc.setTextColor(33, 33, 33);
                        doc.setFont('helvetica', 'normal');
                    }
                    doc.text(lines[lIdx], margin, currentY);
                    currentY += lineHeight;
                }
                currentY += 4; // Space between paragraphs
            }
            currentY += 6; // Space after section
        };

        addSection('One Liner', sub.one_liner);
        addSection('Story Summary', sub.summary || '');

        if (!sub._isRestrictedView && sub.extra_budget === 'yes' && sub.budgetItems && sub.budgetItems.length > 0) {
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text('EXTRA BUDGET ITEMS', margin, currentY);
            currentY += 8;
            
            doc.autoTable({
                startY: currentY,
                head: [['Item', 'Reason', 'Cost']],
                body: sub.budgetItems.map(b => [b.item, b.reason, b.cost]),
                theme: 'striped',
                headStyles: { fillColor: [0, 143, 190], textColor: 255 },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            currentY = doc.lastAutoTable.finalY + 12;
        }

        // Case Studies
        if (!sub._isRestrictedView && sub.caseStudies && sub.caseStudies.length > 0) {
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text('CASE STUDIES', margin, currentY);
            currentY += 8;
            
            doc.autoTable({
                startY: currentY,
                body: sub.caseStudies.map(cs => [`${cs.name} ${cs.surname}`, cs.role || 'Case Study']),
                theme: 'plain',
                styles: { fontSize: 10 },
                margin: { left: margin, right: margin }
            });
            currentY = doc.lastAutoTable.finalY + 12;
        }

        // Experts
        if (sub.experts && sub.experts.length > 0) {
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text('EXPERTS', margin, currentY);
            currentY += 8;
            
            doc.autoTable({
                startY: currentY,
                body: sub.experts.map(ex => [`${ex.name} ${ex.surname}`, ex.role || 'Expert']),
                theme: 'plain',
                styles: { fontSize: 10 },
                margin: { left: margin, right: margin }
            });
            currentY = doc.lastAutoTable.finalY + 12;
        }

        // Team / Insert Details
        if (!sub._isRestrictedView && sub.details) {
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(12);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text('INSERT DETAILS / TEAM', margin, currentY);
            currentY += 8;
            
            const getFullName = (obj) => {
                if (typeof obj === 'object' && obj !== null) return `${obj.name || ''} ${obj.surname || ''}`.trim();
                return (obj || '').toString().trim();
            };

            const team = [
                ['Presenter', sub.details.presenter || '—'],
                ['DOP', getFullName(sub.details.dop) || '—'],
                ['Sound', getFullName(sub.details.sound) || '—'],
                ['Offline Editor', getFullName(sub.details.offline_editor) || '—'],
                ['Online Editor', getFullName(sub.details.online_editor) || '—'],
                ['Audio Final Mix', getFullName(sub.details.audio_final_mix) || '—']
            ];
            
            doc.autoTable({
                startY: currentY,
                body: team,
                theme: 'plain',
                styles: { fontSize: 10 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
                margin: { left: margin, right: margin }
            });
        }

        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Story_Proposal_${sub.commissionNumber || sub.id}_${Date.now()}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    } catch (err) {
        console.error('PDF generation failed:', err);
        alert('Failed to generate simplified PDF. Please try again.');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }
};
});
