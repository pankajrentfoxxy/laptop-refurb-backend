/**
 * Add customer_type to orders: 'New' | 'Existing'
 * Run: node scripts/add-customer-type-to-orders.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/db');

(async () => {
  try {
    await pool.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) DEFAULT 'New'
    `);
    // Backfill: set Existing for customers who had orders before
    await pool.query(`
      UPDATE orders o SET customer_type = 'Existing'
      WHERE EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_id = o.customer_id
          AND o2.order_id < o.order_id
          AND (o2.cancelled_at IS NULL)
      )
    `);
    const r = await pool.query(`SELECT customer_type, COUNT(*) as cnt FROM orders GROUP BY customer_type`);
    console.log('customer_type counts:', r.rows);
    console.log('Done.');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
