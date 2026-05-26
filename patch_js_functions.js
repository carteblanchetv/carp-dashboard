const fs = require('fs');
const file = 'c:/Users/lizzy/.gemini/antigravity/scratch/cb_forms/frontend/proposal.js';

let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\r\n/g, '\n');

const functionsToInject = `
window.downloadCallSheetFile = async (id, path, filename) => {
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.add('active');
        const token = await window.auth.getIdToken();
        const response = await fetch(\`/api/get-call-sheet-file?id=\${id}&path=\${encodeURIComponent(path)}\`, {
            headers: { 'Authorization': \`Bearer \${token}\` }
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
        backBtn.href = \`proposal.html?id=\${sub.id}&view=preview\`;
    }
}

function renderCallSheetReport(sub) {
    const summaryDiv = document.getElementById('proposalSummary');
    if (!summaryDiv) return;
    
    const cs = (sub.details && sub.details.callSheet) || {};
    
    // Prepare Crew HTML
    const crewFields = [
        { label: 'Presenter', name: cs.presenter_name || '—', phone: cs.presenter_phone || '—', id: cs.presenter_id || '—' },
        { label: 'Producer / Director', name: (sub.submittedByName && sub.submittedBySurname) ? \`\${sub.submittedByName} \${sub.submittedBySurname}\` : sub.submittedByEmail, phone: cs.producer_phone || '—', id: cs.producer_id || '—' },
        { label: 'DOP', name: cs.dop_name || '—', phone: cs.dop_phone || '—', id: cs.dop_id || '—' },
        { label: 'Camera Assistant', name: cs.cam_assistant_name || '—', phone: cs.cam_assistant_phone || '—', id: cs.cam_assistant_id || '—' },
        { label: 'Security', name: cs.security_name || '—', phone: cs.security_phone || '—', id: 'Status: ' + (cs.security_status === 'required' ? 'Required' : 'Not Required') }
    ];
    
    let flightFileHtml = '—';
    if (cs.travel && cs.travel.flight_file_path) {
        flightFileHtml = \`<button type="button" class="btn-soft" onclick="window.downloadCallSheetFile('\${sub.id}', '\${cs.travel.flight_file_path}', '\${cs.travel.flight_filename || 'Flight_Booking.pdf'}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Download PDF Attachment</button>\`;
    }
    
    let transFileHtml = '—';
    if (cs.travel && cs.travel.trans_file_path) {
        transFileHtml = \`<button type="button" class="btn-soft" onclick="window.downloadCallSheetFile('\${sub.id}', '\${cs.travel.trans_file_path}', '\${cs.travel.trans_filename || 'Transport_Booking.pdf'}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Download PDF Attachment</button>\`;
    }

    const t = cs.travel || {};
    const k = cs.kit || {};

    summaryDiv.innerHTML = \`
        <div style="max-width: 900px; margin: 0 auto; padding: 3rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); color: var(--text-main); font-family: 'Inter', sans-serif;">
            <div style="border-bottom: 2px solid var(--success); padding-bottom: 1.5rem; margin-bottom: 2.5rem; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h1 style="font-size: 2.25rem; margin: 0; color: var(--text-main); line-height: 1.2;">CALL SHEET</h1>
                    <p style="margin: 0.75rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">
                        Story: <b style="color: var(--text-main);">\${sub.story_title}</b>
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.7rem; font-weight: 800; color: var(--success); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.25rem;">Commission Number</div>
                    <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid var(--success); color: var(--success); padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 900; font-size: 1.75rem; display: inline-block;">
                        #\${sub.commissionNumber || 'N/A'}
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
                        \${crewFields.map(f => \`
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem 0.5rem; font-weight: 600;">\${f.label}</td>
                                <td style="padding: 0.75rem 0.5rem;">\${f.name}</td>
                                <td style="padding: 0.75rem 0.5rem;">\${f.phone}</td>
                                <td style="padding: 0.75rem 0.5rem;">\${f.id}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            </div>

            <!-- MOVEMENT ORDER -->
            <div style="margin-bottom: 3rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                    <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); margin: 0; font-weight: 700;">Movement Order</h3>
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Shoot Day \${cs.shoot_day || '—'} (\${formatStoryDate(cs.shoot_date)})</span>
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
                        \${cs.movementOrder && cs.movementOrder.length > 0 ? cs.movementOrder.map(r => \`
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem 0.5rem; font-weight: 600;">\${r.time}</td>
                                <td style="padding: 0.75rem 0.5rem;">\${r.what}</td>
                                <td style="padding: 0.75rem 0.5rem;">\${r.location}</td>
                            </tr>
                        \`).join('') : \`<tr><td colspan="3" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No movement items scheduled.</td></tr>\`}
                    </tbody>
                </table>

                <div style="margin-top: 1.5rem; background: rgba(0,0,0,0.02); padding: 1.25rem; border-radius: 8px; border: 1px dashed var(--border);">
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin: 0 0 0.5rem 0;">Story Description (Risk Assessment)</h4>
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap;">\${cs.story_description || 'No description / risk assessment provided.'}</p>
                </div>
            </div>

            <!-- KIT / EQUIPMENT -->
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700;">Kit / Equipment</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; font-size: 0.9rem;">
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Camera (Cam A-F)</span><span style="font-weight: 600;">\${k.camera || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Audio (Mic 1-6)</span><span style="font-weight: 600;">\${k.audio || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Lenses</span><span style="font-weight: 600;">\${k.lenses || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Lighting Kit</span><span style="font-weight: 600;">\${k.lighting || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Rigs</span><span style="font-weight: 600;">\${k.rigs || '—'}</span></div>
                    <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; text-transform: uppercase; margin-bottom: 0.2rem;">Other</span><span style="font-weight: 600;">\${k.other || '—'}</span></div>
                </div>
            </div>

            <!-- TRAVEL & VEHICLES -->
            <div style="margin-bottom: 3rem;">
                <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem; color: var(--success); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700;">Travel & Vehicles</h3>
                
                <div style="margin-bottom: 1.5rem; background: rgba(0,0,0,0.01); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="font-size: 0.85rem; color: var(--success); margin: 0 0 1rem 0;">Flight Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Passenger Name</span><span style="font-weight: 600;">\${t.flight_name || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Flight Details</span><span style="font-weight: 600;">\${t.flight_details || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Travel Booking PDF</span>\${flightFileHtml}</div>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem; background: rgba(0,0,0,0.01); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="font-size: 0.85rem; color: var(--success); margin: 0 0 1rem 0;">Accommodation Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Guest Name</span><span style="font-weight: 600;">\${t.accom_name || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Location / Address</span><span style="font-weight: 600;">\${t.accom_location || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Duration Dates</span><span style="font-weight: 600;">\${t.accom_from ? \`\${formatStoryDate(t.accom_from)} to \${formatStoryDate(t.accom_to)}\` : '—'}</span></div>
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.01); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="font-size: 0.85rem; color: var(--success); margin: 0 0 1rem 0;">Transport Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem; margin-bottom: 1rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Name / Surname</span><span style="font-weight: 600;">\${t.trans_name || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">From Location</span><span style="font-weight: 600;">\${t.trans_from_loc || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">To Location</span><span style="font-weight: 600;">\${t.trans_to_loc || '—'}</span></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Dates</span><span style="font-weight: 600;">\${t.trans_from_date ? \`\${formatStoryDate(t.trans_from_date)} to \${formatStoryDate(t.trans_to_date)}\` : '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Time Slot</span><span style="font-weight: 600;">\${t.trans_from_time || '—'} to \${t.trans_to_time || '—'}</span></div>
                        <div><span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Rental Booking PDF</span>\${transFileHtml}</div>
                    </div>
                </div>
            </div>

            <div style="margin-top: 5rem; padding-top: 2.5rem; border-top: 1px solid var(--border); text-align: center;" class="no-print">
                <p style="margin-top: 0;"><a href="proposal.html?id=\${sub.id}&view=preview" style="color: var(--text-muted); font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">← Back to Proposal Preview</a></p>
            </div>
        </div>
    \`;
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

        const producerName = (sub.submittedByName && sub.submittedBySurname) ? \`\${sub.submittedByName} \${sub.submittedBySurname}\` : sub.submittedByEmail;
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
            head: [['Time', 'What\\'s Happening?', 'Location']],
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
            ['Driver', t.trans_name || '—', 'Transport route', \`From \${t.trans_from_loc || '—'} to \${t.trans_to_loc || '—'}\`],
            ['Transport From', t.trans_from_date || '—', 'Transport To', t.trans_to_date || '—'],
            ['Trans Times', \`From \${t.trans_from_time || '—'} to \${t.trans_to_time || '—'}\`, '', '']
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
        link.download = \`Call_Sheet_\${sub.commissionNumber || sub.id}_\${Date.now()}.pdf\`;
        link.click();
        URL.revokeObjectURL(url);
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    } catch (err) {
        console.error('Call Sheet PDF generation failed:', err);
        alert('Failed to generate Call Sheet PDF.');
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }
};
`;

// Insert before the last closing bracket inside proposal.js
const endMarker = 'window.downloadProposalPDF = async () => {';
const markerIndex = content.lastIndexOf(endMarker);
if (markerIndex !== -1) {
  content = content.substring(0, markerIndex) + functionsToInject + "\n\n" + content.substring(markerIndex);
  fs.writeFileSync(file, content, 'utf8');
  console.log("Functions injected successfully!");
} else {
  console.log("downloadProposalPDF target NOT found!");
}
