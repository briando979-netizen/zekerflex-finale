#!/usr/bin/env bash
# Zet de WhatsApp-brug voor spoedoproepen aan op de VPS (eenmalig).
# Draaien in de map van de app (waar docker-compose.vps.yml staat):
#   bash deploy/whatsapp-brug/installeer.sh
# Daarna: de QR-code uit het log scannen met WhatsApp op de telefoon met het
# aparte nummer (Instellingen → Gekoppelde apparaten → Apparaat koppelen).
set -euo pipefail

ENV=.env.production
[ -f "$ENV" ] || { echo "Geen $ENV gevonden; draai dit in de map van de app."; exit 1; }

if ! grep -q '^WHATSAPP_BRUG_TOKEN=' "$ENV"; then
  TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  printf '\n# WhatsApp-brug voor spoedoproepen (deploy/whatsapp-brug)\nWHATSAPP_BRUG_TOKEN=%s\nWHATSAPP_BRUG_URL=http://whatsapp-brug:3900\n' "$TOKEN" >> "$ENV"
  echo "Sleutel toegevoegd aan $ENV."
else
  grep -q '^WHATSAPP_BRUG_URL=' "$ENV" || printf 'WHATSAPP_BRUG_URL=http://whatsapp-brug:3900\n' >> "$ENV"
  echo "Sleutel stond al in $ENV."
fi

C="docker compose -f docker-compose.vps.yml -f docker-compose.whatsapp.yml --env-file $ENV"
$C up -d --build whatsapp-brug
# De app leest de nieuwe variabelen pas na een herstart van zijn container.
$C up -d --no-deps --force-recreate app

echo
echo "Klaar. Scan nu de QR-code; die verschijnt hieronder (stoppen met Ctrl+C, de brug blijft draaien):"
$C logs -f --since 1m whatsapp-brug
