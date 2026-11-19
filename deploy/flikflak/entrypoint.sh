#!/bin/sh
# Bij de allereerste start (leeg volume): de demo-inhoud erin zetten, zodat de app
# meteen gevuld oogt. Daarna nooit meer: echte uploads blijven staan.
set -e
if [ ! -f /data/data/db.json ]; then
  echo "FlikFlak: eerste start, demo-inhoud plaatsen"
  mkdir -p /data/data /data/uploads
  cp /app/seed/db.json /data/data/db.json
  cp -a /app/seed/uploads/. /data/uploads/ 2>/dev/null || true
fi
exec node server.js
