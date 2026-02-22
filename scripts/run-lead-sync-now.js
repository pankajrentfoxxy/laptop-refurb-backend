/**
 * Run lead email ingestion once (for today's leads).
 * Run: node scripts/run-lead-sync-now.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runLeadEmailSync } = require('../services/leadEmailIngestionService');

(async () => {
  try {
    console.log('Running lead email sync...');
    await runLeadEmailSync();
    console.log('Done. Leads will appear in the Lead section.');
  } catch (e) {
    console.error('Sync failed:', e.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
