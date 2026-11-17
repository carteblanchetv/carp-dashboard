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

        <!-- Arrival Airport, Return Date & Time -->
        <div id="flightReturnRow_${id}" class="field-group-grid-3" style="margin-bottom: 1.25rem;">
            <div class="form-field">
                <label>Arrival Airport <span class="required">*</span></label>
                <input type="text" name="flight_retAirport[]" list="saAirportsList" placeholder="e.g. CPT - Cape Town" value="${retAirportVal}">
            </div>
            <div class="form-field flight-return-dt ${isOneWayFlight ? 'hidden' : ''}">
                <label>Return Date</label>
                ${renderDateInputHTML('flight_retDate[]', retDate)}
            </div>
            <div class="form-field flight-return-dt ${isOneWayFlight ? 'hidden' : ''}">
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
    const isOneWay = tripTypeVal === 'One-Way';
    returnRow.querySelectorAll('.flight-return-dt').forEach(el => {
        el.classList.toggle('hidden', isOneWay);
    });
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
            const arrAirport = card.querySelector('input[name="flight_retAirport[]"]')?.value.trim() || '';
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

            if (depAirport || depDate || depTime || arrAirport || retDate || retTime || flightPassengers.length > 0) {
                flights.push({
                    flightNumber: flights.length + 1,
                    tripType,
                    depAirport: depAirport || 'N/A',
                    arrAirport: arrAirport || 'N/A',
                    retAirport: arrAirport || 'N/A',
                    depDate: depDate || 'N/A',
                    depTime: depTime || 'N/A',
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
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN_X = 40;
    const CONTENT_W = PAGE_W - (MARGIN_X * 2); // 515.28
    const RIGHT_X = MARGIN_X + CONTENT_W;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const primaryColor = rgb(0 / 255, 143 / 255, 190 / 255);     // #008fbe Carte Blanche Blue
    const secondaryBlue = rgb(2 / 255, 132 / 255, 199 / 255);    // #0284c7 Sky 600
    const tealColor = rgb(13 / 255, 148 / 255, 136 / 255);       // #0d9488 Teal 600
    const darkColor = rgb(15 / 255, 23 / 255, 42 / 255);         // #0f172a Slate 900
    const bodyColor = rgb(30 / 255, 41 / 255, 59 / 255);         // #1e293b Slate 800
    const mutedColor = rgb(100 / 255, 116 / 255, 139 / 255);     // #64748b Slate 500
    const borderColor = rgb(203 / 255, 213 / 255, 225 / 255);    // #cbd5e1 Slate 300
    const softBorder = rgb(226 / 255, 232 / 255, 240 / 255);     // #e2e8f0 Slate 200
    const cardBg = rgb(252 / 255, 253 / 255, 255 / 255);
    const tableHeaderBg = rgb(241 / 255, 245 / 255, 249 / 255);  // #f1f5f9 Slate 100
    const zebraBg = rgb(248 / 255, 250 / 255, 252 / 255);        // #f8fafc Slate 50

    // Load official logos if available
    let cbLogoImg = null;
    let caLogoImg = null;
    try {
        const [cbRes, caRes] = await Promise.all([
            fetch('assets/carte_blanche_logo.png').catch(() => null),
            fetch('assets/combined_artists_logo_for_pdf.png').catch(() => fetch('assets/combined_artists_logo.png').catch(() => null))
        ]);
        if (cbRes && cbRes.ok) {
            const cbBytes = await cbRes.arrayBuffer();
            cbLogoImg = await pdfDoc.embedPng(cbBytes);
        }
        if (caRes && caRes.ok) {
            const caBytes = await caRes.arrayBuffer();
            caLogoImg = await pdfDoc.embedPng(caBytes);
        }
    } catch (logoErr) {
        console.warn('Logo embed skipped:', logoErr);
    }

    const safeDrawText = (text, options = {}) => {
        if (text === undefined || text === null || text === '') return;
        const cleaned = cleanPdfText(String(text));
        if (!cleaned) return;
        const targetPage = options.page || page;
        const drawOpts = { ...options };
        delete drawOpts.page;
        try {
            targetPage.drawText(cleaned, drawOpts);
        } catch (e) {
            try {
                const asciiOnly = cleaned.replace(/[^\x20-\x7E]/g, '');
                if (asciiOnly) targetPage.drawText(asciiOnly, drawOpts);
            } catch (fallbackErr) {
                console.error('safeDrawText fallback failed:', fallbackErr);
            }
        }
    };

    const truncateToWidth = (str, fnt, sz, maxW) => {
        const cleaned = cleanPdfText(String(str || ''));
        if (!cleaned) return '';
        if (fnt.widthOfTextAtSize(cleaned, sz) <= maxW) return cleaned;
        let out = cleaned;
        while (out.length > 1 && fnt.widthOfTextAtSize(out + '...', sz) > maxW) {
            out = out.slice(0, -1);
        }
        return out + '...';
    };

    const wrapLines = (str, fnt, sz, maxW) => {
        const words = cleanPdfText(String(str || '')).split(/\s+/).filter(Boolean);
        if (words.length === 0) return [];
        const lines = [];
        let cur = '';
        for (const w of words) {
            const test = cur ? `${cur} ${w}` : w;
            if (fnt.widthOfTextAtSize(test, sz) <= maxW) {
                cur = test;
            } else {
                if (cur) lines.push(cur);
                cur = w;
            }
        }
        if (cur) lines.push(cur);
        return lines;
    };

    const drawPageHeader = (pg, isFirstPage = false) => {
        if (isFirstPage) {
            let rightBound = RIGHT_X;
            if (cbLogoImg) {
                const cbH = 38;
                const cbW = (cbH / cbLogoImg.height) * cbLogoImg.width;
                const cbX = RIGHT_X - cbW;
                pg.drawImage(cbLogoImg, { x: cbX, y: 766, width: cbW, height: cbH });
                rightBound = cbX - 14;
            }
            if (caLogoImg) {
                const caH = 23;
                const caW = (caH / caLogoImg.height) * caLogoImg.width;
                const caX = rightBound - caW;
                pg.drawImage(caLogoImg, { x: caX, y: 773.5, width: caW, height: caH });
            }

            safeDrawText('TRAVEL BOOKING FORM 2026', {
                page: pg,
                x: MARGIN_X,
                y: 785,
                size: 16,
                font: fontBold,
                color: primaryColor
            });
            safeDrawText('Carte Blanche & Combined Artists  •  Official Travel & Logistics Requisition', {
                page: pg,
                x: MARGIN_X,
                y: 769,
                size: 8.5,
                font,
                color: mutedColor
            });
            pg.drawLine({
                start: { x: MARGIN_X, y: 756 },
                end: { x: RIGHT_X, y: 756 },
                thickness: 1.5,
                color: primaryColor
            });
            return 744;
        } else {
            safeDrawText('CARTE BLANCHE  •  TRAVEL BOOKING FORM 2026', {
                page: pg,
                x: MARGIN_X,
                y: 802,
                size: 9.5,
                font: fontBold,
                color: primaryColor
            });
            safeDrawText(`Story: ${truncateToWidth(storyName || 'N/A', font, 8, 180)}   |   Comm #: ${commNum || 'N/A'}`, {
                page: pg,
                x: RIGHT_X - 230,
                y: 802,
                size: 8,
                font,
                color: mutedColor
            });
            pg.drawLine({
                start: { x: MARGIN_X, y: 794 },
                end: { x: RIGHT_X, y: 794 },
                thickness: 1,
                color: primaryColor
            });
            return 780;
        }
    };

    let y = drawPageHeader(page, true);

    const checkPageBreak = (needed = 45) => {
        if (y - needed < 44) {
            page = pdfDoc.addPage([PAGE_W, PAGE_H]);
            y = drawPageHeader(page, false);
        }
    };

    const drawSectionBanner = (title, accent = primaryColor) => {
        checkPageBreak(45);
        y -= 4;
        page.drawRectangle({
            x: MARGIN_X,
            y: y - 15,
            width: 3.5,
            height: 14,
            color: accent
        });
        safeDrawText(title, {
            x: MARGIN_X + 9,
            y: y - 12,
            size: 10,
            font: fontBold,
            color: accent
        });
        y -= 21;
    };

    // -----------------------------------------------------------------
    // 1. STORY & REQUESTOR SUMMARY GRID
    // -----------------------------------------------------------------
    const summaryH = 54;
    const summaryTopY = y;
    const summaryBottomY = y - summaryH;
    const colSplit1 = MARGIN_X + 235;
    const colSplit2 = MARGIN_X + 390;
    const rowMidY = summaryTopY - 27;
    const submittedDateStr = formatDateToDDMMYY(new Date().toISOString().split('T')[0]);

    page.drawRectangle({
        x: MARGIN_X,
        y: summaryBottomY,
        width: CONTENT_W,
        height: summaryH,
        color: zebraBg,
        borderColor,
        borderWidth: 0.85
    });

    // Horizontal & vertical grid lines inside summary card
    page.drawLine({ start: { x: MARGIN_X, y: rowMidY }, end: { x: RIGHT_X, y: rowMidY }, thickness: 0.6, color: softBorder });
    page.drawLine({ start: { x: colSplit1, y: summaryBottomY }, end: { x: colSplit1, y: summaryTopY }, thickness: 0.6, color: softBorder });
    page.drawLine({ start: { x: colSplit2, y: summaryBottomY }, end: { x: colSplit2, y: rowMidY }, thickness: 0.6, color: softBorder });

    // Row 1: Story Title | Commission Number
    safeDrawText('STORY TITLE', { x: MARGIN_X + 8, y: summaryTopY - 9.5, size: 6.5, font: fontBold, color: mutedColor });
    safeDrawText(truncateToWidth(storyName || 'N/A', fontBold, 9.5, 220), { x: MARGIN_X + 8, y: summaryTopY - 21, size: 9.5, font: fontBold, color: darkColor });

    safeDrawText('COMMISSION NUMBER', { x: colSplit1 + 8, y: summaryTopY - 9.5, size: 6.5, font: fontBold, color: mutedColor });
    safeDrawText(truncateToWidth(commNum || 'N/A', fontBold, 9.5, 260), { x: colSplit1 + 8, y: summaryTopY - 21, size: 9.5, font: fontBold, color: darkColor });

    // Row 2: Requestor / Producer | Submitter Email | Date Submitted
    safeDrawText('REQUESTOR / PRODUCER', { x: MARGIN_X + 8, y: rowMidY - 9.5, size: 6.5, font: fontBold, color: mutedColor });
    safeDrawText(truncateToWidth(requestorName || 'N/A', font, 8.8, 220), { x: MARGIN_X + 8, y: rowMidY - 20.5, size: 8.8, font, color: darkColor });

    safeDrawText('SUBMITTER EMAIL', { x: colSplit1 + 8, y: rowMidY - 9.5, size: 6.5, font: fontBold, color: mutedColor });
    safeDrawText(truncateToWidth(submitterEmail || 'N/A', font, 8.5, 142), { x: colSplit1 + 8, y: rowMidY - 20.5, size: 8.5, font, color: darkColor });

    safeDrawText('DATE SUBMITTED', { x: colSplit2 + 8, y: rowMidY - 9.5, size: 6.5, font: fontBold, color: mutedColor });
    safeDrawText(submittedDateStr, { x: colSplit2 + 8, y: rowMidY - 20.5, size: 8.8, font: fontBold, color: darkColor });

    y = summaryBottomY - 14;

    // -----------------------------------------------------------------
    // 2. AIR TRAVEL SECTION
    // -----------------------------------------------------------------
    if (airTravelRequired && flights.length > 0) {
        drawSectionBanner('AIR TRAVEL REQUIREMENTS', primaryColor);

        flights.forEach((f, idx) => {
            const isReturn = f.tripType !== 'One-Way';
            const paxCount = Array.isArray(f.passengers) ? f.passengers.length : 0;
            const paxRowsCount = Math.max(1, paxCount);

            const headerBarH = 17;
            const scheduleH = 44;
            const paxTitleBarH = 14;
            const paxRowH = 14.5;
            const cardH = headerBarH + scheduleH + paxTitleBarH + (paxRowsCount * paxRowH) + 4;

            checkPageBreak(cardH + 10);

            const cardTop = y;
            const cardBottom = y - cardH;

            // Card container
            page.drawRectangle({
                x: MARGIN_X,
                y: cardBottom,
                width: CONTENT_W,
                height: cardH,
                color: cardBg,
                borderColor,
                borderWidth: 0.75
            });

            // Header bar
            page.drawRectangle({
                x: MARGIN_X,
                y: cardTop - headerBarH,
                width: CONTENT_W,
                height: headerBarH,
                color: primaryColor
            });

            safeDrawText(`FLIGHT #${idx + 1}`, {
                x: MARGIN_X + 8,
                y: cardTop - 12,
                size: 8.5,
                font: fontBold,
                color: rgb(1, 1, 1)
            });

            const badgeText = isReturn ? 'RETURN FLIGHT' : 'ONE-WAY FLIGHT';
            const badgeW = fontBold.widthOfTextAtSize(badgeText, 7.5);
            safeDrawText(badgeText, {
                x: RIGHT_X - badgeW - 8,
                y: cardTop - 11.5,
                size: 7.5,
                font: fontBold,
                color: rgb(0.9, 0.96, 1)
            });

            // Schedule Grid (2 rows × 3 columns)
            const schedTop = cardTop - headerBarH;
            const schedMid = schedTop - 22;
            const schedBottom = schedTop - scheduleH;
            const colDateX = MARGIN_X + 320;
            const colTimeX = MARGIN_X + 420;

            page.drawLine({ start: { x: MARGIN_X, y: schedMid }, end: { x: RIGHT_X, y: schedMid }, thickness: 0.5, color: softBorder });
            page.drawLine({ start: { x: MARGIN_X, y: schedBottom }, end: { x: RIGHT_X, y: schedBottom }, thickness: 0.6, color: borderColor });
            page.drawLine({ start: { x: colDateX, y: schedBottom }, end: { x: colDateX, y: schedTop }, thickness: 0.5, color: softBorder });
            page.drawLine({ start: { x: colTimeX, y: schedBottom }, end: { x: colTimeX, y: schedTop }, thickness: 0.5, color: softBorder });

            // Schedule Row 1: Departure Airport | Departure Date | Departure Time
            safeDrawText('DEPARTURE AIRPORT', { x: MARGIN_X + 8, y: schedTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(truncateToWidth(f.depAirport || 'N/A', fontBold, 8.2, 304), { x: MARGIN_X + 8, y: schedTop - 17.5, size: 8.2, font: fontBold, color: darkColor });

            safeDrawText('DEPARTURE DATE', { x: colDateX + 8, y: schedTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(f.depDate || 'N/A', { x: colDateX + 8, y: schedTop - 17.5, size: 8.2, font: fontBold, color: darkColor });

            safeDrawText('DEPARTURE TIME (24H)', { x: colTimeX + 8, y: schedTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(f.depTime || 'N/A', { x: colTimeX + 8, y: schedTop - 17.5, size: 8.2, font: fontBold, color: darkColor });

            // Schedule Row 2: Arrival Airport | Return Date | Return Time
            safeDrawText('ARRIVAL AIRPORT', { x: MARGIN_X + 8, y: schedMid - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(truncateToWidth(f.arrAirport || f.retAirport || 'N/A', fontBold, 8.2, 304), { x: MARGIN_X + 8, y: schedMid - 17.5, size: 8.2, font: fontBold, color: darkColor });

            safeDrawText('RETURN DATE', { x: colDateX + 8, y: schedMid - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(isReturn ? (f.retDate || 'N/A') : '— (One-Way)', {
                x: colDateX + 8,
                y: schedMid - 17.5,
                size: 8.2,
                font: isReturn ? fontBold : fontOblique,
                color: isReturn ? darkColor : mutedColor
            });

            safeDrawText('RETURN TIME (24H)', { x: colTimeX + 8, y: schedMid - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(isReturn ? (f.retTime || 'N/A') : '—', {
                x: colTimeX + 8,
                y: schedMid - 17.5,
                size: 8.2,
                font: isReturn ? fontBold : fontOblique,
                color: isReturn ? darkColor : mutedColor
            });

            // Passengers Sub-Table Header
            const paxHeadTop = schedBottom;
            const paxHeadBottom = paxHeadTop - paxTitleBarH;
            page.drawRectangle({
                x: MARGIN_X + 0.5,
                y: paxHeadBottom,
                width: CONTENT_W - 1,
                height: paxTitleBarH,
                color: tableHeaderBg
            });
            page.drawLine({ start: { x: MARGIN_X, y: paxHeadBottom }, end: { x: RIGHT_X, y: paxHeadBottom }, thickness: 0.5, color: softBorder });

            const pColNum = MARGIN_X + 8;
            const pColName = MARGIN_X + 32;
            const pColId = MARGIN_X + 245;
            const pColMob = MARGIN_X + 395;

            safeDrawText('#', { x: pColNum, y: paxHeadBottom + 4, size: 6.5, font: fontBold, color: mutedColor });
            safeDrawText(`PASSENGERS TAKING FLIGHT #${idx + 1}`, { x: pColName, y: paxHeadBottom + 4, size: 6.5, font: fontBold, color: primaryColor });
            safeDrawText('ID / PASSPORT NUMBER', { x: pColId, y: paxHeadBottom + 4, size: 6.5, font: fontBold, color: mutedColor });
            safeDrawText('MOBILE NUMBER', { x: pColMob, y: paxHeadBottom + 4, size: 6.5, font: fontBold, color: mutedColor });

            let rowTop = paxHeadBottom;
            if (paxCount > 0) {
                f.passengers.forEach((p, pIdx) => {
                    const rowBottom = rowTop - paxRowH;
                    if (pIdx % 2 === 1) {
                        page.drawRectangle({
                            x: MARGIN_X + 0.5,
                            y: rowBottom,
                            width: CONTENT_W - 1,
                            height: paxRowH,
                            color: zebraBg
                        });
                    }
                    if (pIdx < paxCount - 1) {
                        page.drawLine({ start: { x: MARGIN_X + 4, y: rowBottom }, end: { x: RIGHT_X - 4, y: rowBottom }, thickness: 0.4, color: softBorder });
                    }
                    const textY = rowBottom + 4.2;
                    safeDrawText(`${pIdx + 1}.`, { x: pColNum, y: textY, size: 8, font: fontBold, color: mutedColor });
                    safeDrawText(truncateToWidth(p.name || 'N/A', fontBold, 8.2, 205), { x: pColName, y: textY, size: 8.2, font: fontBold, color: darkColor });
                    safeDrawText(truncateToWidth(p.idNumber || 'N/A', font, 8.2, 142), { x: pColId, y: textY, size: 8.2, font, color: bodyColor });
                    safeDrawText(truncateToWidth(p.mobile || 'N/A', font, 8.2, 110), { x: pColMob, y: textY, size: 8.2, font, color: bodyColor });
                    rowTop = rowBottom;
                });
            } else {
                const rowBottom = rowTop - paxRowH;
                safeDrawText('No passengers listed for this flight.', { x: pColName, y: rowBottom + 4.2, size: 8, font: fontOblique, color: mutedColor });
            }

            y = cardBottom - 8;
        });

        y -= 4;
    }

    // -----------------------------------------------------------------
    // 3. CAR RENTAL SECTION
    // -----------------------------------------------------------------
    if (carRentalRequired && vehicles.length > 0) {
        drawSectionBanner('CAR RENTAL REQUIREMENTS', secondaryBlue);

        vehicles.forEach((v, idx) => {
            const hasSpec = Boolean(v.specialRequirements && v.specialRequirements !== 'N/A');
            const headerBarH = 17;
            const gridH = 24;
            const specH = hasSpec ? 16 : 0;
            const cardH = headerBarH + gridH + specH;

            checkPageBreak(cardH + 10);

            const cardTop = y;
            const cardBottom = y - cardH;

            page.drawRectangle({
                x: MARGIN_X,
                y: cardBottom,
                width: CONTENT_W,
                height: cardH,
                color: cardBg,
                borderColor,
                borderWidth: 0.75
            });

            page.drawRectangle({
                x: MARGIN_X,
                y: cardTop - headerBarH,
                width: CONTENT_W,
                height: headerBarH,
                color: secondaryBlue
            });

            safeDrawText(`VEHICLE RENTAL #${idx + 1}`, {
                x: MARGIN_X + 8,
                y: cardTop - 12,
                size: 8.5,
                font: fontBold,
                color: rgb(1, 1, 1)
            });

            const driverText = `RESPONSIBLE DRIVER:  ${v.driver || 'N/A'}`;
            const driverW = fontBold.widthOfTextAtSize(cleanPdfText(driverText), 7.8);
            safeDrawText(driverText, {
                x: RIGHT_X - driverW - 8,
                y: cardTop - 11.8,
                size: 7.8,
                font: fontBold,
                color: rgb(1, 1, 1)
            });

            const gTop = cardTop - headerBarH;
            const gBottom = gTop - gridH;
            const halfX = MARGIN_X + (CONTENT_W / 2);

            page.drawLine({ start: { x: halfX, y: gBottom }, end: { x: halfX, y: gTop }, thickness: 0.5, color: softBorder });
            if (hasSpec) {
                page.drawLine({ start: { x: MARGIN_X, y: gBottom }, end: { x: RIGHT_X, y: gBottom }, thickness: 0.5, color: softBorder });
            }

            safeDrawText('PICK-UP LOCATION & DATE/TIME (24H)', { x: MARGIN_X + 8, y: gTop - 8, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(truncateToWidth(`${v.pickUp || 'N/A'}   •   ${v.pickUpDate || 'N/A'}`, fontBold, 8.2, (CONTENT_W / 2) - 16), {
                x: MARGIN_X + 8,
                y: gTop - 18.5,
                size: 8.2,
                font: fontBold,
                color: darkColor
            });

            safeDrawText('DROP-OFF LOCATION & DATE/TIME (24H)', { x: halfX + 8, y: gTop - 8, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(truncateToWidth(`${v.dropOff || 'N/A'}   •   ${v.dropOffDate || 'N/A'}`, fontBold, 8.2, (CONTENT_W / 2) - 16), {
                x: halfX + 8,
                y: gTop - 18.5,
                size: 8.2,
                font: fontBold,
                color: darkColor
            });

            if (hasSpec) {
                page.drawRectangle({
                    x: MARGIN_X + 0.5,
                    y: cardBottom + 0.5,
                    width: CONTENT_W - 1,
                    height: specH - 0.5,
                    color: zebraBg
                });
                safeDrawText('SPECIAL REQUIREMENTS:', { x: MARGIN_X + 8, y: cardBottom + 5, size: 6.8, font: fontBold, color: secondaryBlue });
                safeDrawText(truncateToWidth(v.specialRequirements, font, 8, CONTENT_W - 115), {
                    x: MARGIN_X + 102,
                    y: cardBottom + 5,
                    size: 8,
                    font,
                    color: darkColor
                });
            }

            y = cardBottom - 8;
        });

        y -= 4;
    }

    // -----------------------------------------------------------------
    // 4. ACCOMMODATION SECTION
    // -----------------------------------------------------------------
    if (accommodationRequired && hotels.length > 0) {
        drawSectionBanner('ACCOMMODATION REQUIREMENTS', tealColor);

        hotels.forEach((h, idx) => {
            const guestCount = Array.isArray(h.guestDetails) ? h.guestDetails.length : 0;
            const guestRowsCount = Math.max(1, guestCount);
            const hasSpec = Boolean(h.specialRequest && h.specialRequest !== 'N/A');

            const headerBarH = 17;
            const infoRowH = 23;
            const guestHeaderH = 14;
            const guestRowH = 14.5;
            const specH = hasSpec ? 16 : 0;
            const cardH = headerBarH + infoRowH + guestHeaderH + (guestRowsCount * guestRowH) + specH + 2;

            checkPageBreak(cardH + 10);

            const cardTop = y;
            const cardBottom = y - cardH;

            page.drawRectangle({
                x: MARGIN_X,
                y: cardBottom,
                width: CONTENT_W,
                height: cardH,
                color: cardBg,
                borderColor,
                borderWidth: 0.75
            });

            page.drawRectangle({
                x: MARGIN_X,
                y: cardTop - headerBarH,
                width: CONTENT_W,
                height: headerBarH,
                color: tealColor
            });

            safeDrawText(`ACCOMMODATION LOCATION #${idx + 1}`, {
                x: MARGIN_X + 8,
                y: cardTop - 12,
                size: 8.5,
                font: fontBold,
                color: rgb(1, 1, 1)
            });

            // Top Info Row: Destination/City | Hotel/B&B | Check-In Date | Check-Out Date
            const infoTop = cardTop - headerBarH;
            const infoBottom = infoTop - infoRowH;
            const cHotelX = MARGIN_X + 145;
            const cInX = MARGIN_X + 335;
            const cOutX = MARGIN_X + 425;

            page.drawLine({ start: { x: MARGIN_X, y: infoBottom }, end: { x: RIGHT_X, y: infoBottom }, thickness: 0.6, color: borderColor });
            page.drawLine({ start: { x: cHotelX, y: infoBottom }, end: { x: cHotelX, y: infoTop }, thickness: 0.5, color: softBorder });
            page.drawLine({ start: { x: cInX, y: infoBottom }, end: { x: cInX, y: infoTop }, thickness: 0.5, color: softBorder });
            page.drawLine({ start: { x: cOutX, y: infoBottom }, end: { x: cOutX, y: infoTop }, thickness: 0.5, color: softBorder });

            safeDrawText('DESTINATION / CITY', { x: MARGIN_X + 8, y: infoTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(truncateToWidth(h.city || 'N/A', fontBold, 8.2, 130), { x: MARGIN_X + 8, y: infoTop - 18, size: 8.2, font: fontBold, color: darkColor });

            safeDrawText('PREFERRED HOTEL / B&B', { x: cHotelX + 8, y: infoTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(truncateToWidth(h.hotel || 'N/A', fontBold, 8.2, 180), { x: cHotelX + 8, y: infoTop - 18, size: 8.2, font: fontBold, color: darkColor });

            safeDrawText('CHECK-IN DATE', { x: cInX + 8, y: infoTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(h.checkIn || 'N/A', { x: cInX + 8, y: infoTop - 18, size: 8.2, font: fontBold, color: darkColor });

            safeDrawText('CHECK-OUT DATE', { x: cOutX + 8, y: infoTop - 7.5, size: 6, font: fontBold, color: mutedColor });
            safeDrawText(h.checkOut || 'N/A', { x: cOutX + 8, y: infoTop - 18, size: 8.2, font: fontBold, color: darkColor });

            // Guest Details Sub-Table Header (aligned with Flight Passengers columns!)
            const gHeadTop = infoBottom;
            const gHeadBottom = gHeadTop - guestHeaderH;
            page.drawRectangle({
                x: MARGIN_X + 0.5,
                y: gHeadBottom,
                width: CONTENT_W - 1,
                height: guestHeaderH,
                color: tableHeaderBg
            });
            page.drawLine({ start: { x: MARGIN_X, y: gHeadBottom }, end: { x: RIGHT_X, y: gHeadBottom }, thickness: 0.5, color: softBorder });

            const gColNum = MARGIN_X + 8;
            const gColName = MARGIN_X + 32;
            const gColId = MARGIN_X + 245;
            const gColMob = MARGIN_X + 395;

            safeDrawText('#', { x: gColNum, y: gHeadBottom + 4, size: 6.5, font: fontBold, color: mutedColor });
            safeDrawText('GUEST DETAILS (FULL NAME & SURNAME)', { x: gColName, y: gHeadBottom + 4, size: 6.5, font: fontBold, color: tealColor });
            safeDrawText('ID / PASSPORT NUMBER', { x: gColId, y: gHeadBottom + 4, size: 6.5, font: fontBold, color: mutedColor });
            safeDrawText('MOBILE NUMBER', { x: gColMob, y: gHeadBottom + 4, size: 6.5, font: fontBold, color: mutedColor });

            let rowTop = gHeadBottom;
            if (guestCount > 0) {
                h.guestDetails.forEach((g, gIdx) => {
                    const rowBottom = rowTop - guestRowH;
                    if (gIdx % 2 === 1) {
                        page.drawRectangle({
                            x: MARGIN_X + 0.5,
                            y: rowBottom,
                            width: CONTENT_W - 1,
                            height: guestRowH,
                            color: zebraBg
                        });
                    }
                    if (gIdx < guestCount - 1 || hasSpec) {
                        page.drawLine({ start: { x: MARGIN_X + 4, y: rowBottom }, end: { x: RIGHT_X - 4, y: rowBottom }, thickness: 0.4, color: softBorder });
                    }
                    const textY = rowBottom + 4.2;
                    safeDrawText(`${gIdx + 1}.`, { x: gColNum, y: textY, size: 8, font: fontBold, color: mutedColor });
                    safeDrawText(truncateToWidth(g.name || 'N/A', fontBold, 8.2, 205), { x: gColName, y: textY, size: 8.2, font: fontBold, color: darkColor });
                    safeDrawText(truncateToWidth(g.idNumber || 'N/A', font, 8.2, 142), { x: gColId, y: textY, size: 8.2, font, color: bodyColor });
                    safeDrawText(truncateToWidth(g.mobile || 'N/A', font, 8.2, 110), { x: gColMob, y: textY, size: 8.2, font, color: bodyColor });
                    rowTop = rowBottom;
                });
            } else {
                const rowBottom = rowTop - guestRowH;
                safeDrawText('No guests listed for this location.', { x: gColName, y: rowBottom + 4.2, size: 8, font: fontOblique, color: mutedColor });
                rowTop = rowBottom;
            }

            if (hasSpec) {
                page.drawRectangle({
                    x: MARGIN_X + 0.5,
                    y: cardBottom + 0.5,
                    width: CONTENT_W - 1,
                    height: specH - 0.5,
                    color: zebraBg
                });
                safeDrawText('SPECIAL REQUEST:', { x: MARGIN_X + 8, y: cardBottom + 5, size: 6.8, font: fontBold, color: tealColor });
                safeDrawText(truncateToWidth(h.specialRequest, font, 8, CONTENT_W - 95), {
                    x: MARGIN_X + 84,
                    y: cardBottom + 5,
                    size: 8,
                    font,
                    color: darkColor
                });
            }

            y = cardBottom - 8;
        });

        y -= 4;
    }

    // -----------------------------------------------------------------
    // 5. GENERAL SPECIAL REQUESTS
    // -----------------------------------------------------------------
    if (specialNotes) {
        drawSectionBanner('GENERAL SPECIAL REQUESTS', primaryColor);

        const rawParagraphs = specialNotes.split('\n').map(s => s.trim()).filter(Boolean);
        const wrappedNoteLines = [];
        rawParagraphs.forEach(p => {
            const lines = wrapLines(p, font, 8.5, CONTENT_W - 20);
            wrappedNoteLines.push(...lines);
        });
        const displayLines = wrappedNoteLines.length > 0 ? wrappedNoteLines : [cleanPdfText(specialNotes)];
        const boxH = Math.max(28, (displayLines.length * 12) + 14);

        checkPageBreak(boxH + 10);

        page.drawRectangle({
            x: MARGIN_X,
            y: y - boxH,
            width: CONTENT_W,
            height: boxH,
            color: zebraBg,
            borderColor,
            borderWidth: 0.75
        });

        let noteY = y - 13;
        displayLines.forEach(line => {
            safeDrawText(line, { x: MARGIN_X + 10, y: noteY, size: 8.5, font, color: darkColor });
            noteY -= 12;
        });

        y -= (boxH + 10);
    }

    // -----------------------------------------------------------------
    // 6. NUMBERED FOOTERS ON ALL PAGES
    // -----------------------------------------------------------------
    const allPages = pdfDoc.getPages();
    const totalPages = allPages.length;
    allPages.forEach((pg, idx) => {
        const footerY = 24;
        pg.drawLine({
            start: { x: MARGIN_X, y: footerY + 10 },
            end: { x: RIGHT_X, y: footerY + 10 },
            thickness: 0.5,
            color: softBorder
        });
        safeDrawText('Carte Blanche  •  Electronic Media Network (Pty) Ltd  •  Combined Artistic Productions CC', {
            page: pg,
            x: MARGIN_X,
            y: footerY,
            size: 7,
            font,
            color: mutedColor
        });
        const pageLabel = `Form Ref: CB-TRF-2026   |   Page ${idx + 1} of ${totalPages}`;
        const pageLabelW = font.widthOfTextAtSize(pageLabel, 7);
        safeDrawText(pageLabel, {
            page: pg,
            x: RIGHT_X - pageLabelW,
            y: footerY,
            size: 7,
            font,
            color: mutedColor
        });
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
