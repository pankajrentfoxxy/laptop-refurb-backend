ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(user_id);

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS is_wfh BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estimate_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS destination_pincode VARCHAR(20),
    ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(30) DEFAULT 'Not Dispatched',
    ADD COLUMN IF NOT EXISTS item_tracker_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS item_courier_partner VARCHAR(120),
    ADD COLUMN IF NOT EXISTS item_dispatch_date DATE,
    ADD COLUMN IF NOT EXISTS item_estimated_delivery DATE,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

UPDATE order_items
SET tracking_status = CASE
    WHEN tracking_status IS NOT NULL THEN tracking_status
    WHEN o.status = 'Delivered' THEN 'Delivered'
    WHEN o.status = 'Dispatched' THEN 'On The Way'
    ELSE 'Not Dispatched'
END
FROM orders o
WHERE o.order_id = order_items.order_id;

CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_tracking_status ON order_items(order_id, tracking_status);
CREATE INDEX IF NOT EXISTS idx_order_items_destination ON order_items(order_id, destination_pincode);
