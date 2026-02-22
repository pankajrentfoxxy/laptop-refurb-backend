-- Add address_type to customer_addresses (Billing, Shipping, etc.)
ALTER TABLE customer_addresses
    ADD COLUMN IF NOT EXISTS address_type VARCHAR(30);

-- Add address_type to lead_addresses for lead-to-deal flow
ALTER TABLE lead_addresses
    ADD COLUMN IF NOT EXISTS address_type VARCHAR(30);
