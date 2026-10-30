import { submitLegalForm, showSubmissionSuccessModal, cleanPdfText } from './form_submission_helper.js?v=5.3.1';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.3.1';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Toggles for sections
    setupSectionToggles();

    // 2. Add initial items
    addFlightLeg();
    addPassenger();
    addVehicle();
    addHotel();

    // 3. Attach repeater button listeners
    document.getElementById('btnAddFlightLeg').addEventListener('click', () => addFlightLeg());
    document.getElementById('btnAddPassenger').addEventListener('click', () => addPassenger());
    document.getElementById('btnAddVehicle').addEventListener('click', () => addVehicle());
    document.getElementById('btnAddHotel').addEventListener('click', () => addHotel());

    // 4. Share Form Handler
    document.getElementById('shareFormBtn')?.addEventListener('click', () => {
        const comm = document.getElementById('commissionNumber')?.value || '';
        const story = document.getElementById('storyName')?.value || '';
        openShareModal({
            title: 'Travel Booking Form 2026',
            url: window.location.href,
            storyTitle: story,
            commNum: comm
        });
    });

    // 5. Pre-fill from URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('commNum')) document.getElementById('commissionNumber').value = urlParams.get('commNum');
    if (urlParams.get('story')) document.getElementById('storyName').value = urlParams.get('story');
    if (urlParams.get('producer')) document.getElementById('requestorName').value = urlParams.get('producer');

    // 6. Download & Share Completed PDF Handler
    document.getElementById('downloadCompletedPdfBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadCompletedPdfBtn');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Generating PDF...';
        btn.disabled = true;
        try {
            const { pdfBlob, filename, metadata } = await buildTravelBookingPDF();
            await downloadAndSharePDF(pdfBlob, filename, {
                title: 'Travel Booking Form 2026',
                storyTitle: metadata.storyName || '',
                commNum: metadata.commNum || ''
            });
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            alert('Error generating PDF: ' + err.message);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    });

    // 6. Submit Travel Booking Handler
    document.getElementById('submitFormBtn').addEventListener('click', async () => {
        const form = document.getElementById('travelBookingForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const submitBtn = document.getElementById('submitFormBtn');
        const origSubmitText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>⏳</span> Submitting & Sending Email...';
        submitBtn.disabled = true;

        try {
            const { pdfBlob, filename, metadata } = await buildTravelBookingPDF();

            const formData = new FormData();
            formData.append('pdf', pdfBlob, filename);
            formData.append('formType', 'travel_booking');
            formData.append('formTitle', 'Travel Booking Form 2026');
            formData.append('storyName', metadata.storyName);
            formData.append('commissionNumber', metadata.commNum);
            formData.append('producerName', metadata.requestorName);
            formData.append('submitterEmail', metadata.submitterEmail);
            formData.append('metadata', JSON.stringify({
                airTravelRequired: metadata.airTravelRequired,
                carRentalRequired: metadata.carRentalRequired,
                accommodationRequired: metadata.accommodationRequired,
                flightsCount: metadata.flights.length,
                vehiclesCount: metadata.vehicles.length,
                hotelsCount: metadata.hotels.length,
                specialNotes: metadata.specialNotes
            }));

            const response = await submitLegalForm(formData);

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Server rejected submission.');
            }

            showSubmissionSuccessModal({
                title: 'Travel Booking Form 2026',
                recipients: result.recipients || [metadata.submitterEmail],
                pdfBlob,
                filename
            });

        } catch (err) {
            console.error('Submission failed:', err);
            alert('Submission failed: ' + err.message);
        } finally {
            submitBtn.innerHTML = origSubmitText;
            submitBtn.disabled = false;
        }
    });
});

function setupSectionToggles() {
    const toggles = [
        { radioName: 'airTravelRequired', containerId: 'airTravelContainer' },
        { radioName: 'carRentalRequired', containerId: 'carRentalContainer' },
        { radioName: 'accommodationRequired', containerId: 'accommodationContainer' }
    ];

    toggles.forEach(({ radioName, containerId }) => {
        const radios = document.querySelectorAll(`input[name="${radioName}"]`);
        const container = document.getElementById(containerId);
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'Yes') {
                    container.classList.remove('hidden');
                } else {
                    container.classList.add('hidden');
                }
            });
        });
    });
}

