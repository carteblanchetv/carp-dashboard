import { submitLegalForm, getAgreementForCoSign, renderCoSignBanner, showSubmissionSuccessModal, cleanPdfText, getActiveProducerEmail } from './form_submission_helper.js?v=5.4.3';
import { openShareModal, downloadAndSharePDF } from './share_helper.js?v=5.4.3';

document.addEventListener('DOMContentLoaded', () => {
    // 0. Inject 24-hour time datalist (00:00 to 23:45)
    ensureTime24Datalist();

    // 1. Toggles for sections
    setupSectionToggles();

    // 2. Add initial items
    addFlightLeg();
    addVehicle();
    addHotel();

    // 3. Attach repeater button listeners
    document.getElementById('btnAddFlightLeg')?.addEventListener('click', () => addFlightLeg());
    document.getElementById('btnAddVehicle')?.addEventListener('click', () => addVehicle());
    document.getElementById('btnAddHotel')?.addEventListener('click', () => addHotel());

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
    const submissionId = urlParams.get('id');
    const isEditMode = urlParams.get('mode') === 'edit';
    const commVal = urlParams.get('commNum') || urlParams.get('comm');
    if (commVal) document.getElementById('commissionNumber').value = commVal;
    if (urlParams.get('story')) document.getElementById('storyName').value = urlParams.get('story');
    if (urlParams.get('producer')) document.getElementById('requestorName').value = urlParams.get('producer');

    if (submissionId) {
        (async () => {
            try {
                const loadedSubmission = await getAgreementForCoSign(submissionId);
                if (loadedSubmission.commissionNumber) document.getElementById('commissionNumber').value = loadedSubmission.commissionNumber;
                if (loadedSubmission.storyName || loadedSubmission.storyTitle) document.getElementById('storyName').value = loadedSubmission.storyName || loadedSubmission.storyTitle;
                if (loadedSubmission.producerName) document.getElementById('requestorName').value = loadedSubmission.producerName;
                const emailEl = document.getElementById('submitterEmail');
                if (emailEl && !emailEl.value) {
                    emailEl.value = getActiveProducerEmail(loadedSubmission.submittedByEmail || loadedSubmission.producerEmail) || '';
                }
                const savedMeta = typeof loadedSubmission.metadata === 'string'
                    ? (() => { try { return JSON.parse(loadedSubmission.metadata); } catch (e) { return {}; } })()
                    : (loadedSubmission.metadata || {});
                if (savedMeta.specialNotes && document.getElementById('specialNotes')) {
                    document.getElementById('specialNotes').value = savedMeta.specialNotes;
                }
                if (savedMeta.airTravelRequired && Array.isArray(savedMeta.flights) && savedMeta.flights.length > 0) {
                    const airYes = document.getElementById('airTravelYes');
                    if (airYes) {
                        airYes.checked = true;
                        document.getElementById('airTravelContainer')?.classList.remove('hidden');
                    }
                    const flightsList = document.getElementById('flightLegsList');
                    if (flightsList) flightsList.innerHTML = '';
                    flightLegCount = 0;
                    savedMeta.flights.forEach(f => addFlightLeg(f));
                }
                if (isEditMode) {
                    const container = document.querySelector('.form-card-container') || document.querySelector('.form-container') || document.querySelector('form');
                    renderCoSignBanner(container, {
                        title: '✏️ Edit Mode — Updating Existing Travel Booking',
                        subtitle: 'Modify any fields below and click Save & Update Travel Booking.',
                        status: 'info'
                    });
                    const submitBtn = document.getElementById('submitFormBtn');
                    if (submitBtn) submitBtn.innerHTML = '<span>💾</span> Save & Update Travel Booking';
                }
            } catch (err) {
                console.error('Failed to load Travel Booking:', err);
            }
        })();
    }

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
            if (submissionId) formData.append('submissionId', submissionId);
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
                flights: metadata.flights,
                passengers: metadata.passengers,
                vehicles: metadata.vehicles,
                hotels: metadata.hotels,
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
let passengerRowCounter = 0;

function ensureTime24Datalist() {
    if (document.getElementById('time24List')) return;
    const dl = document.createElement('datalist');
    dl.id = 'time24List';
    const opts = [];
    for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        for (const mm of ['00', '15', '30', '45']) {
            opts.push(`<option value="${hh}:${mm}"></option>`);
        }
    }
    dl.innerHTML = opts.join('');
    document.body.appendChild(dl);
}

function formatDateToDDMMYY(raw) {
    if (!raw || raw === 'N/A') return '';
    const s = String(raw).trim();
    // YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) {
        const yy = m[1].slice(-2);
        const mm = m[2].padStart(2, '0');
        const dd = m[3].padStart(2, '0');
        return `${dd}-${mm}-${yy}`;
    }
    // DD-MM-YYYY or DD/MM/YYYY
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        const yy = m[3].slice(-2);
        return `${dd}-${mm}-${yy}`;
    }
    // DD-MM-YY or DD/MM/YY
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        const yy = m[3];
        return `${dd}-${mm}-${yy}`;
    }
    return s;
}

