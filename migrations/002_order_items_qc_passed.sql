-- Per-item QC pass: allow QC to pass each laptop individually for multi-laptop orders
-- Run: psql -U postgres -d postgres -f migrations/002_order_items_qc_passed.sql

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS qc_passed BOOLEAN DEFAULT false;

-- Backfill: orders already in QC Passed have all items implicitly passed
UPDATE order_items SET qc_passed = true
WHERE order_id IN (SELECT order_id FROM orders WHERE status = 'QC Passed')
  AND (qc_passed IS NULL OR qc_passed = false);

CREATE INDEX IF NOT EXISTS idx_order_items_qc_passed ON order_items(order_id, qc_passed);
