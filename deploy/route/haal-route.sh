#!/usr/bin/env bash
# Haalt de wegen van Nederland binnen en bouwt er de routeplanner (Valhalla) mee,
# vanuit de projectmap op de VPS:
#   bash deploy/route/haal-route.sh             (alleen iets doen als Geofabrik een nieuwer bestand heeft)
#   bash deploy/route/haal-route.sh --opnieuw   (de tegels hoe dan ook opnieuw bouwen)
# - netherlands-latest.osm.pbf: alle wegen en paden van Nederland uit OpenStreetMap,
#   via Geofabrik (±1,3 GB), in ./route-data/bron. Alleen opnieuw als het controle-
#   getal (md5) van Geofabrik veranderd is; elke download wordt gecontroleerd.
# - De tegels bouwt de image zelf (valhalla-scripted, precies de versie van de dienst
#   "routes" in docker-compose.vps.yml) in ./route-data/bouw, in een losse container
#   die niets serveert, met begrensd geheugen. Lukt dat, dan wordt route-data/bouw het
#   nieuwe route-data/actief en start de dienst opnieuw; wordt hij niet gezond, dan
#   gaat de vorige versie terug. Mislukt het bouwen, dan blijft de vorige gewoon draaien.
# Verwacht voor Nederland: schijf ±1,3 GB bron + ±3 GB tegels (map + tar); tijdens het
# omwisselen even ±3 GB extra, daarom moet er 8 GB vrij zijn. Geheugen tijdens het bouwen
# tot 4 GB (ROUTE_BOUW_GEHEUGEN_GB), 2 rekenkernen (ROUTE_BOUW_KERNEN): ±30-60 minuten.
# Daarna gebruikt de dienst ±0,5-1 GB (grens 2 GB).
# Veilig om opnieuw te draaien. Bouwt nooit tijdens een uitrol: hij neemt tijdens het
# bouwen dezelfde vergrendeling als vps-update.sh (.zf-slot/deploy.lock). Een uitrol die
# dan start, stopt meteen met "er loopt al een uitrol"; draai dit dus op een rustig moment.
# Kaartgegevens © OpenStreetMap-bijdragers (ODbL), bestand via Geofabrik.
set -euo pipefail
cd "$(dirname "$0")/../.."

DATA=route-data
BRON="$DATA/bron"
BOUW="$DATA/bouw"
ACTIEF="$DATA/actief"
OUD="$DATA/oud"
URL=https://download.geofabrik.de/europe/netherlands-latest.osm.pbf
PBF="$BRON/netherlands-latest.osm.pbf"
C="docker compose -f docker-compose.vps.yml --env-file .env.production"
CONTAINER=zekerflex-routes-1
EIGENAAR="${ROUTE_UID:-1000}:${ROUTE_GID:-1000}"
GEHEUGEN_GB="${ROUTE_BOUW_GEHEUGEN_GB:-4}"
KERNEN="${ROUTE_BOUW_KERNEN:-2}"
OPNIEUW=""
[ "${1:-}" = "--opnieuw" ] && OPNIEUW=1

# één bron voor de versie: de dienst in compose
IMAGE=$(grep -oE 'ghcr\.io/valhalla/valhalla-scripted:[0-9][0-9.]*' docker-compose.vps.yml | head -n 1 || true)
[ -n "$IMAGE" ] || { echo "Geen valhalla-image gevonden in docker-compose.vps.yml." >&2; exit 1; }
echo "Routeplanner: $IMAGE"

mkdir -p "$BRON" .zf-slot

# ---- 1. het bestand van Geofabrik, alleen als er een nieuwer is ------------------
NIEUW_MD5=$(curl -fsS --retry 3 "$URL.md5" | awk '{print $1}')
[ "${#NIEUW_MD5}" -eq 32 ] || { echo "Geofabrik gaf geen controlegetal; probeer het later opnieuw." >&2; exit 1; }
if [ -f "$PBF" ] && [ "$(cat "$BRON/pbf.md5" 2>/dev/null)" = "$NIEUW_MD5" ]; then
  echo "Wegen: het nieuwste bestand van Geofabrik staat er al."
