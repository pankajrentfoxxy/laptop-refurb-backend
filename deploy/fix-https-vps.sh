#!/bin/bash
# Fix HTTPS for CRM - ensure web container has SSL certs and port 443
# Run: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/fix-https-vps.sh | bash"

set -e
echo "=== Fixing HTTPS for crm.rentfoxxy.com ==="

# Check if certs exist
if [ ! -f /etc/letsencrypt/live/crm.rentfoxxy.com/fullchain.pem ]; then
  echo "ERROR: SSL cert not found at /etc/letsencrypt/live/crm.rentfoxxy.com/"
  echo "Run: curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/setup-ssl-vps.sh | bash"
  exit 1
fi

echo "SSL certs found. Restarting web container with HTTPS..."

# Stop and remove
docker stop laptop-erp-web 2>/dev/null || true
docker rm laptop-erp-web 2>/dev/null || true

# Start with correct mounts (port 443 + certs)
NETWORK=$(docker inspect laptop-erp-backend --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || echo "laptop-erp_default")
mkdir -p /var/www/certbot

docker run -d --name laptop-erp-web --restart unless-stopped --network "$NETWORK" \
  -p 80:80 -p 443:443 \
  -v /var/www/certbot:/var/www/certbot \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  laptop-erp-web:latest

echo ""
echo "Done. Test: https://crm.rentfoxxy.com"
