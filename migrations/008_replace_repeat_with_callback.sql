-- Replace Repeat status with Call Back (customer not reachable, try again)
-- Migrate existing Repeat leads to Deal (they had same order-creation capability)
UPDATE leads SET status = 'Deal' WHERE status = 'Repeat';

-- Drop old CHECK constraint if it exists (PostgreSQL)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new CHECK constraint with Call Back instead of Repeat
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (
  status IN ('Pending', 'Cold', 'Warm', 'Hot', 'Gone', 'Hold', 'Rejected', 'Call Back', 'Deal')
);
