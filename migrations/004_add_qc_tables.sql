-- Migration: Add QC-1/QC-2 Module Tables
-- Author: System
-- Date: 2026-02-09

-- Table: qc_results
-- Stores QC-1 and QC-2 checklist results with grading
CREATE TABLE IF NOT EXISTS qc_results (
    qc_id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(ticket_id),
    qc_stage VARCHAR(10) NOT NULL CHECK (qc_stage IN ('QC1', 'QC2')),
    
    -- Header (Auto-filled/Selected)
    processor VARCHAR(20), -- i3/i5/i7
    generation VARCHAR(20),
    storage_type VARCHAR(50), -- 120GB/128GB/240GB/256GB/500GB/512GB
    ram_size VARCHAR(20), -- 8GB/16GB/32GB
    
    -- Checklist Data (JSONB for flexibility - same structure for QC1 and QC2)
    checklist_data JSONB NOT NULL,
    
    -- Part Replacement (manual entry)
    parts_replaced BOOLEAN DEFAULT FALSE,
    replaced_parts JSONB, -- [{part_code, part_name, serial_number}]
    
    -- Result
    qc_result VARCHAR(20), -- PASS/FAIL
    failure_reasons TEXT[],
    remarks TEXT,
    
    -- Grading (required for both QC-1 and QC-2)
    final_grade VARCHAR(50), -- Brand New, New, Slightly Scratched, Old / Heavy Usage, Poor Condition
    grade_notes TEXT,
    
    -- Sign-off
    tested_by INTEGER REFERENCES users(user_id),
    checked_by INTEGER REFERENCES users(user_id),
    qc_date DATE,
    dispatch_date DATE,
    
    -- Audit
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    
    CONSTRAINT unique_ticket_qc_stage UNIQUE (ticket_id, qc_stage)
);

-- Table: qc_photos
-- Optional photos for QC failures
CREATE TABLE IF NOT EXISTS qc_photos (
    photo_id SERIAL PRIMARY KEY,
    qc_id INTEGER REFERENCES qc_results(qc_id) ON DELETE CASCADE,
    photo_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qc_results_ticket ON qc_results(ticket_id);
CREATE INDEX IF NOT EXISTS idx_qc_results_stage ON qc_results(qc_stage);
CREATE INDEX IF NOT EXISTS idx_qc_results_result ON qc_results(qc_result);

-- Update tickets table to store final_grade (from QC-2)
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS final_grade VARCHAR(50);

COMMENT ON TABLE qc_results IS 'QC-1 and QC-2 quality check results with grading';
COMMENT ON TABLE qc_photos IS 'Optional photos for QC failures or issues';
