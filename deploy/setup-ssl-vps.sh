#!/bin/bash
# Obtain Let's Encrypt SSL cert for crm.rentfoxxy.com
# Run on VPS: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/setup-ssl-vps.sh | bash"
#
# Prerequisites: Web container must be running (serves ACME challenge from /var/www/certbot)

set -e
DOMAIN="crm.rentfoxxy.com"
EMAIL="${SSL_EMAIL:-admin@rentfoxxy.com}"

echo "=== Setting up SSL for $DOMAIN ==="

mkdir -p /var/www/certbot
mkdir -p /etc/letsencrypt

# Check if cert already exists
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "Certificate already exists. To renew: certbot renew"
  exit 0
fi

# Install certbot if not present
if ! command -v certbot &>/dev/null; then
  echo "Installing certbot..."
  apt-get update -qq && apt-get install -y -qq certbot
fi

# Obtain cert (webroot method - web container serves /.well-known/acme-challenge/)
echo "Obtaining certificate..."
certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo ""
echo "Certificate obtained. Restart the web container to enable HTTPS:"
echo "  docker restart laptop-erp-web"
echo ""
echo "Or redeploy: curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/redeploy-vps.sh | bash"
