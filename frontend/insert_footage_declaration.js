// insert_footage_declaration.js
// VERSION: 2.2.0 (CSV/Excel Import Data)

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded: insert_footage_declaration.js 3.0.0');
    const tableBody = document.getElementById('footageTableBody');
    const addRowBtn = document.getElementById('addRowBtn');
    const form = document.getElementById('insertFootageForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    const projectComm = urlParams.get('comm');
    const projectStory = urlParams.get('story');
    const projectId = urlParams.get('project');
    const projectDelivery = urlParams.get('delivery');
    const projectProducer = urlParams.get('producer');
    
    let isEditMode = !!submissionId;
    let hasExistingFiles = false;

    const backBtn = document.getElementById('backToProposalBtn');
    const backToId = projectId || submissionId;
    console.log("[DEBUG] Back Button Logic - ID:", backToId, "Btn exists:", !!backBtn);
    if (backBtn && backToId) {
        backBtn.classList.remove('hidden');
        backBtn.style.display = 'flex';
        backBtn.href = `proposal.html?id=${backToId}&view=preview`;
    }

    const footerBackBtn = document.getElementById('footerBackBtn');
    if (footerBackBtn && backToId) {
        footerBackBtn.href = `proposal.html?id=${backToId}&view=preview`;
        footerBackBtn.textContent = '← Back to Proposal';
    }

    // Pre-fill from project
    if (projectComm) document.getElementById('commission_number').value = projectComm;
    if (projectStory) document.getElementById('story_name').value = decodeURIComponent(projectStory);
    if (projectDelivery) document.getElementById('delivery_date').value = projectDelivery;
    
    // --- STORY DELIVERABLES BAR ---
    const loadProjectForBar = async () => {
        const idToUse = projectId || submissionId; // submissionId might be from edit mode
        if (!idToUse) return;
        try {
            const res = await window.auth.fetchWithAuth(`/api/get-submission/${idToUse}`);
            const result = await res.json();
            if (result.success) {
                const sub = result.submission;
                const isCommissioned = sub.status === 'accepted' || sub.status === 'paid';
                const phaseBar = document.getElementById('productionPhaseBar');
                if (phaseBar && isCommissioned) {
                    phaseBar.classList.remove('hidden');
                    if (sub._isRestrictedView) {
                        const btnFootageDec = document.getElementById('btnFootageDec');
                        const btnCallSheet = document.getElementById('btnCallSheet');
                        if (btnFootageDec) btnFootageDec.style.display = 'none';
                        if (btnCallSheet) btnCallSheet.style.display = 'none';
                    }
                    
                    // Fetch linked assets for the project to correctly link buttons
                    const assets = result.linkedAssets || [];
                    const existingFootage = assets.find(a => a.formType === 'insert_footage');
                    const existingScript = assets.find(a => a.formType === 'final_script');

                    document.getElementById('btnFootageDec').onclick = () => {
                        if (isEditMode && submissionId === existingFootage?.id) {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        } else if (existingFootage) {
                            window.location.href = `insert_footage_declaration.html?id=${existingFootage.id}&project=${sub.id}`;
                        } else {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    };
                    document.getElementById('btnCallSheet').onclick = () => {
                        window.location.href = `proposal.html?id=${sub.id}#CallSheet`;
                    };
                    document.getElementById('btnFinalScript').onclick = () => {
                        const url = existingScript 
                            ? `final_script.html?id=${sub.id}&assetId=${existingScript.id}` 
                            : `final_script.html?id=${sub.id}`;
                        window.location.href = url;
                    };
                }
            }
        } catch (e) {
            console.warn("Failed to load project for action bar", e);
        }
    };
    loadProjectForBar();
    
    // Producers logic moved inside autofillProfile to ensure list is loaded first

    // Load Producers and Auto-populate
    const autofillProfile = async () => {
        const producerSelect = document.getElementById('producer_name');
        try {
            // 1. Fetch All Producers
            const [producersRes, profileRes] = await Promise.all([
                window.auth.fetchWithAuth('/api/list-producers'),
                window.auth.fetchWithAuth('/api/profile')
            ]);

            const pResult = await producersRes.json();
            const profResult = await profileRes.json();

            if (pResult.success && producerSelect) {
                pResult.producers.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = `${p.name} ${p.surname}`.trim();
                    opt.textContent = `${p.name} ${p.surname}`.trim();
                    producerSelect.appendChild(opt);
                });
            }

            // 2. Select Producer
            if (projectProducer && producerSelect) {
                const decProducer = decodeURIComponent(projectProducer);
                // Ensure the producer exists in options, if not add it
                let found = false;
                Array.from(producerSelect.options).forEach(opt => {
                    if (opt.value === decProducer) found = true;
                });
                if (!found) {
                    const opt = document.createElement('option');
                    opt.value = decProducer;
                    opt.textContent = decProducer;
                    producerSelect.appendChild(opt);
                }
                producerSelect.value = decProducer;
            } else if (profResult.success && profResult.name && producerSelect) {
                const fullName = `${profResult.name} ${profResult.surname}`.trim();
                producerSelect.value = fullName;
            }
        } catch (err) {
            console.warn('Producers load/autofill failed:', err);
        }
    };
    const producersPromise = autofillProfile();

    // --- EXISTING FILES LOGIC (EDIT MODE) ---
    async function deleteExistingFile(storagePath) {
        if (!confirm('Are you sure you want to delete this file? This cannot be undone.')) return;
        
        try {
            loadingOverlay.classList.add('active');
            const response = await window.auth.fetchWithAuth('/api/delete-file', {
                method: 'POST',
                body: JSON.stringify({ id: submissionId, path: storagePath })
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

    async function viewExistingFile(storagePath) {
        try {
            loadingOverlay.classList.add('active');
            document.getElementById('loadingHeading').textContent = "Opening File...";
            const response = await window.auth.fetchWithAuth(`/api/get-file?id=${submissionId}&path=${encodeURIComponent(storagePath)}`);
            
            if (!response.ok) throw new Error('File access denied or not found');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
            loadingOverlay.classList.remove('active');
        } catch (error) {
            console.error('View error:', error);
            alert('Could not open file: ' + error.message);
            loadingOverlay.classList.remove('active');
        }
    }

    async function mergePDFs(declarationArrayBuffer, uploadedFiles) {
        console.log('Merging PDFs...');
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        // 1. Add Declaration Pages
        const declarationPdf = await PDFDocument.load(declarationArrayBuffer);
        const declarationPages = await mergedPdf.copyPages(declarationPdf, declarationPdf.getPageIndices());
        declarationPages.forEach(page => mergedPdf.addPage(page));

        // 2. Add Uploaded Files
        for (const file of uploadedFiles) {
            try {
                const fileArrayBuffer = await file.arrayBuffer();
                const externalPdf = await PDFDocument.load(fileArrayBuffer);
                const externalPages = await mergedPdf.copyPages(externalPdf, externalPdf.getPageIndices());
                externalPages.forEach(page => mergedPdf.addPage(page));
            } catch (err) {
                console.error(`Error loading file ${file.name}:`, err);
            }
        }

        return await mergedPdf.save();
    }

    const INITIAL_ROWS = 10;
    const DEFAULT_CONTACT = "As per attached agreement";

    function formatSA(val) {
        if (val.startsWith('0')) return '+27' + val.substring(1);
        return val;
    }

    function formatTimecode(input) {
        let val = input.value.replace(/\D/g, '');
        if (val.length > 6) val = val.slice(0, 6);
        let formatted = '';
        if (val.length > 0) formatted += val.slice(0, 2);
        if (val.length > 2) formatted += ':' + val.slice(2, 4);
        if (val.length > 4) formatted += ':' + val.slice(4, 6);
        input.value = formatted;
    }

    function normalizeTimecode(val) {
        if (!val) return "";
        val = val.trim();
        // Handle Excel AM/PM format (e.g. "12:04:32 AM" -> "00:04:32")
        if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(val)) {
            const parts = val.split(/\s+/);
            const timeParts = parts[0].split(':');
            let h = parseInt(timeParts[0]);
            const m = timeParts[1].padStart(2, '0');
            const s = (timeParts[2] || '00').padStart(2, '0');
            const ampm = parts[1].toUpperCase();

            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;

            return `${h.toString().padStart(2, '0')}:${m}:${s}`;
        }
        // Handle "0:04:32" -> "00:04:32"
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(val)) {
            const p = val.split(':');
            return `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}:${p[2].padStart(2, '0')}`;
        }
        return val;
    }

    function calculateDuration(start, end, displayField) {
        if (!start || !end || start.length < 8 || end.length < 8) {
            displayField.value = '00:00:00';
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

    function createRow() {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><select name="type[]" class="table-input"><option value="Video">Video</option><option value="Photo">Photo</option><option value="Newspaper Clipping">Newspaper Clipping</option><option value="Other">Other</option></select></td>
            <td><input type="text" name="clip_name[]" class="table-input"></td>
            <td><input type="text" name="description[]" class="table-input"></td>
            <td><input type="text" name="source[]" class="table-input"></td>
            <td><input type="text" name="contact[]" class="table-input" value="${DEFAULT_CONTACT}" oninput="this.value = formatSA(this.value)"></td>
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
        tableBody.appendChild(row);
        return row; // return the row for programmatic filling
    }

    // --- IMPORT SPREADSHEET LOGIC ---
    const importDataInput = document.getElementById('importDataInput');
    const importDataBtn = document.getElementById('importDataBtn');
    const mappingModal = document.getElementById('mappingModal');
    const mappingContainer = document.getElementById('mappingContainer');
    const mappingCancelBtn = document.getElementById('mappingCancelBtn');
    const mappingConfirmBtn = document.getElementById('mappingConfirmBtn');

    let parsedData = [];
    let fileHeaders = [];

    const systemFields = [
        { id: 'type', label: 'Type (Video/Photo)', type: 'select', aliases: ['type', 'format', 'media'] },
        { id: 'clip_name', label: 'Clip Name', type: 'text', aliases: ['clip', 'name', 'title', 'file', 'clip name'] },
        { id: 'description', label: 'Description', type: 'text', aliases: ['description', 'desc', 'details', 'notes'] },
        { id: 'source', label: 'Footage Source', type: 'text', aliases: ['source', 'provider', 'archive', 'origin'] },
        { id: 'contact', label: 'Contact Info', type: 'text', aliases: ['contact', 'email', 'phone', 'owner'] },
        { id: 'agreement', label: 'Agreement (Yes/No)', type: 'select', aliases: ['agreement', 'agreed', 'release'] },
        { id: 'tc_in', label: 'TC In', type: 'text', aliases: ['tc in', 'timecode in', 'start', 'in'] },
        { id: 'tc_out', label: 'TC Out', type: 'text', aliases: ['tc out', 'timecode out', 'end', 'out'] },
        { id: 'duration', label: 'Duration', type: 'text', aliases: ['duration', 'length', 'dur'] },
        { id: 'licence_req', label: 'Licence Req. (Yes/No)', type: 'select', aliases: ['licence req', 'license required', 'licensed'] },
        { id: 'licence_period', label: 'Licence Period', type: 'select', aliases: ['licence period', 'license term', 'period'] },
        { id: 'resale', label: 'Resale (Yes/No)', type: 'select', aliases: ['resale', 'resell'] }
    ];

    if (importDataBtn && importDataInput) {
        importDataBtn.addEventListener('click', () => {
            importDataInput.click();
        });

        importDataInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            
            if (file.name.endsWith('.csv')) {
                // Parse CSV using PapaParse
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function(results) {
                        handleParsedData(results.data, results.meta.fields);
                    }
                });
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                // Parse Excel using SheetJS
                reader.onload = function(evt) {
                    const data = evt.target.result;
                    const workbook = XLSX.read(data, { type: 'binary', cellText: true, cellNF: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
                    
                    if (json.length > 0) {
                        const headers = Object.keys(json[0]);
                        handleParsedData(json, headers);
                    } else {
                        alert("The spreadsheet appears to be empty.");
                    }
                };
                reader.readAsBinaryString(file);
            } else if (file.name.endsWith('.docx')) {
                // Parse Word using Mammoth
                reader.onload = function(evt) {
                    const arrayBuffer = evt.target.result;
                    mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                        .then(function(result) {
                            const html = result.value;
                            const container = document.createElement('div');
                            container.innerHTML = html;
                            const table = container.querySelector('table');
                            
                            if (table) {
                                const rows = Array.from(table.querySelectorAll('tr'));
                                if (rows.length < 1) {
                                    alert("No data found in Word table.");
                                    return;
                                }
                                
                                // Extract headers from first row
                                const headerCells = Array.from(rows[0].querySelectorAll('td, th'));
                                const headers = headerCells.map(cell => cell.textContent.trim());
                                
                                // Extract data from subsequent rows
                                const data = rows.slice(1).map(row => {
                                    const cells = Array.from(row.querySelectorAll('td'));
                                    const rowObj = {};
                                    headers.forEach((header, i) => {
                                        rowObj[header] = cells[i] ? cells[i].textContent.trim() : "";
                                    });
                                    return rowObj;
                                });
                                
                                handleParsedData(data, headers);
                            } else {
                                alert("No table found in the Word document.");
                            }
                        })
                        .catch(function(err) {
                            console.error("Mammoth error:", err);
                            alert("Failed to parse Word document.");
                        });
                };
                reader.readAsArrayBuffer(file);
            } else {
                alert("Unsupported file format. Please upload a CSV, Excel, or Word file.");
            }
            
            // Reset input so the same file can be selected again
            e.target.value = '';
        });
    }

    function handleParsedData(data, headers) {
        if (!data || data.length === 0) {
            alert("No data found in the file.");
            return;
        }
        parsedData = data;
        fileHeaders = headers;
        
        // Build Mapping UI
        mappingContainer.innerHTML = '';
        
        systemFields.forEach(field => {
            // Try to auto-map based on aliases
            let bestMatch = '';
            const lowerAliases = field.aliases.map(a => a.toLowerCase());
            
            for (const header of headers) {
                const lowerHeader = header.toLowerCase().trim();
                if (lowerAliases.some(alias => lowerHeader.includes(alias))) {
                    bestMatch = header;
                    break;
                }
            }

            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '1fr 1fr';
            row.style.gap = '1rem';
            row.style.alignItems = 'center';
            row.style.paddingBottom = '0.5rem';
            row.style.borderBottom = '1px solid var(--border)';

            let optionsHtml = '<option value="">-- Do Not Import --</option>';
            headers.forEach(header => {
                const selected = (header === bestMatch) ? 'selected' : '';
            optionsHtml += `<option value="${header.replace(/"/g, '&quot;')}" ${selected}>${header}</option>`;
        });

        row.innerHTML = `
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${field.label}</div>
            <div>
                <select class="table-input mapping-select" data-field="${field.id}" style="width: 100%; margin: 0;">
                    ${optionsHtml}
                </select>
            </div>
        `;
            mappingContainer.appendChild(row);
        });

        mappingModal.classList.remove('hidden');
    }

    if (mappingCancelBtn) {
        mappingCancelBtn.addEventListener('click', () => {
            mappingModal.classList.add('hidden');
            parsedData = [];
            fileHeaders = [];
        });
    }

    if (mappingConfirmBtn) {
        mappingConfirmBtn.addEventListener('click', () => {
            const mappingSelects = document.querySelectorAll('.mapping-select');
            const map = {};
            mappingSelects.forEach(select => {
                if (select.value) {
                    map[select.getAttribute('data-field')] = select.value;
                }
            });

            // Identify existing empty rows to fill them first
            const existingRows = Array.from(document.querySelectorAll('#footageTableBody tr'));
            let rowCursor = 0;

            const isRowEmpty = (row) => {
                const clipName = row.querySelector('[name="clip_name[]"]')?.value.trim() || '';
                const description = row.querySelector('[name="description[]"]')?.value.trim() || '';
                const source = row.querySelector('[name="source[]"]')?.value.trim() || '';
                return !clipName && !description && !source;
            };

            // Populate Data
            parsedData.forEach(rowData => {
                let targetRow = null;

                // Find next empty row
                while (rowCursor < existingRows.length) {
                    const row = existingRows[rowCursor];
                    if (isRowEmpty(row)) {
                        targetRow = row;
                        rowCursor++;
                        break;
                    }
                    rowCursor++;
                }

                // If no empty row found, create a new one
                if (!targetRow) {
                    targetRow = createRow();
                }
                
                systemFields.forEach(field => {
                    const mappedHeader = map[field.id];
                    const input = targetRow.querySelector(`[name="${field.id}[]"]`);
                    
                    if (input) {
                        if (mappedHeader && rowData[mappedHeader] !== undefined) {
                            let value = rowData[mappedHeader].toString().trim();
                            
                            if (field.type === 'select') {
                                const lowerVal = value.toLowerCase();
                                Array.from(input.options).forEach(opt => {
                                    if (opt.value.toLowerCase() === lowerVal || opt.textContent.toLowerCase() === lowerVal) {
                                        input.value = opt.value;
                                    }
                                });
                            } else {
                                if (field.id === 'tc_in' || field.id === 'tc_out') {
                                    input.value = normalizeTimecode(value);
                                    formatTimecode(input);
                                } else {
                                    input.value = value;
                                }
                            }
                        } else {
                            // Apply Defaults if column is missing or unmapped
                            if (field.id === 'contact') input.value = DEFAULT_CONTACT;
                            if (field.id === 'licence_period') input.value = "1 Year";
                            if (field.id === 'resale') input.value = "No";
                            if (field.id === 'agreement' && !mappedHeader) input.value = "Yes";
                        }
                    }
                });

                // Trigger duration calc for the row
                const tcIn = targetRow.querySelector('input[name="tc_in[]"]');
                const tcOut = targetRow.querySelector('input[name="tc_out[]"]');
                const durField = targetRow.querySelector('input[name="duration[]"]');
                if (tcIn && tcOut && durField) {
                    calculateDuration(tcIn.value, tcOut.value, durField);
                }
            });

            mappingModal.classList.add('hidden');
            parsedData = [];
            fileHeaders = [];

            // Scroll back to the top of the table so user can see imported data
            setTimeout(() => {
                document.getElementById('footageDeclarationSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        });
    }

    async function loadSubmissionData() {
        if (!isEditMode) return;

        
        try {
            loadingOverlay.classList.add('active');
            document.getElementById('loadingHeading').textContent = "Loading...";
            document.getElementById('loadingSubtext').textContent = "Retrieving saved data...";
            const response = await window.auth.fetchWithAuth(`/api/get-submission/${submissionId}`);
            const result = await response.json();
            
            if (result.success) {
                const sub = result.submission;
                hasExistingFiles = sub.files && sub.files.length > 0;
                // Populate Fields (with fallbacks for both snake_case and camelCase)
                form.story_name.value = sub.story_name || sub.storyName || '';
                form.commission_number.value = sub.commission_number || sub.commissionNumber || '';
                form.producer_name.value = sub.producer_name || sub.producerName || '';
                form.delivery_date.value = sub.delivery_date || sub.deliveryDate || '';
                
                // Populate Table
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
                    // Filter out the merged declaration PDF
                    const displayFiles = sub.files.filter(f => f.fieldname !== 'declaration');
                    
                    if (displayFiles.length > 0) {
                        const section = document.createElement('section');
                        section.className = 'form-section';
                        section.innerHTML = `
                            <h2 class="section-title">Already Uploaded Documents</h2>
                            <div class="existing-files-list">
                                ${displayFiles.map(f => `
                                    <div class="existing-file-item">
                                        <span class="file-name">${f.filename}</span>
                                        <div class="file-actions">
                                            <button type="button" class="action-icon-btn view" onclick="window.viewExistingFile('${f.storagePath}')" title="View Document">👁️</button>
                                            <button type="button" class="action-icon-btn remove" onclick="window.deleteExistingFile('${f.storagePath}')" title="Delete Permanently">🗑️</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                        document.querySelector('.form-actions').insertAdjacentElement('beforebegin', section);
                    }
                }
                
                document.getElementById('submitBtn').textContent = 'Update Declaration';
            }
        } catch (err) {
            console.error("Load failed:", err);
            alert("Failed to load submission data.");
        } finally {
            loadingOverlay.classList.remove('active');
        }
    }

    window.deleteExistingFile = deleteExistingFile;
    window.viewExistingFile = viewExistingFile;

    if (isEditMode) {
        producersPromise.then(() => {
            loadSubmissionData().then(() => {
                if (tableBody.querySelectorAll('tr').length === 0) {
                    for (let i = 0; i < INITIAL_ROWS; i++) createRow();
                }
            });
        });
    } else {
        for (let i = 0; i < INITIAL_ROWS; i++) createRow();
    }
    
    addRowBtn.addEventListener('click', createRow);

    async function generatePDFBlob() {
        console.log('Generating PDF...');
        const { jsPDF } = window.jspdf;
        // Use landscape orientation to fit all 12 columns
        const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        let currentY = 25;
        
        // 1. BRANDING LOGOS
        if (typeof getBlackLogo === 'function') {
            const blackLogo = getBlackLogo();
            const props = doc.getImageProperties(blackLogo);
            const width = 50;
            const height = width * (props.height / props.width);
            doc.addImage(blackLogo, 'PNG', 14, currentY, width, height);
            currentY += height + 15;
        } else {
            currentY += 20;
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
        doc.text('FOOTAGE DECLARATION', pageWidth / 2, 60, { align: 'center' });
        
        // Header Info
        doc.autoTable({
            startY: 68, theme: 'plain', styles: { fontSize: 10, cellPadding: 2 },
            body: [['Commission No:', form.commission_number.value, 'Story Name:', form.story_name.value], ['Producer:', form.producer_name.value, 'Delivery Date:', form.delivery_date.value]]
        });

        // Footage Table Data
        const rows = [];
        const tableRows = document.querySelectorAll('#footageTableBody tr');
        
        tableRows.forEach(tr => {
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
        document.getElementById('loadingHeading').textContent = "Processing...";
        document.getElementById('loadingSubtext').textContent = "Please wait, this might take a moment.";

        try {


            const pdfBlob = await generatePDFBlob();
            
            const formData = new FormData(form);
            if (isEditMode) {
                formData.append('id', submissionId);
                formData.append('formType', 'insert_footage');
            }
            if (projectId) {
                formData.append('projectId', projectId);
            }

            // Append declaration PDF
            formData.append('declaration', pdfBlob, `InsertFootage_${isEditMode ? 'Update_' : ''}${Date.now()}.pdf`);
            


            console.log(`Sending data to server...`);
            const token = await window.auth.getIdToken();
            const endpoint = isEditMode ? '/api/update-submission' : '/api/send-insert-footage';
            
            const response = await window.auth.fetchWithAuth(endpoint, { 
                method: 'POST', 
                body: formData 
            });

            console.log('Server response received.');
            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            console.log('Submission complete.');
            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            if (dialog) {
                dialog.classList.remove('hidden');
                const redirectUrl = projectId ? `proposal.html?id=${projectId}&view=preview` : 'index.html';
                document.getElementById('dialogCloseBtn').onclick = () => window.location.href = redirectUrl;
            } else {
                alert('Success!');
                window.location.href = projectId ? `proposal.html?id=${projectId}&view=preview` : 'index.html';
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



















