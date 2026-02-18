BEGIN;

ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS generation VARCHAR(80),
    ADD COLUMN IF NOT EXISTS gpu VARCHAR(120),
    ADD COLUMN IF NOT EXISTS screen_size VARCHAR(40);

-- Clear inventory as requested before ERP-driven re-sync.
UPDATE order_items
SET inventory_id = NULL
WHERE inventory_id IS NOT NULL;

DELETE FROM inventory;
ALTER SEQUENCE IF EXISTS inventory_inventory_id_seq RESTART WITH 1;

COMMIT;
