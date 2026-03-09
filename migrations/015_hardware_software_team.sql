-- Hardware & Software Team: Single team for Diagnosis, Assembly & Software, Final Testing
-- DB name on Hostinger is 'postgres'. Run: docker exec -i laptop-erp-postgres psql -U postgres -d postgres < migrations/015_hardware_software_team.sql

-- 1. Create Hardware & Software team if not exists
INSERT INTO teams (team_name) 
SELECT 'Hardware & Software' 
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'Hardware & Software');

-- 2. Update stages: Diagnosis, Assembly & Software, Final Testing -> Hardware & Software team
UPDATE stages SET team_id = (SELECT team_id FROM teams WHERE team_name = 'Hardware & Software' LIMIT 1)
WHERE stage_name IN ('Diagnosis', 'Assembly & Software', 'Final Testing');

-- 3. Migrate existing users from Diagnose Team, Assembly & Software Team, Testing Team to Hardware & Software
UPDATE users SET team_id = (SELECT team_id FROM teams WHERE team_name = 'Hardware & Software' LIMIT 1)
WHERE team_id IN (
  SELECT team_id FROM teams WHERE team_name IN ('Diagnose Team', 'Assembly & Software Team', 'Testing Team')
);
