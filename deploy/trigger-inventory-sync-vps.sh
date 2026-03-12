#!/bin/bash
# Trigger ERP inventory sync on VPS (pulls QC Passed laptops from ERP into CRM)
# Run: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/trigger-inventory-sync-vps.sh | bash"
#
# Requires: Backend running with ERP_API_TOKEN set in env

set -e
echo "=== Triggering ERP inventory sync ==="

docker exec laptop-erp-backend node /app/scripts/run-inventory-sync.js

echo ""
echo "Done. Check CRM Inventory for updated items."
