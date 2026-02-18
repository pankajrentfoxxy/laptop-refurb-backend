-- ============================================================================
-- LAPTOP REFURBISHMENT SYSTEM - DATABASE SETUP
-- ============================================================================

-- TABLE CREATION, INDEXES, TRIGGERS, AND SEED DATA
-- Run this file in your PostgreSQL database

-- ============================================================================
-- TABLE CREATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL,
    manager_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'team_lead', 'team_member', 'viewer', 'floor_manager')),
    team_id INTEGER REFERENCES teams(team_id),
    active BOOLEAN DEFAULT true,
    barcode VARCHAR(100) UNIQUE,
    permissions TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stages (
    stage_id SERIAL PRIMARY KEY,
    stage_name VARCHAR(100) NOT NULL,
    stage_order INTEGER NOT NULL,
    team_id INTEGER REFERENCES teams(team_id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
    ticket_id SERIAL PRIMARY KEY,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    brand VARCHAR(50),
    model VARCHAR(100),
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'on_hold')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    current_stage_id INTEGER REFERENCES stages(stage_id),
    assigned_team_id INTEGER REFERENCES teams(team_id),
    assigned_user_id INTEGER REFERENCES users(user_id),
    initial_condition TEXT,
    final_grade VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
    lead_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'New Lead',
    owner_user_id INTEGER REFERENCES users(user_id),
    delivery_date DATE,
    shipping_address TEXT,
    dispatch_date DATE,
    tracker_id VARCHAR(100),
    courier_partner VARCHAR(100),
    dispatched_at TIMESTAMP,
    estimated_delivery DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS procurement_requests (
    request_id SERIAL PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items(item_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'New',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS activities (
    activity_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    user_id INTEGER REFERENCES users(user_id),
    action VARCHAR(50) NOT NULL,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parts (
    part_id SERIAL PRIMARY KEY,
    part_name VARCHAR(100) NOT NULL,
    part_type VARCHAR(50),
    quantity INTEGER DEFAULT 0,
    vendor VARCHAR(100),
    cost DECIMAL(10, 2),
    location_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_parts (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    part_id INTEGER REFERENCES parts(part_id),
    quantity_used INTEGER NOT NULL,
    notes TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photos (
    photo_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(20) CHECK (photo_type IN ('before', 'after', 'issue', 'repair')),
    uploaded_by INTEGER REFERENCES users(user_id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stage_checklists (
    checklist_id SERIAL PRIMARY KEY,
    stage_id INTEGER REFERENCES stages(stage_id),
    checklist_items JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_checklist_progress (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    stage_id INTEGER REFERENCES stages(stage_id),
    checklist_data JSONB NOT NULL,
    completed_by INTEGER REFERENCES users(user_id),
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chip_level_repairs (
    repair_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id) UNIQUE,
    created_by INTEGER REFERENCES users(user_id),
    updated_by INTEGER REFERENCES users(user_id),
    status VARCHAR(50) DEFAULT 'in_progress',
    issues TEXT[] DEFAULT '{}'::text[],
    issue_notes TEXT,
    parts_required BOOLEAN DEFAULT false,
    parts_notes TEXT,
    resolved_checks TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tickets_serial ON tickets(serial_number);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_stage ON tickets(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_activities_ticket ON activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_ticket ON photos(ticket_id);

-- TRIGGERS
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

-- SEED DATA
INSERT INTO teams (team_name) VALUES
('Warehouse Team'),('Diagnose Team'),('Chip Level Repair Team'),('Dismantle Team'),('Procurement Team'),
('Vendor (Body & Paint)'),('Assembly & Software Team'),('Testing Team'),
('QC1 Team'),('QC2 Team'),('Inventory Team')
ON CONFLICT DO NOTHING;

INSERT INTO stages (stage_name, stage_order, team_id, description) VALUES
('Floor Manager', 1, 1, 'Receive laptop and create initial ticket'),
('Diagnosis', 2, 2, 'Full hardware and cosmetic diagnosis'),
('Chip Level Repair', 3, 3, 'Motherboard and chip-level repairs'),
('Dismantle', 4, 4, 'Parts tagging and removal'),
('Procurement', 5, 5, 'Source required parts'),
('Body & Paint', 6, 6, 'Body repair and paint work'),
('Assembly & Software', 7, 7, 'Repair, replacement, and software installation'),
('Final Testing', 8, 8, 'Final system validation and defect resolution'),
('QC1', 9, 9, 'First quality check - 50+ points'),
('QC2', 10, 10, 'Second quality check - final verification'),
('Inventory', 11, 11, 'Add to final inventory')
ON CONFLICT DO NOTHING;

-- Default password is: admin123
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
