-- Diagnosis Tables Migration
-- Run this to add diagnosis workflow support

-- Main diagnosis results table
CREATE TABLE IF NOT EXISTS diagnosis_results (
    diagnosis_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id) UNIQUE,
    diagnosed_by INTEGER REFERENCES users(user_id),
    diagnosed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Section 1: Power & Boot
    power_on BOOLEAN,
    power_button_working BOOLEAN,
    boots_successfully BOOLEAN,
    bios_accessible BOOLEAN,
    bios_password_lock BOOLEAN,
    
    -- Section 2: Display
    display_on BOOLEAN,
    brightness_control BOOLEAN,
    no_flickering BOOLEAN,
    no_lines_spots BOOLEAN,
    webcam_working BOOLEAN,
    
    -- Section 3: Keyboard & Touchpad
    all_keys_working BOOLEAN,
    touchpad_working BOOLEAN,
    left_click_working BOOLEAN,
    right_click_working BOOLEAN,
    
    -- Section 4: Battery & Charging
    battery_detected BOOLEAN,
    battery_charging BOOLEAN,
    charging_port_tight BOOLEAN,
    battery_swollen BOOLEAN,
    
    -- Section 5: Storage
    storage_detected BOOLEAN,
    smart_status_ok BOOLEAN,
    no_bad_sectors BOOLEAN,
    
    -- Section 6: RAM
    ram_detected BOOLEAN,
    correct_capacity BOOLEAN,
    slot_1_working BOOLEAN,
    slot_2_working BOOLEAN,
    
    -- Section 7: Network
    wifi_detected BOOLEAN,
    wifi_connecting BOOLEAN,
    bluetooth_working BOOLEAN,
    
    -- Section 8: Ports
    usb_ports BOOLEAN,
    type_c BOOLEAN,
    hdmi BOOLEAN,
    audio_jack BOOLEAN,
    power_port BOOLEAN,
    
    -- Section 9: Thermal
    fan_spinning BOOLEAN,
    no_abnormal_noise BOOLEAN,
    heating_normal BOOLEAN,
    
    -- Section 10: Motherboard
    no_short BOOLEAN,
    no_rust_liquid BOOLEAN,
    no_ic_heating BOOLEAN,
    
    -- Section 11: Security & Locks
    bios_unlocked BOOLEAN,
    hdd_unlocked BOOLEAN,
    no_mdm_computrace BOOLEAN,
    
    -- Computed Flags (auto-calculated on submission)
    power_issue_flag BOOLEAN DEFAULT FALSE,
    display_replacement_required BOOLEAN DEFAULT FALSE,
    keyboard_replacement_required BOOLEAN DEFAULT FALSE,
    battery_replacement_required BOOLEAN DEFAULT FALSE,
    storage_replacement_required BOOLEAN DEFAULT FALSE,
    ram_slot_fault BOOLEAN DEFAULT FALSE,
    network_card_check BOOLEAN DEFAULT FALSE,
    port_repair_required BOOLEAN DEFAULT FALSE,
    cleaning_paste_required BOOLEAN DEFAULT FALSE,
    chip_level_repair_required BOOLEAN DEFAULT FALSE,
    security_hold BOOLEAN DEFAULT FALSE,
    
    -- Summary
    total_failures INTEGER DEFAULT 0,
    next_team TEXT, -- 'Dismantle', 'Repair', 'Hold', 'OS Installation'
    remarks TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'In Progress', -- 'In Progress', 'Completed'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Images for diagnosis (mandatory when failures exist)
CREATE TABLE IF NOT EXISTS diagnosis_images (
    image_id SERIAL PRIMARY KEY,
    diagnosis_id INTEGER REFERENCES diagnosis_results(diagnosis_id) ON DELETE CASCADE,
    section_name VARCHAR(100),
    image_path TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parts required based on diagnosis
CREATE TABLE IF NOT EXISTS diagnosis_parts_required (
    id SERIAL PRIMARY KEY,
    diagnosis_id INTEGER REFERENCES diagnosis_results(diagnosis_id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    part_name VARCHAR(255) NOT NULL,
    part_category VARCHAR(100), -- 'Display', 'Battery', 'Keyboard', 'RAM', 'Storage', 'Network', 'Motherboard', 'Thermal'
    quantity INTEGER DEFAULT 1,
    is_available BOOLEAN DEFAULT FALSE,
    inventory_part_id INTEGER, -- Links to parts inventory if available
    status VARCHAR(50) DEFAULT 'Required', -- 'Required', 'Requested', 'Fulfilled', 'Attached'
    attached_by INTEGER REFERENCES users(user_id),
    attached_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_diagnosis_ticket ON diagnosis_results(ticket_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_parts_ticket ON diagnosis_parts_required(ticket_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_parts_status ON diagnosis_parts_required(status);

-- Add comment
COMMENT ON TABLE diagnosis_results IS 'Stores diagnosis checklist results for each ticket';
COMMENT ON TABLE diagnosis_parts_required IS 'Tracks parts required after diagnosis, links to inventory/procurement';
