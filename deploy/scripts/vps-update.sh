#!/usr/bin/env bash
# Werkt de draaiende VPS-installatie (docker-compose.vps.yml) bij met de code die
# net in ~/zekerflex is uitgepakt. Draai met nohup, zodat een verbroken ssh de
# update niet raakt:
#   nohup bash ~/zekerflex/deploy/scripts/vps-update.sh > /tmp/zf-deploy.log 2>&1 &
# Een mislukte build laat de draaiende container met rust; de vorige versie
# blijft als zekerflex-app:rollback staan. Eerste installatie: deploy-vps.sh.
# ZF_MIGREER=1 past wachtende database-wijzigingen toe na de build en vóór de start.
# De Admin-knop "Live zetten" (deploy/bouwer/zf-live.py) gebruikt dit script ook.
cd "$(dirname "$0")/../.." || { echo "DEPLOY_EXIT=2"; exit 2; }
C="docker compose -f docker-compose.vps.yml --env-file .env.production"
# Eén uitrol tegelijk: sessies en de Admin-knop delen deze vergrendeling, een tweede
# stopt meteen. zf-live.py houdt hem zelf al vast en zet dan ZF_DEPLOY_LOCKED.
if [ -z "${ZF_DEPLOY_LOCKED:-}" ]; then
  exec 9>.zf-deploy.lock
  flock -n 9 || { echo "DEPLOY_BEZIG: er loopt al een uitrol, probeer het straks opnieuw"; echo "DEPLOY_EXIT=3"; exit 3; }
fi
sudo docker tag zekerflex-app:latest zekerflex-app:rollback
for i in 1 2 3; do
  if sudo $C build app; then
    # Migreren met de Prisma uit het nieuwe image, vóór de nieuwe app start. Mislukt
    # dat, dan blijft de oude app draaien en wijst latest weer naar de vorige versie.
    if [ -n "${ZF_MIGREER:-}" ]; then
      if ! sudo $C run --rm --no-deps -T app node node_modules/prisma/build/index.js migrate deploy; then
        sudo docker tag zekerflex-app:rollback zekerflex-app:latest
        echo "MIGRATIE_MISLUKT: de vorige versie blijft draaien"
        echo "DEPLOY_EXIT=5"
        exit 5
      fi
    fi
    sudo $C up -d app backup coturn
    # coturn leest zijn opstartscript via een bind-mount en tar vervangt dat bestand
    # (nieuwe inode): alleen bij een gewijzigd script opnieuw aanmaken. Niet altijd,
    # want lopende gesprekken via de relay vallen dan even weg.
    if [ "$(sudo docker exec zekerflex-coturn-1 cat /zf-turn.sh 2>/dev/null | sha256sum)" != "$(sha256sum < deploy/coturn/entrypoint.sh)" ]; then
      sudo $C up -d --force-recreate coturn
    fi
    # de crontab wordt bij het starten gemaakt: herstarten neemt nieuwe taken mee
    sudo $C restart cron
    # Caddy: eerst de nieuwe Caddyfile valideren in een losse container, want een
    # kapotte Caddyfile legt de hele site plat. Pas dan (her)maken als de compose-
    # instellingen veranderden, en herladen zonder onderbreking (de map-mount laat
    # de draaiende caddy de nieuwe versie zien). Ongeldig = de vorige blijft actief.
    if sudo $C run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > /tmp/zf-caddy-validate.log 2>&1; then
      sudo $C up -d caddy
      if sudo docker exec zekerflex-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile > /tmp/zf-caddy-reload.log 2>&1; then
        echo "caddy: Caddyfile actief"
      else
        echo "CADDY_HERLADEN_MISLUKT: de vorige Caddyfile blijft actief"; tail -3 /tmp/zf-caddy-reload.log
      fi
    else
      echo "CADDY_ONGELDIG: de vorige Caddyfile blijft actief"; tail -3 /tmp/zf-caddy-validate.log
    fi
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
