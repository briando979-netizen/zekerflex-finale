#!/usr/bin/env bash
# Werkt de draaiende VPS-installatie (docker-compose.vps.yml) bij met de code die
# net in ~/zekerflex is uitgepakt. Draai met nohup, zodat een verbroken ssh de
# update niet raakt:
#   nohup bash ~/zekerflex/deploy/scripts/vps-update.sh > /tmp/zf-deploy.log 2>&1 &
# Een mislukte build laat de draaiende container met rust; de vorige versie
# blijft als zekerflex-app:rollback staan. Eerste installatie: deploy-vps.sh.
cd "$(dirname "$0")/../.." || { echo "DEPLOY_EXIT=2"; exit 2; }
C="docker compose -f docker-compose.vps.yml --env-file .env.production"
sudo docker tag zekerflex-app:latest zekerflex-app:rollback
for i in 1 2 3; do
  if sudo $C build app; then
    sudo $C up -d app backup coturn
    # de crontab wordt bij het starten gemaakt: herstarten neemt nieuwe taken mee
    sudo $C restart cron
    # Elke build laat oude lagen achter; in nov 2026 stond de schijf zo op 79%
    # (52 GB build-cache). Getagde images (latest + rollback) blijven staan.
    sudo docker image prune -f > /dev/null
    sudo docker builder prune -f --filter until=72h > /dev/null 2>&1
    echo "DEPLOY_EXIT=0 (poging $i)"
    exit 0
  fi
  echo "build mislukt, poging $i"
  sleep 20
done
echo "DEPLOY_EXIT=1"
exit 1
