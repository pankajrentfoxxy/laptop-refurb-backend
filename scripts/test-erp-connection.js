#!/usr/bin/env node
/**
 * Test ERP API connection - diagnose 401/auth issues
 * Run: docker exec laptop-erp-backend node /app/scripts/test-erp-connection.js
 */
require('dotenv').config();
const axios = require('axios');

const ERP_BASE_URL = process.env.ERP_BASE_URL || 'https://erp.rentfoxxy.com/rentfoxxy-api';
const ERP_TOKEN = (process.env.ERP_API_TOKEN || '').trim();

console.log('ERP_BASE_URL:', ERP_BASE_URL);
console.log('ERP_API_TOKEN set:', !!ERP_TOKEN, '(length:', ERP_TOKEN.length + ')');
console.log('');

const testAuth = async (name, config) => {
  const url = `${ERP_BASE_URL}/qc-orders/passed?page=1`;
  try {
    const res = await axios.get(url, { ...config, timeout: 10000 });
    console.log(name, '-> SUCCESS (status', res.status + ')');
    return true;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.log(name, '-> FAILED (status', status + ')');
    if (data && typeof data === 'object') {
      console.log('  Response:', JSON.stringify(data).slice(0, 200));
    } else if (data) {
      console.log('  Response:', String(data).slice(0, 200));
    }
    return false;
  }
};

(async () => {
  console.log('Testing ERP API auth...\n');

  // 1. Bearer token (current)
  await testAuth('Bearer token', {
    headers: {
      Accept: 'application/json',
      Authorization: ERP_TOKEN.startsWith('Bearer ') ? ERP_TOKEN : `Bearer ${ERP_TOKEN}`
    }
  });

  // 2. Token as query param (some Laravel APIs)
  await testAuth('Query param ?api_token=', {
    headers: { Accept: 'application/json' },
    params: { api_token: ERP_TOKEN }
  });

  // 3. X-API-TOKEN header
  await testAuth('X-API-TOKEN header', {
    headers: {
      Accept: 'application/json',
      'X-API-TOKEN': ERP_TOKEN
    }
  });

  // 4. No auth (to see if endpoint exists)
  await testAuth('No auth', { headers: { Accept: 'application/json' } });

  console.log('\nIf all failed: Get a fresh API token from the ERP (erp.rentfoxxy.com) and update ERP_API_TOKEN.');
})();
