const pool = require('../config/db');

(async () => {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_no VARCHAR(50)');
    console.log('Added mobile_no column to users');
    const r = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position"
    );
    console.log('users columns:', r.rows.map((x) => x.column_name).join(', '));
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
