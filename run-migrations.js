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

  // Migration 007: address_type
  await runMigration('007_add_address_type', `
    ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(30);
    ALTER TABLE lead_addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(30);
  `);

  // Migration 008: Replace Repeat with Call Back
  await runMigration('008_replace_repeat_with_callback', `
    UPDATE leads SET status = 'Deal' WHERE status = 'Repeat';
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
