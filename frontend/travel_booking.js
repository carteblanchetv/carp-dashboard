// travel_booking.js - v5.3.3
function initTravelBooking() {
    const form = document.getElementById('travelBookingForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    const SA_AIRPORTS = [
        "O.R. Tambo International Airport (JNB) - Johannesburg",
        "Cape Town International Airport (CPT) - Cape Town",
        "King Shaka International Airport (DUR) - Durban",
        "Lanseria International Airport (HLA) - Johannesburg",
        "Chief Dawid Stuurman International Airport (PLZ) - Gqeberha",
        "Bram Fischer International Airport (BFN) - Bloemfontein",
        "George Airport (GRJ) - George",
        "East London Airport (ELS) - East London",
        "Kruger Mpumalanga International Airport (MQP) - Mbombela",
        "Kimberley Airport (KIM) - Kimberley",
        "Upington Airport (UTN) - Upington",
        "Polokwane International Airport (PTG) - Polokwane",
        "Pietermaritzburg Airport (PZB) - Pietermaritzburg",
        "Richards Bay Airport (RCB) - Richards Bay",
        "Skukuza Airport (SZK) - Kruger National Park",
        "Other"
    ];

    // -------------------------------------------------------------------------
    // 1. Resolve Active User Identity for Auto-filling Name & Email
    // -------------------------------------------------------------------------
    function getActiveUserData() {
        try {
            const cacheKey = localStorage.getItem('user_profile_cache') ||
                Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
            if (cacheKey) {
                const u = JSON.parse(localStorage.getItem(cacheKey) || '{}');
                const n = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
                const e = u.email || '';
                if (n || e) return { name: n, email: e };
            }
            if (window.auth && typeof window.auth.getCurrentUser === 'function') {
                const cur = window.auth.getCurrentUser();
                if (cur) return {
                    name: cur.displayName || `${cur.firstName || ''} ${cur.lastName || ''}`.trim() || cur.email || '',
                    email: cur.email || ''
                };
            }
        } catch (e) {
            console.warn('[TRAVEL-FORM] Could not resolve active user:', e);
        }
        return { name: '', email: '' };
    }

    const activeUser = getActiveUserData();
    const nameInput = document.getElementById('nameAndSurname');
    const emailInput = document.getElementById('email');
    if (nameInput && !nameInput.value && activeUser.name) nameInput.value = activeUser.name;
    if (emailInput && !emailInput.value && activeUser.email) emailInput.value = activeUser.email;

    // Pre-fill from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const initialComm = urlParams.get('comm') || urlParams.get('commission') || urlParams.get('commissionNumber') || '';
    const initialStory = urlParams.get('story') || urlParams.get('storyName') || '';
    const initialProducer = urlParams.get('producer') || urlParams.get('producerName') || '';
    const initialEmail = urlParams.get('producerEmail') || urlParams.get('email') || '';

    if (initialComm && document.getElementById('commissionNumber')) {
        document.getElementById('commissionNumber').value = initialComm;
    }
    if (initialStory && document.getElementById('storyName')) {
        document.getElementById('storyName').value = initialStory;
    }
    if (initialProducer && nameInput && !nameInput.value) {
        nameInput.value = initialProducer;
    }
    if (initialEmail && emailInput && !emailInput.value) {
        emailInput.value = initialEmail;
    }

    const todayIso = new Date().toISOString().split('T')[0];

    // -------------------------------------------------------------------------
    // 2. Airport Select HTML Generator Helper
    // -------------------------------------------------------------------------
    function buildAirportOptions() {
        return `
            <option value="">-- Select Airport --</option>
            ${SA_AIRPORTS.map(apt => `<option value="${apt}">${apt}</option>`).join('')}
        `;
    }

    // -------------------------------------------------------------------------
    // 3. Dynamic FLIGHTS Builder (Flights 1 to 5 + Add More)
    // -------------------------------------------------------------------------
    const flightsContainer = document.getElementById('flightsContainer');
    let flightCount = 0;

    function updateFlightCards() {
        const cards = flightsContainer.querySelectorAll('.travel-card');
        cards.forEach((card, idx) => {
            const num = idx + 1;
            const title = card.querySelector('.travel-card-title');
            if (title) title.textContent = `FLIGHT ${num}`;

            const header = card.querySelector('.travel-card-header');
            let removeBtn = card.querySelector('.btn-remove-flight');
            if (num === 1) {
                if (removeBtn) removeBtn.remove();
            } else {
                if (!removeBtn && header) {
                    removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'btn-action-small btn-remove-flight';
                    removeBtn.title = 'Remove this flight';
                    removeBtn.textContent = '🗑️ Remove';
                    removeBtn.addEventListener('click', () => {
                        card.remove();
                        updateFlightCards();
                        syncLegacyFields();
                    });
                    header.appendChild(removeBtn);
                }
            }
        });
    }

    function createFlightCard(fNum) {
        const card = document.createElement('div');
        card.className = 'travel-card';
        card.id = `flightCard_${fNum}`;
        card.dataset.flightIndex = fNum;

        card.innerHTML = `
            <div class="travel-card-header">
                <h3 class="travel-card-title">FLIGHT ${fNum}</h3>
                ${fNum > 1 ? `<button type="button" class="btn-action-small btn-remove-flight" title="Remove this flight">🗑️ Remove</button>` : ''}
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="depAirport_${fNum}">Departure Airport:</label>
                    <select id="depAirport_${fNum}" name="depAirport_${fNum}" class="airport-select">
                        ${buildAirportOptions()}
                    </select>
                    <div id="depAirportOtherWrap_${fNum}" class="other-airport-wrap hidden">
                        <input type="text" id="depAirportOther_${fNum}" name="depAirportOther_${fNum}" placeholder="Specify departure airport...">
                    </div>
                </div>

                <div class="form-group">
                    <label for="depDate_${fNum}">Departure Date:</label>
                    <input type="date" id="depDate_${fNum}" name="depDate_${fNum}" value="${todayIso}">
                </div>

                <div class="form-group">
                    <label for="depTime_${fNum}">Departure Time:</label>
                    <input type="time" id="depTime_${fNum}" name="depTime_${fNum}">
                </div>

                <div class="form-group">
                    <label for="arrAirport_${fNum}">Arrival Airport:</label>
                    <select id="arrAirport_${fNum}" name="arrAirport_${fNum}" class="airport-select">
                        ${buildAirportOptions()}
                    </select>
                    <div id="arrAirportOtherWrap_${fNum}" class="other-airport-wrap hidden">
                        <input type="text" id="arrAirportOther_${fNum}" name="arrAirportOther_${fNum}" placeholder="Specify arrival airport...">
                    </div>
                </div>

                <div class="form-group full-width">
                    <label for="totalPax_${fNum}">Total Passengers:</label>
                    <input type="number" id="totalPax_${fNum}" name="totalPax_${fNum}" min="1" placeholder="e.g. 3">
                </div>
            </div>

            <div style="margin-top: 1rem;">
                <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--primary); margin: 0 0 0.4rem 0;">PASSENGER INFO</h4>
                <div class="data-table-container">
                    <table class="travel-table" id="paxTable_${fNum}">
                        <thead>
                            <tr>
                                <th style="width: 100px;">Passenger</th>
                                <th>First Name</th>
                                <th>Surname</th>
                                <th>ID Number</th>
                                <th>Mobile Number</th>
                                <th style="width: 40px; text-align: center;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Passengers 1, 2, 3 added initially -->
                        </tbody>
                    </table>
                </div>
                <button type="button" class="btn-add-row btn-add-pax" data-flight="${fNum}">
                    <span>➕</span> Add another passenger
                </button>
            </div>
        `;

        flightsContainer.appendChild(card);

        // Bind 'Other' toggle for Departure & Arrival airports
        const depSelect = card.querySelector(`#depAirport_${fNum}`);
        const depOtherWrap = card.querySelector(`#depAirportOtherWrap_${fNum}`);
        depSelect.addEventListener('change', () => {
            depOtherWrap.classList.toggle('hidden', depSelect.value !== 'Other');
        });

        const arrSelect = card.querySelector(`#arrAirport_${fNum}`);
        const arrOtherWrap = card.querySelector(`#arrAirportOtherWrap_${fNum}`);
        arrSelect.addEventListener('change', () => {
            arrOtherWrap.classList.toggle('hidden', arrSelect.value !== 'Other');
        });

        // Add 3 initial passengers
        const tbody = card.querySelector(`#paxTable_${fNum} tbody`);
        for (let p = 1; p <= 3; p++) {
            addPassengerRow(fNum, p, tbody);
        }

        // Add passenger button
        const addPaxBtn = card.querySelector('.btn-add-pax');
        addPaxBtn.addEventListener('click', () => {
            const currentRows = tbody.querySelectorAll('tr').length;
            addPassengerRow(fNum, currentRows + 1, tbody);
        });

        // Remove flight button (for flights > 1)
        const removeBtn = card.querySelector('.btn-remove-flight');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                card.remove();
                updateFlightCards();
                syncLegacyFields();
            });
        }
    }

    function addPassengerRow(fNum, paxNum, tbody) {
        const tr = document.createElement('tr');
        tr.dataset.paxIndex = paxNum;
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--text-dark, #334155); font-size: 0.8rem;">Passenger ${paxNum}</td>
            <td><input type="text" name="f${fNum}_pax${paxNum}_firstName" placeholder="First Name"></td>
            <td><input type="text" name="f${fNum}_pax${paxNum}_surname" placeholder="Surname"></td>
            <td><input type="text" name="f${fNum}_pax${paxNum}_id" placeholder="ID Number"></td>
            <td><input type="tel" name="f${fNum}_pax${paxNum}_mobile" placeholder="Mobile Number"></td>
            <td style="text-align: center;">
                ${paxNum > 3 ? `<button type="button" class="btn-action-small btn-remove-pax" title="Remove row">🗑️</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);

        const removeBtn = tr.querySelector('.btn-remove-pax');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                tr.remove();
                // Re-number remaining rows in this table
                tbody.querySelectorAll('tr').forEach((row, idx) => {
                    row.querySelector('td:first-child').textContent = `Passenger ${idx + 1}`;
                });
                syncLegacyFields();
            });
        }
    }

    // Build initial Flight 1 only
    createFlightCard(1);
    flightCount = 1;

    // Add another flight button
    const btnAddFlight = document.getElementById('btnAddFlight');
    btnAddFlight.addEventListener('click', () => {
        flightCount++;
        createFlightCard(flightCount);
        updateFlightCards();
    });

    // -------------------------------------------------------------------------
    // 5. Dynamic CAR RENTAL Builder (Car Rental 1 + Add More)
    // -------------------------------------------------------------------------
    const carRentalsContainer = document.getElementById('carRentalsContainer');
    let carRentalCount = 0;

    function updateCarRentalCards() {
        const cards = carRentalsContainer.querySelectorAll('.travel-card');
        cards.forEach((card, idx) => {
            const num = idx + 1;
            const title = card.querySelector('.travel-card-title');
            if (title) title.textContent = `CAR RENTAL ${num}`;

            const header = card.querySelector('.travel-card-header');
            let removeBtn = card.querySelector('.btn-remove-car');
            if (num === 1) {
                if (removeBtn) removeBtn.remove();
            } else {
                if (!removeBtn && header) {
                    removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'btn-action-small btn-remove-car';
                    removeBtn.title = 'Remove car rental';
                    removeBtn.textContent = '🗑️ Remove';
                    removeBtn.addEventListener('click', () => {
                        card.remove();
                        updateCarRentalCards();
                        syncLegacyFields();
                    });
                    header.appendChild(removeBtn);
                }
            }
        });
    }

    function createCarRentalCard(cNum) {
        const card = document.createElement('div');
        card.className = 'travel-card';
        card.id = `carRentalCard_${cNum}`;
        card.dataset.carIndex = cNum;

        card.innerHTML = `
            <div class="travel-card-header">
                <h3 class="travel-card-title">CAR RENTAL ${cNum}</h3>
                ${cNum > 1 ? `<button type="button" class="btn-action-small btn-remove-car" title="Remove car rental">🗑️ Remove</button>` : ''}
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="car${cNum}_pickupLoc">Pick-Up Location:</label>
                    <input type="text" id="car${cNum}_pickupLoc" name="car${cNum}_pickupLoc" placeholder="e.g. O.R. Tambo Airport">
                </div>
                <div class="form-group">
                    <label for="car${cNum}_pickupDate">Date:</label>
                    <input type="date" id="car${cNum}_pickupDate" name="car${cNum}_pickupDate" value="${todayIso}">
                </div>
                <div class="form-group">
                    <label for="car${cNum}_pickupTime">Time:</label>
                    <input type="time" id="car${cNum}_pickupTime" name="car${cNum}_pickupTime">
                </div>

                <div class="form-group">
                    <label for="car${cNum}_dropoffLoc">Drop-Off Location:</label>
                    <input type="text" id="car${cNum}_dropoffLoc" name="car${cNum}_dropoffLoc" placeholder="e.g. Cape Town Airport">
                </div>
                <div class="form-group">
                    <label for="car${cNum}_dropoffDate">Date:</label>
                    <input type="date" id="car${cNum}_dropoffDate" name="car${cNum}_dropoffDate" value="${todayIso}">
                </div>
                <div class="form-group">
                    <label for="car${cNum}_dropoffTime">Time:</label>
                    <input type="time" id="car${cNum}_dropoffTime" name="car${cNum}_dropoffTime">
                </div>

                <div class="form-group full-width">
                    <label for="car${cNum}_driver">Responsible Driver Name &amp; Surname:</label>
                    <input type="text" id="car${cNum}_driver" name="car${cNum}_driver" placeholder="Enter driver full name &amp; surname...">
                </div>
            </div>
        `;

        carRentalsContainer.appendChild(card);

        const removeBtn = card.querySelector('.btn-remove-car');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                card.remove();
                updateCarRentalCards();
                syncLegacyFields();
            });
        }
    }

    // Build initial Car Rental 1 only
    createCarRentalCard(1);
    carRentalCount = 1;

    const btnAddCar = document.getElementById('btnAddCar');
    btnAddCar.addEventListener('click', () => {
        carRentalCount++;
        createCarRentalCard(carRentalCount);
        updateCarRentalCards();
    });

    // -------------------------------------------------------------------------
    // 6. Dynamic ACCOMMODATION Builder (Location 1 + Add More)
    // -------------------------------------------------------------------------
    const locationsContainer = document.getElementById('locationsContainer');
    let locationCount = 0;

    function updateLocationCards() {
        const cards = locationsContainer.querySelectorAll('.travel-card');
        cards.forEach((card, idx) => {
            const num = idx + 1;
            const title = card.querySelector('.travel-card-title');
            if (title) title.textContent = `LOCATION ${num}`;

            const header = card.querySelector('.travel-card-header');
            let removeBtn = card.querySelector('.btn-remove-loc');
            if (num === 1) {
                if (removeBtn) removeBtn.remove();
            } else {
                if (!removeBtn && header) {
                    removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'btn-action-small btn-remove-loc';
                    removeBtn.title = 'Remove location';
                    removeBtn.textContent = '🗑️ Remove';
                    removeBtn.addEventListener('click', () => {
                        card.remove();
                        updateLocationCards();
                        syncLegacyFields();
                    });
                    header.appendChild(removeBtn);
                }
            }
        });
    }

    function createLocationCard(lNum) {
        const card = document.createElement('div');
        card.className = 'travel-card';
        card.id = `locationCard_${lNum}`;
        card.dataset.locationIndex = lNum;

        card.innerHTML = `
            <div class="travel-card-header">
                <h3 class="travel-card-title">LOCATION ${lNum}</h3>
                ${lNum > 1 ? `<button type="button" class="btn-action-small btn-remove-loc" title="Remove location">🗑️ Remove</button>` : ''}
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="loc${lNum}_where">Where:</label>
                    <input type="text" id="loc${lNum}_where" name="loc${lNum}_where" placeholder="City / Area, e.g. Durban North">
                </div>
                <div class="form-group">
                    <label for="loc${lNum}_hotel">Hotel / B&amp;B (if applicable):</label>
                    <input type="text" id="loc${lNum}_hotel" name="loc${lNum}_hotel" placeholder="Hotel or B&amp;B name...">
                </div>
                <div class="form-group">
                    <label for="loc${lNum}_checkIn">Check-In Date:</label>
                    <input type="date" id="loc${lNum}_checkIn" name="loc${lNum}_checkIn" value="${todayIso}">
                </div>
                <div class="form-group">
                    <label for="loc${lNum}_checkOut">Check-Out Date:</label>
                    <input type="date" id="loc${lNum}_checkOut" name="loc${lNum}_checkOut" value="${todayIso}">
                </div>
            </div>

            <div style="margin-top: 1rem;">
                <h4 style="font-size: 0.9rem; font-weight: 700; color: #0d9488; margin: 0 0 0.4rem 0;">GUEST INFO</h4>
                <div class="data-table-container">
                    <table class="travel-table" id="guestTable_${lNum}">
                        <thead>
                            <tr>
                                <th style="width: 100px;">Guest</th>
                                <th>First Name</th>
                                <th>Surname</th>
                                <th>ID Number</th>
                                <th style="width: 40px; text-align: center;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Guests 1, 2, 3 added initially -->
                        </tbody>
                    </table>
                </div>
                <button type="button" class="btn-add-row btn-add-guest" data-location="${lNum}">
                    <span>➕</span> Add another guest
                </button>
            </div>
        `;

        locationsContainer.appendChild(card);

        // Add 3 initial guests
        const tbody = card.querySelector(`#guestTable_${lNum} tbody`);
        for (let g = 1; g <= 3; g++) {
            addGuestRow(lNum, g, tbody);
        }

        const addGuestBtn = card.querySelector('.btn-add-guest');
        addGuestBtn.addEventListener('click', () => {
            const currentRows = tbody.querySelectorAll('tr').length;
            addGuestRow(lNum, currentRows + 1, tbody);
        });

        const removeBtn = card.querySelector('.btn-remove-loc');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                card.remove();
                updateLocationCards();
                syncLegacyFields();
            });
        }
    }

    function addGuestRow(lNum, guestNum, tbody) {
        const tr = document.createElement('tr');
        tr.dataset.guestIndex = guestNum;
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--text-dark, #334155); font-size: 0.8rem;">Guest ${guestNum}</td>
            <td><input type="text" name="loc${lNum}_guest${guestNum}_firstName" placeholder="First Name"></td>
            <td><input type="text" name="loc${lNum}_guest${guestNum}_surname" placeholder="Surname"></td>
            <td><input type="text" name="loc${lNum}_guest${guestNum}_id" placeholder="ID Number"></td>
            <td style="text-align: center;">
                ${guestNum > 3 ? `<button type="button" class="btn-action-small btn-remove-guest" title="Remove row">🗑️</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);

        const removeBtn = tr.querySelector('.btn-remove-guest');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                tr.remove();
                tbody.querySelectorAll('tr').forEach((row, idx) => {
                    row.querySelector('td:first-child').textContent = `Guest ${idx + 1}`;
                });
                syncLegacyFields();
            });
        }
    }

    // Build initial Location 1 only
    createLocationCard(1);
    locationCount = 1;

    const btnAddLocation = document.getElementById('btnAddLocation');
    btnAddLocation.addEventListener('click', () => {
        locationCount++;
        createLocationCard(locationCount);
        updateLocationCards();
    });

    // -------------------------------------------------------------------------
    // 7. Backward Compatibility Sync with Legacy Fields
    // -------------------------------------------------------------------------
    const travelerNameAlias = document.getElementById('travelerName');
    const idNumberAlias = document.getElementById('idNumber');
    const phoneAlias = document.getElementById('phone');
    const depAirportAlias = document.getElementById('departureAirport');
    const destAirportAlias = document.getElementById('destinationAirport');
    const depDateAlias = document.getElementById('departureDate');
    const retDateAlias = document.getElementById('returnDate');
    const carHireRequiredAlias = document.getElementById('carHireRequired');
    const additionalNotesAlias = document.getElementById('additionalNotes');
    const producerNameAlias = document.getElementById('producerName');
    const producerAlias = document.getElementById('producer');
    const producerEmailAlias = document.getElementById('producerEmail');

    function syncLegacyFields() {
        const nameVal = (nameInput?.value || '').trim();
        if (travelerNameAlias) travelerNameAlias.value = nameVal;
        if (producerNameAlias) producerNameAlias.value = nameVal;
        if (producerAlias) producerAlias.value = nameVal;

        const emailVal = (emailInput?.value || '').trim();
        if (producerEmailAlias && !producerEmailAlias.value) producerEmailAlias.value = emailVal;

        // First passenger details
        const firstPaxId = document.querySelector('input[name="f1_pax1_id"]')?.value?.trim() || '';
        if (idNumberAlias) idNumberAlias.value = firstPaxId;

        const firstPaxMobile = document.querySelector('input[name="f1_pax1_mobile"]')?.value?.trim() || '';
        if (phoneAlias) phoneAlias.value = firstPaxMobile;

        // Flight 1 airports & dates
        let depApt = document.getElementById('depAirport_1')?.value || '';
        if (depApt === 'Other') depApt = document.getElementById('depAirportOther_1')?.value || 'Other';
        if (depAirportAlias) depAirportAlias.value = depApt;

        let arrApt = document.getElementById('arrAirport_1')?.value || '';
        if (arrApt === 'Other') arrApt = document.getElementById('arrAirportOther_1')?.value || 'Other';
        if (destAirportAlias) destAirportAlias.value = arrApt;

        const depDate = document.getElementById('depDate_1')?.value || '';
        if (depDateAlias) depDateAlias.value = depDate;

        const retDate = document.getElementById('depDate_2')?.value || depDate;
        if (retDateAlias) retDateAlias.value = retDate;

        const carReq = document.getElementById('carRentalRequired')?.value || 'No';
        if (carHireRequiredAlias) carHireRequiredAlias.value = carReq;

        const notes = document.getElementById('specialRequirements')?.value || '';
        if (additionalNotesAlias) additionalNotesAlias.value = notes;
    }

    form.addEventListener('input', syncLegacyFields);
    form.addEventListener('change', syncLegacyFields);
    syncLegacyFields();

    // -------------------------------------------------------------------------
    // 8. Multi-Page Client-Side PDF Builder (buildTravelBookingPdf)
    // -------------------------------------------------------------------------
    async function buildTravelBookingPdf() {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 16;
            const contentWidth = pageWidth - (margin * 2);

            const commNum = (document.getElementById('commissionNumber')?.value || 'N/A').trim();
            const story = (document.getElementById('storyName')?.value || 'Story').trim();
            const userName = (nameInput?.value || 'User').trim();
            const userEmail = (emailInput?.value || '').trim();
            const airReq = (document.getElementById('airTravelRequired')?.value || 'Yes').trim();
            const singleOrRet = (document.getElementById('singleOrReturn')?.value || 'Return').trim();
            const carReq = (document.getElementById('carRentalRequired')?.value || 'No').trim();
            const accReq = (document.getElementById('accommodationRequired')?.value || 'No').trim();
            const specialReq = (document.getElementById('specialRequirements')?.value || '').trim();

            function drawRunningHeader(pageNumber, totalPages, subTitle) {
                // Branding Logos
                try {
                    let caLogo = null;
                    try { if (typeof getBlackLogo === 'function') caLogo = getBlackLogo(); } catch(e){}
                    if (!caLogo && typeof CAP_LOGO_B64 !== 'undefined') caLogo = CAP_LOGO_B64;
                    if (caLogo) {
                        const props = doc.getImageProperties(caLogo);
                        const caW = 28;
                        const caH = (props && props.width > 0) ? caW * (props.height / props.width) : 10;
                        doc.addImage(caLogo, 'PNG', margin, 8, caW, caH, undefined, 'FAST');
                    }
                } catch(e){}

                try {
                    if (typeof CB_LOGO_B64 !== 'undefined' && CB_LOGO_B64) {
                        const props = doc.getImageProperties(CB_LOGO_B64);
                        const cbW = 16;
                        const cbH = (props && props.width > 0) ? cbW * (props.height / props.width) : 13;
                        doc.addImage(CB_LOGO_B64, 'PNG', pageWidth - margin - cbW, 7, cbW, cbH, undefined, 'FAST');
                    }
                } catch(e){}

                // Title bar
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(0, 143, 190);
                doc.text(subTitle || 'TRAVEL BOOKING FORM', margin + 34, 14);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 116, 139);
                doc.text(`Story: ${story}  •  Comm: ${commNum}  •  Submitted by: ${userName}`, margin + 34, 19);

                doc.setDrawColor(0, 143, 190);
                doc.setLineWidth(0.4);
                doc.line(margin, 22, pageWidth - margin, 22);

                // Footer
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text(`Carte Blanche & Combined Artists  •  Form Ref: CB-TRF-2026`, margin, pageHeight - 6);
                doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 6);
            }

            // Total pages estimation: 3 pages
            const totalPages = 3;

            // -----------------------------------------------------------------
            // PAGE 1: Flights 1 & 2
            // -----------------------------------------------------------------
            drawRunningHeader(1, totalPages, 'TRAVEL BOOKING FORM (FLIGHTS 1 & 2)');

            let y = 28;
            // Top Details Box
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, y, contentWidth, 14, 1.5, 1.5, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(71, 85, 105);
            doc.text(`COMMISSION NUMBER:`, margin + 3, y + 5);
            doc.text(`STORY NAME:`, margin + 50, y + 5);
            doc.text(`PRODUCER:`, margin + 105, y + 5);
            doc.text(`EMAIL:`, margin + 145, y + 5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(commNum, margin + 3, y + 10);
            doc.text(story, margin + 50, y + 10);
            doc.text(userName, margin + 105, y + 10);
            doc.text(userEmail, margin + 145, y + 10);

            y += 18;

            // AIR TRAVEL Heading & Options
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0, 143, 190);
            doc.text('AIR TRAVEL', margin, y);

            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(`Air Travel Required? Y / N:  ${airReq}`, margin + 45, y);
            doc.text(`Single or Return?  ${singleOrRet}`, margin + 115, y);

            y += 4;

            function drawFlightOnPdf(fNum) {
                const flightCards = flightsContainer.querySelectorAll('.travel-card');
                const fCard = flightCards[fNum - 1];

                let dep = '';
                let depDate = '';
                let depTime = '';
                let arr = '';
                let totalPax = '';

                if (fCard) {
                    const depSel = fCard.querySelector('.airport-select');
                    dep = depSel ? depSel.value : '';
                    if (dep === 'Other') {
                        const depOth = fCard.querySelector('.other-airport-wrap input');
                        dep = depOth ? depOth.value : 'Other';
                    }
                    const dInput = fCard.querySelector('input[type="date"]');
                    depDate = dInput ? dInput.value : '';
                    const tInput = fCard.querySelector('input[type="time"]');
                    depTime = tInput ? tInput.value : '';

                    const selects = fCard.querySelectorAll('.airport-select');
                    if (selects.length > 1) {
                        arr = selects[1].value;
                        if (arr === 'Other') {
                            const otherInputs = fCard.querySelectorAll('.other-airport-wrap input');
                            if (otherInputs.length > 1) arr = otherInputs[1].value;
                            else arr = 'Other';
                        }
                    }
                    const numInput = fCard.querySelector('input[type="number"]');
                    totalPax = numInput ? numInput.value : '';
                } else {
                    dep = document.getElementById(`depAirport_${fNum}`)?.value || '';
                    if (dep === 'Other') dep = document.getElementById(`depAirportOther_${fNum}`)?.value || 'Other';
                    depDate = document.getElementById(`depDate_${fNum}`)?.value || '';
                    depTime = document.getElementById(`depTime_${fNum}`)?.value || '';
                    arr = document.getElementById(`arrAirport_${fNum}`)?.value || '';
                    if (arr === 'Other') arr = document.getElementById(`arrAirportOther_${fNum}`)?.value || 'Other';
                    totalPax = document.getElementById(`totalPax_${fNum}`)?.value || '';
                }

                const blockH = 46;
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(203, 213, 225);
                doc.roundedRect(margin, y, contentWidth, blockH, 1.5, 1.5, 'FD');

                // Header bar
                doc.setFillColor(0, 143, 190);
                doc.roundedRect(margin, y, contentWidth, 5.5, 1, 1, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(255, 255, 255);
                doc.text(`FLIGHT ${fNum}`, margin + 3, y + 4);

                // Flight details row 1
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(71, 85, 105);
                doc.text('Departure Airport:', margin + 3, y + 9);
                doc.text('Departure Date:', margin + 85, y + 9);
                doc.text('Departure Time (HH:MM):', margin + 130, y + 9);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(15, 23, 42);
                doc.text(dep || '___________________________', margin + 3, y + 13);
                doc.text(depDate || 'DD/MM/YYYY', margin + 85, y + 13);
                doc.text(depTime || '__:__', margin + 130, y + 13);

                // Flight details row 2
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(71, 85, 105);
                doc.text('Arrival Airport:', margin + 3, y + 18);
                doc.text('Total Passengers:', margin + 85, y + 18);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(15, 23, 42);
                doc.text(arr || '___________________________', margin + 3, y + 22);
                doc.text(totalPax || '___', margin + 85, y + 22);

                // Passenger Info Subheader
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(0, 143, 190);
                doc.text('PASSENGER INFO', margin + 3, y + 27);

                // Passenger table header
                const pTableY = y + 30;
                doc.setFillColor(241, 245, 249);
                doc.rect(margin + 2, pTableY - 3, contentWidth - 4, 4, 'F');
                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.text('Passenger', margin + 4, pTableY);
                doc.text('First Name', margin + 28, pTableY);
                doc.text('Surname', margin + 68, pTableY);
                doc.text('ID Number', margin + 108, pTableY);
                doc.text('Mobile Number', margin + 145, pTableY);

                // 3 Passenger Rows
                for (let p = 1; p <= 3; p++) {
                    const rowY = pTableY + (p * 4);
                    let pFirst = '', pLast = '', pId = '', pMob = '';
                    if (fCard) {
                        const paxRow = fCard.querySelectorAll('tbody tr')[p - 1];
                        if (paxRow) {
                            const pInputs = paxRow.querySelectorAll('input');
                            pFirst = pInputs[0]?.value || '';
                            pLast = pInputs[1]?.value || '';
                            pId = pInputs[2]?.value || '';
                            pMob = pInputs[3]?.value || '';
                        }
                    } else {
                        pFirst = document.querySelector(`input[name="f${fNum}_pax${p}_firstName"]`)?.value || '';
                        pLast = document.querySelector(`input[name="f${fNum}_pax${p}_surname"]`)?.value || '';
                        pId = document.querySelector(`input[name="f${fNum}_pax${p}_id"]`)?.value || '';
                        pMob = document.querySelector(`input[name="f${fNum}_pax${p}_mobile"]`)?.value || '';
                    }

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6.5);
                    doc.setTextColor(51, 65, 85);
                    doc.text(`Passenger ${p}`, margin + 4, rowY);

                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(15, 23, 42);
                    doc.text(pFirst || '__________________', margin + 28, rowY);
                    doc.text(pLast || '__________________', margin + 68, rowY);
                    doc.text(pId || '__________________', margin + 108, rowY);
                    doc.text(pMob || '__________________', margin + 145, rowY);
                }

                y += blockH + 4;
            }

            drawFlightOnPdf(1);
            drawFlightOnPdf(2);

            // -----------------------------------------------------------------
            // PAGE 2: Flights 3, 4, 5
            // -----------------------------------------------------------------
            doc.addPage([pageWidth, pageHeight]);
            drawRunningHeader(2, totalPages, 'TRAVEL BOOKING FORM (FLIGHTS 3, 4 & 5)');

            y = 28;
            drawFlightOnPdf(3);
            drawFlightOnPdf(4);
            drawFlightOnPdf(5);

            // -----------------------------------------------------------------
            // PAGE 3: Car Rental + Accommodation + Special Req + Confirmation
            // -----------------------------------------------------------------
            doc.addPage([pageWidth, pageHeight]);
            drawRunningHeader(3, totalPages, 'TRAVEL BOOKING FORM (CAR RENTAL & ACCOMMODATION)');

            y = 28;

            // CAR RENTAL HEADING
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0, 143, 190);
            doc.text('CAR RENTAL', margin, y);
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(`Car Rental Required:  ${carReq}`, margin + 50, y);

            y += 4;

            function drawCarRentalOnPdf(cNum) {
                const carCards = carRentalsContainer.querySelectorAll('.travel-card');
                const cCard = carCards[cNum - 1];

                let pickLoc = '', pickDate = '', pickTime = '', dropLoc = '', dropDate = '', dropTime = '', driver = '';

                if (cCard) {
                    const txts = cCard.querySelectorAll('.form-grid input[type="text"]');
                    const dts = cCard.querySelectorAll('.form-grid input[type="date"]');
                    const tms = cCard.querySelectorAll('.form-grid input[type="time"]');
                    pickLoc = txts[0]?.value || '';
                    dropLoc = txts[1]?.value || '';
                    driver = txts[2]?.value || '';
                    pickDate = dts[0]?.value || '';
                    dropDate = dts[1]?.value || '';
                    pickTime = tms[0]?.value || '';
                    dropTime = tms[1]?.value || '';
                } else {
                    pickLoc = document.getElementById(`car${cNum}_pickupLoc`)?.value || '';
                    pickDate = document.getElementById(`car${cNum}_pickupDate`)?.value || '';
                    pickTime = document.getElementById(`car${cNum}_pickupTime`)?.value || '';
                    dropLoc = document.getElementById(`car${cNum}_dropoffLoc`)?.value || '';
                    dropDate = document.getElementById(`car${cNum}_dropoffDate`)?.value || '';
                    dropTime = document.getElementById(`car${cNum}_dropoffTime`)?.value || '';
                    driver = document.getElementById(`car${cNum}_driver`)?.value || '';
                }

                const blockH = 26;
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(203, 213, 225);
                doc.roundedRect(margin, y, contentWidth, blockH, 1.5, 1.5, 'FD');

                doc.setFillColor(2, 132, 199);
                doc.roundedRect(margin, y, contentWidth, 5, 1, 1, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(255, 255, 255);
                doc.text(`CAR RENTAL ${cNum}`, margin + 3, y + 3.8);

                // Row 1 Pick-up
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(71, 85, 105);
                doc.text('Pick-Up Location:', margin + 3, y + 8.5);
                doc.text('Date:', margin + 85, y + 8.5);
                doc.text('Time (HH:MM):', margin + 130, y + 8.5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(15, 23, 42);
                doc.text(pickLoc || '___________________________', margin + 3, y + 12.5);
                doc.text(pickDate || 'DD/MM/YYYY', margin + 85, y + 12.5);
                doc.text(pickTime || '__:__', margin + 130, y + 12.5);

                // Row 2 Drop-off
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(71, 85, 105);
                doc.text('Drop-Off Location:', margin + 3, y + 17);
                doc.text('Date:', margin + 85, y + 17);
                doc.text('Time (HH:MM):', margin + 130, y + 17);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(15, 23, 42);
                doc.text(dropLoc || '___________________________', margin + 3, y + 20.5);
                doc.text(dropDate || 'DD/MM/YYYY', margin + 85, y + 20.5);
                doc.text(dropTime || '__:__', margin + 130, y + 20.5);

                // Row 3 Driver
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(71, 85, 105);
                doc.text('Responsible Driver Name & Surname:', margin + 3, y + 24.5);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(15, 23, 42);
                doc.text(driver || '__________________________________________________', margin + 50, y + 24.5);

                y += blockH + 3.5;
            }

            drawCarRentalOnPdf(1);
            drawCarRentalOnPdf(2);

            // ACCOMMODATION HEADING
            y += 4;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0, 143, 190);
            doc.text('ACCOMMODATION', margin, y);
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(`Accommodation Required:  ${accReq}`, margin + 50, y);

            y += 4;

            function drawLocationOnPdf(lNum) {
                const locCards = locationsContainer.querySelectorAll('.travel-card');
                const lCard = locCards[lNum - 1];

                let where = '', hotel = '', cIn = '', cOut = '';

                if (lCard) {
                    const txts = lCard.querySelectorAll('.form-grid input[type="text"]');
                    const dts = lCard.querySelectorAll('.form-grid input[type="date"]');
                    where = txts[0]?.value || '';
                    hotel = txts[1]?.value || '';
                    cIn = dts[0]?.value || '';
                    cOut = dts[1]?.value || '';
                } else {
                    where = document.getElementById(`loc${lNum}_where`)?.value || '';
                    hotel = document.getElementById(`loc${lNum}_hotel`)?.value || '';
                    cIn = document.getElementById(`loc${lNum}_checkIn`)?.value || '';
                    cOut = document.getElementById(`loc${lNum}_checkOut`)?.value || '';
                }

                const blockH = 32;
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(203, 213, 225);
                doc.roundedRect(margin, y, contentWidth, blockH, 1.5, 1.5, 'FD');

                doc.setFillColor(13, 148, 136);
                doc.roundedRect(margin, y, contentWidth, 5, 1, 1, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(255, 255, 255);
                doc.text(`LOCATION ${lNum}`, margin + 3, y + 3.8);

                // Row 1 Location details
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(71, 85, 105);
                doc.text('Where:', margin + 3, y + 8.5);
                doc.text('Hotel / B&B (if applicable):', margin + 55, y + 8.5);
                doc.text('Check-In Date:', margin + 115, y + 8.5);
                doc.text('Check-Out Date:', margin + 148, y + 8.5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(15, 23, 42);
                doc.text(where || '_________________', margin + 3, y + 12.5);
                doc.text(hotel || '_________________', margin + 55, y + 12.5);
                doc.text(cIn || 'DD/MM/YYYY', margin + 115, y + 12.5);
                doc.text(cOut || 'DD/MM/YYYY', margin + 148, y + 12.5);

                // Guest Info Table
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(13, 148, 136);
                doc.text('GUEST INFO', margin + 3, y + 17);

                const gTableY = y + 19.5;
                doc.setFillColor(241, 245, 249);
                doc.rect(margin + 2, gTableY - 2.5, contentWidth - 4, 3.5, 'F');
                doc.setFontSize(6);
                doc.setTextColor(100, 116, 139);
                doc.text('Guest', margin + 4, gTableY);
                doc.text('First Name', margin + 30, gTableY);
                doc.text('Surname', margin + 80, gTableY);
                doc.text('ID Number', margin + 130, gTableY);

                for (let g = 1; g <= 3; g++) {
                    const rowY = gTableY + (g * 3.4);
                    let gFirst = '', gLast = '', gId = '';
                    if (lCard) {
                        const gRow = lCard.querySelectorAll('tbody tr')[g - 1];
                        if (gRow) {
                            const gInputs = gRow.querySelectorAll('input');
                            gFirst = gInputs[0]?.value || '';
                            gLast = gInputs[1]?.value || '';
                            gId = gInputs[2]?.value || '';
                        }
                    } else {
                        gFirst = document.querySelector(`input[name="loc${lNum}_guest${g}_firstName"]`)?.value || '';
                        gLast = document.querySelector(`input[name="loc${lNum}_guest${g}_surname"]`)?.value || '';
                        gId = document.querySelector(`input[name="loc${lNum}_guest${g}_id"]`)?.value || '';
                    }

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6);
                    doc.setTextColor(51, 65, 85);
                    doc.text(`Guest ${g}`, margin + 4, rowY);

                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(15, 23, 42);
                    doc.text(gFirst || '__________________', margin + 30, rowY);
                    doc.text(gLast || '__________________', margin + 80, rowY);
                    doc.text(gId || '__________________', margin + 130, rowY);
                }

                y += blockH + 3.5;
            }

            drawLocationOnPdf(1);
            drawLocationOnPdf(2);
            drawLocationOnPdf(3);

            // Special Requirements Box
            y += 4;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(0, 143, 190);
            doc.text('Special Requirements', margin, y);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text('(Example: SUV for crew & gear)', margin + 38, y);

            y += 2.5;
            const reqBoxH = 14;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.roundedRect(margin, y, contentWidth, reqBoxH, 1, 1, 'FD');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(15, 23, 42);
            const splitReq = doc.splitTextToSize(specialReq || 'No special requirements specified.', contentWidth - 6);
            doc.text(splitReq.slice(0, 2), margin + 3, y + 4.5);

            y += reqBoxH + 4;

            // Confirmation Checkboxes
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(15, 23, 42);
            doc.text('[X]  I hereby confirm that the above information is correct.', margin + 2, y);
            y += 4;
            doc.text('[X]  I agree to inform management of any changes as soon as possible.', margin + 2, y);

            return doc.output('blob');
        } catch (fatalErr) {
            console.error('[PDF] Error in primary PDF generation, building fallback:', fatalErr);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            doc.setFontSize(16);
            doc.text('TRAVEL BOOKING FORM', 20, 20);
            doc.setFontSize(10);
            doc.text(`Name: ${nameInput?.value || 'N/A'}`, 20, 35);
            doc.text(`Story: ${document.getElementById('storyName')?.value || 'N/A'}`, 20, 45);
            doc.text(`Commission: ${document.getElementById('commissionNumber')?.value || 'N/A'}`, 20, 55);
            return doc.output('blob');
        }
    }

    // -------------------------------------------------------------------------
    // 9. Form Submission Handler
    // -------------------------------------------------------------------------
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate checkboxes
        const confirm1 = document.getElementById('confirmCorrect');
        const confirm2 = document.getElementById('agreeInformManagement');
        if (!confirm1.checked || !confirm2.checked) {
            alert('Please check both confirmation boxes before submitting.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.dataset.originalText = submitBtn.textContent;
            submitBtn.textContent = 'Submitted';
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        if (loadingOverlay) loadingOverlay.classList.remove('active');

        // Immediate confirmation dialog
        const dialog = document.getElementById('successDialog');
        let isBgDone = false;
        let isNavigating = false;

        if (dialog) {
            dialog.classList.remove('hidden');
            const returnBtn = document.getElementById('dialogReturnBtn');
            const anotherBtn = document.getElementById('dialogAnotherBtn');

            let autoCloseTimer = null;
            const scheduleAutoClose = () => {
                if (autoCloseTimer) clearTimeout(autoCloseTimer);
                autoCloseTimer = setTimeout(() => {
                    if (!isNavigating && dialog) {
                        handleModalNavigate('forms_hub.html');
                    }
                }, 2000);
            };

            const handleModalNavigate = async (targetUrl) => {
                if (autoCloseTimer) clearTimeout(autoCloseTimer);
                isNavigating = true;
                if (dialog) dialog.classList.add('hidden');
                if (!isBgDone && bgSubmitPromise) {
                    try {
                        await Promise.race([
                            bgSubmitPromise,
                            new Promise(resolve => setTimeout(resolve, 3500))
                        ]);
                    } catch (e) {
                        console.warn('[TRAVEL-BOOKING] Proceeding with navigation:', e);
                    }
                }
                window.location.href = targetUrl;
            };

            if (returnBtn) {
                returnBtn.disabled = false;
                returnBtn.textContent = 'Return to Dashboard';
                returnBtn.onclick = () => handleModalNavigate('index.html');
            }
            if (anotherBtn) {
                anotherBtn.disabled = false;
                anotherBtn.textContent = 'Submit Another Form';
                anotherBtn.onclick = () => handleModalNavigate('forms_hub.html');
            }

            scheduleAutoClose();
        }

        const bgSubmitPromise = (async () => {
            try {
                syncLegacyFields();

                const pdfBlob = await buildTravelBookingPdf();

                const formData = new FormData(form);
                formData.append('file', pdfBlob, `TravelBooking_${(document.getElementById('storyName')?.value || 'Story').replace(/\s+/g, '_')}_${Date.now()}.pdf`);

                const token = (window.auth && typeof window.auth.getIdToken === 'function')
                    ? await window.auth.getIdToken().catch(() => null)
                    : null;
                const headers = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const response = await fetch('/api/send-travel-booking', {
                    method: 'POST',
                    headers,
                    body: formData
                });

                const result = await response.json();
                console.log('[TRAVEL-BOOKING] Server response:', result);
                if (!result.success) throw new Error(result.error || result.message || 'Submission failed');
                isBgDone = true;
                return result;
            } catch (err) {
                console.error('[TRAVEL-BOOKING] Submission error:', err);
                if (dialog) {
                    const p = dialog.querySelector('p');
                    if (p) p.textContent = 'Error: ' + (err.message || 'Submission could not be completed.');
                }
            }
        })();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTravelBooking);
} else {
    initTravelBooking();
}
