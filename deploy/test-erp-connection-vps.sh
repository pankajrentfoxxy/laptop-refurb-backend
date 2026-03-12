#!/bin/bash
# Test ERP API connection - diagnose 401/auth
# Run: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/test-erp-connection-vps.sh | bash"

set -e
ERP_URL=$(docker exec laptop-erp-backend printenv ERP_BASE_URL 2>/dev/null || echo "https://erp.rentfoxxy.com/rentfoxxy-api")
TOKEN=$(docker exec laptop-erp-backend printenv ERP_API_TOKEN 2>/dev/null || echo "")

echo "=== Testing ERP API connection ==="
echo "URL: $ERP_URL/qc-orders/passed"
echo "Token: ${TOKEN:0:10}... (length ${#TOKEN})"
echo ""

echo "1. Bearer token:"
curl -s -o /dev/null -w "   Status: %{http_code}\n" -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" "$ERP_URL/qc-orders/passed?page=1"

echo "2. Query param api_token:"
curl -s -o /dev/null -w "   Status: %{http_code}\n" -H "Accept: application/json" "$ERP_URL/qc-orders/passed?page=1&api_token=$TOKEN"

echo "3. No auth:"
curl -s -o /dev/null -w "   Status: %{http_code}\n" -H "Accept: application/json" "$ERP_URL/qc-orders/passed?page=1"

echo ""
echo "200 = OK. 401 = Unauthorized (wrong token or auth format)."
echo "Get a fresh API token from the ERP and set ERP_API_TOKEN in /docker/laptop-erp/.env"
