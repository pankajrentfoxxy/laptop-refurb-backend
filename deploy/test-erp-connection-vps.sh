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
RESP=$(curl -s -w "\n%{http_code}" -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" "$ERP_URL/qc-orders/passed?page=1")
CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
echo "   Status: $CODE"
[ "$CODE" = "401" ] && echo "   Body: $BODY" | head -c 300

echo ""
echo "2. X-API-TOKEN header:"
curl -s -o /dev/null -w "   Status: %{http_code}\n" -H "Accept: application/json" -H "X-API-TOKEN: $TOKEN" "$ERP_URL/qc-orders/passed?page=1"

echo ""
echo "3. Query param api_token:"
curl -s -o /dev/null -w "   Status: %{http_code}\n" -H "Accept: application/json" "$ERP_URL/qc-orders/passed?page=1&api_token=$TOKEN"

echo ""
echo "---"
echo "If all 401: Token invalid or ERP migrated (old tokens don't work)."
echo "Action: Log into erp.rentfoxxy.com -> create NEW API token -> update ERP_API_TOKEN on VPS."