function ddmmyyToIso(ddmmyy) {
    const m = String(ddmmyy || '').trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `20${m[3]}-${m[2]}-${m[1]}`;
}

function formatTimeTo24Hr(raw) {
    if (!raw || raw === 'N/A') return '';
    let s = String(raw).trim();
    const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
        let h = parseInt(ampmMatch[1], 10);
        const min = ampmMatch[2];
        const mer = ampmMatch[3].toUpperCase();
        if (mer === 'PM' && h < 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}`;
    }
    const hmMatch = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
    if (hmMatch) {
        const h = Math.min(23, Math.max(0, parseInt(hmMatch[1], 10)));
        const min = Math.min(59, Math.max(0, parseInt(hmMatch[2], 10)));
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length === 4) {
        const h = Math.min(23, Math.max(0, parseInt(digits.slice(0, 2), 10)));
        const min = Math.min(59, Math.max(0, parseInt(digits.slice(2, 4), 10)));
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    return s;
}

window.handleDDMMYYInput = (inputEl) => {
    const digits = inputEl.value.replace(/\D/g, '').slice(0, 6);
    let formatted = digits;
    if (digits.length > 4) {
        formatted = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    } else if (digits.length > 2) {
        formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    inputEl.value = formatted;
};

window.handleDDMMYYBlur = (inputEl) => {
    if (!inputEl.value) return;
    inputEl.value = formatDateToDDMMYY(inputEl.value);
};

window.openNativeDatePicker = (btnEl) => {
    const wrap = btnEl.closest('.ddmmyy-date-wrap');
    if (!wrap) return;
    const textInput = wrap.querySelector('.ddmmyy-input');
    const nativeInput = wrap.querySelector('.ddmmyy-native-picker');
    if (!nativeInput) return;
    const iso = ddmmyyToIso(textInput?.value);
    if (iso) nativeInput.value = iso;
    if (typeof nativeInput.showPicker === 'function') {
        try {
            nativeInput.showPicker();
            return;
        } catch (e) {}
    }
    nativeInput.focus();
    nativeInput.click();
};

window.syncFromNativeDatePicker = (nativeInput) => {
    const wrap = nativeInput.closest('.ddmmyy-date-wrap');
    if (!wrap) return;
    const textInput = wrap.querySelector('.ddmmyy-input');
    if (textInput && nativeInput.value) {
        textInput.value = formatDateToDDMMYY(nativeInput.value);
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
};

window.handleTime24Input = (inputEl) => {
    const raw = inputEl.value;
    if (/^\d{2}:\d{2}$/.test(raw)) return;
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
        inputEl.value = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    } else {
        inputEl.value = digits;
    }
};

window.handleTime24Blur = (inputEl) => {
    if (!inputEl.value) return;
    inputEl.value = formatTimeTo24Hr(inputEl.value);
};

function renderDateInputHTML(name, val = '', extraStyle = '') {
    const formatted = formatDateToDDMMYY(val);
    return `
    <div class="ddmmyy-date-wrap" ${extraStyle ? `style="${extraStyle}"` : ''}>
        <input type="text" name="${name}" class="ddmmyy-input" placeholder="DD-MM-YY" maxlength="8" inputmode="numeric" value="${formatted}" oninput="window.handleDDMMYYInput(this)" onblur="window.handleDDMMYYBlur(this)" title="Date (DD-MM-YY)">
        <button type="button" class="ddmmyy-picker-btn" tabindex="-1" title="Select date (DD-MM-YY)" onclick="window.openNativeDatePicker(this)">📅</button>
        <input type="date" class="ddmmyy-native-picker" tabindex="-1" onchange="window.syncFromNativeDatePicker(this)">
    </div>`;
}

function renderTime24InputHTML(name, val = '', extraStyle = '') {
    const formatted = formatTimeTo24Hr(val);
    return `<input type="text" name="${name}" class="time24-input" list="time24List" placeholder="HH:MM (24h)" maxlength="5" inputmode="numeric" value="${formatted}" oninput="window.handleTime24Input(this)" onblur="window.handleTime24Blur(this)" title="24-hour time (HH:MM)" ${extraStyle ? `style="${extraStyle}"` : ''}>`;
}

function addFlightLeg(data = {}) {
    flightLegCount++;
    const container = document.getElementById('flightLegsList');
    const id = flightLegCount;

    // Backward-compatibility if legacy depDateTime was saved as "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM"
    let depDate = data.depDate || '';
    let depTime = data.depTime || '';
    if (!depDate && data.depDateTime && data.depDateTime !== 'N/A') {
        const parts = String(data.depDateTime).split(/[T ]/);
        depDate = parts[0] || '';
        depTime = parts[1] || '';
    }

    let retDate = data.retDate || '';
    let retTime = data.retTime || '';
    if (!retDate && data.retDateTime && data.retDateTime !== 'N/A') {
        const parts = String(data.retDateTime).split(/[T ]/);
        retDate = parts[0] || '';
        retTime = parts[1] || '';
    }

    const depAirportVal = (data.depAirport && data.depAirport !== 'N/A') ? data.depAirport : '';
    const retAirportVal = (data.retAirport && data.retAirport !== 'N/A')
        ? data.retAirport
        : ((data.arrAirport && data.arrAirport !== 'N/A') ? data.arrAirport : '');
    const isOneWayFlight = data.tripType === 'One-Way' || data.tripType === 'One Way' || data.tripType === 'Single';

    const html = `
    <div class="dynamic-subcard flight-subcard" id="flightLeg_${id}" data-flight-id="${id}">
        <div class="dynamic-subcard-header" style="flex-wrap: wrap; gap: 0.75rem;">
            <h4 class="flight-card-title">✈️ Flight #${id}</h4>
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <div class="toggle-switch-group">
                    <div class="toggle-pill">
                        <input type="radio" id="flightOneWay_${id}" name="flight_tripType_${id}" value="One-Way" ${isOneWayFlight ? 'checked' : ''} onchange="window.toggleFlightReturnRow(${id}, 'One-Way')">
                        <label for="flightOneWay_${id}">One-Way</label>
                        <input type="radio" id="flightReturn_${id}" name="flight_tripType_${id}" value="Return" ${!isOneWayFlight ? 'checked' : ''} onchange="window.toggleFlightReturnRow(${id}, 'Return')">
                        <label for="flightReturn_${id}">Return</label>
                    </div>
                </div>
                ${id > 1 ? `<button type="button" class="btn-remove-subcard" onclick="window.removeFlightLeg(${id})">✕ Remove Flight</button>` : ''}
            </div>
        </div>

        <!-- Departure Airport, Date & Time -->
        <div class="field-group-grid-3">
            <div class="form-field">
                <label>Departure Airport <span class="required">*</span></label>
                <input type="text" name="flight_depAirport[]" list="saAirportsList" placeholder="e.g. JNB - O.R. Tambo" value="${depAirportVal}">
            </div>
            <div class="form-field">
                <label>Departure Date <span class="required">*</span></label>
                ${renderDateInputHTML('flight_depDate[]', depDate)}
            </div>
            <div class="form-field">
                <label>Departure Time <span class="required">*</span></label>
                ${renderTime24InputHTML('flight_depTime[]', depTime)}
            </div>
        </div>

        <!-- Return Airport, Date & Time -->
        <div id="flightReturnRow_${id}" class="field-group-grid-3 ${isOneWayFlight ? 'hidden' : ''}" style="margin-bottom: 1.25rem;">
            <div class="form-field">
                <label>Return Airport</label>
                <input type="text" name="flight_retAirport[]" list="saAirportsList" placeholder="e.g. CPT - Cape Town" value="${retAirportVal}">
            </div>
            <div class="form-field">
                <label>Return Date</label>
                ${renderDateInputHTML('flight_retDate[]', retDate)}
            </div>
            <div class="form-field">
                <label>Return Time</label>
                ${renderTime24InputHTML('flight_retTime[]', retTime)}
            </div>
        </div>

        <!-- Passengers Taking This Flight -->
        <div style="margin-top: 1rem; padding-top: 0.9rem; border-top: 1px dashed var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <label class="flight-pax-heading" style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">
                    👥 Passengers Taking Flight #${id}
                </label>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${id > 1 ? `<button type="button" class="btn-add-subcard btn-copy-pax" style="margin-top: 0; padding: 0.25rem 0.65rem; font-size: 0.78rem;" onclick="window.copyPassengersFromFirstFlight(${id})">📋 Copy Passengers from Flight #1</button>` : ''}
                    <button type="button" class="btn-add-subcard" style="margin-top: 0; padding: 0.25rem 0.65rem; font-size: 0.78rem;" onclick="window.addPassengerToFlight(${id})">
                        <span>➕</span> Add Passenger to Flight
                    </button>
                </div>
            </div>
            <div class="table-responsive">
                <table class="travel-table" id="passengersTable_${id}">
                    <thead>
                        <tr>
                            <th style="width: 24%;">First Name</th>
                            <th style="width: 24%;">Surname</th>
                            <th style="width: 26%;">ID / Passport No.</th>
                            <th style="width: 22%;">Mobile Number</th>
                            <th style="width: 4%;"></th>
                        </tr>
                    </thead>
                    <tbody id="passengersTableBody_${id}" class="flight-passengers-tbody">
                        <!-- Passenger rows for this flight -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);

    if (Array.isArray(data.passengers) && data.passengers.length > 0) {
        data.passengers.forEach(p => {
            const nameParts = (!p.firstName && !p.lastName && p.name) ? String(p.name).split(' ') : [];
            addPassengerToFlight(id, {
                firstName: p.firstName || nameParts[0] || '',
                lastName: p.lastName || nameParts.slice(1).join(' ') || '',
                idNumber: (p.idNumber && p.idNumber !== 'N/A') ? p.idNumber : '',
                mobile: (p.mobile && p.mobile !== 'N/A') ? p.mobile : ''
            });
        });
    } else {
        addPassengerToFlight(id);
    }

    renumberFlightLegs();
}

