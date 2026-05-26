const fs = require('fs');
const file = 'c:/Users/lizzy/.gemini/antigravity/scratch/cb_forms/frontend/proposal.html';

let content = fs.readFileSync(file, 'utf8');

const target = `<section id="callSheetSection" class="form-section" style="border-top: 2px solid var(--success); padding-top: 2rem; margin-top: 3rem;">
                    <h2 class="section-title" style="color: var(--success);">Call Sheet</h2>
                    <p style="background: rgba(239, 68, 68, 0.08); padding: 1.25rem; border-radius: var(--radius-sm); border-left: 5px solid var(--danger); font-size: 1rem; margin-bottom: 2rem; color: var(--danger); font-weight: 600;">
                        <b>IMPORTANT:</b> For insurance purposes, Call Sheet must be submitted before filming.
                    </p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Commission Number</label>
                            <input type="text" id="cs_comm_num" readonly style="background: var(--bg-light); cursor: not-allowed;">
                        </div>
                        <div class="form-group">
                            <label>Story Name</label>
                            <input type="text" id="cs_story_name" readonly style="background: var(--bg-light); cursor: not-allowed;">
                        </div>
                        <div class="form-group">
                            <label>Producer Name</label>
                            <input type="text" id="cs_producer_name" readonly style="background: var(--bg-light); cursor: not-allowed;">
                        </div>
                    </div>

                    <div class="form-grid" style="margin-top: 1.5rem;">
                        <div class="form-group">
                            <label>Producer Phone Number</label>
                            <input type="text" id="cs_producer_phone" name="cs_producer_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" title="Please use SA dial code (+27) or 10-digit number" oninput="this.value = formatSA(this.value)">
                        </div>
                        <div class="form-group">
                            <label>Producer ID Number</label>
                            <input type="text" id="cs_producer_id" name="cs_producer_id" placeholder="13 Digit ID Number" maxlength="13" minlength="13" pattern="\\d{13}" title="Must be exactly 13 digits with no spaces">
                        </div>
                    </div>

                    <div class="form-grid-3-col" style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                        <div class="form-group">
                            <label>Presenter Name</label>
                            <select id="cs_presenter_name" name="cs_presenter_name">
                                <option value="">-- Select Presenter --</option>
                            </select>
                            <div id="csPresenterOtherWrapper" class="hidden" style="margin-top: 0.75rem;">
                                <input type="text" id="cs_presenter_other" name="cs_presenter_other" placeholder="Type name here...">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Presenter Phone Number</label>
                            <input type="text" id="cs_presenter_phone" name="cs_presenter_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" oninput="this.value = formatSA(this.value)">
                        </div>
                        <div class="form-group">
                            <label>Presenter ID Number</label>
                            <input type="text" id="cs_presenter_id" name="cs_presenter_id" placeholder="13 Digit ID Number" maxlength="13" minlength="13" pattern="\\d{13}">
                        </div>
                    </div>

                    <div class="form-grid-3-col" style="margin-top: 1.5rem;">
                        <div class="form-group">
                            <label>DOP Name</label>
                            <input type="text" id="cs_dop_name" name="cs_dop_name">
                        </div>
                        <div class="form-group">
                            <label>DOP Phone Number</label>
                            <input type="text" id="cs_dop_phone" name="cs_dop_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" oninput="this.value = formatSA(this.value)">
                        </div>
                        <div class="form-group">
                            <label>DOP ID Number</label>
                            <input type="text" id="cs_dop_id" name="cs_dop_id" placeholder="13 Digit ID Number" maxlength="13" minlength="13" pattern="\\d{13}">
                        </div>
                    </div>

                    <div class="form-grid-3-col" style="margin-top: 1.5rem;">
                        <div class="form-group">
                            <label>Camera Assistant Name</label>
                            <input type="text" id="cs_cam_assistant_name" name="cs_cam_assistant_name">
                        </div>
                        <div class="form-group">
                            <label>Camera Assistant Phone Number</label>
                            <input type="text" id="cs_cam_assistant_phone" name="cs_cam_assistant_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" oninput="this.value = formatSA(this.value)">
                        </div>
                        <div class="form-group">
                            <label>Camera Assistant ID Number</label>
                            <input type="text" id="cs_cam_assistant_id" name="cs_cam_assistant_id" placeholder="13 Digit ID Number" maxlength="13" minlength="13" pattern="\\d{13}">
                        </div>
                    </div>

                    <div id="dynamicAdditionalCrew">
                        <div class="form-grid-3-col" style="margin-top: 1.5rem; border-top: 1px dashed var(--border); padding-top: 1.5rem;">
                            <div class="form-group">
                                <label>Additional Name</label>
                                <input type="text" id="cs_add1_name" name="cs_add1_name">
                            </div>
                            <div class="form-group">
                                <label>Additional Phone Number</label>
                                <input type="text" id="cs_add1_phone" name="cs_add1_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" oninput="this.value = formatSA(this.value)">
                            </div>
                            <div class="form-group">
                                <label>Additional ID Number</label>
                                <input type="text" id="cs_add1_id" name="cs_add1_id" placeholder="13 Digit ID Number" maxlength="13" minlength="13" pattern="\\d{13}">
                            </div>
                        </div>
                    </div>

                    <button type="button" id="addCsCrewBtn" class="add-btn" style="margin-top: 1.5rem; width: fit-content;">+ Add Additional Details</button>

                    <div class="form-group" style="margin-top: 2rem;">
                        <label for="cs_story_description">Story Description (Risk Assessment)</label>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                            Please describe the kind of story you're doing. This is basically a risk assessment - skydiving, riot, mountain climbing, etc. Is it a feature, news piece, investigative, etc.
                        </p>
                        <textarea id="cs_story_description" name="cs_story_description" rows="4" placeholder="Describe the story and any risks..."></textarea>
                    </div>

                    <div class="form-group" style="margin-top: 2rem;">
                        <label>Shoot Schedule</label>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                            Please break ALL your shoot days down WITH dates. You need to indicate flying, driving (whose car), etc. We need every day broken up in slots with times, addresses and what you are shooting.
                        </p>
                        <div class="table-container">
                            <table class="data-table" style="min-width: 1200px;">
                                <thead>
                                    <tr>
                                        <th style="width: 120px;">Date</th>
                                        <th style="width: 100px;">Time</th>
                                        <th>From Destination</th>
                                        <th>To Destination</th>
                                        <th style="width: 120px;">Transport</th>
                                        <th style="width: 120px;">Vehicle Owner</th>
                                        <th style="width: 150px;">Responsible Driver</th>
                                        <th>What You are Shooting</th>
                                        <th style="width: 50px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="shootScheduleTableBody">
                                    <!-- Dynamic rows go here -->
                                </tbody>
                            </table>
                        </div>
                        <button type="button" id="addShootRowBtn" class="add-btn" style="margin-top: 0.75rem;">+ Add Shoot Day/Slot</button>
                    </div>
                </section>`;

