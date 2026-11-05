#!/usr/bin/env bash
# Maakt de losse databases aan die eigen diensten op de server gebruiken, als
# ze er nog niet zijn: `metabase` (rapportages) en `outline` (kennisbank). Beide
# draaien in onze eigen Postgres-container; de diensten maken zelf hun tabellen.
# Draait bij elke uitrol (deploy/scripts/vps-update.sh), vóór de diensten starten,
# zodat ze niet hoeven te herstarten tot de database er is. Veilig om vaker te draaien.
set -u
cd "$(dirname "$0")/../.." || exit 0
C="sudo docker compose -f docker-compose.vps.yml --env-file .env.production"
for db in metabase outline; do
  if ! $C exec -T postgres psql -U zekerflex -d zekerflex -tAc "select 1 from pg_database where datname = '$db'" 2>/dev/null | grep -q 1; then
    $C exec -T postgres psql -U zekerflex -d zekerflex -c "CREATE DATABASE $db" > /dev/null 2>&1 && echo "database $db aangemaakt" || echo "database $db: aanmaken lukte niet (draait postgres?)"
  fi
done
