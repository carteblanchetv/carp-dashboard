// music_cue_sheet.js
// VERSION: 1.2.2 (FetchWithAuth Fix)

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded: music_cue_sheet.js 1.2.1-SERVER-STORAGE');
    const tableBody = document.getElementById('cueTableBody');
    const addRowBtn = document.getElementById('addRowBtn');
    const form = document.getElementById('musicCueForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');
    const projectComm = urlParams.get('comm');
    const projectStory = urlParams.get('story');
    
    let isEditMode = !!submissionId;

    // Pre-fill from project
    if (projectComm) document.getElementById('commission_number').value = projectComm;
    if (projectStory) document.getElementById('story_name').value = decodeURIComponent(projectStory);

    const INITIAL_ROWS = 10;

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
            displayField.value = '';
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

    function createRow(cueNumber) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" name="cue[]" class="table-input" value="${cueNumber}" readonly style="width:40px; text-align:center;"></td>
            <td><input type="text" name="tc_in[]" class="table-input tc-input" placeholder="00:00:00"></td>
            <td><input type="text" name="tc_out[]" class="table-input tc-input" placeholder="00:00:00"></td>
            <td><input type="text" name="duration[]" class="table-input duration-display" readonly placeholder="00:00:00"></td>
            <td><input type="text" name="song_title[]" class="table-input" placeholder="Title..."></td>
            <td><input type="text" name="composer[]" class="table-input" placeholder="Composer..."></td>
            <td><input type="text" name="publisher[]" class="table-input" placeholder="Publisher..."></td>
            <td><input type="text" name="album_title[]" class="table-input" placeholder="Album..."></td>
            <td><input type="text" name="track_number[]" class="table-input" placeholder="e.g. 3"></td>
            <td><input type="text" name="isrc[]" class="table-input" placeholder="ISRC..."></td>
            <td><input type="text" name="iswc[]" class="table-input" placeholder="ISWC..."></td>
            <td><select name="music_type[]" class="table-input"><option value="Background">Background</option><option value="Instrumental">Instrumental</option><option value="Mood">Mood</option><option value="Production">Production</option><option value="Sound FX">Sound FX</option><option value="Other">Other</option></select></td>
            <td><button type="button" class="remove-btn" title="Remove">&times;</button></td>
        `;
        const tcIn = row.querySelector('input[name="tc_in[]"]');
        const tcOut = row.querySelector('input[name="tc_out[]"]');
        const durField = row.querySelector('input[name="duration[]"]');
        [tcIn, tcOut].forEach(input => {
            input.addEventListener('input', (e) => { formatTimecode(e.target); calculateDuration(tcIn.value, tcOut.value, durField); });
        });
        row.querySelector('.remove-btn').addEventListener('click', () => {
            if (document.querySelectorAll('#cueTableBody tr').length > 1) {
                row.remove();
                renumberRows();
            }
        });
        tableBody.appendChild(row);
    }

    function renumberRows() {
        document.querySelectorAll('#cueTableBody tr').forEach((row, i) => {
            const cueInput = row.querySelector('input[name="cue[]"]');
            if (cueInput) cueInput.value = i + 1;
        });
    }

    async function loadSubmissionData() {
        if (!isEditMode) return;
        
        try {
            loadingOverlay.classList.add('active');
            const response = await window.auth.fetchWithAuth(`/api/get-submission/${submissionId}`);
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
                form.commission_number.value = sub.commission_number || sub.commissionNumber || '';
                form.story_name.value = sub.story_name || sub.storyName || '';
                form.producer_name.value = sub.producer_name || sub.producerName || '';
                form.afm_operator.value = sub.afm_operator || sub.afmOperator || '';
                form.delivery_date.value = sub.delivery_date || sub.deliveryDate || '';
                
                // Populate Cues Table
                if (sub.cues && sub.cues.length > 0) {
                    tableBody.innerHTML = '';
                    sub.cues.forEach((cue, i) => {
                        createRow(i + 1);
                        const row = tableBody.lastElementChild;
                        row.querySelector('input[name="tc_in[]"]').value = cue.tc_in;
                        row.querySelector('input[name="tc_out[]"]').value = cue.tc_out;
                        row.querySelector('input[name="duration[]"]').value = cue.duration;
                        row.querySelector('input[name="song_title[]"]').value = cue.song_title;
                        row.querySelector('input[name="composer[]"]').value = cue.composer;
                        row.querySelector('input[name="publisher[]"]').value = cue.publisher;
                        row.querySelector('input[name="album_title[]"]').value = cue.album_title;
                        row.querySelector('input[name="track_number[]"]').value = cue.track_number;
                        row.querySelector('input[name="isrc[]"]').value = cue.isrc;
                        row.querySelector('input[name="iswc[]"]').value = cue.iswc;
                        row.querySelector('select[name="music_type[]"]').value = cue.music_type;
                    });
                }
                
                document.getElementById('submitBtn').textContent = 'Update Cue Sheet';
            }
        } catch (err) {
            console.error("Load failed:", err);
            alert("Failed to load submission data.");
        } finally {
            loadingOverlay.classList.remove('active');
        }
    }

    if (isEditMode) {
        loadSubmissionData();
    } else {
        for (let i = 0; i < INITIAL_ROWS; i++) createRow(i + 1);
    }

    addRowBtn.addEventListener('click', () => createRow(document.querySelectorAll('#cueTableBody tr').length + 1));

    async function generatePDFBlob() {
        console.log('Generating PDF...');
        const { jsPDF } = window.jspdf;
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

        doc.setFontSize(20);
        doc.setTextColor(0, 143, 190);
        doc.setFont('helvetica', 'bold');
        doc.text('INSERT MUSIC CUE SHEET', pageWidth / 2, 60, { align: 'center' });
        doc.autoTable({
            startY: 68, theme: 'plain', styles: { fontSize: 9, cellPadding: 1, overflow: 'linebreak' },
            body: [['Commission No:', form.commission_number.value, 'Story Name:', form.story_name.value], ['Producer:', form.producer_name.value, 'AFM Operator:', form.afm_operator.value]]
        });

        // 2. Music Cue Table
        const rows = [];
        document.querySelectorAll('#cueTableBody tr').forEach(tr => {
            const rowData = [];
            tr.querySelectorAll('input, select').forEach(input => rowData.push(input.value));
            if (rowData.some(v => v)) rows.push(rowData);
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [['#', 'Title', 'Composer', 'Publisher', 'Library', 'CD/Source', 'Track', 'In', 'Out', 'Dur', 'Usage']],
            body: rows,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
            headStyles: { fillColor: [0, 143, 190], textColor: 255 },
            margin: { left: 14, right: 14 }
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
                formData.append('formType', 'music_cue_sheet');
            }
            formData.append('pdf', pdfBlob, `Music_Cue_Sheet_${isEditMode ? 'Update_' : ''}${Date.now()}.pdf`);

            console.log('Sending to server...');
            const token = await window.auth.getIdToken();
            const endpoint = isEditMode ? '/api/update-submission' : '/api/send-music-cue-sheet';
            
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

    // --- ACTION BAR LOGIC ---
    const projectId = urlParams.get('project');
    const loadProjectForBar = async () => {
        if (!projectId) return;
        try {
            const response = await window.auth.fetchWithAuth(`/api/get-submission/${projectId}`);
            const result = await response.json();
            if (result.success) {
                const sub = result.submission;
                const isCommissioned = sub.status === 'accepted' || sub.status === 'paid';
                const phaseBar = document.getElementById('productionPhaseBar');
                if (phaseBar && isCommissioned) {
                    phaseBar.classList.remove('hidden');
                    
                    const assets = result.linkedAssets || [];
                    const existingFootage = assets.find(a => a.formType === 'insert_footage');
                    const existingScript = assets.find(a => a.formType === 'final_script');
                    const existingMusic = assets.find(a => a.formType === 'music_cue_sheet');

                    document.getElementById('btnFootageDec').onclick = () => {
                        if (existingFootage) {
                            window.location.href = `insert_footage_declaration.html?id=${existingFootage.id}&project=${sub.id}`;
                        } else {
                            window.location.href = `insert_footage_declaration.html?project=${sub.id}`;
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
                    const btnMusic = document.getElementById('btnMusicCue');
                    if (btnMusic) {
                        btnMusic.onclick = () => {
                            if (isEditMode && submissionId === existingMusic?.id) {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            } else if (existingMusic) {
                                window.location.href = `music_cue_sheet.html?id=${existingMusic.id}&project=${sub.id}`;
                            } else {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                        };
                    }
                }
            }
        } catch (e) {
            console.warn("Failed to load project for action bar", e);
        }
    };
    loadProjectForBar();
});



















