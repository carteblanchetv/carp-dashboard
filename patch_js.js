const fs = require('fs');
const file = 'c:/Users/lizzy/.gemini/antigravity/scratch/cb_forms/frontend/proposal.js';

let content = fs.readFileSync(file, 'utf8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// Find and replace the callSheet payload block using a regex that ignores formatting spaces
const regex = /callSheet:\s*\{[\s\S]*?story_description:\s*formData\.get\('cs_story_description'\),\s*shootSchedule:\s*gatherShootSchedule\(\)\s*\}/;

const replacement = `callSheet: {
                            producer_phone: formData.get('cs_producer_phone'),
                            producer_id: formData.get('cs_producer_id'),
                            presenter_name: formData.get('cs_presenter_name') === 'Other' ? formData.get('cs_presenter_other') : formData.get('cs_presenter_name'),
                            presenter_phone: formData.get('cs_presenter_phone'),
                            presenter_id: formData.get('cs_presenter_id'),
                            dop_name: formData.get('cs_dop_name'),
                            dop_phone: formData.get('cs_dop_phone'),
                            dop_id: formData.get('cs_dop_id'),
                            cam_assistant_name: formData.get('cs_cam_assistant_name'),
                            cam_assistant_phone: formData.get('cs_cam_assistant_phone'),
                            cam_assistant_id: formData.get('cs_cam_assistant_id'),
                            security_status: formData.get('cs_security_status'),
                            security_name: formData.get('cs_security_name'),
                            security_phone: formData.get('cs_security_phone'),
                            shoot_day: formData.get('cs_shoot_day'),
                            shoot_date: formData.get('cs_shoot_date'),
                            movementOrder: Array.from(document.querySelectorAll('#movementOrderTableBody tr')).map(row => ({
                                time: row.querySelector('input[name="mo_time[]"]')?.value || '',
                                what: row.querySelector('input[name="mo_what[]"]')?.value || '',
                                location: row.querySelector('input[name="mo_location[]"]')?.value || ''
                            })).filter(row => row.time || row.what || row.location),
                            kit: {
                                camera: formData.get('kit_camera'),
                                audio: formData.get('kit_audio'),
                                lenses: formData.get('kit_lenses'),
                                lighting: formData.get('kit_lighting'),
                                rigs: formData.get('kit_rigs'),
                                other: formData.get('kit_other')
                            },
                            travel: {
                                flight_name: formData.get('travel_flight_name'),
                                flight_details: formData.get('travel_flight_details'),
                                flight_file_path: formData.get('travel_flight_file_path'),
                                flight_filename: formData.get('travel_flight_filename'),
                                accom_name: formData.get('travel_accom_name'),
                                accom_location: formData.get('travel_accom_location'),
                                accom_from: formData.get('travel_accom_from'),
                                accom_to: formData.get('travel_accom_to'),
                                trans_name: formData.get('travel_trans_name'),
                                trans_from_loc: formData.get('travel_trans_from_loc'),
                                trans_to_loc: formData.get('travel_trans_to_loc'),
                                trans_from_date: formData.get('travel_trans_from_date'),
                                trans_to_date: formData.get('travel_trans_to_date'),
                                trans_from_time: formData.get('travel_trans_from_time'),
                                trans_to_time: formData.get('travel_trans_to_time'),
                                trans_file_path: formData.get('travel_trans_file_path'),
                                trans_filename: formData.get('travel_trans_filename')
                            },
                            additionalCrew: formData.getAll('cs_add_name[]').map((name, i) => ({
                                name: name.trim(),
                                phone: formData.getAll('cs_add_phone[]')[i]?.trim() || '',
                                id: formData.getAll('cs_add_id[]')[i]?.trim() || ''
                            })).filter(c => c.name !== ''),
                            story_description: formData.get('cs_story_description')
                        }`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log("Payload replacement successful!");
} else {
  console.log("Payload regex target NOT matched in file!");
}
