#!/bin/bash
# Run this script on the VPS (Hostinger) to enable HTTPS
# Usage: bash enable-https-vps.sh
# Or: curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/enable-https-vps.sh | bash

set -e

echo "=== Enabling HTTPS for crm.rentfoxxy.com ==="

# Get network from backend container
NETWORK=$(docker inspect laptop-erp-backend --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
if [ -z "$NETWORK" ]; then
  echo "ERROR: Could not find docker network. Is laptop-erp-backend running?"
  exit 1
fi
echo "Using network: $NETWORK"

# Clone backend repo
WORKDIR="/tmp/laptop-erp-ssl-setup"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
echo "Cloning backend repo..."
git clone --depth 1 https://github.com/pankajrentfoxxy/laptop-refurb-backend.git .

# Stop old web container
echo "Stopping laptop-erp-web..."
docker stop laptop-erp-web
docker rm laptop-erp-web 2>/dev/null || true

# Build SSL web image (--no-cache + CACHEBUST ensures latest frontend from GitHub)
echo "Building SSL web image (this may take 3-5 minutes)..."
docker build --no-cache --build-arg CACHEBUST=$(date +%s) -f Dockerfile.web.ssl.deploy -t laptop-erp-web:ssl .

# Run new web container with SSL
echo "Starting web container with HTTPS..."
docker run -d \
  --name laptop-erp-web \
  --restart unless-stopped \
  --network "$NETWORK" \
  -p 80:80 \
  -p 443:443 \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  laptop-erp-web:ssl

# Cleanup
cd /
rm -rf "$WORKDIR"

echo ""
echo "=== Done! ==="
echo "Test: https://crm.rentfoxxy.com"
echo ""
echo "Next: Update FRONTEND_URL to https://crm.rentfoxxy.com in Hostinger and restart backend."
