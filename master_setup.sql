-- ============================================================================
-- LAPTOP REFURBISHMENT SYSTEM - MASTER SETUP
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLES
CREATE TABLE IF NOT EXISTS teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL,
    manager_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'sales', 'team_lead', 'team_member', 'viewer', 'floor_manager')),
    team_id INTEGER REFERENCES teams(team_id),
    active BOOLEAN DEFAULT true,
    barcode VARCHAR(100) UNIQUE,
    permissions TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stages (
    stage_id SERIAL PRIMARY KEY,
    stage_name VARCHAR(100) NOT NULL,
    stage_order INTEGER NOT NULL,
    team_id INTEGER REFERENCES teams(team_id),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
    ticket_id SERIAL PRIMARY KEY,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    machine_number VARCHAR(100),
    brand VARCHAR(50),
    model VARCHAR(100),
    processor VARCHAR(100),
    ram VARCHAR(50),
    storage VARCHAR(50),
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'on_hold')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    current_stage_id INTEGER REFERENCES stages(stage_id),
    assigned_team_id INTEGER REFERENCES teams(team_id),
    assigned_user_id INTEGER REFERENCES users(user_id),
    initial_condition TEXT,
    final_grade VARCHAR(10),
    initial_cost DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS inventory (
    inventory_id SERIAL PRIMARY KEY,
    stock_type VARCHAR(50) NOT NULL CHECK (stock_type IN ('Cooling Period', 'Ready')),
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('Laptop', 'Desktop')),
    machine_number VARCHAR(100) UNIQUE NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    processor VARCHAR(100),
    ram VARCHAR(50),
    storage VARCHAR(50),
    grade VARCHAR(10),
    status VARCHAR(50) DEFAULT 'In Stock',
    stage VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS laptop_catalog (
    catalog_id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(120),
    processor VARCHAR(120),
    generation VARCHAR(80),
    ram VARCHAR(50),
    storage VARCHAR(50),
    device_type VARCHAR(50) DEFAULT 'Laptop',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_laptop_catalog UNIQUE (brand, model, processor, generation, ram, storage, device_type)
);

