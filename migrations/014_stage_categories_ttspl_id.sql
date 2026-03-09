-- Stage categories: Hardware & Software (Diagnosis, Assembly & Software, Final Testing), QC Team (QC1, QC2)
-- TTSPL ID for tickets

-- Add stage_category to stages
ALTER TABLE stages ADD COLUMN IF NOT EXISTS stage_category VARCHAR(100);

-- Set categories by stage name
UPDATE stages SET stage_category = 'Hardware & Software' WHERE stage_name IN ('Diagnosis', 'Assembly & Software', 'Final Testing');
UPDATE stages SET stage_category = 'QC Team' WHERE stage_name IN ('QC1', 'QC2');

-- Add ttspl_id to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ttspl_id VARCHAR(100);
