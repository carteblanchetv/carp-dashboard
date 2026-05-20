// footage_agreement.js
// VERSION: 1.2.1-SERVER-STORAGE (CORS 404 Fix)

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded: footage_agreement.js 1.2.1-SERVER-STORAGE');
    
    const tableBody = document.getElementById('footageTableBody');
    const addRowBtn = document.getElementById('addRowBtn');
    const form = document.getElementById('footageAgreementForm');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const footageSection = document.getElementById('footageDeclarationSection');
    const totalDurationInput = document.getElementById('total_duration');
    const refreshStoriesBtn = document.getElementById('refreshStoriesBtn');
    const importBtn = document.getElementById('importBtn');
    const importSelect = document.getElementById('importStorySelect');
    const importStatus = document.getElementById('importStatus');
    let availableStories = [];

    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    let isEditMode = !!submissionId;

    // --- SUPPORTING DOCUMENTS LOGIC ---
    let selectedFiles = [];
    const fileInput = document.getElementById('supportingDocsInput');
    const fileOrderList = document.getElementById('fileOrderList');

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const newFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
            selectedFiles = [...selectedFiles, ...newFiles];
            renderFileList();
            e.target.value = ''; // Reset input
        });
    }

    function renderFileList() {
        if (!fileOrderList) return;
        fileOrderList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <span class="file-name">${file.name}</span>
                <div class="file-actions">
                    <button type="button" class="action-icon-btn" onclick="window.moveFile(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move Up">↑</button>
                    <button type="button" class="action-icon-btn" onclick="window.moveFile(${index}, 1)" ${index === selectedFiles.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
                    <button type="button" class="action-icon-btn remove" onclick="window.removeFile(${index})" title="Remove">&times;</button>
                </div>
            `;
            fileOrderList.appendChild(item);
        });
    }

    window.moveFile = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= selectedFiles.length) return;
        const temp = selectedFiles[index];
        selectedFiles[index] = selectedFiles[target];
        selectedFiles[target] = temp;
        renderFileList();
    };

    window.removeFile = (index) => {
        selectedFiles.splice(index, 1);
        renderFileList();
    };

    // --- EXISTING FILES LOGIC (EDIT MODE) ---
    async function deleteExistingFile(storagePath) {
        if (!confirm('Are you sure you want to delete this file? This cannot be undone.')) return;
        
        try {
            loadingOverlay.classList.add('active');
            const token = await window.auth.getIdToken();
            const response = await fetch('/api/delete-file', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ submissionId, storagePath })
            });
            const result = await response.json();
            if (result.success) {
                location.reload(); // Refresh to show updated list
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert('Delete failed: ' + err.message);
            loadingOverlay.classList.remove('active');
        }
    }
    window.deleteExistingFile = deleteExistingFile;

    const INITIAL_ROWS = 15;
    const DEFAULT_CONTACT = "As per attached agreement";

    function formatTimecode(input) {
        let val = input.value.replace(/\D/g, '');
        if (val.length > 6) val = val.slice(0, 6);
        let formatted = '';
        if (val.length > 0) formatted += val.slice(0, 2);
        if (val.length > 2) formatted += ':' + val.slice(2, 4);
        if (val.length > 4) formatted += ':' + val.slice(4, 6);
        input.value = formatted;
    }

    function calculateDuration(start, end, displayField) {
        if (!start || !end || start.length < 8 || end.length < 8) {
            displayField.value = "00:00:00";
            return;
        }
        const sParts = start.split(':').map(Number);
        const eParts = end.split(':').map(Number);
        const sSecs = sParts[0] * 3600 + sParts[1] * 60 + sParts[2];
        const eSecs = eParts[0] * 3600 + eParts[1] * 60 + eParts[2];
        let diff = Math.max(0, eSecs - sSecs);
        const h = Math.floor(diff / 3600).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        displayField.value = `${h}:${m}:${s}`;
    }

    function createStoryHeaderRow(storyName) {
        const row = document.createElement('tr');
        row.className = 'story-header-row';
        row.innerHTML = `
            <td colspan="12">
                STORY: ${storyName}
            </td>
            <td><button type="button" class="remove-btn" title="Remove">&times;</button></td>
        `;
        row.querySelector('.remove-btn').addEventListener('click', () => { row.remove(); });
        tableBody.appendChild(row);
        return row;
    }

    function createRow(parent) {
        const container = parent || tableBody;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><select name="type[]" class="table-input"><option value="Video">Video</option><option value="Photo">Photo</option><option value="Newspaper Clipping">Newspaper Clipping</option><option value="Other">Other</option></select></td>
            <td><input type="text" name="clip_name[]" class="table-input"></td>
            <td><input type="text" name="description[]" class="table-input"></td>
            <td><input type="text" name="source[]" class="table-input"></td>
            <td><input type="text" name="contact[]" class="table-input" value="${DEFAULT_CONTACT}"></td>
            <td><select name="agreement[]" class="table-input"><option value="Yes">Yes</option><option value="No">No</option></select></td>
            <td><input type="text" name="tc_in[]" class="table-input tc-input" placeholder="00:00:00"></td>
            <td><input type="text" name="tc_out[]" class="table-input tc-input" placeholder="00:00:00"></td>
            <td><input type="text" name="duration[]" class="table-input duration-display" readonly placeholder="00:00:00"></td>
            <td><select name="licence_req[]" class="table-input"><option value="Yes">Yes</option><option value="No">No</option></select></td>
            <td><select name="licence_period[]" class="table-input"><option value="1 Year">1 Year</option><option value="2 Years">2 Years</option><option value="In Perpetuity">In Perpetuity</option><option value="Other">Other</option></select></td>
            <td><select name="resale[]" class="table-input"><option value="Yes">Yes</option><option value="No" selected>No</option></select></td>
            <td><button type="button" class="remove-btn" title="Remove">&times;</button></td>
        `;
        const tcIn = row.querySelector('input[name="tc_in[]"]');
        const tcOut = row.querySelector('input[name="tc_out[]"]');
        const durField = row.querySelector('input[name="duration[]"]');
        [tcIn, tcOut].forEach(input => {
            input.addEventListener('input', (e) => { formatTimecode(e.target); calculateDuration(tcIn.value, tcOut.value, durField); });
        });
        row.querySelector('.remove-btn').addEventListener('click', () => { if (document.querySelectorAll('#footageTableBody tr').length > 1) row.remove(); });
        container.appendChild(row);
        return row;
    }

    async function loadSubmissionData() {
        if (!isEditMode) return;
        
        try {
            loadingOverlay.classList.add('active');
            const token = await window.auth.getIdToken();
            const response = await fetch(`/api/get-submission/${submissionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                const sub = result.submission;
                // Add Edit Mode Badge
                const header = document.querySelector('.form-header');
                const badge = document.createElement('div');
                badge.className = 'edit-mode-badge';
                badge.textContent = 'EDIT MODE: ' + sub.id;
                header.insertAdjacentElement('afterend', badge);
                
                // Populate Fields
                form.tx_date.value = sub.txDate || '';
                form.season.value = sub.season || '';
                form.episode.value = sub.episode || '';
                form.uid_number.value = sub.uid || '';
                form.total_duration.value = sub.duration || '';
                
                // Populate Footage Section
                if (sub.footage && sub.footage.length > 0) {
                    tableBody.innerHTML = '';
                    sub.footage.forEach(item => {
                        createRow();
                        const row = tableBody.lastElementChild;
                        row.querySelector('select[name="type[]"]').value = item.type;
                        row.querySelector('input[name="clip_name[]"]').value = item.clip_name;
                        row.querySelector('input[name="description[]"]').value = item.description;
                        row.querySelector('input[name="source[]"]').value = item.source;
                        row.querySelector('input[name="contact[]"]').value = item.contact;
                        row.querySelector('select[name="agreement[]"]').value = item.agreement;
                        row.querySelector('input[name="tc_in[]"]').value = item.tc_in;
                        row.querySelector('input[name="tc_out[]"]').value = item.tc_out;
                        row.querySelector('input[name="duration[]"]').value = item.duration;
                        row.querySelector('select[name="licence_req[]"]').value = item.licence_req;
                        row.querySelector('select[name="licence_period[]"]').value = item.licence_period;
                        row.querySelector('select[name="resale[]"]').value = item.resale;
                    });
                }
                
                // Existing Files
                if (sub.files && sub.files.length > 0) {
                    const section = document.createElement('section');
                    section.className = 'form-section';
                    section.innerHTML = `
                        <h2 class="section-title">Already Uploaded Documents</h2>
                        <div class="existing-files-list">
                            ${sub.files.map(f => `
                                <div class="existing-file-item">
                                    <span class="file-name">${f.filename}</span>
                                    <button type="button" class="action-icon-btn remove" onclick="window.deleteExistingFile('${f.storagePath}')" title="Delete Permanently">🗑️</button>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    document.getElementById('fileOrderList').parentElement.insertAdjacentElement('beforebegin', section);
                }
                
                document.getElementById('submitBtn').textContent = 'Update Declaration';
            }
        } catch (err) {
            console.error("Load failed:", err);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    }

    if (isEditMode) {
        loadSubmissionData();
    } else {
        for (let i = 0; i < INITIAL_ROWS; i++) createRow();
    }
    
    addRowBtn.addEventListener('click', createRow);
    
    // Auto-fetch stories on load since section is now always visible
    fetchStories();

    if (refreshStoriesBtn) {
        refreshStoriesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fetchStories();
        });
    }

    totalDurationInput.addEventListener('input', (e) => formatTimecode(e.target));

    // --- IMPORT LOGIC ---

    async function fetchStories() {
        try {
            importSelect.innerHTML = '<option value="">-- Loading stories... --</option>';
            const token = await window.auth.getIdToken();
            const response = await fetch('/api/insert-footage-stories', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                availableStories = result.stories;
                importSelect.innerHTML = '<option value="">-- Select a story --</option>';
                if (availableStories.length === 0) {
                    importSelect.innerHTML = '<option value="">No stories found in last 30 days</option>';
                } else {
                    availableStories.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        // Handle Firestore timestamp or Date string
                        let dateStr = 'Unknown Date';
                        if (s.submittedAt) {
                            const date = s.submittedAt._seconds ? new Date(s.submittedAt._seconds * 1000) : new Date(s.submittedAt);
                            dateStr = date.toLocaleDateString();
                        }
                        opt.textContent = `${s.storyName || 'Unnamed Story'} (${dateStr})`;
                        importSelect.appendChild(opt);
                    });
                }
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('Failed to fetch stories:', err);
            importStatus.textContent = 'Failed to load stories.';
            importSelect.innerHTML = '<option value="">Error loading stories</option>';
        }
    }

    importBtn.addEventListener('click', () => {
        try {
            console.log('Import and Append clicked.');
            const storyId = importSelect.value;
            if (!storyId) {
                alert('Please select a story first.');
                return;
            }

            console.log('Searching for story ID:', storyId);
            const story = availableStories.find(s => s.id === storyId);
            if (!story) {
                console.error('Story not found in availableStories list.');
                alert('Error: Selected story not found. Please refresh the list.');
                return;
            }

            if (!story.footage || story.footage.length === 0) {
                alert('No footage found for this story.');
                return;
            }

            console.log('Story found:', story.storyName, 'with', story.footage.length, 'entries');

            // Remove rows where all TEXT inputs are blank / default — selects always have a value so ignore them
            const currentRows = tableBody.querySelectorAll('tr');
            currentRows.forEach(row => {
                if (row.classList.contains('story-header-row')) return;

                const textInputs = row.querySelectorAll('input[type="text"], input:not([type])');
                let rowHasData = false;
                textInputs.forEach(input => {
                    const val = input.value.trim();
                    if (val !== '' && val !== DEFAULT_CONTACT) {
                        rowHasData = true;
                    }
                });

                if (!rowHasData) {
                    row.remove();
                }
            });

            // Build a document fragment for the new story so we can prepend it
            const fragment = document.createDocumentFragment();

            // Story header
            const headerRow = document.createElement('tr');
            headerRow.className = 'story-header-row';
            headerRow.innerHTML = `
                <td colspan="12" style="background: var(--primary); color: white; font-weight: bold; padding: 0.75rem; text-align: left; border-radius: 4px;">
                    STORY: ${story.storyName}
                </td>
                <td><button type="button" class="remove-btn" title="Remove">&times;</button></td>
            `;
            headerRow.querySelector('.remove-btn').addEventListener('click', () => { headerRow.remove(); });
            fragment.appendChild(headerRow);

            story.footage.forEach((item, idx) => {
                const row = createRow(fragment); // createRow appends to fragment instead of tableBody
                // Populate row
                try {
                    if (item.type) row.querySelector('select[name="type[]"]').value = item.type;
                    if (item.clip_name) row.querySelector('input[name="clip_name[]"]').value = item.clip_name;
                    if (item.description) row.querySelector('input[name="description[]"]').value = item.description;
                    if (item.source) row.querySelector('input[name="source[]"]').value = item.source;
                    if (item.contact) row.querySelector('input[name="contact[]"]').value = item.contact;
                    if (item.agreement) row.querySelector('select[name="agreement[]"]').value = item.agreement;
                    if (item.tc_in) row.querySelector('input[name="tc_in[]"]').value = item.tc_in;
                    if (item.tc_out) row.querySelector('input[name="tc_out[]"]').value = item.tc_out;
                    if (item.duration) row.querySelector('input[name="duration[]"]').value = item.duration;
                    if (item.licence_req) row.querySelector('select[name="licence_req[]"]').value = item.licence_req;
                    if (item.licence_period) row.querySelector('select[name="licence_period[]"]').value = item.licence_period;
                    if (item.resale) row.querySelector('select[name="resale[]"]').value = item.resale;
                } catch (rowErr) {
                    console.warn(`Failed to populate row ${idx}:`, rowErr);
                }
            });

            // Prepend the whole fragment to the TOP of the table
            const firstExisting = tableBody.querySelector('tr');
            if (firstExisting) {
                tableBody.insertBefore(fragment, firstExisting);
            } else {
                tableBody.appendChild(fragment);
            }

            importStatus.textContent = `Successfully imported ${story.footage.length} entries from "${story.storyName}".`;
            setTimeout(() => { importStatus.textContent = ''; }, 5000);
        } catch (err) {
            console.error('CRITICAL IMPORT ERROR:', err);
            alert('A critical error occurred during import: ' + err.message);
        }
    });

    async function generatePDFBlob() {
        console.log('Generating PDF...');
        const { jsPDF } = window.jspdf;
        // Use landscape orientation to fit all 12 columns
        const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // 1. BRANDING LOGOS
        if (typeof getBlackLogo === 'function') {
            const blackLogo = getBlackLogo();
            const props = doc.getImageProperties(blackLogo);
            const ratio = props.height / props.width;
            const width = 45;
            const height = width * ratio;
            doc.addImage(blackLogo, 'PNG', 14, 25, width, height);
        }
        if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
            const props = doc.getImageProperties(CB_LOGO_B64);
            const ratio = props.height / props.width;
            const width = 40;
            const height = width * ratio;
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - 14 - width, 25, width, height);
        }

        doc.setFontSize(22);
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.text('MASTER FOOTAGE DECLARATION (FDL)', pageWidth / 2, 60, { align: 'center' });
        
        // Header Info
        doc.autoTable({
            startY: 68, theme: 'plain', styles: { fontSize: 9, cellPadding: 1, overflow: 'linebreak' },
            body: [
                ['TX Date:', form.tx_date.value, 'Season:', form.season.value, 'Episode:', form.episode.value],
                ['UID Number:', form.uid_number.value, 'Duration:', form.total_duration.value, '', '']
            ]
        });

        // Footage Table Data
        const rows = [];
        const tableRows = document.querySelectorAll('#footageTableBody tr');
        
        tableRows.forEach(tr => {
            if (tr.classList.contains('story-header-row')) {
                const headerText = tr.cells[0].textContent.trim();
                rows.push([{ 
                    content: headerText, 
                    colSpan: 12, 
                    styles: { 
                        fillColor: [44, 62, 80], 
                        textColor: 255, 
                        fontStyle: 'bold', 
                        fontSize: 9,
                        halign: 'left',
                        cellPadding: 3
                    } 
                }]);
                return;
            }

            const rowData = [];
            const inputs = tr.querySelectorAll('.table-input');
            let hasData = false;
            
            inputs.forEach((input, index) => {
                const val = (input.tagName === 'SELECT' ? input.options[input.selectedIndex].text : input.value) || '';
                if (index === 1 && val) hasData = true; // Clip Name has data
                if (index === 2 && val) hasData = true; // Description has data
                rowData.push(val);
            });
            
            if (hasData) {
                rows.push(rowData);
            }
        });

        // Render the 12-column table
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [['Type', 'Clip Name', 'Description', 'Source', 'Contact', 'Agr?', 'In', 'Out', 'Dur', 'Lic?', 'Period', 'Resale']],
            body: rows,
            theme: 'striped',
            margin: { left: 14, right: 14 },
            headStyles: { fillColor: [0, 143, 190], textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 15 }, // Type
                1: { cellWidth: 30 }, // Clip Name
                2: { cellWidth: 50 }, // Description
                3: { cellWidth: 30 }, // Source
                4: { cellWidth: 45 }, // Contact
                5: { cellWidth: 12 }, // Agreement
                6: { cellWidth: 15 }, // In
                7: { cellWidth: 15 }, // Out
                8: { cellWidth: 15 }, // Duration
                9: { cellWidth: 12 }, // Lic Req
                10: { cellWidth: 20 }, // Period
                11: { cellWidth: 10 }  // Resale
            }
        });

        console.log('PDF Generated successfully.');
        return doc.output('blob');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Submit clicked.');
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) submitBtn.disabled = true;
        loadingOverlay.classList.add('active');

        try {
            const pdfBlob = await generatePDFBlob();
            
            const formData = new FormData(form);
            if (isEditMode) {
                formData.append('id', submissionId);
                formData.append('formType', 'episode_footage');
            }

            // Append declaration PDF
            formData.append('declaration', pdfBlob, `FootageDeclaration_${isEditMode ? 'Update_' : ''}${Date.now()}.pdf`);

            // Append each supporting doc
            selectedFiles.forEach((file, index) => {
                formData.append(`supporting_${index}`, file, file.name);
            });

            console.log(`Sending data to server...`);
            const token = await window.auth.getIdToken();
            const endpoint = isEditMode ? '/api/update-submission' : '/api/send-footage-agreement';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            console.log('Server response received.');
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Server error');

            console.log('Submission complete.');
            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            if (dialog) {
                dialog.classList.remove('hidden');
                document.getElementById('dialogCloseBtn').onclick = () => window.location.href = 'index.html';
            } else {
                alert('Success!');
                window.location.href = 'index.html';
            }

        } catch (error) {
            console.error('CRITICAL ERROR:', error);
            alert('An error occurred. Check browser console.');
        } finally {
            loadingOverlay.classList.remove('active');
            if (submitBtn) submitBtn.disabled = false;
        }
    });
});



















