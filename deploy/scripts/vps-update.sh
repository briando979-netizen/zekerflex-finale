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
# stopt meteen. zf-live.py houdt hem zelf al vast en zet dan ZF_DEPLOY_LOCKED. De
# Bouwer ziet hem (alleen-lezen mount) en wacht met zware stappen tot de uitrol klaar is.
mkdir -p .zf-slot
if [ -z "${ZF_DEPLOY_LOCKED:-}" ]; then
  exec 9>.zf-slot/deploy.lock
  flock -n 9 || { echo "DEPLOY_BEZIG: er loopt al een uitrol, probeer het straks opnieuw"; echo "DEPLOY_EXIT=3"; exit 3; }
fi
# geheimen die alleen op deze server hoeven te bestaan (browser-werker, kennisbank, Metabase): één keer
# maken. Met sudo: .env.production is van root (600) en moet dat blijven.
sudo bash deploy/scripts/env-aanvullen.sh .env.production
sudo docker tag zekerflex-app:latest zekerflex-app:rollback
# Het eigen taalmodel (Ollama, ±3,5 GB met gemma3:4b + granite-embedding) en de build (±4 GB) pasten
# samen niet in de 8 GB van deze server: op 7 nov liep de load naar 138 en was de site 20 minuten
# weg. Sinds de upgrade naar 16 GB (7 nov) blijft Ollama draaien (dan blijft de AI-chat werken tijdens
# een uitrol); alleen als er vóór het bouwen minder dan 6 GB vrij is, staat hij stil en start hij aan
# het eind weer, ook als het bouwen mislukt (trap). Het model laadt daarna vanzelf (cron ai/warm).
OLLAMA_WAS_AAN=""
VRIJ_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
echo "geheugen vrij vóór het bouwen: ${VRIJ_MB} MB"
if [ "${VRIJ_MB:-0}" -lt 6144 ] && sudo docker ps --format '{{.Names}}' | grep -qx zekerflex-ollama-1; then
  OLLAMA_WAS_AAN=1
  sudo docker stop -t 10 zekerflex-ollama-1 > /dev/null && echo "ollama: stil tijdens het bouwen"