else
  VRIJ_GB=$(df -BG --output=avail "$DATA" | tail -n 1 | tr -dc '0-9')
  [ "${VRIJ_GB:-0}" -ge 3 ] || { echo "Te weinig schijfruimte voor de download (${VRIJ_GB} GB vrij, 3 GB nodig)." >&2; exit 4; }
  echo "Wegen: downloaden van Geofabrik (±1,3 GB)…"
  curl -fL --retry 3 --retry-delay 15 -o "$PBF.deel" "$URL"
  if ! echo "$NIEUW_MD5  $PBF.deel" | md5sum -c --quiet - > /dev/null 2>&1; then
    # Geofabrik kan net tijdens de download een nieuwe versie hebben gezet: dan klopt het oude getal niet
    NIEUW_MD5=$(curl -fsS --retry 3 "$URL.md5" | awk '{print $1}')
    echo "$NIEUW_MD5  $PBF.deel" | md5sum -c --quiet - > /dev/null 2>&1 || {
      rm -f "$PBF.deel"
      echo "De download is beschadigd (controlegetal klopt niet); er is niets veranderd. Probeer het opnieuw." >&2
      exit 1
    }
  fi
  mv -f "$PBF.deel" "$PBF"
  echo "$NIEUW_MD5" > "$BRON/pbf.md5"
fi

# ---- 2. zijn de tegels al van dit bestand? ---------------------------------------
if [ -z "$OPNIEUW" ] && [ -s "$ACTIEF/valhalla_tiles.tar" ] && [ "$(cat "$ACTIEF/bron.md5" 2>/dev/null)" = "$(cat "$BRON/pbf.md5")" ]; then
  echo "Routeplanner: de tegels zijn al van dit bestand; niets te bouwen."
  sudo $C up -d routes
  exit 0
fi

# ---- 3. niet tijdens een uitrol, en alleen met genoeg geheugen en schijf --------
exec 9>.zf-slot/deploy.lock
flock -n 9 || { echo "Er loopt een uitrol: de tegels worden nu niet gebouwd. Probeer het straks opnieuw."; exit 3; }
VRIJ_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
NODIG_MB=$(( (GEHEUGEN_GB + 1) * 1024 ))
if [ "${VRIJ_MB:-0}" -lt "$NODIG_MB" ]; then
  echo "Te weinig vrij geheugen om te bouwen (${VRIJ_MB} MB vrij, ${NODIG_MB} MB nodig). Probeer het op een rustiger moment, bijv. 's nachts." >&2
  exit 4
fi
VRIJ_GB=$(df -BG --output=avail "$DATA" | tail -n 1 | tr -dc '0-9')
[ "${VRIJ_GB:-0}" -ge 8 ] || { echo "Te weinig schijfruimte om te bouwen (${VRIJ_GB} GB vrij, 8 GB nodig)." >&2; exit 4; }

