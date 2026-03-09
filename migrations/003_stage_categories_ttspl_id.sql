-- Stage categories and TTSPL ID
-- Run: node run-migrations.js

-- 1. Add stage_category to stages
ALTER TABLE stages ADD COLUMN IF NOT EXISTS stage_category VARCHAR(100);

-- 2. Set stage categories
-- Hardware & Software: Diagnosis (2), Assembly & Software (7), Final Testing (8)
-- QC Team: QC1 (9), QC2 (10)
UPDATE stages SET stage_category = 'Hardware & Software'
WHERE stage_name IN ('Diagnosis', 'Assembly & Software', 'Final Testing');

UPDATE stages SET stage_category = 'QC Team'
WHERE stage_name IN ('QC1', 'QC2');

-- 3. Add ttspl_id to tickets (nullable for existing tickets)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ttspl_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_tickets_ttspl_id ON tickets(ttspl_id);
CREATE INDEX IF NOT EXISTS idx_stages_category ON stages(stage_category);
