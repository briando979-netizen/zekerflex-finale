#!/usr/bin/env bash
# Haalt de kaartdata van ZekerFlex Kaart binnen, vanuit de projectmap op de VPS:
#   bash deploy/kaart/haal-kaart.sh [BUILD]     (BUILD bv. 20261102; leeg = een recente)
# - nl.pmtiles: OpenStreetMap-vectortegels van Nederland plus grensstreek, tot
#   zoom 15, uit de dagelijkse wereldbouw van Protomaps (alleen dit stuk wordt
#   gedownload, via Range-verzoeken; ±1 GB).
# - fonts/ en sprites/: de lettertypes en symbolen die de kaartstijl gebruikt.
# Alles in ./kaart-data (niet in git; de app leest het via een alleen-lezen mount
# op /app/kaart-data, zie app/kaart-data/[...pad]/route.ts). Kaartgegevens
# © OpenStreetMap-bijdragers (ODbL), tegels via Protomaps (BSD/ODbL).
set -euo pipefail
cd "$(dirname "$0")/../.."
DOEL=kaart-data
TMP="$DOEL/tmp"
mkdir -p "$TMP"

BUILD="${1:-}"
if [ -z "$BUILD" ]; then
  # de op één na laatste: de laatste kan nog aan het uploaden zijn
  BUILD=$(curl -fsS https://build-metadata.protomaps.dev/builds.json | python3 -c 'import json,sys; print(json.load(sys.stdin)[-2]["key"].split(".")[0])')
fi
echo "Kaart: build $BUILD"

if [ -f "$DOEL/nl.pmtiles" ] && [ "$(cat "$DOEL/versie.txt" 2>/dev/null)" = "$BUILD" ]; then
  echo "Tegels van $BUILD staan er al."
else
  # go-pmtiles (de officiële tool) in een wegwerpcontainer
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/$TMP:/data" protomaps/go-pmtiles:latest \
    extract "https://build.protomaps.com/$BUILD.pmtiles" /data/nl.pmtiles --bbox=3.0,50.6,7.4,53.7 --maxzoom=15 --download-threads=4
  mv -f "$TMP/nl.pmtiles" "$DOEL/nl.pmtiles"
  echo "$BUILD" > "$DOEL/versie.txt"
fi

# lettertypes en symbolen (alleen wat de stijl gebruikt)
curl -fsSL -o "$TMP/assets.zip" https://codeload.github.com/protomaps/basemaps-assets/zip/refs/heads/main
rm -rf "$TMP/assets" && mkdir -p "$TMP/assets"
# python in plaats van unzip: dat staat er niet standaard op
python3 -m zipfile -e "$TMP/assets.zip" "$TMP/assets"
BRON="$TMP/assets/basemaps-assets-main"
rm -rf "$DOEL/fonts.nieuw" "$DOEL/sprites.nieuw"
mkdir -p "$DOEL/fonts.nieuw"
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do cp -r "$BRON/fonts/$f" "$DOEL/fonts.nieuw/"; done
cp -r "$BRON/sprites/v4" "$DOEL/sprites.nieuw"
rm -rf "$DOEL/fonts" "$DOEL/sprites" && mv "$DOEL/fonts.nieuw" "$DOEL/fonts" && mv "$DOEL/sprites.nieuw" "$DOEL/sprites"
rm -rf "$TMP"
du -sh "$DOEL"/* | sed 's/^/  /'
echo "Klaar."
