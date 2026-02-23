-- Add QC Team and Dispatch Team for order workflow (Procurement Team already exists)
INSERT INTO teams (team_name)
SELECT 'QC Team' WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'QC Team');

INSERT INTO teams (team_name)
SELECT 'Dispatch Team' WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'Dispatch Team');
