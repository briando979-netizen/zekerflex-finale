#!/usr/bin/env bash
# Health-watchdog: herstart de app ALLEEN als hij echt vastzit (health faalt
# meermaals achter elkaar). Raakt NOOIT de database of volumes aan. Bedoeld voor
# de systemd-timer (elke paar minuten). Vangt de "container draait wel, maar app
# hangt"-situatie die een gewone restart-policy niet ziet.
set -euo pipefail

cd "$(dirname "$0")/../.."
C="docker compose -f docker-compose.prod.yml"

ok=0
for _ in 1 2 3; do
  if $C exec -T app wget -qO- --timeout=5 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 3
done

if [ "$ok" = "1" ]; then
  exit 0
fi

echo "$(date -Is) watchdog: app ongezond na 3 pogingen — herstart app-container" >&2
$C restart app
