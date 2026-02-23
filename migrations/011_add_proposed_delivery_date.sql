-- Add per-item proposed delivery date (customer requested) to order_items
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS proposed_delivery_date DATE;
