-- For Apple brand in laptop_catalog: set generation = processor
-- Run on Hostinger: docker exec -i laptop-erp-postgres psql -U postgres -d postgres < migrations/017_apple_generation_laptop_catalog.sql

UPDATE laptop_catalog
SET generation = processor
WHERE brand ILIKE 'Apple';
