#!/usr/bin/env node
/**
 * Run database migrations
 * Usage: node run-migrations.js
 */
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function run() {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Running ${file}...`);
      await pool.query(sql);
      console.log(`  OK`);
    }
    console.log('Migrations complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

run();
