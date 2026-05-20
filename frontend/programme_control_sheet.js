// programme_control_sheet.js
// VERSION: 1.2.4 (FetchWithAuth Fix)

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded: 1.2.3-EDIT-MODE');
    
    // ----------------------------------------
    // Elements & State
    // ----------------------------------------
    const anchorsContainer = document.getElementById('anchorsContainer');
    const addAnchorBtn = document.getElementById('addAnchorBtn');
    const storiesContainer = document.getElementById('storiesContainer');
    const addStoryBtn = document.getElementById('addStoryBtn');
    const segmentsContainer = document.getElementById('segmentsContainer');
    const addSegmentBtn = document.getElementById('addSegmentBtn');
    const form = document.getElementById('controlSheetForm');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const totalDurationInput = document.getElementById('duration');

    // ----------------------------------------
    // Utilities
    // ----------------------------------------

    async function loadAvailableStories() {
        try {
            const response = await window.auth.fetchWithAuth('/api/admin/proposals');
            const result = await response.json();
            
            if (result.success) {
                const datalist = document.getElementById('availableStories');
                datalist.innerHTML = '';
                
                // Get accepted/paid stories, formatted as "[####] Story Title"
                const stories = result.proposals
                    .filter(p => p.status === 'accepted' || p.status === 'paid')
                    .map(p => {
                        const comm = p.commissionNumber || '????';
                        const title = p.story_title || 'Untitled';
                        return `[${comm}] ${title}`;
                    })
                    .sort();

                stories.forEach(entry => {
                    const option = document.createElement('option');
                    option.value = entry;
                    datalist.appendChild(option);
                });
                console.log(`[AUTOCOMPLETE] Loaded ${stories.length} stories with commission numbers.`);
            }
        } catch (err) {
            console.error('[AUTOCOMPLETE] Failed to load stories:', err);
        }
    }

    function setupTimecodeFormatting(input) {
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 6) value = value.slice(0, 6);
            let formattedValue = '';
            for (let i = 0; i < value.length; i++) {
                if (i === 2 || i === 4) formattedValue += ':';
                formattedValue += value[i];
            }
            e.target.value = formattedValue;
        });
    }

    function timeToSeconds(hms) {
        if (!hms || hms.length !== 8) return null;
        const parts = hms.split(':').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return null;
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    function secondsToTime(secs) {
        if (secs === null || secs < 0) return '00:00:00';
        const h = Math.floor(secs / 3600).toString().padStart(2, '0');
        const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    setupTimecodeFormatting(totalDurationInput);

    // ----------------------------------------
    // Dynamic Row Builders
    // ----------------------------------------

    function createAnchorRow() {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 1rem; align-items: start; margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border: 1px dashed var(--border); border-radius: var(--radius-md);';
        row.innerHTML = `
            <div class="form-group" style="flex:1;">
                <label>Select Anchor</label>
                <select class="anchor-select" name="anchorSelect[]" required>
                    <option value="">-- Select --</option>
                    <option value="Catherine Rice">Catherine Rice</option>
                    <option value="Claire Mawisa">Claire Mawisa</option>
                    <option value="Erin Bates">Erin Bates</option>
                    <option value="Govan Whittles">Govan Whittles</option>
                    <option value="Lourensa Eckard">Lourensa Eckard</option>
                    <option value="Macfarlane Moleli">Macfarlane Moleli</option>
                    <option value="Masa Kekana">Masa Kekana</option>
                    <option value="Nickolaus Bauer">Nickolaus Bauer</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="form-group hidden other-anchor-group" style="flex:1;">
                <label>Specify Other Anchor</label>
                <input type="text" class="other-anchor-text" name="otherAnchorText[]" placeholder="Enter name">
            </div>
            <button type="button" class="remove-btn" title="Remove Anchor">🗑️</button>
        `;
        const selectEl = row.querySelector('.anchor-select');
        const otherGrp = row.querySelector('.other-anchor-group');
        const otherInput = row.querySelector('.other-anchor-text');
        selectEl.addEventListener('change', (e) => {
            if (e.target.value === 'Other') {
                otherGrp.classList.remove('hidden');
                otherInput.setAttribute('required', 'true');
            } else {
                otherGrp.classList.add('hidden');
                otherInput.removeAttribute('required');
                otherInput.value = '';
            }
        });
        row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
        return row;
    }

    function createPresenterBlock(isFirst = false) {
        const block = document.createElement('div');
        block.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;';
        let removeHTML = isFirst ? '' : '<button type="button" class="remove-presenter-btn" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size: 1.2rem; padding: 0 0.25rem;">×</button>';
        block.innerHTML = `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <select class="presenter-select" name="storyPresenter[]" style="flex:1;" required>
                    <option value="">-- Select Presenter --</option>
                    <option value="No Presenter">No Presenter</option>
                    <option value="Catherine Rice">Catherine Rice</option>
                    <option value="Claire Mawisa">Claire Mawisa</option>
                    <option value="Erin Bates">Erin Bates</option>
                    <option value="Govan Whittles">Govan Whittles</option>
                    <option value="Lourensa Eckard">Lourensa Eckard</option>
                    <option value="Macfarlane Moleli">Macfarlane Moleli</option>
                    <option value="Masa Kekana">Masa Kekana</option>
                    <option value="Nickolaus Bauer">Nickolaus Bauer</option>
                    <option value="Other">Other</option>
                </select>
                ${removeHTML}
            </div>
            <input type="text" class="other-presenter-text hidden" name="storyOtherPresenter[]" placeholder="Specify presenter name" style="width: 100%;">
        `;
        const selectEl = block.querySelector('.presenter-select');
        const otherInput = block.querySelector('.other-presenter-text');
        selectEl.addEventListener('change', (e) => {
            if (e.target.value === 'Other') {
                otherInput.classList.remove('hidden');
                otherInput.setAttribute('required', 'true');
            } else {
                otherInput.classList.add('hidden');
                otherInput.removeAttribute('required');
                otherInput.value = '';
            }
        });
        if (!isFirst) block.querySelector('.remove-presenter-btn').addEventListener('click', () => block.remove());
        return block;
    }

    function createStoryRow() {
        const row = document.createElement('div');
        row.className = 'dynamic-row story-row';
        row.style.cssText = 'display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; padding: 1.25rem; background: var(--bg-light); border: 1px dashed var(--border); border-radius: var(--radius-md);';
        row.innerHTML = `
            <div style="display: flex; gap: 1rem; align-items: flex-end; width: 100%;">
                <div class="form-group" style="flex: 2.5; min-width: 0;">
                    <label>Story Name</label>
                    <input type="text" name="storyName[]" list="availableStories" required>
                </div>
                <div class="form-group" style="flex: 1; min-width: 0;">
                    <label>Type</label>
                    <select name="storyType[]" required>
                        <option value="Insert">Insert</option>
                        <option value="Live Interview">Live Interview</option>
                        <option value="Studio">Studio</option>
                    </select>
                </div>
                <button type="button" class="remove-btn" title="Remove Story" style="padding: 0.5rem; margin-bottom: 0.25rem;">🗑️</button>
            </div>
            <div style="display: flex; gap: 1rem; align-items: flex-start; width: 100%;">
                <div class="form-group" style="flex: 1; min-width: 0;">
                    <label>Presenter(s)</label>
                    <div class="presenters-list"></div>
                    <button type="button" class="add-presenter-btn" style="color: var(--accent); cursor: pointer; padding: 0.25rem 0; border:none; background:none;">+ Add Presenter</button>
                </div>
                <div class="form-group" style="flex: 1; min-width: 0;">
                    <label>Guest(s)</label>
                    <textarea name="storyGuest[]" placeholder="Guest names..." rows="2" style="width:100%;"></textarea>
                </div>
            </div>
        `;
        const presentersList = row.querySelector('.presenters-list');
        const addPresenterBtn = row.querySelector('.add-presenter-btn');
        presentersList.appendChild(createPresenterBlock(true));
        addPresenterBtn.addEventListener('click', () => presentersList.appendChild(createPresenterBlock(false)));

        const storyInput = row.querySelector('input[name="storyName[]"]');
        storyInput.addEventListener('input', (e) => {
            const val = e.target.value;
            // Smart Cleanup: If user selects "[6890] Story Name", strip the prefix
            if (val.startsWith('[') && val.includes('] ')) {
                const parts = val.split('] ');
                if (parts.length > 1) {
                    e.target.value = parts.slice(1).join('] ');
                }
            }
        });

        row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
        return row;
    }

    function createSegmentRow() {
        const row = document.createElement('div');
        row.className = 'dynamic-row segment-row';
        row.innerHTML = `
            <div class="form-group"><label>TC In</label><input type="text" class="tc-input" name="tcIn[]" required></div>
            <div class="form-group"><label>TC Out</label><input type="text" class="tc-input" name="tcOut[]" required></div>
            <div class="form-group"><label>Duration</label><input type="text" class="tc-input" name="segDuration[]" required></div>
            <button type="button" class="remove-btn" title="Remove Segment">🗑️</button>
        `;
        row.querySelectorAll('.tc-input').forEach(input => setupTimecodeFormatting(input));
        const tcInInput = row.querySelector('input[name="tcIn[]"]');
        const tcOutInput = row.querySelector('input[name="tcOut[]"]');
        const durationInput = row.querySelector('input[name="segDuration[]"]');
        function calculateDuration() {
            const inSecs = timeToSeconds(tcInInput.value);
            const outSecs = timeToSeconds(tcOutInput.value);
            if (inSecs !== null && outSecs !== null) {
                const diff = Math.max(0, outSecs - inSecs);
                durationInput.value = secondsToTime(diff);
            }
        }
        tcInInput.addEventListener('input', () => { calculateDuration(); updateTotalDuration(); });
        tcOutInput.addEventListener('input', () => { calculateDuration(); updateTotalDuration(); });
        durationInput.addEventListener('input', updateTotalDuration);
        row.querySelector('.remove-btn').addEventListener('click', () => { row.remove(); updateTotalDuration(); });
        return row;
    }

    function updateTotalDuration() {
        const durationInputs = document.querySelectorAll('input[name="segDuration[]"]');
        let totalSecs = 0;
        durationInputs.forEach(input => {
            const secs = timeToSeconds(input.value);
            if (secs !== null) totalSecs += secs;
        });
        totalDurationInput.value = secondsToTime(totalSecs);
    }

    // Init
    for (let i = 0; i < 3; i++) { storiesContainer.appendChild(createStoryRow()); }
    for (let i = 0; i < 5; i++) { segmentsContainer.appendChild(createSegmentRow()); }
    for (let i = 0; i < 2; i++) { anchorsContainer.appendChild(createAnchorRow()); }
    addAnchorBtn.addEventListener('click', () => anchorsContainer.appendChild(createAnchorRow()));
    addStoryBtn.addEventListener('click', () => storiesContainer.appendChild(createStoryRow()));
    addSegmentBtn.addEventListener('click', () => segmentsContainer.appendChild(createSegmentRow()));

    loadAvailableStories();

    // ----------------------------------------
    // Edit Mode / Pre-loading
    // ----------------------------------------
    async function loadSubmissionData(id) {
        try {
            loadingOverlay.classList.add('active');
            const h2 = loadingOverlay.querySelector('h2');
            const originalText = h2.textContent;
            h2.textContent = 'Loading Submission Data...';
            
            const res = await window.auth.fetchWithAuth(`/api/get-submission/${id}`);
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const result = await res.json();
            
            if (result.success) {
                console.log('[DEBUG] Fetched submission:', result.submission);
                const s = result.submission;
                document.getElementById('submissionId').value = s.id;
                document.getElementById('txDate').value = s.txDate || '';
                document.getElementById('season').value = s.season || '';
                document.getElementById('episode').value = s.episode || '';
                document.getElementById('uid').value = s.uid || '';
                document.getElementById('duration').value = s.duration || '';
                
                // Clear defaults
                storiesContainer.innerHTML = '';
                segmentsContainer.innerHTML = '';
                anchorsContainer.innerHTML = '';
                
                // Helper for robust JSON parsing
                const parseJSON = (val) => {
                    if (!val) return null;
                    if (typeof val !== 'string') return val;
                    try {
                        const parsed = JSON.parse(val);
                        // Handle potential double-encoding
                        if (typeof parsed === 'string') return JSON.parse(parsed);
                        return parsed;
                    } catch (e) {
                        console.warn('[DEBUG] JSON parse failed for:', val);
                        return null;
                    }
                };

                // Restore Stories
                const stories = parseJSON(s.stories);
                if (stories && Array.isArray(stories)) {
                    stories.forEach(storyData => {
                        const row = createStoryRow();
                        row.querySelector('[name="storyName[]"]').value = storyData.name || '';
                        row.querySelector('[name="storyType[]"]').value = storyData.type || 'Insert';
                        row.querySelector('[name="storyGuest[]"]').value = storyData.guests || '';
                        
                        // Presenters
                        if (storyData.presenters && storyData.presenters.length > 0) {
                            const pList = row.querySelector('.presenters-list');
                            pList.innerHTML = '';
                            storyData.presenters.forEach((p, pi) => {
                                const pBlock = createPresenterBlock(pi === 0);
                                const pSel = pBlock.querySelector('.presenter-select');
                                pSel.value = p.value || '';
                                if (p.value === 'Other') {
                                    const oInput = pBlock.querySelector('.other-presenter-text');
                                    oInput.classList.remove('hidden');
                                    oInput.value = p.other || '';
                                    oInput.setAttribute('required', 'true');
                                }
                                pList.appendChild(pBlock);
                            });
                        }
                        storiesContainer.appendChild(row);
                    });
                }
                
                // Restore Segments
                const segments = parseJSON(s.segments);
                if (segments && Array.isArray(segments)) {
                    segments.forEach(seg => {
                        const row = createSegmentRow();
                        row.querySelector('[name="tcIn[]"]').value = seg.tcIn || '';
                        row.querySelector('[name="tcOut[]"]').value = seg.tcOut || '';
                        row.querySelector('[name="segDuration[]"]').value = seg.duration || '';
                        segmentsContainer.appendChild(row);
                    });
                }
                
                // Restore Anchors
                const anchors = parseJSON(s.anchors);
                if (anchors && Array.isArray(anchors)) {
                    anchors.forEach(a => {
                        const row = createAnchorRow();
                        const sel = row.querySelector('.anchor-select');
                        sel.value = a.value || '';
                        if (a.value === 'Other') {
                            const oGrp = row.querySelector('.other-anchor-group');
                            const oInput = row.querySelector('.other-anchor-text');
                            oGrp.classList.remove('hidden');
                            oInput.value = a.other || '';
                            oInput.setAttribute('required', 'true');
                        }
                        anchorsContainer.appendChild(row);
                    });
                }

                // Fallbacks if empty
                if (storiesContainer.children.length === 0) for (let i = 0; i < 3; i++) storiesContainer.appendChild(createStoryRow());
                if (segmentsContainer.children.length === 0) for (let i = 0; i < 5; i++) segmentsContainer.appendChild(createSegmentRow());
                if (anchorsContainer.children.length === 0) for (let i = 0; i < 2; i++) anchorsContainer.appendChild(createAnchorRow());

                updateTotalDuration();
            }
            h2.textContent = originalText;
        } catch (err) {
            console.error('Failed to load submission:', err);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const subId = urlParams.get('id');
    if (subId) {
        loadSubmissionData(subId);
    }

    // ----------------------------------------
    // PDF Generation
    // ----------------------------------------
    async function generatePDFBlob() {
        console.log('Generating PDF...');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();

        // Helper to format date
        const formatDate = (dateStr) => {
            if (!dateStr) return 'TBA';
            const date = new Date(dateStr);
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
        };



        let currentY = 45;

        // 1. BRANDING LOGOS
        if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
            const props = doc.getImageProperties(CB_LOGO_B64);
            const width = 40;
            const height = width * (props.height / props.width);
            // Top Right
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - 14 - width, 25, width, height);
        }

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

        doc.setFontSize(22);
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.text('Final Control Sheet (FCC)', pageWidth / 2, currentY, { align: 'center' });
        currentY += 12;

        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text('CONTACT DETAILS: Nombuso Nkosi | 083 700 3479', 14, currentY);
        currentY += 6;

        doc.setFont('helvetica', 'bold');
        const txDateVal = document.getElementById('txDate').value;
        const formattedTxDate = formatDate(txDateVal);
        doc.text(`TX Date: ${formattedTxDate}`, 14, currentY);
        doc.text('Show Name: Carte Blanche', 14, currentY + 5);
        doc.text('Channel: 101', 14, currentY + 10);
        doc.setFont('helvetica', 'normal');
        currentY += 15;
        
        const commonStyles = { fontSize: 9, cellPadding: 2, overflow: 'linebreak', halign: 'left' };
        const commonHeadStyles = { fillColor: [0, 143, 190], textColor: 255, fontStyle: 'bold' };

        const showInfo = [
            ['TX Date', formattedTxDate], 
            ['Season', document.getElementById('season').value], 
            ['Episode', document.getElementById('episode').value], 
            ['UID', document.getElementById('uid').value], 
            ['Total Duration', document.getElementById('duration').value]
        ];
        doc.autoTable({ 
            startY: currentY, 
            head: [['', '']], // No title for Field and Value
            body: showInfo, 
            theme: 'striped',
            headStyles: commonHeadStyles,
            styles: commonStyles,
            margin: { left: 14, right: 14 }
        });

        // Stories Table
        const storiesData = [];
        document.querySelectorAll('.story-row').forEach((row, i) => {
            const name = row.querySelector('[name="storyName[]"]').value;
            const type = row.querySelector('[name="storyType[]"]').value;
            const presenters = Array.from(row.querySelectorAll('.presenter-select')).map((sel, idx) => {
                return sel.value === 'Other' ? row.querySelectorAll('.other-presenter-text')[idx].value : sel.value;
            }).filter(p => p).join(', ');
            const guests = row.querySelector('[name="storyGuest[]"]').value;
            if (name) storiesData.push([i + 1, name, type, presenters, guests]);
        });
        if (storiesData.length > 0) {
            doc.autoTable({ 
                startY: doc.lastAutoTable.finalY + 10, 
                head: [['', 'Story Name', 'Type', 'Presenter(s)', 'Guest(s)']], // Empty title for #
                body: storiesData, 
                theme: 'striped',
                headStyles: commonHeadStyles,
                styles: commonStyles,
                margin: { left: 14, right: 14 }
            });
        }

        const anchorsData = [];
        document.querySelectorAll('.anchor-select').forEach((sel, i) => {
            const val = sel.value === 'Other' ? document.querySelectorAll('.other-anchor-text')[i].value : sel.value;
            if (val) anchorsData.push([i + 1, val]);
        });
        if (anchorsData.length > 0) {
            doc.autoTable({ 
                startY: doc.lastAutoTable.finalY + 10, 
                head: [['', 'Anchor']], // Empty title for #
                body: anchorsData, 
                theme: 'striped',
                headStyles: commonHeadStyles,
                styles: commonStyles,
                margin: { left: 14, right: 14 }
            });
        }

        const segmentsData = [];
        document.querySelectorAll('.segment-row').forEach((row, i) => {
            segmentsData.push([i + 1, row.querySelector('[name="tcIn[]"]').value, row.querySelector('[name="tcOut[]"]').value, row.querySelector('[name="segDuration[]"]').value]);
        });
        if (segmentsData.length > 0) {
            doc.autoTable({ 
                startY: doc.lastAutoTable.finalY + 10, 
                head: [['Segment', 'TC In', 'TC Out', 'Duration']], // Seg=Segment, In=TC In, Out=TC Out, Dur=Duration
                body: segmentsData, 
                theme: 'striped',
                headStyles: commonHeadStyles,
                styles: commonStyles,
                margin: { left: 14, right: 14 }
            });
        }

        console.log('PDF Generated successfully.');
        return doc.output('blob');
    }

    // ----------------------------------------
    // Synchronous Submission
    // ----------------------------------------
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Submit clicked.');
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) submitBtn.disabled = true;
        loadingOverlay.classList.add('active');

        try {
            // 1. PDF
            const pdfBlob = await generatePDFBlob();

            // 2. Data
            const formData = new FormData();
            formData.append('pdf', pdfBlob, 'ControlSheet.pdf');
            formData.append('txDate', document.getElementById('txDate').value);
            formData.append('season', document.getElementById('season').value);
            formData.append('episode', document.getElementById('episode').value);
            formData.append('uid', document.getElementById('uid').value);
            formData.append('duration', document.getElementById('duration').value);
            
            // Collect stories for searching
            const stories = Array.from(document.querySelectorAll('.story-row')).map(row => ({
                name: row.querySelector('[name="storyName[]"]').value,
                type: row.querySelector('[name="storyType[]"]').value,
                guests: row.querySelector('[name="storyGuest[]"]').value,
                presenters: Array.from(row.querySelectorAll('.presenter-select')).map((pSel, pi) => ({
                    value: pSel.value,
                    other: pSel.value === 'Other' ? row.querySelectorAll('.other-presenter-text')[pi].value : ''
                })).filter(p => p.value)
            })).filter(s => s.name);
            formData.append('stories', JSON.stringify(stories));

            const anchors = Array.from(document.querySelectorAll('.anchor-select')).map((sel, i) => ({
                value: sel.value,
                other: sel.value === 'Other' ? document.querySelectorAll('.other-anchor-text')[i].value : ''
            })).filter(a => a.value);
            formData.append('anchors', JSON.stringify(anchors));

            const segments = Array.from(document.querySelectorAll('.segment-row')).map(row => ({
                tcIn: row.querySelector('[name="tcIn[]"]').value,
                tcOut: row.querySelector('[name="tcOut[]"]').value,
                duration: row.querySelector('[name="segDuration[]"]').value
            }));
            formData.append('segments', JSON.stringify(segments));

            // 3. SERVER SAVE
            const submissionId = document.getElementById('submissionId').value;
            if (submissionId) formData.append('id', submissionId);
            formData.append('formType', 'control_sheet');

            const endpoint = submissionId ? '/api/update-submission' : '/api/send-control-sheet';
            console.log(submissionId ? 'Updating on server...' : 'Sending to server...');
            const response = await window.auth.fetchWithAuth(endpoint, {
                method: 'POST',
                body: formData
            });

            console.log('Server response received.');
            const result = await response.json();
            
            if (!result.success) throw new Error(result.error || 'Server error');

            console.log('Submission fully complete.');
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
            alert('An error occurred. Check console.');
        } finally {
            loadingOverlay.classList.remove('active');
            if (submitBtn) submitBtn.disabled = false;
        }
    });

});



