fi
ollama_terug() {
  if [ -n "$OLLAMA_WAS_AAN" ]; then sudo docker start zekerflex-ollama-1 > /dev/null 2>&1 && echo "ollama: weer gestart"; fi
}
trap ollama_terug EXIT
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
    # de back-updienst heeft een eigen klein image (postgres + scp/curl): gecacht, seconden
    sudo $C build -q backup > /dev/null 2>&1 || echo "backup: image bouwen mislukt, het oude blijft"
    # eigen databases voor Metabase en Outline (bestaan ze al, dan gebeurt er niets)
    bash deploy/scripts/databases-aanmaken.sh
    # crowdsec: de aanvalsbescherming (deploy/crowdsec) gaat mee in elke uitrol; de
    # firewall-bouncer op de host haalt de blokkades bij hem op en hoeft niet mee
    sudo $C up -d app backup coturn freeradius headscale metabase outline crowdsec
    # de browser-werker (deploy/scraper): eigen image, gecacht; een mislukte build laat de oude draaien
    sudo $C build -q scraper > /dev/null 2>&1 && sudo $C up -d scraper || echo "scraper: image bouwen mislukt, de oude blijft (of hij staat nog uit)"
    # coturn leest zijn opstartscript via een bind-mount en tar vervangt dat bestand
    # (nieuwe inode): alleen bij een gewijzigd script opnieuw aanmaken. Niet altijd,
    # want lopende gesprekken via de relay vallen dan even weg.
    if [ "$(sudo docker exec zekerflex-coturn-1 cat /zf-turn.sh 2>/dev/null | sha256sum)" != "$(sha256sum < deploy/coturn/entrypoint.sh)" ]; then
      sudo $C up -d --force-recreate coturn
    fi
    # De Bouwer (AI-programmeur, deploy/bouwer/werker) leest zijn code via een map-mount:
    # alleen herstarten als die code veranderde, want een herstart breekt lopend werk af.
    if [ -f deploy/bouwer/werker/server.mjs ]; then
      # gecachte build (seconden): alleen echt werk als deploy/bouwer/werker/Dockerfile veranderde,
      # anders bleef een gewijzigd image stil hangen; een nieuw image maakt de container opnieuw
      sudo $C build -q bouwer > /dev/null 2>&1 || echo "bouwer: image bouwen mislukt, het oude blijft"
      sudo $C up -d bouwer
      # zonder \r: een archief van een Windows-pc heeft CRLF, de live-zetter LF; dezelfde code
      BOUWER_HASH="$(cat deploy/bouwer/werker/*.mjs | tr -d '\r' | sha256sum)"
      if [ "$BOUWER_HASH" != "$(cat .zf-bouwer.hash 2>/dev/null)" ]; then
        sudo $C restart bouwer && echo "$BOUWER_HASH" > .zf-bouwer.hash
      fi
    fi
    # De Android-bouwer (rijschool-apps, deploy/android-bouwer): zelfde aanpak, maar
    # alleen als hij geïnstalleerd is (de image bouwen duurt lang; dat doet installeer.sh).
    if sudo docker image inspect zekerflex-android-bouwer:latest > /dev/null 2>&1; then
      sudo $C up -d --no-build android-bouwer
      ANDROID_HASH="$(cat deploy/android-bouwer/*.mjs | tr -d '\r' | sha256sum)"
      if [ "$ANDROID_HASH" != "$(cat .zf-android-bouwer.hash 2>/dev/null)" ]; then
        sudo $C restart android-bouwer && echo "$ANDROID_HASH" > .zf-android-bouwer.hash
      fi
    fi
    # De live-zetter (deploy/bouwer/zf-live.py) laadt nieuwe code pas bij een herstart. Na een
    # uitrol via de knop doet hij dat zelf; bij een handmatige uitrol doet dit script het, als
    # zijn code veranderde. Nooit als dit script ín de live-zetter draait (ouderproces), want
    # dan zou hij zichzelf midden in de uitrol afbreken.
    if systemctl is-active -q zf-live 2>/dev/null && ! ps -o args= -p "$PPID" 2>/dev/null | grep -q "zf-live.py"; then
      LIVE_HASH="$(tr -d '\r' < deploy/bouwer/zf-live.py | sha256sum)"
      if [ "$LIVE_HASH" != "$(cat .zf-live.hash 2>/dev/null)" ]; then
        sudo systemctl restart zf-live && echo "$LIVE_HASH" > .zf-live.hash && echo "live-zetter: nieuwe versie geladen"
      fi
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
    # Elke build laat ~1,7 GB cache achter. BuildKit markeert die als "gedeeld",
    # en een gewone prune (ook met until=72h of --keep-storage) slaat die over:
    # op 3 nov 2026 stond de schijf zo op 89% (68 GB cache). Daarom -a: alle
    # cache die 20 minuten niet gebruikt is gaat weg; wat deze build net gebruikte
    # (npm ci) blijft. Getagde images (latest + rollback) blijven staan.
    # Eerst was dat 2 uur, maar met uitrollen om de 10-20 minuten werd cache nooit
    # zo oud: dezelfde avond weer 94% (59 GB). Blijft de schijf daarna op 85% of
    # hoger, dan gaat alle buildcache weg (de volgende build duurt dan wat langer).
    sudo docker image prune -f > /dev/null
    sudo docker builder prune -af --filter until=20m > /dev/null 2>&1
    if [ "$(df --output=pcent / | tail -n 1 | tr -dc '0-9')" -ge 85 ]; then
      sudo docker builder prune -af > /dev/null 2>&1
    fi
    echo "DEPLOY_EXIT=0 (poging $i)"
    exit 0
  fi
  echo "build mislukt, poging $i"
  sleep 20
done
echo "DEPLOY_EXIT=1"
exit 1
