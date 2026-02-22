/**
 * Cleanup script: Delete specific inventory items + clear QC, Dispatch, Leads, Lead Orders, Tickets
 * Run: node scripts/cleanup-fresh-start.js
 * Uses credentials from .env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/db');

const MACHINE_NUMBERS_TO_DELETE = [
  'GFHJKGF67898765',
  'FGHJKHGV678',
  'GHJKHVfghjk68897',
  'GFHJFGHJK5678967'
];

const runQuery = async (client, sql, params = [], label) => {
  try {
    const res = await client.query(sql, params);
    const count = res.rowCount ?? 0;
    if (count > 0 || label) console.log(`  ${label}: ${count} rows`);
    return count;
  } catch (e) {
    if (e.code === '42P01') return 0; // table does not exist
    throw e;
  }
};

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting cleanup...\n');

    // 1. Order-related (order_status_history first if exists, then procurement, then orders cascade to order_items)
    await runQuery(client, `DELETE FROM order_status_history`, [], 'order_status_history');
    await runQuery(client, `DELETE FROM procurement_requests`, [], 'procurement_requests');
    await runQuery(client, `DELETE FROM order_items`, [], 'order_items');
    await runQuery(client, `DELETE FROM orders`, [], 'orders');

    // 2. Leads (lead_orders, lead_activities, etc. cascade from leads, but delete explicitly for clarity)
    await runQuery(client, `DELETE FROM lead_followup_notifications`, [], 'lead_followup_notifications');
    await runQuery(client, `DELETE FROM lead_orders`, [], 'lead_orders');
    await runQuery(client, `DELETE FROM lead_company_research`, [], 'lead_company_research');
    await runQuery(client, `DELETE FROM lead_assignments`, [], 'lead_assignments');
    await runQuery(client, `DELETE FROM lead_activities`, [], 'lead_activities');
    await runQuery(client, `DELETE FROM leads`, [], 'leads');

    // 3. QC and ticket-related (delete in FK order)
    await runQuery(client, `DELETE FROM qc_photos`, [], 'qc_photos');
    await runQuery(client, `DELETE FROM qc_results`, [], 'qc_results');
    await runQuery(client, `DELETE FROM diagnosis_images`, [], 'diagnosis_images');
    await runQuery(client, `DELETE FROM diagnosis_parts_required`, [], 'diagnosis_parts_required');
    await runQuery(client, `DELETE FROM diagnosis_results`, [], 'diagnosis_results');
    await runQuery(client, `DELETE FROM chip_level_repairs`, [], 'chip_level_repairs');
    await runQuery(client, `DELETE FROM ticket_parts`, [], 'ticket_parts');
    await runQuery(client, `DELETE FROM ticket_services`, [], 'ticket_services');
    await runQuery(client, `DELETE FROM ticket_checklist_progress`, [], 'ticket_checklist_progress');
    await runQuery(client, `DELETE FROM part_requests`, [], 'part_requests');
    await runQuery(client, `DELETE FROM photos`, [], 'photos');
    await runQuery(client, `DELETE FROM work_logs`, [], 'work_logs');
    await runQuery(client, `DELETE FROM activities`, [], 'activities');
    await runQuery(client, `DELETE FROM tickets`, [], 'tickets');

    // 4. Delete specific inventory items by machine_number
    const invRes = await client.query(
      `DELETE FROM inventory WHERE machine_number = ANY($1::text[]) RETURNING inventory_id, machine_number, serial_number`,
      [MACHINE_NUMBERS_TO_DELETE]
    );
    console.log(`\n  Inventory deleted: ${invRes.rowCount} items`);
    invRes.rows.forEach((r) => console.log(`    - ${r.machine_number} (${r.serial_number})`));

    console.log('\nCleanup complete. Team can start fresh.');
  } catch (e) {
    console.error('Cleanup failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
