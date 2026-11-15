#!/usr/bin/env bash
# Zet de WhatsApp-brug aan op de VPS (eenmalig): je eigen WhatsApp live in Admin → WhatsApp.
# Draaien in de map van de app (waar docker-compose.vps.yml staat):
#   bash deploy/whatsapp-brug/installeer.sh
# Daarna: Admin → WhatsApp openen en de koppelcode scannen met WhatsApp op je telefoon
# (Instellingen → Gekoppelde apparaten → Apparaat koppelen).
# .env.production is van root (600): lezen en schrijven met sudo, en eerst een kopie.
set -euo pipefail

ENV=.env.production
sudo test -f "$ENV" || { echo "Geen $ENV gevonden; draai dit in de map van de app."; exit 1; }

if ! sudo grep -q '^WHATSAPP_BRUG_TOKEN=' "$ENV"; then
  sudo cp -p "$ENV" "$ENV.bak-whatsapp-$(date +%Y%m%d%H%M%S)"
  TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  printf '\n# WhatsApp-brug (deploy/whatsapp-brug)\nWHATSAPP_BRUG_TOKEN=%s\nWHATSAPP_BRUG_URL=http://whatsapp-brug:3900\n' "$TOKEN" | sudo tee -a "$ENV" > /dev/null
  unset TOKEN
  echo "Sleutel toegevoegd aan $ENV (kopie ernaast)."
else
  sudo grep -q '^WHATSAPP_BRUG_URL=' "$ENV" || printf 'WHATSAPP_BRUG_URL=http://whatsapp-brug:3900\n' | sudo tee -a "$ENV" > /dev/null
  echo "Sleutel stond al in $ENV."
fi

C="sudo docker compose -f docker-compose.vps.yml -f docker-compose.whatsapp.yml --env-file $ENV"
$C up -d --build whatsapp-brug
# De app leest de nieuwe variabelen pas na een herstart van zijn container (onder het uitrolslot).
flock ~/zekerflex/.zf-slot/deploy.lock $C up -d --no-deps --force-recreate app

echo
echo "Klaar. Open Admin → WhatsApp en scan de koppelcode met WhatsApp op je telefoon."
$C logs --since 1m whatsapp-brug | tail -5