let flightLegCount = 0;
function addFlightLeg(data = {}) {
    flightLegCount++;
    const container = document.getElementById('flightLegsList');
    const id = flightLegCount;

    const html = `
    <div class="dynamic-subcard" id="flightLeg_${id}">
        <div class="dynamic-subcard-header">
            <h4>Flight Leg #${id}</h4>
            ${id > 1 ? `<button type="button" class="btn-remove-subcard" onclick="document.getElementById('flightLeg_${id}').remove()">✕ Remove</button>` : ''}
        </div>
        <div class="field-group-grid">
            <div class="form-field">
                <label>Trip Type</label>
                <select name="flight_tripType[]">
                    <option value="Single" ${data.tripType === 'Single' ? 'selected' : ''}>One Way / Single</option>
                    <option value="Return" ${data.tripType === 'Return' ? 'selected' : ''}>Return</option>
                </select>
            </div>
            <div class="form-field">
                <label>Departure Airport</label>
                <input type="text" name="flight_depAirport[]" placeholder="e.g. JNB - O.R. Tambo" value="${data.depAirport || ''}">
            </div>
            <div class="form-field">
                <label>Arrival Airport</label>
                <input type="text" name="flight_arrAirport[]" placeholder="e.g. CPT - Cape Town" value="${data.arrAirport || ''}">
            </div>
            <div class="form-field">
                <label>Departure Date & Time</label>
                <input type="datetime-local" name="flight_depDateTime[]" value="${data.depDateTime || ''}">
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

let passengerCount = 0;
function addPassenger(data = {}) {
    passengerCount++;
    const tbody = document.getElementById('passengersTableBody');
    const id = passengerCount;

    const html = `
    <tr id="passengerRow_${id}">
        <td><input type="text" name="passenger_firstName[]" placeholder="First Name" value="${data.firstName || ''}"></td>
        <td><input type="text" name="passenger_lastName[]" placeholder="Surname" value="${data.lastName || ''}"></td>
        <td><input type="text" name="passenger_idNumber[]" placeholder="ID or Passport" value="${data.idNumber || ''}"></td>
        <td><input type="text" name="passenger_mobile[]" placeholder="Mobile Number" value="${data.mobile || ''}"></td>
        <td style="text-align: center;">
            ${id > 1 ? `<button type="button" class="btn-remove-subcard" onclick="document.getElementById('passengerRow_${id}').remove()">✕</button>` : ''}
        </td>
    </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', html);
}

