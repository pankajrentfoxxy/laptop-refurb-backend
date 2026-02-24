-- Add Warehouse Team and warehouse role
INSERT INTO teams (team_name) SELECT 'Warehouse Team' WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'Warehouse Team');

-- Add warehouse role to users (if constraint exists, it may need to be dropped first - handled in run-migrations)
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
--   role IN ('admin', 'manager', 'sales', 'team_lead', 'team_member', 'viewer', 'floor_manager', 'procurement', 'qc', 'dispatch', 'warehouse')
-- );
