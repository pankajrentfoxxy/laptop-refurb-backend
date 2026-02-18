const pool = require('../config/db');

// QC Checklist Configuration
const QC_CHECKLIST_STRUCTURE = {
    body_physical: {
        body_scratches: { label: 'Body Scratches Available', options: ['YES', 'NO'] },
        physical_damage: { label: 'Physical Damage / Crack Available', options: ['YES', 'NO'] },
        body_screws: { label: 'Body Check for Screws', options: ['YES', 'NO'] },
        ttspl_id: { label: 'TTSPL ID', options: ['YES', 'NO'] },
        body_hinge: { label: 'Body Check for Hinge', options: ['YES', 'NO'] }
    },
    internal_thermal: {
        motherboard_cleaning: { label: 'Motherboard Cleaning & CPU Paste', options: ['YES', 'NO'] },
        heating_test: { label: 'Heating Issues Test', options: ['YES', 'NO'] }
    },
    camera_bios_drivers: {
        camera_recording: { label: 'Camera (Video & Audio) Recording', options: ['YES', 'NO'] },
        bios_check: { label: 'BIOS Check', options: ['YES', 'NO'] },
        required_drivers: { label: 'All Required Drivers', options: ['YES', 'NO'] }
    },
    os_software: {
        ms_office: { label: 'MS Office Installation & Activation', options: ['INSTALLED', 'NOT INSTALLED'] },
        chrome: { label: 'Chrome', options: ['INSTALLED', 'NOT INSTALLED'] },
        ultra_viewer: { label: 'Ultra Viewer', options: ['INSTALLED', 'NOT INSTALLED'] },
        virtual_memory: { label: 'Virtual Memory Set as per RAM', options: ['YES', 'NO'] }
    },
    input_devices: {
        touchpad: { label: 'Touch Pad', options: ['WORKING', 'NOT WORKING'] },
        cursor_speed: { label: 'Cursor Speed Set 80%', options: ['YES', 'NO'] },
        left_click: { label: 'Left Click', options: ['WORKING', 'NOT WORKING'] },
        right_click: { label: 'Right Click', options: ['WORKING', 'NOT WORKING'] },
        scrolling: { label: 'Scrolling', options: ['WORKING', 'NOT WORKING'] },
        keyboard: { label: 'Keyboard', options: ['WORKING', 'NOT WORKING'] },
        keyboard_light: { label: 'Keyboard Light', options: ['YES', 'NO'] }
    },
    ports_connectivity: {
        usb_ports: { label: 'All USB Ports', options: ['WORKING', 'NOT WORKING'] },
        vga_hdmi: { label: 'VGA or HDMI', options: ['WORKING', 'NOT WORKING'] },
        lan_port: { label: 'LAN Port', options: ['WORKING', 'NOT WORKING'] },
        wifi_test: { label: 'WiFi Test (2.4 / 5 GHz)', options: ['WORKING', 'NOT WORKING'] },
        power_adapter: { label: 'Power Adapter & Watt', options: ['WORKING', 'NOT WORKING'] },
        bluetooth: { label: 'Bluetooth Check', options: ['WORKING', 'NOT WORKING'] },
        audio_jack: { label: 'Audio Jack', options: ['YES', 'NO'] }
    },
    display_audio: {
        speaker: { label: 'Speaker', options: ['WORKING', 'NOT WORKING'] },
        screen_resolution: { label: 'Screen Resolution', options: ['PASS', 'FAIL'] },
        refresh_rate: { label: 'Display Adapter Refresh Rate Set', options: ['YES', 'NO'] },
        touch_screen: { label: 'Touch Screen', options: ['YES', 'NO'] }
    },
    power_storage: {
        ssd_health: { label: 'SSD Health', options: ['GOOD', 'AVERAGE', 'BAD'] },
        battery_health: { label: 'Battery Health', options: ['GOOD', 'AVERAGE', 'BAD'] }
    },
    hardware_expandability: {
        expandability: { label: 'Hard Drive, RAM Type & Expandable Possibility', options: ['YES', 'NO'] }
    },
    part_replacement: {
        parts_replaced: { label: 'Any Part Replaced', options: ['YES', 'NO'] }
    }
};

