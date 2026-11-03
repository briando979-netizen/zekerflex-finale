#!/usr/bin/env bash
# Zet de ZekerFlex Bouwer aan op de VPS (eenmalig), vanuit de projectmap:
#   sudo bash deploy/bouwer/installeer-bouwer.sh [--app]
# Maakt een geheime sleutel tussen app en Bouwer (BOUWER_TOKEN in .env.production),
# zet 4 GB swap aan als die er niet is, en start de bouwer-container. De app krijgt
# de sleutel bij de volgende uitrol mee (of meteen met --app: de app herstart dan
# een paar seconden). Daarna in Admin → ZekerFlex AI → Bouwer → instellingen een
# GitHub-sleutel invullen.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Draai dit met sudo." >&2; exit 1; }
GEBRUIKER="${SUDO_USER:-}"
[ -n "$GEBRUIKER" ] && [ "$GEBRUIKER" != root ] || { echo "Draai dit met sudo vanuit je gewone gebruiker, niet als root." >&2; exit 1; }
cd "$(dirname "$0")/../.."
ENV_BESTAND=.env.production
C="docker compose -f docker-compose.vps.yml --env-file $ENV_BESTAND"

if ! grep -qE '^BOUWER_TOKEN=.{24,}' "$ENV_BESTAND"; then
  # met een regeleinde ervoor: het bestand eindigt misschien niet op een nieuwe regel
  printf '\nBOUWER_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$ENV_BESTAND"
  echo "BOUWER_TOKEN toegevoegd aan $ENV_BESTAND"
else
  echo "BOUWER_TOKEN stond er al"
fi

# Vangnet voor het geheugen (8 GB): een uitrol-build en een Bouwer-controle samen
# mogen nooit de app of de database raken. 4 GB swap, alleen gebruikt bij nood.
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile > /dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-zekerflex-swap.conf && sysctl -q -p /etc/sysctl.d/90-zekerflex-swap.conf
  echo "4 GB swap aangezet"
fi

# van de gewone gebruiker, want vps-update.sh (zonder sudo) schrijft hier ook
install -d -o "$GEBRUIKER" -g "$GEBRUIKER" .zf-slot
$C up -d --build bouwer
cat deploy/bouwer/werker/*.mjs | sha256sum > .zf-bouwer.hash
chown "$GEBRUIKER:$GEBRUIKER" .zf-bouwer.hash
if [ "${1:-}" = "--app" ]; then
  $C up -d app
fi
sleep 3
docker logs --tail 5 zekerflex-bouwer-1
echo
echo "Klaar. De Bouwer staat in Admin -> ZekerFlex AI -> Bouwer (na de volgende uitrol, of meteen met --app)."
