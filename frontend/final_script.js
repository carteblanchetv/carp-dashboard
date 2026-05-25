// final_script.js
// VERSION: 2.7.0 (Justification & Line Height)
import { getIdToken, fetchWithAuth, checkAuth } from './auth.js?v=5.1.1';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded: final_script.js');
    const form = document.getElementById('finalScriptForm');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const promoContainer = document.getElementById('promoLinesContainer');
    const addPromoBtn = document.getElementById('addPromoBtn');
    const editBtn = document.getElementById('editScriptBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');

    const urlParams = new URLSearchParams(window.location.search);
    const proposalId = urlParams.get('id') || urlParams.get('project');
    const isStandalone = !proposalId;
    const forceViewMode = urlParams.get('mode') === 'view';

    if (isStandalone) {
        console.log("[DEBUG] Standalone Mode: No Proposal ID provided.");
        // Make fields editable
        ['commission_number', 'story_name', 'duration'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.removeAttribute('readonly');
                el.style.background = 'var(--bg-card)';
                el.style.cursor = 'text';
                el.placeholder = "Enter " + id.replace('_', ' ') + "...";
            }
        });
        // Hide the production bar
        const phaseBar = document.getElementById('productionPhaseBar');
        if (phaseBar) phaseBar.classList.add('hidden');
        
        // Initialize with 3 rows
        promoContainer.innerHTML = '';
        for (let i = 0; i < 3; i++) addPromoLine();
    }



    window.downloadAsPDF = async () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('active');
            document.getElementById('loadingHeading').textContent = "Generating PDF";
            document.getElementById('loadingSubtext').textContent = "Please wait while we prepare your document...";
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
            if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
                const props = doc.getImageProperties(CB_LOGO_B64);
                const width = 40;
                const height = width * (props.height / props.width);
                doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - width, currentY, width, height);
            }

            if (typeof getBlackLogo === 'function') {
                const blackLogo = getBlackLogo();
                const props = doc.getImageProperties(blackLogo);
                const width = 50;
                const height = width * (props.height / props.width);
                doc.addImage(blackLogo, 'PNG', margin, 25, width, height);
                currentY += height + 15;
            } else {
                currentY += 20;
            }    

            doc.setFontSize(22);
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.text('FINAL SCRIPT', pageWidth / 2, currentY, { align: 'center' });
            currentY += 12;

            // Metadata
            const metadata = [
                ['Commission No', document.getElementById('commission_number').value || 'N/A'],
                ['Story Name', document.getElementById('story_name').value || 'Untitled'],
                ['Duration', document.getElementById('duration').value || '—']
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
            const promoLines = Array.from(document.querySelectorAll('input[name="promo_lines[]"]'))
                .map(i => i.value.trim())
                .filter(v => v !== '');
            
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
            const pressRelease = document.getElementById('press_release') ? document.getElementById('press_release').value : '';
            renderTextSection('PRESS RELEASE', pressRelease);

            // Script Content
            const scriptContent = document.getElementById('script_content').value;
            renderTextSection('SCRIPT CONTENT', scriptContent);

            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Final_Script_${document.getElementById('commission_number').value || 'N/A'}_${Date.now()}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        } catch (err) {
            console.error('PDF generation failed:', err);
            alert('Failed to generate simplified PDF.');
            if (loadingOverlay) loadingOverlay.classList.remove('active');
        }
    };

    function addPromoLine(value = '') {
        const div = document.createElement('div');
        div.className = 'promo-line-row';
        div.style.display = 'flex';
        div.style.gap = '0.5rem';
        div.innerHTML = `
            <input type="text" name="promo_lines[]" class="table-input" value="${value}" placeholder="Enter promo line...">
            <button type="button" class="btn-soft remove-btn" style="padding: 0.5rem; color: var(--danger);" title="Remove">&times;</button>
        `;
        div.querySelector('.remove-btn').onclick = () => {
            if (promoContainer.children.length > 1) div.remove();
        };
        promoContainer.appendChild(div);
    }

    addPromoBtn.onclick = () => addPromoLine();

    function setEditMode(isEditing) {
        const formActions = document.querySelector('.form-actions');
        const scriptContent = document.getElementById('script_content');
        const promoInputs = document.querySelectorAll('input[name="promo_lines[]"]');
        const removeBtns = document.querySelectorAll('.remove-btn');
        const scriptPreview = document.getElementById('script_content_preview');
        const pressRelease = document.getElementById('press_release');
        const pressReleasePreview = document.getElementById('press_release_preview');
        const promoSection = document.getElementById('promoSection');
        const pressReleaseSection = document.getElementById('pressReleaseSection');

        if (isEditing) {
            scriptContent.classList.remove('hidden');
            scriptPreview.classList.add('hidden');
            scriptContent.removeAttribute('readonly');
            scriptContent.style.background = 'var(--bg-input)';
            scriptContent.style.border = '1px solid var(--border)';
            scriptContent.style.cursor = 'text';
            scriptContent.style.height = '';
            scriptContent.style.overflow = '';
            
            if (promoSection) promoSection.classList.remove('hidden');
            if (pressReleaseSection) pressReleaseSection.classList.remove('hidden');
            
            if (pressRelease) {
                pressRelease.classList.remove('hidden');
                pressReleasePreview.classList.add('hidden');
                pressRelease.removeAttribute('readonly');
                pressRelease.style.background = 'var(--bg-input)';
                pressRelease.style.border = '1px solid var(--border)';
                pressRelease.style.cursor = 'text';
                pressRelease.style.height = '';
                pressRelease.style.overflow = '';
            }
            
            promoInputs.forEach(i => {
                i.removeAttribute('readonly');
                i.style.background = 'var(--bg-input)';
                i.style.border = '1px solid var(--border)';
            });
            removeBtns.forEach(b => b.style.display = 'block');
            addPromoBtn.style.display = 'block';
            if (downloadPdfBtn) downloadPdfBtn.style.display = 'none';
            if (viewDetailsBtn) viewDetailsBtn.style.display = 'none';
            formActions.classList.remove('hidden');
            if (editBtn) editBtn.classList.add('hidden');
            document.getElementById('pageTitle').textContent = "Edit Final Script";
            document.getElementById('pageSubtext').textContent = "Update the script and promo lines below.";
        } else {
            scriptContent.classList.add('hidden');
            scriptPreview.classList.remove('hidden');
            scriptPreview.textContent = scriptContent.value;
            
            if (pressRelease) {
                pressRelease.classList.add('hidden');
                pressReleasePreview.classList.remove('hidden');
                pressReleasePreview.textContent = pressRelease.value || '—';
                if (pressReleaseSection) {
                    if (!pressRelease.value.trim()) {
                        pressReleaseSection.classList.add('hidden');
                    } else {
                        pressReleaseSection.classList.remove('hidden');
                    }
                }
            }
            
            let hasPromoLines = false;
            promoInputs.forEach(i => {
                if (i.value.trim() !== '') hasPromoLines = true;
                i.setAttribute('readonly', 'true');
                i.style.background = 'transparent';
                i.style.border = 'none';
                i.style.borderBottom = '1px dashed var(--border)';
            });
            if (promoSection) {
                if (!hasPromoLines) {
                    promoSection.classList.add('hidden');
                } else {
                    promoSection.classList.remove('hidden');
                }
            }
            removeBtns.forEach(b => b.style.display = 'none');
            addPromoBtn.style.display = 'none';
            if (downloadPdfBtn) downloadPdfBtn.style.display = 'inline-block';
            if (viewDetailsBtn) viewDetailsBtn.style.display = 'inline-block';
            formActions.classList.add('hidden');
            if (editBtn) editBtn.classList.remove('hidden');
            document.getElementById('pageTitle').textContent = "Final Script Preview";
            document.getElementById('pageSubtext').textContent = "Read-only view of the submitted script.";
        }
    }

    if (editBtn) editBtn.onclick = () => setEditMode(true);
    if (downloadPdfBtn) downloadPdfBtn.onclick = () => window.downloadAsPDF();
    if (viewDetailsBtn) viewDetailsBtn.onclick = () => {
        if (proposalId) window.location.href = `proposal.html?id=${proposalId}&view=preview`;
    };

    async function loadData() {
        if (isStandalone) return; // No data to load
        try {
            loadingOverlay.classList.add('active');
            const response = await fetchWithAuth(`/api/get-submission/${proposalId}`);
            const result = await response.json();

            if (result.success) {
                const sub = result.submission;
                const isRestricted = !!sub._isRestrictedView;
                if (isRestricted && downloadPdfBtn) {
                    downloadPdfBtn.style.display = 'none';
                }
                // Auto-populate Story Info
                const comm = sub.commissionNumber || sub.commission_number || '';
                const story = sub.story_title || sub.story_name || '';
                const duration = sub.acceptanceDetails?.duration || sub.details?.duration || sub.duration || '';
                
                console.log("[FinalScript] Populating Story Info:", { comm, story, duration });
                
                const commEl = document.getElementById('commission_number');
                const storyEl = document.getElementById('story_name');
                const durationEl = document.getElementById('duration');
                
                if (commEl) commEl.value = comm;
                if (storyEl) storyEl.value = story;
                if (durationEl) durationEl.value = duration;
                
                // Story Deliverables Bar Logic
                const isCommissioned = sub.status === 'accepted' || sub.status === 'paid';
                const phaseBar = document.getElementById('productionPhaseBar');
                if (phaseBar && isCommissioned) {
                    phaseBar.classList.remove('hidden');

                    if (sub._isRestrictedView) {
                        const btnFootageDec = document.getElementById('btnFootageDec');
                        const btnCallSheet = document.getElementById('btnCallSheet');
                        const btnMusicCue = document.getElementById('btnMusicCue');
                        if (btnFootageDec) btnFootageDec.style.display = 'none';
                        if (btnCallSheet) btnCallSheet.style.display = 'none';
                        if (btnMusicCue) btnMusicCue.style.display = 'none';
                    }

                    
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
                            const url = existingMusic
                                ? `music_cue_sheet.html?id=${existingMusic.id}&project=${sub.id}`
                                : `music_cue_sheet.html?project=${sub.id}`;
                            window.location.href = url;
                        };
                    }
                }

                // Load existing Final Script data if it exists
                if (sub.details && sub.details.finalScript) {
                    const fs = sub.details.finalScript;
                    document.getElementById('script_content').value = fs.content || '';
                    if (document.getElementById('press_release')) {
                        document.getElementById('press_release').value = fs.pressRelease || '';
                    }
                    
                    promoContainer.innerHTML = ''; // Clear defaults before loading
                    if (fs.promoLines && fs.promoLines.length > 0) {
                        fs.promoLines.forEach(line => addPromoLine(line));
                    } else {
                        // Default 3 rows if script exists but no promo lines
                        for (let i = 0; i < 3; i++) addPromoLine();
                    }
                    // If data exists or forceViewMode is on, default to preview mode
                    setEditMode(false);
                } else {
                    // Default 3 rows for new script
                    promoContainer.innerHTML = '';
                    for (let i = 0; i < 3; i++) addPromoLine();
                    // If no data and not forced view, default to edit mode
                    setEditMode(forceViewMode ? false : true);
                }
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('Load failed:', err);
            alert('Failed to load story details.');
        } finally {
            loadingOverlay.classList.remove('active');
            if (urlParams.get('download') === 'true') {
                setTimeout(() => window.downloadAsPDF(), 1000);
            }
        }
    }

    loadData();

    const backBtn = document.getElementById('backToProposalBtn');
    console.log("[DEBUG] Back Button - ProposalID:", proposalId, "Btn:", !!backBtn);
    if (backBtn && proposalId) {
        backBtn.classList.remove('hidden');
        backBtn.style.display = 'flex';
        backBtn.href = `proposal.html?id=${proposalId}&view=preview`;
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        loadingOverlay.classList.add('active');
        document.getElementById('loadingHeading').textContent = "Saving...";

        try {
            const formData = new FormData(form);
            const promoLines = Array.from(document.querySelectorAll('input[name="promo_lines[]"]'))
                .map(i => i.value.trim())
                .filter(v => v !== '');

            const scriptData = {
                promoLines: promoLines,
                content: document.getElementById('script_content').value,
                pressRelease: document.getElementById('press_release') ? document.getElementById('press_release').value : '',
                updatedAt: new Date().toISOString()
            };

            const token = await getIdToken();
            let response;
            
            if (isStandalone) {
                // Standalone mode: Send to new endpoint
                console.log("[FinalScript] Submitting standalone script...");
                response = await fetchWithAuth('/api/submit-standalone-script', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        storyName: document.getElementById('story_name').value,
                        commissionNumber: document.getElementById('commission_number').value,
                        duration: document.getElementById('duration').value,
                        finalScript: scriptData
                    })
                });
            } else {
                // Linked mode: Update proposal details
                console.log("[FinalScript] Updating proposal details for ID:", proposalId);
                response = await fetchWithAuth('/api/update-proposal-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: proposalId,
                        details: { finalScript: scriptData }
                    })
                });
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[FinalScript] Server responded with ${response.status}:`, errorText);
                throw new Error(errorText || `Server error (${response.status})`);
            }

            const result = await response.json();
            if (result.success) {
                const dialog = document.getElementById('successDialog');
                dialog.classList.remove('hidden');
                document.getElementById('dialogCloseBtn').onclick = () => {
                    if (isStandalone) {
                        window.location.href = 'index.html';
                    } else {
                        window.location.href = `proposal.html?id=${proposalId}&view=preview`;
                    }
                };
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('Save failed:', err);
            alert('Failed to save Final Script: ' + err.message);
        } finally {
            loadingOverlay.classList.remove('active');
            submitBtn.disabled = false;
        }
    };
});
