#!/bin/sh
set -e
CERT="/etc/letsencrypt/live/crm.rentfoxxy.com/fullchain.pem"
if [ -f "$CERT" ]; then
  cp /etc/nginx/conf.d/default.conf.ssl /etc/nginx/conf.d/default.conf
  echo "Using HTTPS config (certs found)"
else
  echo "Using HTTP-only config (no SSL certs yet)"
fi
exec nginx -g "daemon off;"