const CHECKLIST_POSITIVE_VALUES = new Set(['YES', 'WORKING', 'INSTALLED', 'PASS', 'GOOD', 'AVERAGE']);

function buildChecklistSummary(checklistData) {
    if (!checklistData) return [];

    const labelMap = Object.values(QC_CHECKLIST_STRUCTURE).reduce((acc, section) => {
        Object.entries(section).forEach(([key, config]) => {
            acc[key] = config.label;
        });
        return acc;
    }, {});

    return Object.entries(checklistData)
        .filter(([, value]) => CHECKLIST_POSITIVE_VALUES.has(value))
        .map(([key]) => labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
}

// Calculate QC Result based on checklist
function calculateQCResult(checklistData) {
    const criticalFailures = [
        checklistData.keyboard === 'NOT WORKING',
        checklistData.touchpad === 'NOT WORKING',
        checklistData.usb_ports === 'NOT WORKING',
        checklistData.wifi_test === 'NOT WORKING',
        checklistData.battery_health === 'BAD',
        checklistData.ssd_health === 'BAD',
        checklistData.screen_resolution === 'FAIL'
    ];

    const failureReasons = [];
    if (checklistData.keyboard === 'NOT WORKING') failureReasons.push('Keyboard not working');
    if (checklistData.touchpad === 'NOT WORKING') failureReasons.push('Touchpad not working');
    if (checklistData.usb_ports === 'NOT WORKING') failureReasons.push('USB ports not working');
    if (checklistData.wifi_test === 'NOT WORKING') failureReasons.push('WiFi not working');
    if (checklistData.battery_health === 'BAD') failureReasons.push('Battery health BAD');
    if (checklistData.ssd_health === 'BAD') failureReasons.push('SSD health BAD');
    if (checklistData.screen_resolution === 'FAIL') failureReasons.push('Screen resolution failed');

    return {
        result: criticalFailures.some(f => f) ? 'FAIL' : 'PASS',
        reasons: failureReasons
    };
}

// Get QC data for a ticket
exports.getQCData = async (req, res) => {
    const { id } = req.params;
    const { qc_stage } = req.query; // 'QC1' or 'QC2'

    try {
        // Get ticket details for header auto-fill
        const ticketRes = await pool.query(
            `SELECT t.*, i.processor, i.ram as ram_size, i.storage as storage_type 
             FROM tickets t
             LEFT JOIN inventory i ON t.serial_number = i.serial_number
             WHERE t.ticket_id = $1`,
            [id]
        );

        if (ticketRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const ticket = ticketRes.rows[0];

        // Get existing QC result if any
        const qcRes = await pool.query(
            `SELECT * FROM qc_results WHERE ticket_id = $1 AND qc_stage = $2`,
            [id, qc_stage || 'QC1']
        );

        const qcResult = qcRes.rows[0] || null;

        // Get photos if QC exists
        let photos = [];
        if (qcResult) {
            const photoRes = await pool.query(
                `SELECT * FROM qc_photos WHERE qc_id = $1`,
                [qcResult.qc_id]
            );
            photos = photoRes.rows;
        }

        res.json({
            success: true,
            ticket,
            qcResult,
            photos,
            checklistStructure: QC_CHECKLIST_STRUCTURE
        });

    } catch (error) {
        console.error('Get QC data error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Save QC draft
exports.saveQC = async (req, res) => {
    const { id } = req.params;
    const { qcStage, header, checklist, grading, remarks, replacedParts } = req.body;
    const userId = req.user.user_id;

    try {
        // Check if QC already exists
        const existing = await pool.query(
            `SELECT qc_id FROM qc_results WHERE ticket_id = $1 AND qc_stage = $2`,
            [id, qcStage]
        );

        if (existing.rows.length > 0) {
            // Update existing
            await pool.query(
                `UPDATE qc_results 
                 SET processor = $1, generation = $2, storage_type = $3, ram_size = $4,
                     checklist_data = $5, final_grade = $6, grade_notes = $7, remarks = $8,
                     parts_replaced = $9, replaced_parts = $10, tested_by = $11
                 WHERE qc_id = $12`,
                [
                    header.processor, header.generation, header.storage_type, header.ram_size,
                    JSON.stringify(checklist), grading?.final_grade, grading?.grade_notes, remarks,
                    replacedParts && replacedParts.length > 0, JSON.stringify(replacedParts || []),
                    userId, existing.rows[0].qc_id
                ]
            );

            res.json({ success: true, message: 'QC draft saved', qc_id: existing.rows[0].qc_id });
        } else {
            // Insert new
            const result = await pool.query(
                `INSERT INTO qc_results 
                 (ticket_id, qc_stage, processor, generation, storage_type, ram_size, 
                  checklist_data, final_grade, grade_notes, remarks, parts_replaced, 
                  replaced_parts, tested_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING qc_id`,
                [
                    id, qcStage, header.processor, header.generation, header.storage_type, header.ram_size,
                    JSON.stringify(checklist), grading?.final_grade, grading?.grade_notes, remarks,
                    replacedParts && replacedParts.length > 0, JSON.stringify(replacedParts || []),
                    userId
                ]
            );

            res.json({ success: true, message: 'QC draft created', qc_id: result.rows[0].qc_id });
        }

    } catch (error) {
        console.error('Save QC error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Submit QC and route ticket
exports.submitQC = async (req, res) => {
    const { id } = req.params;
    const { qcStage, header, checklist, grading, remarks, replacedParts, signOff } = req.body;
    const userId = req.user.user_id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const ticketMetaRes = await client.query(
            `SELECT serial_number, machine_number FROM tickets WHERE ticket_id = $1`,
            [id]
        );
        const serialNumber = ticketMetaRes.rows[0]?.serial_number || null;
        const machineNumber = ticketMetaRes.rows[0]?.machine_number || null;

        // Calculate QC result
        const { result, reasons } = calculateQCResult(checklist);

        // Save or update QC result
        const qcCheck = await client.query(
            `SELECT qc_id FROM qc_results WHERE ticket_id = $1 AND qc_stage = $2`,
            [id, qcStage]
        );

        let qcId;
        if (qcCheck.rows.length > 0) {
            qcId = qcCheck.rows[0].qc_id;
            await client.query(
                `UPDATE qc_results 
                 SET processor = $1, generation = $2, storage_type = $3, ram_size = $4,
                     checklist_data = $5, final_grade = $6, grade_notes = $7, remarks = $8,
                     parts_replaced = $9, replaced_parts = $10, qc_result = $11, failure_reasons = $12,
                     tested_by = $13, checked_by = $14, qc_date = $15, is_locked = true, submitted_at = CURRENT_TIMESTAMP
                 WHERE qc_id = $16`,
                [
                    header.processor, header.generation, header.storage_type, header.ram_size,
                    JSON.stringify(checklist), grading.final_grade, grading.grade_notes, remarks,
                    replacedParts && replacedParts.length > 0, JSON.stringify(replacedParts || []),
                    result, reasons, userId, signOff?.checked_by || userId, new Date(), qcId
                ]
            );
        } else {
            const insertRes = await client.query(
                `INSERT INTO qc_results 
                 (ticket_id, qc_stage, processor, generation, storage_type, ram_size, 
                  checklist_data, final_grade, grade_notes, remarks, parts_replaced, 
                  replaced_parts, qc_result, failure_reasons, tested_by, checked_by, qc_date, 
                  is_locked, submitted_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true, CURRENT_TIMESTAMP)
                 RETURNING qc_id`,
                [
                    id, qcStage, header.processor, header.generation, header.storage_type, header.ram_size,
                    JSON.stringify(checklist), grading.final_grade, grading.grade_notes, remarks,
                    replacedParts && replacedParts.length > 0, JSON.stringify(replacedParts || []),
                    result, reasons, userId, signOff?.checked_by || userId, new Date()
                ]
            );
            qcId = insertRes.rows[0].qc_id;
        }

        // Update ticket grade from QC (QC1 and QC2)
        await client.query(
            `UPDATE tickets SET final_grade = $1 WHERE ticket_id = $2`,
            [grading.final_grade, id]
        );

        if (serialNumber || machineNumber) {
            await client.query(
                `UPDATE inventory SET grade = $1 WHERE serial_number = $2 OR machine_number = $3`,
                [grading.final_grade, serialNumber, machineNumber]
            );
        }

        // Route ticket based on result
        let nextStage;
        if (result === 'PASS') {
            if (qcStage === 'QC1') {
                nextStage = 'QC2';
            } else if (qcStage === 'QC2') {
                nextStage = 'Inventory';
            }
        } else {
            // FAIL - return to Assembly & Software
            nextStage = 'Assembly & Software';
        }

        // Get next stage ID
        const stageRes = await client.query(
            `SELECT stage_id, team_id FROM stages WHERE stage_name = $1 LIMIT 1`,
            [nextStage]
        );

        if (stageRes.rows.length > 0) {
            const { stage_id, team_id } = stageRes.rows[0];
            const isCompleted = nextStage === 'Inventory';

            await client.query(
                `UPDATE tickets 
                 SET current_stage_id = $1, assigned_team_id = $2, assigned_user_id = NULL,
                     status = $4::varchar, completed_at = CASE WHEN $4::varchar = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
                 WHERE ticket_id = $3`,
                [stage_id, team_id, id, isCompleted ? 'completed' : 'in_progress']
            );

            if (isCompleted && (serialNumber || machineNumber)) {
                await client.query(
                    `UPDATE inventory 
                     SET status = 'In Stock', stock_type = 'Ready', stage = 'Inventory'
                     WHERE serial_number = $1 OR machine_number = $2`,
                    [serialNumber, machineNumber]
                );
            } else if (serialNumber || machineNumber) {
                await client.query(
                    `UPDATE inventory SET stage = $1 WHERE serial_number = $2 OR machine_number = $3`,
                    [nextStage, serialNumber, machineNumber]
                );
            }

            const checklistItems = buildChecklistSummary(checklist);
            const checklistNote = checklistItems.length > 0 ? ` | Checklist: ${checklistItems.join(', ')}` : '';

            // Log activity
            await client.query(
                `INSERT INTO activities (ticket_id, stage_id, user_id, action, notes)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    id, stage_id, userId, `qc_${qcStage.toLowerCase()}_submitted`,
                    `${qcStage} completed. Result: ${result}. Grade: ${grading.final_grade}. Next: ${nextStage}${checklistNote}`
                ]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: `${qcStage} submitted successfully`,
            result,
            nextStage,
            qcId
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Submit QC error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        client.release();
    }
};

// Upload QC photo
exports.uploadPhoto = async (req, res) => {
    const { qc_id } = req.params;

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        const photoPath = req.file.path.replace(/\\/g, '/');

        await pool.query(
            `INSERT INTO qc_photos (qc_id, photo_path) VALUES ($1, $2)`,
            [qc_id, photoPath]
        );

        res.json({ success: true, photoPath });

    } catch (error) {
        console.error('Upload photo error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get QC history for a ticket
exports.getQCHistory = async (req, res) => {
    const { ticket_id } = req.params;

    try {
        const results = await pool.query(
            `SELECT qr.*, u1.name as tested_by_name, u2.name as checked_by_name
             FROM qc_results qr
             LEFT JOIN users u1 ON qr.tested_by = u1.user_id
             LEFT JOIN users u2 ON qr.checked_by = u2.user_id
             WHERE qr.ticket_id = $1
             ORDER BY qr.qc_stage, qr.submitted_at DESC`,
            [ticket_id]
        );

        res.json({ success: true, history: results.rows });

    } catch (error) {
        console.error('Get QC history error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = exports;
