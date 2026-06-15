import { checkAuth, fetchWithAuth } from './auth.js?v=5.1.1';

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const proposalId = urlParams.get('id');

    if (!proposalId) {
        alert('No proposal ID provided.');
        return;
    }

    try {
        const user = await checkAuth();
        if (!user) return;

        const response = await fetchWithAuth(`/api/get-submission/${proposalId}`);
        const result = await response.json();

        if (result.success) {
            const sub = result.submission;
            populateAgreement(sub, user);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('Failed to load agreement data:', err);
        alert('Error loading agreement: ' + err.message);
    }
});

function getAdminSignatoryName(acc, currentUser) {
    let adminName = 'Lezanne Janse van Rensburg'; // Default fallback
    const acceptedByEmail = acc.acceptedBy;
    if (acceptedByEmail) {
        const emailLower = acceptedByEmail.toLowerCase().trim();
        if (emailLower.includes('stenette')) {
            return 'Stenette Grosskopf';
        } else if (emailLower.includes('lezanne')) {
            return 'Lezanne Janse van Rensburg';
        } else if (emailLower.includes('bryan')) {
            return 'Bryan Bartle';
        } else if (emailLower.includes('kevin')) {
            return 'Kevin Freese';
        } else if (emailLower.includes('rudi')) {
            return 'Rudi Botha';
        } else if (emailLower.includes('nombuso')) {
            return 'Nombuso Nkosi';
        } else if (emailLower.includes('john')) {
            return 'John Webb';
        } else if (emailLower.includes('laura')) {
            return 'Laura Byrne';
        } else if (currentUser && currentUser.email && currentUser.email.toLowerCase().trim() === emailLower) {
            return (currentUser.firstName || currentUser.lastName) ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : (currentUser.displayName || acceptedByEmail);
        } else {
            // Format from email (first.last@...)
            const parts = emailLower.split('@')[0].split('.');
            return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        }
    } else {
        // If not accepted yet, fall back to current user
        return (currentUser.firstName && currentUser.lastName) ? `${currentUser.firstName} ${currentUser.lastName}` : (currentUser.displayName || 'Administrator');
    }
}

function populateAgreement(sub, currentUser) {
    const urlParams = new URLSearchParams(window.location.search);
    const isPreview = urlParams.get('preview') === 'true';
    const acc = sub.acceptanceDetails || {};
    
    // Override with URL parameters if provided (for preview)
    const commNum = urlParams.get('commNum') || sub.commissionNumber || 'PENDING';
    const duration = urlParams.get('duration') || acc.duration || 'N/A';
    const presenter = urlParams.get('presenter') || acc.presenter || 'N/A';
    const rate = urlParams.get('rate') || acc.rate || '';
    const deliveryDate = urlParams.get('deliveryDate') || acc.deliveryDate || 'N/A';
    
    // Use the acceptedAt timestamp if available, otherwise current date
    let acceptedAtDate = new Date();
    if (sub.acceptedAt) {
        acceptedAtDate = sub.acceptedAt._seconds ? new Date(sub.acceptedAt._seconds * 1000) : new Date(sub.acceptedAt);
    }
    const commDate = acceptedAtDate.toLocaleDateString('en-ZA');
    
    document.getElementById('pageHeading').textContent = `INSERT COMMISSION AGREEMENT - CBD 2026/${commNum}`;
    
    const producerName = `${sub.submittedByName || ''} ${sub.submittedBySurname || ''}`.trim() || sub.submittedByEmail;
    document.getElementById('producerNameDisplay').textContent = producerName;
    document.getElementById('sigProducerName').textContent = producerName;
    
    const adminName = getAdminSignatoryName(acc, currentUser);
    document.getElementById('sigAdminName').textContent = adminName;
    
    document.querySelectorAll('.sig-date').forEach(el => el.textContent = commDate);
    
    document.getElementById('valTitle').textContent = sub.story_title || 'N/A';
    document.getElementById('valDuration').textContent = duration;
    document.getElementById('valPresenter').textContent = presenter;
    document.getElementById('valCommDate').textContent = commDate;
    document.getElementById('valRate').textContent = rate ? `R ${rate}` : 'N/A';
    
    const locs = sub.locations || [];
    const locStr = locs.map(l => `${l.province || ''}${l.province && l.country ? ', ' : ''}${l.country || ''}`).filter(s => s).join('; ') || 'N/A';
    document.getElementById('valLocations').textContent = locStr;
    
    document.getElementById('valDeliveryDate').textContent = deliveryDate;
    document.getElementById('valEmail').textContent = sub.submittedByEmail || 'N/A';

    // PDF Download Logic
    document.getElementById('downloadPdfBtn').onclick = () => {
        generatePDF(sub, currentUser, commNum, commDate);
    };
}