const replacement = `<section id="callSheetSection" class="form-section" style="border-top: 2px solid var(--success); padding-top: 2rem; margin-top: 3rem;">
                    <h2 class="section-title" style="color: var(--success);">Call Sheet</h2>
                    <p style="background: rgba(239, 68, 68, 0.08); padding: 1.25rem; border-radius: var(--radius-sm); border-left: 5px solid var(--danger); font-size: 1rem; margin-bottom: 2rem; color: var(--danger); font-weight: 600;">
                        <b>IMPORTANT:</b> For insurance purposes, Call Sheet must be submitted before filming.
                    </p>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Commission Number</label>
                            <input type="text" id="cs_comm_num" readonly style="background: var(--bg-light); cursor: not-allowed;">
                        </div>
                        <div class="form-group">
                            <label>Story Name</label>
                            <input type="text" id="cs_story_name" readonly style="background: var(--bg-light); cursor: not-allowed;">
                        </div>
                        <div class="form-group">
                            <label>Producer Name</label>
                            <input type="text" id="cs_producer_name" readonly style="background: var(--bg-light); cursor: not-allowed;">
                        </div>
                    </div>

                    <!-- CREW SECTION -->
                    <div style="margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                        <h3 style="color: var(--success); font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem;">Crew Details</h3>
                        
                        <div class="form-grid" style="margin-top: 1.5rem;">
                            <div class="form-group">
                                <label>Producer Phone Number</label>
                                <input type="text" id="cs_producer_phone" name="cs_producer_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" required title="Please use SA dial code (+27) or 10-digit number" oninput="this.value = formatSA(this.value)">
                            </div>
                            <div class="form-group">
                                <label>Producer ID Number</label>
                                <input type="text" id="cs_producer_id" name="cs_producer_id" placeholder="13 Digit ID Number" required maxlength="13" minlength="13" pattern="\\d{13}" title="Must be exactly 13 digits with no spaces">
                            </div>
                        </div>

                        <div class="form-grid-3-col" style="margin-top: 1.5rem;">
                            <div class="form-group">
                                <label>Presenter Name</label>
                                <select id="cs_presenter_name" name="cs_presenter_name" required>
                                    <option value="">-- Select Presenter --</option>
                                </select>
                                <div id="csPresenterOtherWrapper" class="hidden" style="margin-top: 0.75rem;">
                                    <input type="text" id="cs_presenter_other" name="cs_presenter_other" placeholder="Type name here...">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Presenter Phone Number</label>
                                <input type="text" id="cs_presenter_phone" name="cs_presenter_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" required oninput="this.value = formatSA(this.value)">
                            </div>
                            <div class="form-group">
                                <label>Presenter ID Number</label>
                                <input type="text" id="cs_presenter_id" name="cs_presenter_id" placeholder="13 Digit ID Number" required maxlength="13" minlength="13" pattern="\\d{13}">
                            </div>
                        </div>

                        <div class="form-grid-3-col" style="margin-top: 1.5rem;">
                            <div class="form-group">
                                <label>DOP Name</label>
                                <input type="text" id="cs_dop_name" name="cs_dop_name" required>
                            </div>
                            <div class="form-group">
                                <label>DOP Phone Number</label>
                                <input type="text" id="cs_dop_phone" name="cs_dop_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" required oninput="this.value = formatSA(this.value)">
                            </div>
                            <div class="form-group">
                                <label>DOP ID Number</label>
                                <input type="text" id="cs_dop_id" name="cs_dop_id" placeholder="13 Digit ID Number" required maxlength="13" minlength="13" pattern="\\d{13}">
                            </div>
                        </div>

                        <div class="form-grid-3-col" style="margin-top: 1.5rem;">
                            <div class="form-group">
                                <label>Camera Assistant Name</label>
                                <input type="text" id="cs_cam_assistant_name" name="cs_cam_assistant_name" required>
                            </div>
                            <div class="form-group">
                                <label>Camera Assistant Phone Number</label>
                                <input type="text" id="cs_cam_assistant_phone" name="cs_cam_assistant_phone" placeholder="+27 82 123 4567" pattern="^\\+27\\d{9}$|^0\\d{9}$" required oninput="this.value = formatSA(this.value)">
                            </div>
                            <div class="form-group">
                                <label>Camera Assistant ID Number</label>
                                <input type="text" id="cs_cam_assistant_id" name="cs_cam_assistant_id" placeholder="13 Digit ID Number" required maxlength="13" minlength="13" pattern="\\d{13}">
                            </div>
                        </div>

                        <!-- SECURITY (OPTIONAL) -->
                        <div class="form-grid-3-col" style="margin-top: 1.5rem; border-top: 1px dashed var(--border); padding-top: 1.5rem;">
                            <div class="form-group">
                                <label>Security Status</label>
                                <select id="cs_security_status" name="cs_security_status">
                                    <option value="not_required" selected>Not Required</option>
                                    <option value="required">Required</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Security Name & Surname</label>
                                <input type="text" id="cs_security_name" name="cs_security_name" placeholder="Name & Surname">
                            </div>
                            <div class="form-group">
                                <label>Security Phone Number</label>
                                <input type="text" id="cs_security_phone" name="cs_security_phone" placeholder="+27 82 123 4567" oninput="this.value = formatSA(this.value)">
                            </div>
                        </div>

                        <div id="dynamicAdditionalCrew"></div>
                        <button type="button" id="addCsCrewBtn" class="add-btn" style="margin-top: 1.5rem; width: fit-content;">+ Add Additional Details</button>
                    </div>

                    <!-- MOVEMENT ORDER -->
                    <div style="margin-top: 3rem; border-top: 1px solid var(--border); padding-top: 2rem;">
                        <h3 style="color: var(--success); font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem;">Movement Order</h3>
                        
                        <div class="form-grid" style="margin-bottom: 1.5rem;">
                            <div class="form-group">
                                <label for="cs_shoot_day">Shoot Day</label>
                                <select id="cs_shoot_day" name="cs_shoot_day" required>
                                    <option value="">-- Select Shoot Day --</option>
                                    <option value="0.5">0.5</option>
                                    <option value="1">1</option>
                                    <option value="1.5">1.5</option>
                                    <option value="2">2</option>
                                    <option value="2.5">2.5</option>
                                    <option value="3">3</option>
                                    <option value="3.5">3.5</option>
                                    <option value="4">4</option>
                                    <option value="4.5">4.5</option>
                                    <option value="5">5</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="cs_shoot_date">Shoot Date</label>
                                <input type="date" id="cs_shoot_date" name="cs_shoot_date" required>
                            </div>
                        </div>

                        <div class="form-group">
                            <div class="table-container">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th style="width: 150px;">Time [24H Format]</th>
                                            <th>What's Happening?</th>
                                            <th>Location</th>
                                            <th style="width: 50px;"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="movementOrderTableBody">
                                        <!-- Dynamic rows go here -->
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" id="addMovementRowBtn" class="add-btn" style="margin-top: 0.75rem;">+ Add Movement Slot</button>
                        </div>

                        <div class="form-group" style="margin-top: 2rem;">
                            <label for="cs_story_description">Story Description (Risk Assessment)</label>
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                                Please describe the kind of story you're doing. This is basically a risk assessment - skydiving, riot, mountain climbing, etc. Is it a feature, news piece, investigative, etc.
                            </p>
                            <textarea id="cs_story_description" name="cs_story_description" rows="4" placeholder="Describe the story and any risks..."></textarea>
                        </div>
                    </div>

                    <!-- KIT / EQUIPMENT -->
                    <div style="margin-top: 3rem; border-top: 1px solid var(--border); padding-top: 2rem;">
                        <h3 style="color: var(--success); font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem;">Kit / Equipment</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="kit_camera">Camera (Cam A - Cam F)</label>
                                <input type="text" id="kit_camera" name="kit_camera" placeholder="Camera details...">
                            </div>
                            <div class="form-group">
                                <label for="kit_audio">Audio (Mic 1 - Mic 6)</label>
                                <input type="text" id="kit_audio" name="kit_audio" placeholder="Audio details...">
                            </div>
                        </div>
                        <div class="form-grid" style="margin-top: 1.5rem;">
                            <div class="form-group">
                                <label for="kit_lenses">Lenses</label>
                                <input type="text" id="kit_lenses" name="kit_lenses" placeholder="Lenses details...">
                            </div>
                            <div class="form-group">
                                <label for="kit_lighting">Lighting Kit</label>
                                <input type="text" id="kit_lighting" name="kit_lighting" placeholder="Lighting details...">
                            </div>
                        </div>
                        <div class="form-grid" style="margin-top: 1.5rem;">
                            <div class="form-group">
                                <label for="kit_rigs">Rigs</label>
                                <input type="text" id="kit_rigs" name="kit_rigs" placeholder="Rigs details...">
                            </div>
                            <div class="form-group">
                                <label for="kit_other">Other</label>
                                <input type="text" id="kit_other" name="kit_other" placeholder="Other equipment details...">
                            </div>
                        </div>
                    </div>

                    <!-- TRAVEL & VEHICLES -->
                    <div style="margin-top: 3rem; border-top: 1px solid var(--border); padding-top: 2rem;">
                        <h3 style="color: var(--success); font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem;">Travel & Vehicles</h3>
                        
                        <!-- Flight Details -->
                        <div style="margin-bottom: 2rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.5rem;">
                            <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-main);">Flight Details</h4>
                            <div class="form-grid-3-col">
                                <div class="form-group">
                                    <label for="travel_flight_name">Name / Surname</label>
                                    <input type="text" id="travel_flight_name" name="travel_flight_name" placeholder="Passenger Name">
                                </div>
                                <div class="form-group">
                                    <label for="travel_flight_details">Flight Details</label>
                                    <input type="text" id="travel_flight_details" name="travel_flight_details" placeholder="e.g. Flight No, Airline, Time">
                                </div>
                                <div class="form-group">
                                    <label>Travel Booking PDF</label>
                                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                        <input type="file" id="travel_flight_file" accept=".pdf">
                                        <input type="hidden" id="travel_flight_file_path" name="travel_flight_file_path">
                                        <input type="hidden" id="travel_flight_filename" name="travel_flight_filename">
                                        <span id="travel_flight_file_name_display" style="font-size: 0.75rem; color: var(--success); font-weight: 600;"></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Accommodation Details -->
                        <div style="margin-bottom: 2rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.5rem;">
                            <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-main);">Accommodation Details</h4>
                            <div class="form-grid-2-col">
                                <div class="form-group">
                                    <label for="travel_accom_name">Name / Surname</label>
                                    <input type="text" id="travel_accom_name" name="travel_accom_name" placeholder="Guest Name">
                                </div>
                                <div class="form-group">
                                    <label for="travel_accom_location">Location / Address</label>
                                    <input type="text" id="travel_accom_location" name="travel_accom_location" placeholder="e.g. Hotel name & address">
                                </div>
                            </div>
                            <div class="form-grid" style="margin-top: 1.5rem;">
                                <div class="form-group">
                                    <label for="travel_accom_from">From Date</label>
                                    <input type="date" id="travel_accom_from" name="travel_accom_from">
                                </div>
                                <div class="form-group">
                                    <label for="travel_accom_to">To Date</label>
                                    <input type="date" id="travel_accom_to" name="travel_accom_to">
                                </div>
                            </div>
                        </div>

                        <!-- Transport Details -->
                        <div>
                            <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-main);">Transport Details</h4>
                            <div class="form-grid-3-col">
                                <div class="form-group">
                                    <label for="travel_trans_name">Name / Surname</label>
                                    <input type="text" id="travel_trans_name" name="travel_trans_name" placeholder="Driver / Passenger Name">
                                </div>
                                <div class="form-group">
                                    <label for="travel_trans_from_loc">From Location</label>
                                    <input type="text" id="travel_trans_from_loc" name="travel_trans_from_loc" placeholder="Departure location">
                                </div>
                                <div class="form-group">
                                    <label for="travel_trans_to_loc">To Location</label>
                                    <input type="text" id="travel_trans_to_loc" name="travel_trans_to_loc" placeholder="Destination location">
                                </div>
                            </div>
                            <div class="form-grid-2-col" style="margin-top: 1.5rem;">
                                <div class="form-group">
                                    <label for="travel_trans_from_date">From Date</label>
                                    <input type="date" id="travel_trans_from_date" name="travel_trans_from_date">
                                </div>
                                <div class="form-group">
                                    <label for="travel_trans_to_date">To Date</label>
                                    <input type="date" id="travel_trans_to_date" name="travel_trans_to_date">
                                </div>
                            </div>
                            <div class="form-grid-3-col" style="margin-top: 1.5rem;">
                                <div class="form-group">
                                    <label for="travel_trans_from_time">From Time</label>
                                    <input type="text" id="travel_trans_from_time" name="travel_trans_from_time" placeholder="e.g. 09:00">
                                </div>
                                <div class="form-group">
                                    <label for="travel_trans_to_time">To Time</label>
                                    <input type="text" id="travel_trans_to_time" name="travel_trans_to_time" placeholder="e.g. 17:00">
                                </div>
                                <div class="form-group">
                                    <label>Rental Booking PDF</label>
                                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                        <input type="file" id="travel_trans_file" accept=".pdf">
                                        <input type="hidden" id="travel_trans_file_path" name="travel_trans_file_path">
                                        <input type="hidden" id="travel_trans_filename" name="travel_trans_filename">
                                        <span id="travel_trans_file_name_display" style="font-size: 0.75rem; color: var(--success); font-weight: 600;"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>`;

// Replace normalizing line endings to LF
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
  console.log("Target found! Replacing...");
  const newContent = normalizedContent.replace(normalizedTarget, normalizedReplacement);
  fs.writeFileSync(file, newContent, 'utf8');
  console.log("Replacement successful!");
} else {
  console.log("Target NOT found in file.");
  for (let i = 10; i < normalizedTarget.length; i++) {
    const sub = normalizedTarget.substring(0, i);
    if (!normalizedContent.includes(sub)) {
      console.log("Failed at substring of length:", i);
      console.log("Sub:", JSON.stringify(sub));
      break;
    }
  }
}