window.toggleFlightReturnRow = (flightId, tripTypeVal) => {
    const returnRow = document.getElementById(`flightReturnRow_${flightId}`);
    if (!returnRow) return;
    returnRow.classList.toggle('hidden', tripTypeVal === 'One-Way');
};

function addPassengerToFlight(flightId, data = {}) {
    const tbody = document.getElementById(`passengersTableBody_${flightId}`);
    if (!tbody) return;
    passengerRowCounter++;
    const rowId = passengerRowCounter;
    const isFirstRow = tbody.querySelectorAll('tr').length === 0;

    const html = `
    <tr id="passengerRow_${rowId}" class="flight-passenger-row">
        <td><input type="text" name="passenger_firstName[]" placeholder="First Name" value="${data.firstName || ''}" oninput="window.refreshAllGuestDropdowns()"></td>
        <td><input type="text" name="passenger_lastName[]" placeholder="Surname" value="${data.lastName || ''}" oninput="window.refreshAllGuestDropdowns()"></td>
        <td><input type="text" name="passenger_idNumber[]" placeholder="ID or Passport" value="${data.idNumber || ''}" oninput="window.refreshAllGuestDropdowns()"></td>
        <td><input type="text" name="passenger_mobile[]" placeholder="Mobile Number" value="${data.mobile || ''}" oninput="window.refreshAllGuestDropdowns()"></td>
        <td style="text-align: center;">
            ${!isFirstRow ? `<button type="button" class="btn-remove-subcard" title="Remove passenger" onclick="document.getElementById('passengerRow_${rowId}')?.remove(); window.refreshAllGuestDropdowns();">✕</button>` : ''}
        </td>
    </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', html);
    window.refreshAllGuestDropdowns?.();
}

function renumberFlightLegs() {
    const cards = document.querySelectorAll('#flightLegsList .flight-subcard');
    cards.forEach((card, idx) => {
        const displayNum = idx + 1;
        const titleEl = card.querySelector('.flight-card-title');
        if (titleEl) titleEl.textContent = `✈️ Flight #${displayNum}`;
        const paxHeading = card.querySelector('.flight-pax-heading');
        if (paxHeading) paxHeading.textContent = `👥 Passengers Taking Flight #${displayNum}`;
    });
}

