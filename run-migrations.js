/**
 * Run schema migrations on Supabase/PostgreSQL
 * Usage: node run-migrations.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 6543,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function runMigration(name, sql) {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Running migrations...\n');

  // Migration 005: Order item level logistics (required for order creation)
  await runMigration('005_order_item_level_logistics', `
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS cancelled_by INTEGER;
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS gst_percent DECIMAL(5, 2) DEFAULT 18,
      ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_with_gst DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_wfh BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(30) DEFAULT 'Office',
      ADD COLUMN IF NOT EXISTS customer_address_id INTEGER,
      ADD COLUMN IF NOT EXISTS delivery_contact_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS delivery_contact_phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS delivery_address TEXT,
      ADD COLUMN IF NOT EXISTS delivery_pincode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS estimate_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS destination_pincode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(30) DEFAULT 'Not Dispatched',
      ADD COLUMN IF NOT EXISTS item_tracker_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS item_courier_partner VARCHAR(120),
      ADD COLUMN IF NOT EXISTS item_dispatch_date DATE,
      ADD COLUMN IF NOT EXISTS item_estimated_delivery DATE,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
    CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_items_tracking_status ON order_items(order_id, tracking_status);
    CREATE INDEX IF NOT EXISTS idx_order_items_destination ON order_items(order_id, destination_pincode);
  `);

  // Migration 007: address_type
  await runMigration('007_add_address_type', `
    ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(30);
    ALTER TABLE lead_addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(30);
  `);

  // Migration 008: Replace Repeat with Call Back
  await runMigration('008_replace_repeat_with_callback', `
    UPDATE leads SET status = 'Deal' WHERE status = 'Repeat';
  `);

  // Migration 011: Add procurement/qc/dispatch roles, delete seed users
  await runMigration('011_add_order_roles', `
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
      role IN ('admin', 'manager', 'sales', 'team_lead', 'team_member', 'viewer', 'floor_manager', 'procurement', 'qc', 'dispatch', 'warehouse')
    );
    DELETE FROM users WHERE email IN ('procurement@rentfoxxy.com', 'qc@rentfoxxy.com', 'dispatch@rentfoxxy.com');
  `);

  // Migration 013: Warehouse Team
  await runMigration('013_warehouse_team', `
    INSERT INTO teams (team_name) SELECT 'Warehouse Team' WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'Warehouse Team');
  `);

  // Migration 010: Order workflow teams (QC Team, Dispatch Team)
  await runMigration('010_add_order_teams', `
    INSERT INTO teams (team_name) SELECT 'QC Team' WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'QC Team');
    INSERT INTO teams (team_name) SELECT 'Dispatch Team' WHERE NOT EXISTS (SELECT 1 FROM teams WHERE team_name = 'Dispatch Team');
  `);

  // Migration 012: Per-item proposed delivery date
  await runMigration('012_add_proposed_delivery_date', `
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS proposed_delivery_date DATE;
  `);

  // Migration 014: Fix numeric overflow - ensure DECIMAL columns have sufficient precision
  // Add missing orders columns first, then alter types
  await runMigration('014_orders_columns', `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS lockin_period_days INTEGER DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS security_amount DECIMAL(14, 2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimate_id VARCHAR(120);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_wfh BOOLEAN DEFAULT false;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(14, 2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_gst_amount DECIMAL(14, 2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(14, 2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_gst_amount DECIMAL(14, 2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS grand_total_amount DECIMAL(14, 2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20);
  `);
  await runMigration('014_numeric_precision', `
    ALTER TABLE order_items ALTER COLUMN unit_price TYPE DECIMAL(14, 2);
    ALTER TABLE order_items ALTER COLUMN gst_percent TYPE DECIMAL(10, 2);
    ALTER TABLE order_items ALTER COLUMN gst_amount TYPE DECIMAL(14, 2);
    ALTER TABLE order_items ALTER COLUMN total_with_gst TYPE DECIMAL(14, 2);
    ALTER TABLE order_items ALTER COLUMN shipping_charge TYPE DECIMAL(14, 2);
  `);
  await runMigration('014_orders_precision', `
    ALTER TABLE orders ALTER COLUMN subtotal_amount TYPE DECIMAL(14, 2);
    ALTER TABLE orders ALTER COLUMN items_gst_amount TYPE DECIMAL(14, 2);
    ALTER TABLE orders ALTER COLUMN grand_total_amount TYPE DECIMAL(14, 2);
    ALTER TABLE orders ALTER COLUMN shipping_charge TYPE DECIMAL(14, 2);
    ALTER TABLE orders ALTER COLUMN shipping_gst_amount TYPE DECIMAL(14, 2);
    ALTER TABLE orders ALTER COLUMN security_amount TYPE DECIMAL(14, 2);
  `);

  // Migration 016: order_items.generation
  await runMigration('016_order_items_generation', `
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS generation VARCHAR(80);
  `);

  // Migration 017: Backfill order_items.generation from inventory for existing orders
  await runMigration('017_backfill_order_items_generation', `
    UPDATE order_items oi
    SET generation = i.generation
    FROM inventory i
    WHERE oi.inventory_id = i.inventory_id
      AND (oi.generation IS NULL OR oi.generation = '')
      AND (i.generation IS NOT NULL AND i.generation != '');
  `);

  // Migration 015: lead_auto_assign_config (default assignees for new/unassigned leads)
  await runMigration('015_lead_auto_assign_config', `
    CREATE TABLE IF NOT EXISTS lead_auto_assign_config (
      id SERIAL PRIMARY KEY,
      user_ids INTEGER[] NOT NULL DEFAULT '{}',
      round_robin_index INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(user_id)
    );
  `);

  // Migration 008c: users.mobile_no (for auth)
  await runMigration('008c_users_mobile_no', `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_no VARCHAR(50);
  `);

  // Migration 008b: order_status_history (required for createOrder)
  await runMigration('008b_order_status_history', `
    CREATE TABLE IF NOT EXISTS order_status_history (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      from_status VARCHAR(50),
      to_status VARCHAR(50) NOT NULL,
      changed_by INTEGER REFERENCES users(user_id),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);
  `);

  // Migration 020: Lead company_brand (company brand name, separate from config brand)
  await runMigration('020_lead_company_brand', `
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_brand VARCHAR(255);
  `);

  // Migration 019: Lead personal_remarks
  await runMigration('019_lead_personal_remarks', `
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS personal_remarks TEXT;
  `);

  // Migration 018: Lead config (processor, generation, ram, storage)
  await runMigration('018_lead_config', `
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS processor VARCHAR(100);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS generation VARCHAR(50);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS ram VARCHAR(50);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS storage VARCHAR(100);
  `);

  // Migration 009: Lead remarks
  await runMigration('009_lead_remarks', `
    CREATE TABLE IF NOT EXISTS lead_remarks (
      remark_id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(user_id),
      note TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_lead_remarks_lead ON lead_remarks(lead_id);
  `);

  // Drop only leads_status_check and add new one; restore research_status_check if missing
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check`);
    await client.query(`
      ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (
        status IN ('Pending', 'Cold', 'Warm', 'Hot', 'Gone', 'Hold', 'Rejected', 'Call Back', 'Deal')
      )
    `);
    console.log('✓ Updated leads_status_check constraint');
  } catch (err) {
    if (err.code === '42710') {
      console.log('  (Constraint already exists, skipping)');
    } else {
      throw err;
    }
  }

  try {
    await client.query(`
      ALTER TABLE leads ADD CONSTRAINT leads_research_status_check 
      CHECK (research_status IN ('pending', 'completed', 'failed'))
    `);
    console.log('✓ Restored leads_research_status_check');
  } catch (err) {
    if (err.code === '42710') {
      console.log('  (leads_research_status_check already exists)');
    }
  } finally {
    client.release();
  }

  console.log('\nAll migrations completed.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