let vehicleCount = 0;
function addVehicle(data = {}) {
    vehicleCount++;
    const container = document.getElementById('vehiclesList');
    const id = vehicleCount;

    const html = `
    <div class="dynamic-subcard" id="vehicleCard_${id}">
        <div class="dynamic-subcard-header">
            <h4>Vehicle Rental #${id}</h4>
            ${id > 1 ? `<button type="button" class="btn-remove-subcard" onclick="document.getElementById('vehicleCard_${id}').remove()">✕ Remove</button>` : ''}
        </div>
        <div class="field-group-grid">
            <div class="form-field">
                <label>Pick-Up Location</label>
                <input type="text" name="vehicle_pickUpLocation[]" placeholder="e.g. CPT Airport Avis" value="${data.pickUpLocation || ''}">
            </div>
            <div class="form-field">
                <label>Pick-Up Date & Time</label>
                <input type="datetime-local" name="vehicle_pickUpDateTime[]" value="${data.pickUpDateTime || ''}">
            </div>
            <div class="form-field">
                <label>Drop-Off Location</label>
                <input type="text" name="vehicle_dropOffLocation[]" placeholder="e.g. CPT Airport Avis" value="${data.dropOffLocation || ''}">
            </div>
            <div class="form-field">
                <label>Drop-Off Date & Time</label>
                <input type="datetime-local" name="vehicle_dropOffDateTime[]" value="${data.dropOffDateTime || ''}">
            </div>
            <div class="form-field field-group-full">
                <label>Responsible Driver (Full Name & Surname)</label>
                <input type="text" name="vehicle_driverName[]" placeholder="Driver full name..." value="${data.driverName || ''}">
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

let hotelCount = 0;
function addHotel(data = {}) {
    hotelCount++;
    const container = document.getElementById('hotelsList');
    const id = hotelCount;

    const html = `
    <div class="dynamic-subcard" id="hotelCard_${id}">
        <div class="dynamic-subcard-header">
            <h4>Accommodation Location #${id}</h4>
            ${id > 1 ? `<button type="button" class="btn-remove-subcard" onclick="document.getElementById('hotelCard_${id}').remove()">✕ Remove</button>` : ''}
        </div>
        <div class="field-group-grid">
            <div class="form-field">
                <label>Destination / City</label>
                <input type="text" name="hotel_city[]" placeholder="e.g. Durban" value="${data.city || ''}">
            </div>
            <div class="form-field">
                <label>Preferred Hotel / B&B</label>
                <input type="text" name="hotel_name[]" placeholder="e.g. Southern Sun Elangeni" value="${data.hotelName || ''}">
            </div>
            <div class="form-field">
                <label>Check-In Date</label>
                <input type="date" name="hotel_checkIn[]" value="${data.checkIn || ''}">
            </div>
            <div class="form-field">
                <label>Check-Out Date</label>
                <input type="date" name="hotel_checkOut[]" value="${data.checkOut || ''}">
            </div>
            <div class="form-field field-group-full">
                <label>Guest Names & Room Allocations</label>
                <input type="text" name="hotel_guests[]" placeholder="e.g. Producer (Single Room), Cameraman & Sound (Twin Rooms)" value="${data.guests || ''}">
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

// Global attach for inline button handlers
window.removeSubcard = (id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
};

async function buildTravelBookingPDF() {
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    const commNum = document.getElementById('commissionNumber').value.trim();
    const storyName = document.getElementById('storyName').value.trim();
    const requestorName = document.getElementById('requestorName').value.trim();
    const submitterEmail = document.getElementById('submitterEmail').value.trim();
    const specialNotes = document.getElementById('specialNotes').value.trim();

    const airTravelRequired = document.querySelector('input[name="airTravelRequired"]:checked')?.value === 'Yes';
    const carRentalRequired = document.querySelector('input[name="carRentalRequired"]:checked')?.value === 'Yes';
    const accommodationRequired = document.querySelector('input[name="accommodationRequired"]:checked')?.value === 'Yes';

    // Collect Flights
    const flights = [];
    if (airTravelRequired) {
        const tripTypes = Array.from(document.querySelectorAll('select[name="flight_tripType[]"]')).map(s => s.value);
        const depAirports = Array.from(document.querySelectorAll('input[name="flight_depAirport[]"]')).map(s => s.value.trim());
        const arrAirports = Array.from(document.querySelectorAll('input[name="flight_arrAirport[]"]')).map(s => s.value.trim());
        const depDateTimes = Array.from(document.querySelectorAll('input[name="flight_depDateTime[]"]')).map(s => s.value);

        tripTypes.forEach((type, idx) => {
            if (depAirports[idx] || arrAirports[idx]) {
                flights.push({
                    tripType: type,
                    depAirport: depAirports[idx] || 'N/A',
                    arrAirport: arrAirports[idx] || 'N/A',
                    depDateTime: depDateTimes[idx] ? depDateTimes[idx].replace('T', ' ') : 'N/A'
                });
            }
        });
    }

    // Collect Passengers
    const passengers = [];
    if (airTravelRequired) {
        const firstNames = Array.from(document.querySelectorAll('input[name="passenger_firstName[]"]')).map(s => s.value.trim());
        const lastNames = Array.from(document.querySelectorAll('input[name="passenger_lastName[]"]')).map(s => s.value.trim());
        const idNumbers = Array.from(document.querySelectorAll('input[name="passenger_idNumber[]"]')).map(s => s.value.trim());
        const mobiles = Array.from(document.querySelectorAll('input[name="passenger_mobile[]"]')).map(s => s.value.trim());

        firstNames.forEach((fn, idx) => {
            if (fn || lastNames[idx]) {
                passengers.push({
                    name: `${fn} ${lastNames[idx]}`.trim(),
                    idNumber: idNumbers[idx] || 'N/A',
                    mobile: mobiles[idx] || 'N/A'
                });
            }
        });
    }

    // Collect Vehicles
    const vehicles = [];
    if (carRentalRequired) {
        const pickUps = Array.from(document.querySelectorAll('input[name="vehicle_pickUpLocation[]"]')).map(s => s.value.trim());
        const pickUpDates = Array.from(document.querySelectorAll('input[name="vehicle_pickUpDateTime[]"]')).map(s => s.value);
        const dropOffs = Array.from(document.querySelectorAll('input[name="vehicle_dropOffLocation[]"]')).map(s => s.value.trim());
        const dropOffDates = Array.from(document.querySelectorAll('input[name="vehicle_dropOffDateTime[]"]')).map(s => s.value);
        const drivers = Array.from(document.querySelectorAll('input[name="vehicle_driverName[]"]')).map(s => s.value.trim());

        pickUps.forEach((pu, idx) => {
            if (pu || dropOffs[idx] || drivers[idx]) {
                vehicles.push({
                    pickUp: pu || 'N/A',
                    pickUpDate: pickUpDates[idx] ? pickUpDates[idx].replace('T', ' ') : 'N/A',
                    dropOff: dropOffs[idx] || 'N/A',
                    dropOffDate: dropOffDates[idx] ? dropOffDates[idx].replace('T', ' ') : 'N/A',
                    driver: drivers[idx] || 'N/A'
                });
            }
        });
    }

    // Collect Hotels
    const hotels = [];
    if (accommodationRequired) {
        const cities = Array.from(document.querySelectorAll('input[name="hotel_city[]"]')).map(s => s.value.trim());
        const names = Array.from(document.querySelectorAll('input[name="hotel_name[]"]')).map(s => s.value.trim());
        const checkIns = Array.from(document.querySelectorAll('input[name="hotel_checkIn[]"]')).map(s => s.value);
        const checkOuts = Array.from(document.querySelectorAll('input[name="hotel_checkOut[]"]')).map(s => s.value);
        const guests = Array.from(document.querySelectorAll('input[name="hotel_guests[]"]')).map(s => s.value.trim());

        cities.forEach((c, idx) => {
            if (c || names[idx]) {
                hotels.push({
                    city: c || 'N/A',
                    hotel: names[idx] || 'N/A',
                    checkIn: checkIns[idx] || 'N/A',
                    checkOut: checkOuts[idx] || 'N/A',
                    guests: guests[idx] || 'N/A'
                });
            }
        });
    }

    // Build PDF Document with pdf-lib
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]); // A4 portrait
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const primaryColor = rgb(0.01, 0.52, 0.78); // #0284c7
    const darkColor = rgb(0.06, 0.09, 0.16);
    const mutedColor = rgb(0.39, 0.45, 0.55);
    const lightBg = rgb(0.96, 0.98, 0.99);

    let y = 800;

    const checkPageBreak = (needed = 40) => {
        if (y - needed < 50) {
            page = pdfDoc.addPage([595, 842]);
            y = 800;
        }
    };

    const safeDrawText = (text, options = {}) => {
        if (!text) return;
        const cleaned = cleanPdfText(text);
        if (!cleaned) return;
        try {
            page.drawText(cleaned, options);
        } catch (e) {
            console.warn('PDF drawText fallback for text:', cleaned, e);
            try {
                const asciiOnly = cleaned.replace(/[^\x20-\x7E]/g, '');
                if (asciiOnly) {
                    page.drawText(asciiOnly, options);
                }
            } catch (fallbackErr) {
                console.error('safeDrawText double-fallback failed:', fallbackErr);
            }
        }
    };

    // Header Banner
    page.drawRectangle({
        x: 40,
        y: y - 50,
        width: 515,
        height: 50,
        color: rgb(0.06, 0.09, 0.16)
    });

    safeDrawText('CARTE BLANCHE  |  COMBINED ARTISTS', {
        x: 55,
        y: y - 24,
        size: 11,
        font: fontBold,
        color: rgb(0.01, 0.56, 0.85)
    });

    safeDrawText('TRAVEL & LOGISTICS REQUISITION 2026', {
        x: 55,
        y: y - 40,
        size: 13,
        font: fontBold,
        color: rgb(1, 1, 1)
    });

    y -= 70;

    // Request Details Card
    page.drawRectangle({
        x: 40,
        y: y - 65,
        width: 515,
        height: 65,
        color: lightBg,
        borderColor: rgb(0.85, 0.9, 0.95),
        borderWidth: 1
    });

    safeDrawText(`Story Title:  ${cleanPdfText(storyName) || 'N/A'}`, { x: 55, y: y - 20, size: 10, font: fontBold, color: darkColor });
    safeDrawText(`Commission #:  ${cleanPdfText(commNum) || 'N/A'}`, { x: 340, y: y - 20, size: 10, font: fontBold, color: darkColor });
    safeDrawText(`Requestor:  ${cleanPdfText(requestorName) || 'N/A'}`, { x: 55, y: y - 40, size: 9.5, font, color: darkColor });
    safeDrawText(`Submitter Email:  ${cleanPdfText(submitterEmail) || 'N/A'}`, { x: 340, y: y - 40, size: 9.5, font, color: darkColor });
    safeDrawText(`Date Submitted:  ${new Date().toLocaleDateString('en-ZA')}`, { x: 55, y: y - 56, size: 8.5, font, color: mutedColor });

    y -= 85;

    // Air Travel Section
    if (airTravelRequired && flights.length > 0) {
        checkPageBreak(50);
        safeDrawText('AIR TRAVEL REQUIREMENTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 16;

        flights.forEach((f, idx) => {
            checkPageBreak(30);
            safeDrawText(`Flight ${idx + 1} (${f.tripType}):  ${f.depAirport}  ->  ${f.arrAirport}  |  Dep: ${f.depDateTime}`, {
                x: 50,
                y,
                size: 9,
                font: fontBold,
                color: darkColor
            });
            y -= 14;
        });

        if (passengers.length > 0) {
            y -= 6;
            checkPageBreak(30);
            safeDrawText('Passengers:', { x: 50, y, size: 9.5, font: fontBold, color: mutedColor });
            y -= 14;
            passengers.forEach((p, pIdx) => {
                checkPageBreak(18);
                safeDrawText(`${pIdx + 1}. ${p.name}  -  ID/Passport: ${p.idNumber}  -  Mobile: ${p.mobile}`, {
                    x: 60,
                    y,
                    size: 8.5,
                    font,
                    color: darkColor
                });
                y -= 13;
            });
        }
        y -= 15;
    }

    // Car Rental Section
    if (carRentalRequired && vehicles.length > 0) {
        checkPageBreak(50);
        safeDrawText('CAR RENTAL REQUIREMENTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 16;

        vehicles.forEach((v, idx) => {
            checkPageBreak(35);
            safeDrawText(`Vehicle ${idx + 1} - Driver: ${v.driver}`, { x: 50, y, size: 9.5, font: fontBold, color: darkColor });
            y -= 13;
            safeDrawText(`Pick-Up: ${v.pickUp} (${v.pickUpDate})  ->  Drop-Off: ${v.dropOff} (${v.dropOffDate})`, {
                x: 60,
                y,
                size: 8.5,
                font,
                color: mutedColor
            });
            y -= 18;
        });
        y -= 10;
    }

    // Accommodation Section
    if (accommodationRequired && hotels.length > 0) {
        checkPageBreak(50);
        safeDrawText('ACCOMMODATION REQUIREMENTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 16;

        hotels.forEach((h, idx) => {
            checkPageBreak(35);
            safeDrawText(`Location ${idx + 1}: ${h.city} - Hotel/B&B: ${h.hotel}`, { x: 50, y, size: 9.5, font: fontBold, color: darkColor });
            y -= 13;
            safeDrawText(`Check-In: ${h.checkIn}  |  Check-Out: ${h.checkOut}  |  Guests: ${h.guests}`, {
                x: 60,
                y,
                size: 8.5,
                font,
                color: mutedColor
            });
            y -= 18;
        });
        y -= 10;
    }

    // Special Requirements
    if (specialNotes) {
        checkPageBreak(60);
        safeDrawText('SPECIAL REQUIREMENTS & LOGISTICS NOTES', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 16;
        const noteLines = specialNotes.split('\n');
        noteLines.forEach(nl => {
            checkPageBreak(15);
            safeDrawText(nl, { x: 50, y, size: 8.5, font, color: darkColor });
            y -= 12;
        });
        y -= 15;
    }

    // Footer on page
    safeDrawText('Generated by CARP Dashboard - Combined Artists & Carte Blanche (c) 2026', {
        x: 40,
        y: 35,
        size: 8,
        font,
        color: mutedColor
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const cleanStory = (storyName || 'Carte_Blanche').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Travel_Booking_${cleanStory}_2026.pdf`;

    return {
        pdfBlob,
        filename,
        metadata: {
            commNum,
            storyName,
            requestorName,
            submitterEmail,
            specialNotes,
            airTravelRequired,
            carRentalRequired,
            accommodationRequired,
            flights,
            passengers,
            vehicles,
            hotels
        }
    };
}
