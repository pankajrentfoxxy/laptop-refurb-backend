const { Pool } = require('pg');
require('dotenv').config();

// Disable SSL for local Docker postgres; enable for Supabase/cloud
const useSsl = process.env.DB_HOST !== 'postgres' &&
  process.env.DB_SSL !== 'false' &&
  process.env.DB_SSL !== '0';
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  // Pooler-specific settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

module.exports = pool;