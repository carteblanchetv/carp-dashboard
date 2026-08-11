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

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.text('TRAVEL BOOKING REQUEST 2026', 20, 25);

            doc.setDrawColor(0, 143, 190);
            doc.setLineWidth(1);
            doc.line(20, 30, 190, 30);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Traveler Details', 20, 45);

            doc.setFont('helvetica', 'normal');
            doc.text(`Full Name: ${travelerName}`, 20, 55);
            doc.text(`ID/Passport Number: ${idNumber}`, 20, 65);
            doc.text(`Phone Number: ${phone}`, 20, 75);
            doc.text(`Email Address: ${email}`, 20, 85);

            doc.setFont('helvetica', 'bold');
            doc.text('Itinerary Details', 20, 100);
            doc.setFont('helvetica', 'normal');
            doc.text(`Departure Airport: ${departureAirport}`, 20, 110);
            doc.text(`Destination Airport: ${destinationAirport}`, 20, 120);
            doc.text(`Departure Date: ${departureDate}`, 20, 130);
            doc.text(`Return Date: ${returnDate}`, 20, 140);
            doc.text(`Story / Project: ${storyName}`, 20, 150);

            doc.setFont('helvetica', 'bold');
            doc.text('Additional Booking Options', 20, 165);
            doc.setFont('helvetica', 'normal');
            doc.text(`Accommodation Required: ${accommodationRequired}`, 20, 175);
            doc.text(`Car Hire Required: ${carHireRequired}`, 20, 185);
            
            if (additionalNotes) {
                doc.setFont('helvetica', 'bold');
                doc.text('Preferences / Special Requests:', 20, 200);
                doc.setFont('helvetica', 'normal');
                const splitNotes = doc.splitTextToSize(additionalNotes, 170);
                doc.text(splitNotes, 20, 210);
            }

            doc.setFont('helvetica', 'bold');
            doc.text(`Request Date: ${new Date().toLocaleDateString('en-ZA')}`, 20, 255);

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

            const token = await window.auth.getIdToken();
            const response = await fetch('/api/send-travel-booking', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Server error');

            loadingOverlay.classList.remove('active');
            const dialog = document.getElementById('successDialog');
            dialog.classList.remove('hidden');
            document.getElementById('dialogCloseBtn').onclick = () => window.location.href = 'index.html';

        } catch (error) {
            console.error('CRITICAL ERROR:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            loadingOverlay.classList.remove('active');
        }
    });
});