window.addPassengerToFlight = (flightId, data) => addPassengerToFlight(flightId, data);

window.removeFlightLeg = (flightId) => {
    const el = document.getElementById(`flightLeg_${flightId}`);
    if (el) {
        el.remove();
        renumberFlightLegs();
        window.refreshAllGuestDropdowns?.();
    }
};

window.copyPassengersFromFirstFlight = (targetFlightId) => {
    const firstCard = document.querySelector('#flightLegsList .flight-subcard');
    const targetTbody = document.getElementById(`passengersTableBody_${targetFlightId}`);
    if (!firstCard || !targetTbody) return;

    const sourceRows = firstCard.querySelectorAll('.flight-passenger-row');
    if (sourceRows.length === 0) return;

    targetTbody.innerHTML = '';
    sourceRows.forEach(row => {
        const firstName = row.querySelector('input[name="passenger_firstName[]"]')?.value || '';
        const lastName = row.querySelector('input[name="passenger_lastName[]"]')?.value || '';
        const idNumber = row.querySelector('input[name="passenger_idNumber[]"]')?.value || '';
        const mobile = row.querySelector('input[name="passenger_mobile[]"]')?.value || '';
        addPassengerToFlight(targetFlightId, { firstName, lastName, idNumber, mobile });
    });
};

