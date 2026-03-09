#!/bin/bash
# Rebuild and restart the backend container on VPS (preserves env from old container)
# Usage: curl -sSL https://raw.githubusercontent.com/pankajrentfoxxy/laptop-refurb-backend/main/redeploy-backend-vps.sh | bash

set -e

echo "=== Redeploying Backend ==="

NETWORK=$(docker inspect laptop-erp-postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
if [ -z "$NETWORK" ]; then
  echo "ERROR: Could not find docker network"
  exit 1
fi

# Save env from current backend container (format: KEY=VALUE per line)
ENV_FILE="/tmp/backend-env-$$.env"
docker inspect laptop-erp-backend --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -v '^$' > "$ENV_FILE" || true

WORKDIR="/tmp/backend-redeploy"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

echo "Cloning backend repo..."
git clone --depth 1 https://github.com/pankajrentfoxxy/laptop-refurb-backend.git .

# Run migrations (DB_NAME from env, default: postgres)
DB_NAME=$(grep '^DB_NAME=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
DB_NAME="${DB_NAME:-postgres}"
if [ -d "migrations" ] && ls migrations/*.sql 1>/dev/null 2>&1; then
  echo "Running migrations against database: $DB_NAME"
  for f in $(ls migrations/*.sql 2>/dev/null | sort); do
    echo "  - $(basename "$f")"
    docker exec -i laptop-erp-postgres psql -U postgres -d "$DB_NAME" < "$f" 2>/dev/null || true
  done
else
  echo "No migrations found, skipping."
fi

echo "Stopping backend..."
docker stop laptop-erp-backend 2>/dev/null || true
docker rm laptop-erp-backend 2>/dev/null || true

echo "Building backend image..."
docker build -f Dockerfile.deploy -t laptop-erp-backend:latest .

# Find backend_uploads volume (docker-compose names it project_backend_uploads)
UPLOADS_VOL=$(docker volume ls -q | grep -E 'backend_uploads|backend-uploads' | head -1)

echo "Starting backend with preserved env..."
if [ -s "$ENV_FILE" ]; then
  if [ -n "$UPLOADS_VOL" ]; then
    docker run -d --name laptop-erp-backend --restart unless-stopped --network "$NETWORK" \
      -v "$UPLOADS_VOL:/app/uploads" --env-file "$ENV_FILE" laptop-erp-backend:latest
  else
    docker run -d --name laptop-erp-backend --restart unless-stopped --network "$NETWORK" \
      --env-file "$ENV_FILE" laptop-erp-backend:latest
  fi
else
  echo "WARNING: No env from old container. Start manually with env vars from Hostinger."
fi

rm -f "$ENV_FILE"
cd /
rm -rf "$WORKDIR"

echo ""
echo "Backend redeployed. Test: https://crm.rentfoxxy.com"
