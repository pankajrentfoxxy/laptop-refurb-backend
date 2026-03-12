#!/usr/bin/env node
/**
 * Trigger ERP inventory sync (run inside backend container)
 * Usage: node scripts/run-inventory-sync.js
 * Or from host: docker exec laptop-erp-backend node /app/scripts/run-inventory-sync.js
 */
require('dotenv').config();
const { syncInventoryFromErp } = require('../services/inventoryErpSyncService');

syncInventoryFromErp()
  .then((result) => {
    console.log('ERP inventory sync completed:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('ERP sync failed:', err.message);
    process.exit(1);
  });
