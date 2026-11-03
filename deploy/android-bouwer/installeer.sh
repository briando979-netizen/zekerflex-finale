#!/usr/bin/env bash
# Zet de Android-bouwer aan op de VPS (eenmalig), vanuit de projectmap:
#   sudo bash deploy/android-bouwer/installeer.sh [--app]
# Maakt een geheime sleutel tussen app en bouwer (ANDROID_BOUWER_TOKEN in
# .env.production), bouwt de image (JDK + Android SDK + opgewarmde Gradle: de
# eerste keer 10-20 minuten) en start de container. De app krijgt de sleutel bij
# de volgende uitrol mee (of meteen met --app: de app herstart dan een paar
# seconden). Daarna kan een rijschool in Rijschool → App haar app laten bouwen.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Draai dit met sudo." >&2; exit 1; }
GEBRUIKER="${SUDO_USER:-}"
[ -n "$GEBRUIKER" ] && [ "$GEBRUIKER" != root ] || { echo "Draai dit met sudo vanuit je gewone gebruiker, niet als root." >&2; exit 1; }
cd "$(dirname "$0")/../.."
ENV_BESTAND=.env.production
C="docker compose -f docker-compose.vps.yml --env-file $ENV_BESTAND"

if ! grep -qE '^ANDROID_BOUWER_TOKEN=.{24,}' "$ENV_BESTAND"; then
  # met een regeleinde ervoor: het bestand eindigt misschien niet op een nieuwe regel
  printf '\nANDROID_BOUWER_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$ENV_BESTAND"
  echo "ANDROID_BOUWER_TOKEN toegevoegd aan $ENV_BESTAND"
else
  echo "ANDROID_BOUWER_TOKEN stond er al"
fi

install -d -o "$GEBRUIKER" -g "$GEBRUIKER" .zf-slot
# de image-bouw is zwaar: niet tegelijk met een uitrol
exec 9>.zf-slot/deploy.lock
flock -n 9 || { echo "Er loopt een uitrol; probeer het straks opnieuw." >&2; exit 3; }
$C build android-bouwer
flock -u 9
$C up -d android-bouwer
cat deploy/android-bouwer/*.mjs | tr -d '\r' | sha256sum > .zf-android-bouwer.hash
chown "$GEBRUIKER:$GEBRUIKER" .zf-android-bouwer.hash
if [ "${1:-}" = "--app" ]; then
  $C up -d app
fi
echo "Android-bouwer draait. Controle: sudo docker logs --tail 20 zekerflex-android-bouwer-1"
