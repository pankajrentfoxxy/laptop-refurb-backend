-- For Apple brand: set generation = processor (Apple uses processor name as generation)
-- Run on Hostinger: docker exec -i laptop-erp-postgres psql -U postgres -d postgres < migrations/016_apple_generation_from_processor.sql

UPDATE order_items
SET generation = processor
WHERE brand ILIKE 'Apple';
