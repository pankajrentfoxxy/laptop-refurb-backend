-- Lead remarks for sales team to note customer queries
CREATE TABLE IF NOT EXISTS lead_remarks (
    remark_id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id),
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_remarks_lead ON lead_remarks(lead_id);