# ---- 4. bouwen in een losse map, zonder te serveren --------------------------------
rm -rf "$BOUW"
mkdir -p "$BOUW"
# een harde koppeling kost geen ruimte; lukt die niet (andere schijf), dan een kopie
ln -f "$PBF" "$BOUW/" 2>/dev/null || cp -f "$PBF" "$BOUW/"
# de container draait als de gebruiker van de server, niet als root
if [ "$(stat -c '%u:%g' "$BOUW")" != "$EIGENAAR" ]; then sudo chown -R "$EIGENAAR" "$DATA"; fi
sudo docker pull -q "$IMAGE" > /dev/null
echo "Tegels bouwen (±30-60 minuten, tot ${GEHEUGEN_GB} GB geheugen, ${KERNEN} kernen); voortgang in $DATA/bouw.log"
START=$(date +%s)
# Admin-gebieden (rijrichting, regels per land) uit het bestand zelf; geen tijdzones en
# geen hoogtes (die worden van buiten gedownload en hebben we niet nodig). De standaard-
# snelheden per wegsoort (OpenStreetMapSpeeds, één klein bestand) haalt de image zelf op.
if ! sudo docker run --rm --name zekerflex-route-bouw \
  -u "$EIGENAAR" \
  --memory "${GEHEUGEN_GB}g" --memory-swap "${GEHEUGEN_GB}g" --cpus "$KERNEN" --cpu-shares 256 \
  -e serve_tiles=False \
  -e use_tiles_ignore_pbf=True \
  -e build_admins=True \
  -e build_time_zones=False \
  -e build_elevation=False \
  -e build_transit=False \
  -e build_tar=True \
  -e server_threads="$KERNEN" \
  -v "$PWD/$BOUW:/custom_files" \
  "$IMAGE" > "$DATA/bouw.log" 2>&1; then
  echo "BOUWEN_MISLUKT: de vorige tegels blijven in gebruik. Laatste regels van het log:"
  tail -n 15 "$DATA/bouw.log" | sed 's/^/  /'
  rm -rf "$BOUW"
  exit 1
fi
if [ ! -s "$BOUW/valhalla_tiles.tar" ]; then
  echo "BOUWEN_MISLUKT: er is geen valhalla_tiles.tar gemaakt; de vorige tegels blijven in gebruik."
  tail -n 15 "$DATA/bouw.log" | sed 's/^/  /'
  rm -rf "$BOUW"
  exit 1
fi
echo "Gebouwd in $(( ($(date +%s) - START) / 60 )) minuten."
# de bron hoort niet in de map die de dienst leest (die bouwt nooit zelf)
rm -f "$BOUW/netherlands-latest.osm.pbf"
cp "$BRON/pbf.md5" "$BOUW/bron.md5"

# ---- 5. omwisselen en de dienst (her)starten --------------------------------------
# De draaiende dienst houdt zijn map vast (ook na het verplaatsen) tot hij opnieuw start.
rm -rf "$OUD"
[ -d "$ACTIEF" ] && mv "$ACTIEF" "$OUD"
mv "$BOUW" "$ACTIEF"
sudo $C up -d --force-recreate routes

gezond() {
  for _ in $(seq 1 40); do
    [ "$(sudo docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" = "healthy" ] && return 0
    sleep 6
  done
  return 1
}

if ! gezond; then
  echo "ROUTEPLANNER_NIET_GEZOND: de nieuwe tegels werken niet."
  sudo docker logs --tail 15 "$CONTAINER" 2>&1 | sed 's/^/  /'
  if [ -d "$OUD" ]; then
    rm -rf "$DATA/mislukt" && mv "$ACTIEF" "$DATA/mislukt" && mv "$OUD" "$ACTIEF"
    sudo $C up -d --force-recreate routes
    echo "De vorige tegels staan terug (de nieuwe staan in $DATA/mislukt)."
  fi
  exit 1
fi
rm -rf "$OUD" "$DATA/mislukt"

# een proefrit: Dam → Domtoren met de auto (alleen getallen, geen adres in het log)
PROEF='{"locations":[{"lat":52.3731,"lon":4.8936},{"lat":52.0907,"lon":5.1214}],"costing":"auto","units":"kilometers","directions_type":"none"}'
if UIT=$(sudo docker exec "$CONTAINER" curl -fsS -X POST -H 'Content-Type: application/json' -d "$PROEF" http://localhost:8002/route 2>/dev/null); then
  echo "$UIT" | python3 -c 'import json,sys; s=json.load(sys.stdin)["trip"]["summary"]; print("Proefrit Amsterdam - Utrecht met de auto: %.1f km, %d minuten" % (s["length"], round(s["time"] / 60)))' || echo "Proefrit: antwoord niet te lezen"
else
  echo "Proefrit mislukt; kijk met: sudo docker logs $CONTAINER"
fi
du -sh "$DATA"/* 2>/dev/null | sed 's/^/  /'
echo "Klaar."