let vehicleCount = 0;
function addVehicle(data = {}) {
    vehicleCount++;
    const container = document.getElementById('vehiclesList');
    const id = vehicleCount;

    let pickUpDate = data.pickUpDate || '';
    let pickUpTime = data.pickUpTime || '';
    if (!pickUpDate && data.pickUpDateTime) {
        const parts = String(data.pickUpDateTime).split(/[T ]/);
        pickUpDate = parts[0] || '';
        pickUpTime = parts[1] || '';
    }

    let dropOffDate = data.dropOffDate || '';
    let dropOffTime = data.dropOffTime || '';
    if (!dropOffDate && data.dropOffDateTime) {
        const parts = String(data.dropOffDateTime).split(/[T ]/);
        dropOffDate = parts[0] || '';
        dropOffTime = parts[1] || '';
    }

    const html = `
    <div class="dynamic-subcard vehicle-subcard" id="vehicleCard_${id}">
        <div class="dynamic-subcard-header">
            <h4>Vehicle Rental #${id}</h4>
            ${id > 1 ? `<button type="button" class="btn-remove-subcard" onclick="document.getElementById('vehicleCard_${id}').remove()">✕ Remove</button>` : ''}
        </div>
        <div class="field-group-grid-3">
            <div class="form-field">
                <label>Pick-Up Location</label>
                <input type="text" name="vehicle_pickUpLocation[]" placeholder="e.g. CPT Airport Avis" value="${data.pickUpLocation || data.pickUp || ''}">
            </div>
            <div class="form-field">
                <label>Pick-Up Date</label>
                ${renderDateInputHTML('vehicle_pickUpDate[]', pickUpDate)}
            </div>
            <div class="form-field">
                <label>Pick-Up Time</label>
                ${renderTime24InputHTML('vehicle_pickUpTime[]', pickUpTime)}
            </div>
        </div>
        <div class="field-group-grid-3">
            <div class="form-field">
                <label>Drop-Off Location</label>
                <input type="text" name="vehicle_dropOffLocation[]" placeholder="e.g. CPT Airport Avis" value="${data.dropOffLocation || data.dropOff || ''}">
            </div>
            <div class="form-field">
                <label>Drop-Off Date</label>
                ${renderDateInputHTML('vehicle_dropOffDate[]', dropOffDate)}
            </div>
            <div class="form-field">
                <label>Drop-Off Time</label>
                ${renderTime24InputHTML('vehicle_dropOffTime[]', dropOffTime)}
            </div>
        </div>
        <div class="field-group-grid" style="margin-bottom: 1rem;">
            <div class="form-field field-group-full">
                <label>Responsible Driver (Full Name &amp; Surname)</label>
                <input type="text" name="vehicle_driverName[]" placeholder="Driver full name..." value="${data.driverName || data.driver || ''}">
            </div>
        </div>
        <div class="field-group-grid" style="margin-bottom: 0;">
            <div class="form-field field-group-full">
                <label>Special Requirements</label>
                <input type="text" name="vehicle_specialRequirements[]" placeholder="Require SUV, enough room for crew and gear, producer only." value="${data.specialRequirements || ''}">
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function getNamedFlightPassengers() {
    const paxList = [];
    const seen = new Set();
    const rows = document.querySelectorAll('#flightLegsList .flight-passenger-row');
    rows.forEach(row => {
        const firstName = row.querySelector('input[name="passenger_firstName[]"]')?.value.trim() || '';
        const lastName = row.querySelector('input[name="passenger_lastName[]"]')?.value.trim() || '';
        const idNumber = row.querySelector('input[name="passenger_idNumber[]"]')?.value.trim() || '';
        const mobile = row.querySelector('input[name="passenger_mobile[]"]')?.value.trim() || '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (!fullName) return;
        const key = `${fullName.toLowerCase()}|${idNumber.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        paxList.push({ firstName, lastName, idNumber, mobile, fullName });
    });
    return paxList;
}

function buildFlightPassengerSelectOptions(selectedValue = '') {
    const paxList = getNamedFlightPassengers();
    let html = `<option value="">-- Select Flight Passenger --</option>`;
    paxList.forEach((p, idx) => {
        const payload = encodeURIComponent(JSON.stringify(p));
        const label = p.idNumber ? `${p.fullName} (${p.idNumber})` : p.fullName;
        const isSel = selectedValue && selectedValue === payload ? 'selected' : '';
        html += `<option value="${payload}" ${isSel}>${label}</option>`;
    });
    return html;
}

window.refreshAllGuestDropdowns = () => {
    const selects = document.querySelectorAll('.guest-flight-pax-select');
    selects.forEach(sel => {
        const curVal = sel.value;
        sel.innerHTML = buildFlightPassengerSelectOptions(curVal);
    });
};

window.applyFlightPassengerToGuest = (selectEl) => {
    const val = selectEl.value;
    if (!val) return;
    try {
        const pax = JSON.parse(decodeURIComponent(val));
        const row = selectEl.closest('.hotel-guest-row');
        if (!row) return;
        const fnInput = row.querySelector('input[name="guest_firstName[]"]');
        const lnInput = row.querySelector('input[name="guest_lastName[]"]');
        const idInput = row.querySelector('input[name="guest_idNumber[]"]');
        const mobInput = row.querySelector('input[name="guest_mobile[]"]');
        if (fnInput) fnInput.value = pax.firstName || '';
        if (lnInput) lnInput.value = pax.lastName || '';
        if (idInput) idInput.value = pax.idNumber || '';
        if (mobInput) mobInput.value = pax.mobile || '';
    } catch (e) {
        console.warn('Could not parse selected flight passenger:', e);
    }
};

let hotelCount = 0;
let guestRowCounter = 0;

