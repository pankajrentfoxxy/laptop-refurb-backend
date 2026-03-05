-- Multi-team support: users can be assigned to multiple teams (e.g. QC1 + QC2)
-- Run: psql -U postgres -d postgres -f migrations/001_user_teams.sql

CREATE TABLE IF NOT EXISTS user_teams (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_user_teams_user ON user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_user_teams_team ON user_teams(team_id);

-- Migrate existing users: copy team_id to user_teams
INSERT INTO user_teams (user_id, team_id)
SELECT user_id, team_id FROM users WHERE team_id IS NOT NULL
ON CONFLICT (user_id, team_id) DO NOTHING;