CREATE TABLE IF NOT EXISTS activities (
    activity_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    user_id INTEGER REFERENCES users(user_id),
    action VARCHAR(50) NOT NULL,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_logs (
    log_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    user_id INTEGER REFERENCES users(user_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parts (
    part_id SERIAL PRIMARY KEY,
    part_name VARCHAR(100) NOT NULL,
    part_type VARCHAR(50),
    quantity INTEGER DEFAULT 0,
    vendor VARCHAR(100),
    cost DECIMAL(10, 2),
    location_code VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_parts (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    part_id INTEGER REFERENCES parts(part_id),
    quantity_used INTEGER NOT NULL,
    notes TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photos (
    photo_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(20) CHECK (photo_type IN ('before', 'after', 'issue', 'repair')),
    uploaded_by INTEGER REFERENCES users(user_id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stage_checklists (
    checklist_id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES stages(stage_id),
    checklist_items JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS part_requests (
    request_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    requested_by INTEGER REFERENCES users(user_id),
    part_name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_services (
    service_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    service_type VARCHAR(255) NOT NULL,
    cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
    added_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_checklist_progress (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    checklist_data JSONB NOT NULL,
    completed_by INTEGER REFERENCES users(user_id),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    gst_no VARCHAR(50),
    type VARCHAR(50) DEFAULT 'New',
    details JSONB,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
    lead_type VARCHAR(50),
    order_type VARCHAR(20) DEFAULT 'Sales' CHECK (order_type IN ('Sales', 'Rent', 'Demo')),
    status VARCHAR(50) DEFAULT 'New Lead',
    owner_user_id INTEGER REFERENCES users(user_id),
    lockin_period_days INTEGER DEFAULT 0,
    security_amount DECIMAL(10, 2) DEFAULT 0,
    is_wfh BOOLEAN DEFAULT false,
    shipping_charge DECIMAL(10, 2) DEFAULT 0,
    shipping_gst_amount DECIMAL(10, 2) DEFAULT 0,
    subtotal_amount DECIMAL(12, 2) DEFAULT 0,
    items_gst_amount DECIMAL(12, 2) DEFAULT 0,
    grand_total_amount DECIMAL(12, 2) DEFAULT 0,
    invoice_number VARCHAR(100),
    invoice_generated_at TIMESTAMP WITH TIME ZONE,
    eway_bill_number VARCHAR(100),
    eway_bill_generated_at TIMESTAMP WITH TIME ZONE,
    delivery_date DATE,
    shipping_address TEXT,
    dispatch_date DATE,
    tracker_id VARCHAR(100),
    courier_partner VARCHAR(100),
    dispatched_at TIMESTAMP WITH TIME ZONE,
    estimated_delivery DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    brand VARCHAR(100),
    processor VARCHAR(100),
    ram VARCHAR(50),
    storage VARCHAR(50),
    quantity INTEGER DEFAULT 1,
    preferred_model VARCHAR(100),
    status VARCHAR(50) DEFAULT 'New',
    inventory_id INTEGER REFERENCES inventory(inventory_id),
    unit_price DECIMAL(10, 2) DEFAULT 0,
    gst_percent DECIMAL(5, 2) DEFAULT 18,
    gst_amount DECIMAL(10, 2) DEFAULT 0,
    total_with_gst DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lead Intelligence & Sales Management
CREATE TABLE IF NOT EXISTS leads (
    lead_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    city VARCHAR(100),
    source VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Cold', 'Warm', 'Hot', 'Gone', 'Hold', 'Rejected', 'Call Back', 'Deal')),
    assigned_user_id INTEGER REFERENCES users(user_id),
    assigned_by INTEGER REFERENCES users(user_id),
    assigned_at TIMESTAMP WITH TIME ZONE,
    follow_up_date TIMESTAMP WITH TIME ZONE,
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of INTEGER REFERENCES leads(lead_id),
    rejection_reason TEXT,
    research_status VARCHAR(50) DEFAULT 'pending' CHECK (research_status IN ('pending', 'completed', 'failed')),
    research_requested_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_activities (
    activity_id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(lead_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id),
    action VARCHAR(50),
    status_from VARCHAR(50),
    status_to VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_assignments (
    assignment_id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(lead_id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(user_id),
    assigned_by INTEGER REFERENCES users(user_id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    batch_id UUID
);

CREATE TABLE IF NOT EXISTS lead_company_research (
    research_id SERIAL PRIMARY KEY,
    lead_id INTEGER UNIQUE REFERENCES leads(lead_id) ON DELETE CASCADE,
    cin VARCHAR(100),
    entity_type VARCHAR(100),
    roc VARCHAR(100),
    revenue VARCHAR(100),
    employees VARCHAR(100),
    gst VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    raw_response JSONB,
    researched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_orders (
    lead_order_id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(lead_id) ON DELETE CASCADE,
    order_status VARCHAR(50) DEFAULT 'New',
    amount DECIMAL(10, 2) DEFAULT 0,
    details JSONB,
    created_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_queue (
    email_id SERIAL PRIMARY KEY,
    to_email VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT,
    body_html TEXT,
    dedupe_key VARCHAR(255) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_followup_notifications (
    notification_id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(lead_id) ON DELETE CASCADE,
    follow_up_at TIMESTAMP WITH TIME ZONE NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'email',
    notified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_lead_followup_email_notification UNIQUE (lead_id, follow_up_at, recipient_email, channel)
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_lead_orders_lead_id ON lead_orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status_schedule ON email_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_lead_followup_notifications_lead ON lead_followup_notifications(lead_id);

CREATE TABLE IF NOT EXISTS procurement_requests (
    request_id SERIAL PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items(item_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'New',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qc_results (
    qc_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    qc_stage VARCHAR(10) NOT NULL CHECK (qc_stage IN ('QC1', 'QC2')),
    processor VARCHAR(20),
    generation VARCHAR(20),
    storage_type VARCHAR(50),
    ram_size VARCHAR(20),
    checklist_data JSONB NOT NULL,
    parts_replaced BOOLEAN DEFAULT FALSE,
    replaced_parts JSONB,
    qc_result VARCHAR(20),
    failure_reasons TEXT[],
    remarks TEXT,
    final_grade VARCHAR(50),
    grade_notes TEXT,
    tested_by INTEGER REFERENCES users(user_id),
    checked_by INTEGER REFERENCES users(user_id),
    qc_date DATE,
    dispatch_date DATE,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    CONSTRAINT unique_ticket_qc_stage UNIQUE (ticket_id, qc_stage)
);

CREATE TABLE IF NOT EXISTS qc_photos (
    photo_id SERIAL PRIMARY KEY,
    qc_id INTEGER REFERENCES qc_results(qc_id) ON DELETE CASCADE,
    photo_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_tickets_serial ON tickets(serial_number);
CREATE INDEX IF NOT EXISTS idx_tickets_machine ON tickets(machine_number);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_inventory_machine ON inventory(machine_number);
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory(serial_number);
CREATE INDEX IF NOT EXISTS idx_activities_ticket ON activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_ticket ON work_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_active ON work_logs(ticket_id) WHERE end_time IS NULL;

-- 4. TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory;
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. SEED DATA
INSERT INTO teams (team_name) VALUES
('Warehouse Team'),('Diagnose Team'),('Chip Level Repair Team'),('Dismantle Team'),('Procurement Team'),
('Vendor (Body & Paint)'),('Assembly & Software Team'),('Testing Team'),
('QC1 Team'),('QC2 Team'),('Inventory Team')
ON CONFLICT DO NOTHING;

INSERT INTO stages (stage_name, stage_order, team_id, description)
SELECT v.stage_name, v.stage_order, t.team_id, v.description
FROM (
  VALUES
    ('Floor Manager', 1, 'Warehouse Team', 'Receive laptop and create initial ticket'),
    ('Diagnosis', 2, 'Diagnose Team', 'Full hardware and cosmetic diagnosis'),
    ('Chip Level Repair', 3, 'Chip Level Repair Team', 'Motherboard and chip-level repairs'),
    ('Dismantle', 4, 'Dismantle Team', 'Parts tagging and removal'),
    ('Procurement', 5, 'Procurement Team', 'Source required parts'),
    ('Body & Paint', 6, 'Vendor (Body & Paint)', 'Body repair and paint work'),
    ('Assembly & Software', 7, 'Assembly & Software Team', 'Repair, replacement, and software installation'),
    ('Final Testing', 8, 'Testing Team', 'Final system validation and defect resolution'),
    ('QC1', 9, 'QC1 Team', 'First quality check - 50+ points'),
    ('QC2', 10, 'QC2 Team', 'Second quality check - final verification'),
    ('Inventory', 11, 'Inventory Team', 'Add to final inventory')
) AS v(stage_name, stage_order, team_name, description)
JOIN teams t ON t.team_name = v.team_name
ON CONFLICT DO NOTHING;

-- Admin User: admin@rentfoxxy.com / admin123
INSERT INTO users (name, email, password_hash, role, active) VALUES
('Admin User', 'admin@rentfoxxy.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO parts (part_name, part_type, quantity, vendor, cost) VALUES
('15.6" LCD Screen', 'display', 20, 'TechParts Inc', 89.99),
('Keyboard US Layout', 'keyboard', 30, 'TechParts Inc', 25.00),
('Battery 6-Cell', 'battery', 15, 'PowerSupply Co', 45.00),
('256GB SSD', 'storage', 25, 'StorageWorld', 35.00),
('512GB SSD', 'storage', 10, 'StorageWorld', 65.00),
('8GB RAM DDR4', 'memory', 40, 'MemoryMart', 30.00),
('16GB RAM DDR4', 'memory', 20, 'MemoryMart', 60.00),
('Cooling Fan', 'cooling', 15, 'TechParts Inc', 15.00),
('Touchpad', 'input', 10, 'TechParts Inc', 20.00),
('Webcam Module', 'camera', 12, 'TechParts Inc', 18.00)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- DIAGNOSIS WORKFLOW TABLES
-- ============================================================================

-- Main diagnosis results table
CREATE TABLE IF NOT EXISTS diagnosis_results (
    diagnosis_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id) UNIQUE,
    diagnosed_by INTEGER REFERENCES users(user_id),
    diagnosed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
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
    next_team TEXT,
    remarks TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'In Progress',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Images for diagnosis (mandatory when failures exist)
CREATE TABLE IF NOT EXISTS diagnosis_images (
    image_id SERIAL PRIMARY KEY,
    diagnosis_id INTEGER REFERENCES diagnosis_results(diagnosis_id) ON DELETE CASCADE,
    section_name VARCHAR(100),
    image_path TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Parts required based on diagnosis
CREATE TABLE IF NOT EXISTS diagnosis_parts_required (
    id SERIAL PRIMARY KEY,
    diagnosis_id INTEGER REFERENCES diagnosis_results(diagnosis_id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    part_name VARCHAR(255) NOT NULL,
    part_category VARCHAR(100),
    quantity INTEGER DEFAULT 1,
    is_available BOOLEAN DEFAULT FALSE,
    inventory_part_id INTEGER,
    status VARCHAR(50) DEFAULT 'Required',
    attached_by INTEGER REFERENCES users(user_id),
    attached_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chip Level Repair (L3) workflow
CREATE TABLE IF NOT EXISTS chip_level_repairs (
    repair_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id) UNIQUE,
    created_by INTEGER REFERENCES users(user_id),
    updated_by INTEGER REFERENCES users(user_id),
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'waiting_parts', 'completed')),
    issues TEXT[] DEFAULT '{}'::text[],
    issue_notes TEXT,
    parts_required BOOLEAN DEFAULT false,
    parts_notes TEXT,
    resolved_checks TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_diagnosis_ticket ON diagnosis_results(ticket_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_parts_ticket ON diagnosis_parts_required(ticket_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_parts_status ON diagnosis_parts_required(status);