function addHotel(data = {}) {
    hotelCount++;
    const container = document.getElementById('hotelsList');
    const id = hotelCount;

    const html = `
    <div class="dynamic-subcard hotel-subcard" id="hotelCard_${id}" data-hotel-id="${id}">
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
                <label>Preferred Hotel / B&amp;B</label>
                <input type="text" name="hotel_name[]" placeholder="e.g. Southern Sun Elangeni" value="${data.hotelName || data.hotel || ''}">
            </div>
            <div class="form-field">
                <label>Check-In Date</label>
                ${renderDateInputHTML('hotel_checkIn[]', data.checkIn || '')}
            </div>
            <div class="form-field">
                <label>Check-Out Date</label>
                ${renderDateInputHTML('hotel_checkOut[]', data.checkOut || '')}
            </div>
        </div>

        <!-- Guest Details Table -->
        <div style="margin-top: 1rem; margin-bottom: 1.25rem; padding-top: 0.9rem; border-top: 1px dashed var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <label style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">
                    👥 Guest Details
                </label>
                <button type="button" class="btn-add-subcard" style="margin-top: 0; padding: 0.25rem 0.65rem; font-size: 0.78rem;" onclick="window.addGuestToHotel(${id})">
                    <span>➕</span> Add Guest
                </button>
            </div>
            <div class="table-responsive">
                <table class="travel-table" id="guestsTable_${id}">
                    <thead>
                        <tr>
                            <th style="width: 22%;">Select from Flights</th>
                            <th style="width: 19%;">First Name</th>
                            <th style="width: 19%;">Surname</th>
                            <th style="width: 20%;">ID / Passport No.</th>
                            <th style="width: 16%;">Mobile Number</th>
                            <th style="width: 4%;"></th>
                        </tr>
                    </thead>
                    <tbody id="guestsTableBody_${id}" class="hotel-guests-tbody">
                        <!-- Guest rows for this hotel -->
                    </tbody>
                </table>
            </div>
        </div>

        <div class="field-group-grid" style="margin-bottom: 0;">
            <div class="form-field field-group-full">
                <label>Special Request</label>
                <input type="text" name="hotel_specialRequest[]" placeholder="Require early check-in or late check-in, etc." value="${data.specialRequest || ''}">
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);

    if (Array.isArray(data.guestDetails) && data.guestDetails.length > 0) {
        data.guestDetails.forEach(g => {
            const nameParts = (!g.firstName && !g.lastName && g.name) ? String(g.name).split(' ') : [];
            addGuestToHotel(id, {
                firstName: g.firstName || nameParts[0] || '',
                lastName: g.lastName || nameParts.slice(1).join(' ') || '',
                idNumber: (g.idNumber && g.idNumber !== 'N/A') ? g.idNumber : '',
                mobile: (g.mobile && g.mobile !== 'N/A') ? g.mobile : ''
            });
        });
    } else {
        addGuestToHotel(id);
    }
}

function addGuestToHotel(hotelId, data = {}) {
    const tbody = document.getElementById(`guestsTableBody_${hotelId}`);
    if (!tbody) return;
    guestRowCounter++;
    const rowId = guestRowCounter;
    const isFirstRow = tbody.querySelectorAll('tr').length === 0;

    const html = `
    <tr id="guestRow_${rowId}" class="hotel-guest-row">
        <td>
            <select class="guest-flight-pax-select" onfocus="window.refreshAllGuestDropdowns()" onchange="window.applyFlightPassengerToGuest(this)">
                ${buildFlightPassengerSelectOptions()}
            </select>
        </td>
        <td><input type="text" name="guest_firstName[]" placeholder="First Name" value="${data.firstName || ''}"></td>
        <td><input type="text" name="guest_lastName[]" placeholder="Surname" value="${data.lastName || ''}"></td>
        <td><input type="text" name="guest_idNumber[]" placeholder="ID or Passport" value="${data.idNumber || ''}"></td>
        <td><input type="text" name="guest_mobile[]" placeholder="Mobile Number" value="${data.mobile || ''}"></td>
        <td style="text-align: center;">
            ${!isFirstRow ? `<button type="button" class="btn-remove-subcard" title="Remove guest" onclick="document.getElementById('guestRow_${rowId}')?.remove()">✕</button>` : ''}
        </td>
    </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', html);
}

