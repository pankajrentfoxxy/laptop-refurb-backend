#!/bin/bash
# Deploy laptop-erp (CRM) to VPS
# Run: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/redeploy-vps.sh | bash"

set -e
REPO="${REPO:-pankajrentfoxxy/laptop-refurb-backend}"
BRANCH="${BRANCH:-main}"
LAPTOP_ERP="/docker/laptop-erp"

echo "=== Deploy laptop-erp (CRM) to VPS ==="

# 1. Fetch nginx config from GitHub
echo "Fetching nginx.deploy.conf..."
mkdir -p "$LAPTOP_ERP"
curl -sSL "https://raw.githubusercontent.com/${REPO}/${BRANCH}/deploy/nginx.deploy.conf" -o "$LAPTOP_ERP/nginx.deploy.conf"
if [ ! -s "$LAPTOP_ERP/nginx.deploy.conf" ]; then
  echo "ERROR: nginx.deploy.conf not found. Push deploy files to GitHub first."
  exit 1
fi

# 2. Rebuild and restart laptop-erp web
echo "Rebuilding laptop-erp web..."
cd "$LAPTOP_ERP"
docker compose build web --no-cache
docker stop laptop-erp-web 2>/dev/null || true
docker rm laptop-erp-web 2>/dev/null || true
NETWORK=$(docker inspect laptop-erp-backend --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || echo "laptop-erp_default")
echo "Using network: $NETWORK"
mkdir -p /var/www/certbot
docker run -d --name laptop-erp-web --restart unless-stopped --network "$NETWORK" \
  -p 80:80 -p 443:443 \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  -v /var/www/certbot:/var/www/certbot \
  laptop-erp-web:latest
echo "laptop-erp-web restarted."

echo ""
echo "Done! CRM: https://crm.rentfoxxy.com"