async function generatePDF(sub, currentUser, commNum, commDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let y = 15;

    // --- Header with Logos ---
    try {
        // Combined Artists Logo (Left) - Always use the black/dark logo for printing
        if (typeof CAP_LOGO_B64 !== 'undefined') {
            const props = doc.getImageProperties(CAP_LOGO_B64);
            const caWidth = 40;
            const caHeight = caWidth * (props.height / props.width);
            doc.addImage(CAP_LOGO_B64, 'PNG', margin, y, caWidth, caHeight);
        }
        // Carte Blanche Logo (Right) - Smaller (25mm width)
        if (typeof CB_LOGO_B64 !== 'undefined') {
            const cbWidth = 25;
            const props = doc.getImageProperties(CB_LOGO_B64);
            const cbHeight = cbWidth * (props.height / props.width);
            doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - cbWidth, y, cbWidth, cbHeight);
        }
    } catch (e) {
        console.warn("Logo loading failed:", e);
    }

    y = 42;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`INSERT COMMISSION AGREEMENT - CBD 2026/${commNum}`, pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;

    // Parties (Centred)
    const producerName = `${sub.submittedByName || ''} ${sub.submittedBySurname || ''}`.trim() || sub.submittedByEmail;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Between COMBINED ARTISTIC PRODUCTIONS cc. (hereinafter referred to as the 'company')", pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('helvetica', 'italic');
    doc.text("and", pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`${producerName} (hereinafter referred to as the 'producer')`, pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Data Table
    const acc = sub.acceptanceDetails || {};
    const locs = sub.locations || [];
    const locStr = locs.map(l => `${l.province || ''}${l.province && l.country ? ', ' : ''}${l.country || ''}`).filter(s => s).join('; ') || 'N/A';

    doc.autoTable({
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [0, 0, 0], lineColor: [200, 200, 200] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, fillColor: [250, 250, 250] } },
        body: [
            ['Insert Title:', sub.story_title || 'N/A'],
            ['Duration:', acc.duration || 'N/A'],
            ['Presenter:', acc.presenter || 'N/A'],
            ['Commission Date:', commDate],
            ['Rate per min:', acc.rate ? `R ${acc.rate}` : 'N/A'],
            ['Location(s):', locStr],
            ['Delivery Date:', acc.deliveryDate || 'N/A'],
            ['Email:', sub.submittedByEmail || 'N/A']
        ]
    });
    y = doc.lastAutoTable.finalY + 12;

    // T&Cs Header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("TERMS & CONDITIONS", margin, y);
    y += 8;

    const clauses = [
        "This commission is valid for the production of the above-mentioned insert only.",
        "The duration of the delivered insert shall be as stipulated above. Any variation in duration must be approved by the company prior to delivery. The company reserves the right to amend the duration of the insert according to Carte Blanche's editorial requirements.",
        "The company shall pay the producer according to the minutes delivered multiplied by the per-minute rate (as stated above). The per-minute rate applies to all expenses incurred by the producer during research, pre-production, production and post-production.",
        "The producer has an obligation to inform the company immediately of any potential conflict of interest that may exist or that may arise in relation to the insert. The company may decide not to proceed with the commissioning of the insert if it is of the view that a conflict of interest exists or that the perception of such a conflict may compromise the credibility of the insert.\n   a. Such a conflict of interest includes but is not limited to:\n      i. the existence or prior existence of any relationship (whether business or personal) between the producer or any family member or friend of the producer, and any of the parties featured in the insert; and\n      ii. the existence or prior existence of any financial interest of the producer or any family member or friend of the producer in any business being featured in the insert.",
        "The producer shall have a period of two days to film the insert. Should the producer require additional days to film the insert, the producer must immediately request, telephonically and in writing, the company to authorise the additional days. All expenses incurred during the additional filming days shall be for the company's account and will be settled on receipt of proof of expenses.",
        "The producer shall apply the total amount paid by the company to cover:\n   a. the producer and/or director's fee(s);\n   b. the daily rates (including overtime) for the cameraman, audio operator and/or additional crew;\n   c. additional costs charged by the presenter in circumstances where:\n      i. work is performed outside the two-day period;\n      ii. the presenter's call duration exceeds the maximum of 10 hours per day;\n   d. the presenter's voice-over call fee.\n   e. all post-production related costs including, but not exclusive to the edit and audio final mix.\n   f. all transport and accommodation costs incurred within the producer's city of residence for all crew, including that of the presenter.",
        "All transport and accommodation costs incurred outside the producer's city of residence shall be for the company's account provided that the company approved such request(s) in writing or telephonically prior to travel. The producer shall provide the company with proof of expenses incurred within a reasonable period.",
        "Following completion of the offline edit, a viewing shall be arranged with Carte Blanche's Executive Producer, and if necessary, with Carte Blanche's legal representatives. The delivered insert shall include the Executive Producer's and/or legal representatives' instructions.",
        "The company reserves the right to reject the insert and to demand that the producer rectify any non-conformance within a period specified in writing, at the producers' own cost.",
        "The company reserves the right to terminate this commission agreement and hold the producer liable for production costs incurred if:\n   a. filming has not commenced within 4 (four) weeks of the date of commissioning;\n   b. the producer fails to deliver the insert, all relevant materials and shot footage by the agreed delivery date, without good cause shown;\n   c. the producer deviates from the agreed editorial and/or legal direction;\n   d. the production quality of the insert (including channel specifications), expected journalistic and ethical standards, all relevant materials and shot footage do not meet the company's minimum high definition standards as specified in the Producer Deliverables document, which can be obtained from Carte Blanche's Production Manager;\n   e. the producer has not disclosed a potential conflict of interest as provided for above.",
        "The producer shall deliver the insert, all related materials and shot footage to the company as specified in the Producer Deliverables document a minimum of 4 (four) days prior to broadcast. If the producer fails to do so, the company reserves the right to withhold any payment(s).",
        "The producer shall tender an original tax invoice stating the total amount (see clause 3) and the company shall proceed to settle the tax invoice within 14 (fourteen) days from the date of delivery of the insert and deliverables.",
        "Any property borrowed from the company must be returned in its original order. Failing that, the producer shall reimburse the company the amount equivalent to the replacement value of the property.",
        "The copyright of the insert, all related materials and the shot footage shall remain the property of M-Net. The producer shall not use the insert, any of the related materials and/or shot footage for any other purpose than the use for Carte Blanche.",
        "The producer shall not license, sell or hand over the insert, any of the related material and/or shot footage to any third party without the written permission of the company and M-Net.",
        "The producer waives any lien it may have over any of the items in clauses 14 and 15.",
        "The company and M-Net reserve all rights, known and/or unknown, in perpetuity."
    ];

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    
    clauses.forEach((text, index) => {
        const fullText = `${index + 1}. ${text}`;
        const lines = doc.splitTextToSize(fullText, contentWidth);
        const blockHeight = (lines.length * 4.5) + 2;

        if (y + blockHeight > pageHeight - 25) {
            doc.addPage();
            y = 20;
        }

        doc.text(lines, margin, y);
        y += blockHeight;
    });

    // Signatures
    y += 10;
    if (y > pageHeight - 50) {
        doc.addPage();
        y = 25;
    }

    const adminName = getAdminSignatoryName(acc, currentUser);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Signed at Combined Artists on ${commDate}`, margin, y);
    doc.text(`Signed at Combined Artists on ${commDate}`, margin + (contentWidth / 2) + 5, y);
    y += 12;
    
    // Signatory names (above the line) - using Times Italic for signature look
    doc.setFont('times', 'italic');
    doc.setFontSize(14);
    doc.text(adminName, margin, y);
    doc.text(producerName, margin + (contentWidth / 2) + 5, y);
    y += 2;
    
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + (contentWidth / 2) - 5, y);
    doc.line(margin + (contentWidth / 2) + 5, y, pageWidth - margin, y);
    y += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text("COMBINED ARTISTS", margin, y);
    doc.text("PRODUCER", margin + (contentWidth / 2) + 5, y);

    doc.save(`CommissionAgreement_CBD2026_${commNum}.pdf`);
}