window.addGuestToHotel = (hotelId, data) => addGuestToHotel(hotelId, data);

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

    // Collect Flights & Per-Flight Passengers
    const flights = [];
    const passengers = [];
    if (airTravelRequired) {
        const flightCards = Array.from(document.querySelectorAll('#flightLegsList .flight-subcard'));
        flightCards.forEach((card, idx) => {
            const flightId = card.dataset.flightId;
            const tripType = card.querySelector(`input[name="flight_tripType_${flightId}"]:checked`)?.value || 'Return';
            const isReturnFlight = tripType === 'Return';
            const depAirport = card.querySelector('input[name="flight_depAirport[]"]')?.value.trim() || '';
            const depDate = formatDateToDDMMYY(card.querySelector('input[name="flight_depDate[]"]')?.value.trim() || '');
            const depTime = formatTimeTo24Hr(card.querySelector('input[name="flight_depTime[]"]')?.value.trim() || '');
            const retAirport = isReturnFlight ? (card.querySelector('input[name="flight_retAirport[]"]')?.value.trim() || '') : '';
            const retDate = isReturnFlight ? formatDateToDDMMYY(card.querySelector('input[name="flight_retDate[]"]')?.value.trim() || '') : '';
            const retTime = isReturnFlight ? formatTimeTo24Hr(card.querySelector('input[name="flight_retTime[]"]')?.value.trim() || '') : '';

            const flightPassengers = [];
            const paxRows = card.querySelectorAll('.flight-passenger-row');
            paxRows.forEach(row => {
                const fn = row.querySelector('input[name="passenger_firstName[]"]')?.value.trim() || '';
                const ln = row.querySelector('input[name="passenger_lastName[]"]')?.value.trim() || '';
                const idNum = row.querySelector('input[name="passenger_idNumber[]"]')?.value.trim() || '';
                const mob = row.querySelector('input[name="passenger_mobile[]"]')?.value.trim() || '';
                if (fn || ln || idNum || mob) {
                    const paxObj = {
                        firstName: fn,
                        lastName: ln,
                        name: `${fn} ${ln}`.trim() || 'N/A',
                        idNumber: idNum || 'N/A',
                        mobile: mob || 'N/A',
                        flightNumber: idx + 1
                    };
                    flightPassengers.push(paxObj);
                    passengers.push(paxObj);
                }
            });

            if (depAirport || depDate || depTime || retAirport || retDate || retTime || flightPassengers.length > 0) {
                flights.push({
                    flightNumber: flights.length + 1,
                    tripType,
                    depAirport: depAirport || 'N/A',
                    depDate: depDate || 'N/A',
                    depTime: depTime || 'N/A',
                    retAirport: isReturnFlight ? (retAirport || 'N/A') : 'One-Way',
                    retDate: isReturnFlight ? (retDate || 'N/A') : 'N/A',
                    retTime: isReturnFlight ? (retTime || 'N/A') : 'N/A',
                    passengers: flightPassengers
                });
            }
        });
    }

    // Collect Vehicles
    const vehicles = [];
    if (carRentalRequired) {
        const pickUps = Array.from(document.querySelectorAll('input[name="vehicle_pickUpLocation[]"]')).map(s => s.value.trim());
        const pickUpDates = Array.from(document.querySelectorAll('input[name="vehicle_pickUpDate[]"]')).map(s => formatDateToDDMMYY(s.value));
        const pickUpTimes = Array.from(document.querySelectorAll('input[name="vehicle_pickUpTime[]"]')).map(s => formatTimeTo24Hr(s.value));
        const dropOffs = Array.from(document.querySelectorAll('input[name="vehicle_dropOffLocation[]"]')).map(s => s.value.trim());
        const dropOffDates = Array.from(document.querySelectorAll('input[name="vehicle_dropOffDate[]"]')).map(s => formatDateToDDMMYY(s.value));
        const dropOffTimes = Array.from(document.querySelectorAll('input[name="vehicle_dropOffTime[]"]')).map(s => formatTimeTo24Hr(s.value));
        const drivers = Array.from(document.querySelectorAll('input[name="vehicle_driverName[]"]')).map(s => s.value.trim());
        const specialReqs = Array.from(document.querySelectorAll('input[name="vehicle_specialRequirements[]"]')).map(s => s.value.trim());

        pickUps.forEach((pu, idx) => {
            if (pu || dropOffs[idx] || drivers[idx] || specialReqs[idx]) {
                const pDateTime = [pickUpDates[idx], pickUpTimes[idx]].filter(Boolean).join(' ') || 'N/A';
                const dDateTime = [dropOffDates[idx], dropOffTimes[idx]].filter(Boolean).join(' ') || 'N/A';
                vehicles.push({
                    pickUp: pu || 'N/A',
                    pickUpDate: pDateTime,
                    dropOff: dropOffs[idx] || 'N/A',
                    dropOffDate: dDateTime,
                    driver: drivers[idx] || 'N/A',
                    specialRequirements: specialReqs[idx] || ''
                });
            }
        });
    }

    // Collect Hotels
    const hotels = [];
    if (accommodationRequired) {
        const hotelCards = Array.from(document.querySelectorAll('#hotelsList .hotel-subcard'));
        hotelCards.forEach(card => {
            const city = card.querySelector('input[name="hotel_city[]"]')?.value.trim() || '';
            const hotelName = card.querySelector('input[name="hotel_name[]"]')?.value.trim() || '';
            const checkIn = formatDateToDDMMYY(card.querySelector('input[name="hotel_checkIn[]"]')?.value.trim() || '');
            const checkOut = formatDateToDDMMYY(card.querySelector('input[name="hotel_checkOut[]"]')?.value.trim() || '');
            const specialRequest = card.querySelector('input[name="hotel_specialRequest[]"]')?.value.trim() || '';

            const guestDetails = [];
            card.querySelectorAll('.hotel-guest-row').forEach(row => {
                const fn = row.querySelector('input[name="guest_firstName[]"]')?.value.trim() || '';
                const ln = row.querySelector('input[name="guest_lastName[]"]')?.value.trim() || '';
                const idNum = row.querySelector('input[name="guest_idNumber[]"]')?.value.trim() || '';
                const mob = row.querySelector('input[name="guest_mobile[]"]')?.value.trim() || '';
                if (fn || ln || idNum || mob) {
                    guestDetails.push({
                        firstName: fn,
                        lastName: ln,
                        name: `${fn} ${ln}`.trim() || 'N/A',
                        idNumber: idNum || 'N/A',
                        mobile: mob || 'N/A'
                    });
                }
            });

            if (city || hotelName || checkIn || checkOut || guestDetails.length > 0 || specialRequest) {
                hotels.push({
                    city: city || 'N/A',
                    hotel: hotelName || 'N/A',
                    checkIn: checkIn || 'N/A',
                    checkOut: checkOut || 'N/A',
                    guestDetails,
                    guests: guestDetails.map(g => g.name).join(', ') || 'N/A',
                    specialRequest
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
    safeDrawText(`Date Submitted:  ${formatDateToDDMMYY(new Date().toISOString().split('T')[0])}`, { x: 55, y: y - 56, size: 8.5, font, color: mutedColor });

    y -= 85;

    // Air Travel Section
    if (airTravelRequired && flights.length > 0) {
        checkPageBreak(60);
        safeDrawText('AIR TRAVEL REQUIREMENTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 18;

        flights.forEach((f, idx) => {
            checkPageBreak(65);
            safeDrawText(`Flight #${idx + 1} (${f.tripType || 'Return'})`, {
                x: 48,
                y,
                size: 10,
                font: fontBold,
                color: primaryColor
            });
            y -= 14;

            safeDrawText(`Departure:   Airport: ${f.depAirport}   |   Date: ${f.depDate}   |   Time: ${f.depTime}`, {
                x: 55,
                y,
                size: 8.8,
                font: fontBold,
                color: darkColor
            });
            y -= 13;

            if (f.tripType !== 'One-Way') {
                safeDrawText(`Return:        Airport: ${f.retAirport}   |   Date: ${f.retDate}   |   Time: ${f.retTime}`, {
                    x: 55,
                    y,
                    size: 8.8,
                    font: fontBold,
                    color: darkColor
                });
                y -= 14;
            }

            safeDrawText(`Passengers Taking Flight #${idx + 1}:`, {
                x: 55,
                y,
                size: 8.5,
                font: fontBold,
                color: mutedColor
            });
            y -= 13;

            if (Array.isArray(f.passengers) && f.passengers.length > 0) {
                f.passengers.forEach((p, pIdx) => {
                    checkPageBreak(18);
                    safeDrawText(`${pIdx + 1}. ${p.name}  -  ID/Passport: ${p.idNumber}  -  Mobile: ${p.mobile}`, {
                        x: 65,
                        y,
                        size: 8.5,
                        font,
                        color: darkColor
                    });
                    y -= 12;
                });
            } else {
                safeDrawText('No passengers listed for this flight.', {
                    x: 65,
                    y,
                    size: 8.2,
                    font,
                    color: mutedColor
                });
                y -= 12;
            }
            y -= 8;
        });
        y -= 8;
    }

    // Car Rental Section
    if (carRentalRequired && vehicles.length > 0) {
        checkPageBreak(50);
        safeDrawText('CAR RENTAL REQUIREMENTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 16;

        vehicles.forEach((v, idx) => {
            checkPageBreak(45);
            safeDrawText(`Vehicle ${idx + 1} - Driver: ${v.driver}`, { x: 50, y, size: 9.5, font: fontBold, color: darkColor });
            y -= 13;
            safeDrawText(`Pick-Up: ${v.pickUp} (${v.pickUpDate})  ->  Drop-Off: ${v.dropOff} (${v.dropOffDate})`, {
                x: 60,
                y,
                size: 8.5,
                font,
                color: mutedColor
            });
            y -= 13;
            if (v.specialRequirements) {
                safeDrawText(`Special Requirements: ${v.specialRequirements}`, {
                    x: 60,
                    y,
                    size: 8.5,
                    font,
                    color: darkColor
                });
                y -= 13;
            }
            y -= 6;
        });
        y -= 10;
    }

    // Accommodation Section
    if (accommodationRequired && hotels.length > 0) {
        checkPageBreak(50);
        safeDrawText('ACCOMMODATION REQUIREMENTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
        y -= 16;

        hotels.forEach((h, idx) => {
            checkPageBreak(50);
            safeDrawText(`Location ${idx + 1}: ${h.city} - Hotel/B&B: ${h.hotel}`, { x: 50, y, size: 9.5, font: fontBold, color: darkColor });
            y -= 13;
            safeDrawText(`Check-In: ${h.checkIn}  |  Check-Out: ${h.checkOut}`, {
                x: 60,
                y,
                size: 8.5,
                font,
                color: mutedColor
            });
            y -= 13;
            if (Array.isArray(h.guestDetails) && h.guestDetails.length > 0) {
                safeDrawText('Guest Details:', { x: 60, y, size: 8.5, font: fontBold, color: mutedColor });
                y -= 12;
                h.guestDetails.forEach((g, gIdx) => {
                    checkPageBreak(16);
                    safeDrawText(`${gIdx + 1}. ${g.name}  -  ID/Passport: ${g.idNumber}  -  Mobile: ${g.mobile}`, {
                        x: 70,
                        y,
                        size: 8.5,
                        font,
                        color: darkColor
                    });
                    y -= 12;
                });
            }
            if (h.specialRequest) {
                checkPageBreak(16);
                safeDrawText(`Special Request: ${h.specialRequest}`, {
                    x: 60,
                    y,
                    size: 8.5,
                    font,
                    color: darkColor
                });
                y -= 13;
            }
            y -= 8;
        });
        y -= 10;
    }

    // General Special Requests
    if (specialNotes) {
        checkPageBreak(60);
        safeDrawText('GENERAL SPECIAL REQUESTS', { x: 40, y, size: 11, font: fontBold, color: primaryColor });
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
