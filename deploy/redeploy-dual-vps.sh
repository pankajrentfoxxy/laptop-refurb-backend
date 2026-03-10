#!/bin/bash
# Deploy dual-domain setup (crm + erp proxy) to VPS
# Run: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/redeploy-dual-vps.sh | bash"

set -e
REPO="${REPO:-pankajrentfoxxy/laptop-refurb-backend}"
BRANCH="${BRANCH:-main}"
LAPTOP_ERP="/docker/laptop-erp"
RENTFOXXY_ERP="/docker/rentfoxxy_erp"

echo "=== Deploy dual-domain (crm + erp) to VPS ==="

# 1. Fetch nginx config from GitHub (CRM-only for stability until rentfoxxy_erp is ready)
echo "Fetching nginx.deploy.conf..."
mkdir -p "$LAPTOP_ERP"
# Use CRM-only config - no ERP blocks, avoids "host not found" and missing cert errors
curl -sSL "https://raw.githubusercontent.com/${REPO}/${BRANCH}/deploy/nginx.deploy.crm-only.conf" -o "$LAPTOP_ERP/nginx.deploy.conf"
if [ ! -s "$LAPTOP_ERP/nginx.deploy.conf" ]; then
  echo "Trying full dual config..."
  curl -sSL "https://raw.githubusercontent.com/${REPO}/${BRANCH}/deploy/nginx.deploy.conf" -o "$LAPTOP_ERP/nginx.deploy.conf"
fi
if [ ! -s "$LAPTOP_ERP/nginx.deploy.conf" ]; then
  echo "ERROR: nginx config not found. Push deploy files to GitHub first."
  exit 1
fi

# 2. Ensure docker-compose has 443 and certbot (append if missing)
COMPOSE="$LAPTOP_ERP/docker-compose.yml"
if [ -f "$COMPOSE" ] && ! grep -q "443:443" "$COMPOSE" 2>/dev/null; then
  echo "Note: Add '443:443' and letsencrypt/certbot volumes to web service in docker-compose.yml for HTTPS."
fi

# 3. Rebuild and restart laptop-erp web (use docker run to avoid compose touching backend)
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

# 4. Restart rentfoxxy_erp if present (ensure it's on shared network)
if [ -f "$RENTFOXXY_ERP/docker-compose.yml" ]; then
  echo "Restarting rentfoxxy_erp..."
  cd "$RENTFOXXY_ERP"
  docker compose up -d --build 2>/dev/null || echo "Skipped rentfoxxy_erp (check docker-compose)"
else
  echo "rentfoxxy_erp not found at $RENTFOXXY_ERP - deploy it separately."
fi

echo ""
echo "Done! CRM: https://crm.rentfoxxy.com  ERP: https://erp.rentfoxxy.com"
