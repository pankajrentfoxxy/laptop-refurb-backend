#!/bin/bash
# Deploy laptop-erp web (frontend) to VPS
# Run: ssh root@187.77.187.213 "curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/deploy/redeploy-vps.sh | bash"
#
# Works with Hostinger: backend + postgres run via docker-compose. This script
# fetches latest frontend build files, rebuilds web image, restarts web container.

set -e
REPO="${REPO:-pankajrentfoxxy/laptop-refurb-backend}"
BRANCH="${BRANCH:-main}"
LAPTOP_ERP="/docker/laptop-erp"
WORKDIR="/tmp/redeploy-web-$$"

echo "=== Deploy laptop-erp web (CRM frontend) to VPS ==="

# 1. Clone repo to get latest Dockerfile, nginx config, docker-compose
echo "Fetching latest from GitHub..."
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
git clone --depth 1 "https://github.com/${REPO}.git" .

# 2. Ensure /docker/laptop-erp exists and has required structure
mkdir -p "$LAPTOP_ERP"
mkdir -p "$LAPTOP_ERP/deploy"

# 3. Copy files needed for web build
echo "Copying deploy files..."
mkdir -p "$LAPTOP_ERP/deploy"
for f in nginx.deploy.http-only.conf nginx.deploy.conf docker-entrypoint-web.sh; do
  if [ -f "deploy/$f" ]; then
    cp -f "deploy/$f" "$LAPTOP_ERP/deploy/"
  else
    curl -sSL "https://raw.githubusercontent.com/${REPO}/${BRANCH}/deploy/$f" -o "$LAPTOP_ERP/deploy/$f" 2>/dev/null || true
  fi
done
cp -f Dockerfile.web.deploy "$LAPTOP_ERP/"

# 4. Copy docker-compose only if missing (preserve Hostinger's .env)
if [ ! -f "$LAPTOP_ERP/docker-compose.yml" ] && [ ! -f "$LAPTOP_ERP/docker-compose.yaml" ]; then
  cp -f docker-compose.yaml "$LAPTOP_ERP/"
fi

# 5. Rebuild web image
echo "Rebuilding web image..."
cd "$LAPTOP_ERP"
docker compose build web --no-cache

# 6. Stop and remove old web container
echo "Restarting web container..."
docker stop laptop-erp-web 2>/dev/null || true
docker rm laptop-erp-web 2>/dev/null || true

# 7. Start web container (use docker run to avoid recreating postgres/backend)
NETWORK=$(docker inspect laptop-erp-backend --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || echo "laptop-erp_default")
echo "Using network: $NETWORK"
mkdir -p /var/www/certbot
mkdir -p /etc/letsencrypt

docker run -d --name laptop-erp-web --restart unless-stopped --network "$NETWORK" \
  -p 80:80 -p 443:443 \
  -v /var/www/certbot:/var/www/certbot \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  laptop-erp-web:latest

# Cleanup
rm -rf "$WORKDIR"

echo ""
echo "Done! CRM: https://crm.rentfoxxy.com"
