// travel_booking.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('travelBookingForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            loadingOverlay.classList.add('active');

            const travelerName = document.getElementById('travelerName').value;
            const idNumber = document.getElementById('idNumber').value;
            const phone = document.getElementById('phone').value;
            const email = document.getElementById('email').value;
            const departureAirport = document.getElementById('departureAirport').value;
            const destinationAirport = document.getElementById('destinationAirport').value;
            const departureDate = document.getElementById('departureDate').value;
            const returnDate = document.getElementById('returnDate').value;
            const storyName = document.getElementById('storyName').value;
            const accommodationRequired = document.getElementById('accommodationRequired').value;
            const carHireRequired = document.getElementById('carHireRequired').value;
            const additionalNotes = document.getElementById('additionalNotes').value;

            // Generate PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;

            // 0. Top Instruction Note
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text('Email the completed form to release@carteblanche.co.za', pageWidth / 2, 8, { align: 'center' });

            // 1. Branding Logos
            const caLogo = (typeof getBlackLogo === 'function' ? getBlackLogo() : (typeof CAP_LOGO_B64 !== 'undefined' ? CAP_LOGO_B64 : null));
            if (caLogo) {
                const props = doc.getImageProperties(caLogo);
                const caWidth = 38;
                const caHeight = caWidth * (props.height / props.width);
                doc.addImage(caLogo, 'PNG', margin, 12, caWidth, caHeight);
            }
            if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
                const props = doc.getImageProperties(CB_LOGO_B64);
                const cbWidth = 22;
                const cbHeight = cbWidth * (props.height / props.width);
                doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - cbWidth, 11, cbWidth, cbHeight);
            }

            // 2. Title & Header Line
            doc.setTextColor(0, 143, 190);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('TRAVEL BOOKING REQUEST', margin, 38);

            doc.setDrawColor(0, 143, 190);
            doc.setLineWidth(0.8);
            doc.line(margin, 42, pageWidth - margin, 42);

            // Traveler Details
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Traveler Details', margin, 52);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Full Name: ${travelerName}`, margin, 60);
            doc.text(`ID/Passport Number: ${idNumber}`, margin, 68);
            doc.text(`Phone Number: ${phone}`, margin, 76);
            doc.text(`Email Address: ${email}`, margin, 84);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Itinerary Details', margin, 96);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Departure Airport: ${departureAirport}`, margin, 104);
            doc.text(`Destination Airport: ${destinationAirport}`, margin, 112);
            doc.text(`Departure Date: ${departureDate}`, margin, 120);
            doc.text(`Return Date: ${returnDate}`, margin, 128);
            doc.text(`Story / Project: ${storyName}`, margin, 136);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Additional Booking Options', margin, 148);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Accommodation Required: ${accommodationRequired}`, margin, 156);
            doc.text(`Car Hire Required: ${carHireRequired}`, margin, 164);
            
            let currentY = 176;
            if (additionalNotes) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text('Preferences / Special Requests:', margin, currentY);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                const splitNotes = doc.splitTextToSize(additionalNotes, 170);
                doc.text(splitNotes, margin, currentY + 7);
                currentY += 10 + (splitNotes.length * 5);
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text(`Request Date: ${new Date().toLocaleDateString('en-ZA')}`, margin, Math.max(currentY + 8, 245));

            const pdfBlob = doc.output('blob');

            // Send to server
            const formData = new FormData();
            formData.append('travelerName', travelerName);
            formData.append('idNumber', idNumber);
            formData.append('phone', phone);
            formData.append('email', email);
            formData.append('departureAirport', departureAirport);
            formData.append('destinationAirport', destinationAirport);
            formData.append('departureDate', departureDate);
            formData.append('returnDate', returnDate);
            formData.append('storyName', storyName);
            formData.append('accommodationRequired', accommodationRequired);
            formData.append('carHireRequired', carHireRequired);
            formData.append('additionalNotes', additionalNotes);
            formData.append('travel_pdf', pdfBlob, `TravelRequest_${travelerName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);

            // Append metadata from share link if present
            const commInput = document.getElementById('commissionNumber');
            const prodNameInput = document.getElementById('producerName');
            const prodEmailInput = document.getElementById('producerEmail');
            if (commInput && commInput.value) formData.append('commissionNumber', commInput.value);
            if (prodNameInput && prodNameInput.value) formData.append('producerName', prodNameInput.value);
            if (prodEmailInput && prodEmailInput.value) formData.append('producerEmail', prodEmailInput.value);

            // Fallback for staff users submitting directly without share link
            if (!formData.get('producerName')) {
                try {
                    const userStr = localStorage.getItem('user_profile_cache') || Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
                    if (userStr) {
                        const u = JSON.parse(localStorage.getItem(userStr) || '{}');
                        const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                        if (name) formData.append('producerName', name);
                        if (u.email) formData.append('producerEmail', u.email);
                    }
                } catch (e) {}
            }

            const token = (window.auth && typeof window.auth.getIdToken === 'function')
                ? await window.auth.getIdToken().catch(() => null)
                : null;
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/api/send-travel-booking', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Server error');

            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            dialog.classList.remove('hidden');
            const isGuest = !(window.auth && window.auth.currentUser);
            const closeBtn = document.getElementById('dialogCloseBtn');
            if (isGuest) {
                const p = dialog.querySelector('p');
                if (p) p.textContent = 'Your Travel Booking Form has been submitted and sent to Embassy Travel, Production & Carte Blanche. You may now close this window.';
                closeBtn.textContent = 'Done / Close Window';
                closeBtn.onclick = () => {
                    closeBtn.disabled = true;
                    closeBtn.textContent = 'Submitted ✓';
                    try { window.close(); } catch (e) {}
                };
            } else {
                closeBtn.onclick = () => window.location.href = 'index.html';
            }

        } catch (error) {
            console.error('CRITICAL ERROR:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    });
});
