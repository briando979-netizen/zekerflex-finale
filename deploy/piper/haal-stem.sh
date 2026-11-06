#!/usr/bin/env bash
# Haalt een Nederlandse Piper-stem binnen, vanuit de projectmap op de VPS:
#   bash deploy/piper/haal-stem.sh [STEM-ID]     (leeg = nl_BE-nathalie-medium)
#
# Een stem bestaat uit twee bestanden: het model (.onnx, 20-80 MB) en de
# beschrijving (.onnx.json). Ze komen van de officiële stemmenverzameling van
# Piper op Hugging Face (rhasspy/piper-voices, MIT/CC) en komen in
# deploy/piper/stemmen/ — niet in git, net als de kaartdata.
#
# Nederlandse stemmen (naam = taal-spreker-kwaliteit):
#   nl_BE-nathalie-medium   vrouw, Vlaams-Nederlands, helder  (standaard)
#   nl_BE-nathalie-x_low    dezelfde stem, kleiner en sneller
#   nl_BE-rdh-medium        man, Vlaams-Nederlands
#   nl_NL-mls_5809-low      man, Nederlands-Nederlands
#   nl_NL-mls-medium        vrouw, Nederlands-Nederlands
# Staat een stem er niet (404), kijk dan welke mappen er zijn op
# https://huggingface.co/rhasspy/piper-voices/tree/main/nl
set -euo pipefail
cd "$(dirname "$0")"

STEM="${1:-nl_BE-nathalie-medium}"
# nl_NL-mls_5809-low  ->  taal nl_NL, spreker mls_5809, kwaliteit low
TAAL="${STEM%%-*}"                 # nl_NL
REST="${STEM#*-}"                  # mls_5809-low
SPREKER="${REST%-*}"               # mls_5809
KWALITEIT="${REST##*-}"            # low
FAMILIE="${TAAL%%_*}"              # nl
BASIS="https://huggingface.co/rhasspy/piper-voices/resolve/main/$FAMILIE/$TAAL/$SPREKER/$KWALITEIT"

mkdir -p stemmen
for EXT in onnx onnx.json; do
  DOEL="stemmen/$STEM.$EXT"
  if [ -s "$DOEL" ]; then
    echo "Staat er al: $DOEL"
    continue
  fi
  echo "Ophalen: $STEM.$EXT"
  curl -fL --progress-bar -o "$DOEL.deel" "$BASIS/$STEM.$EXT"
  mv -f "$DOEL.deel" "$DOEL"
done

# De container draait als een gewone gebruiker: alles moet leesbaar zijn.
chmod a+r stemmen/"$STEM".onnx stemmen/"$STEM".onnx.json
ls -lh stemmen | sed 's/^/  /'
echo "Klaar. Zet de bestandsnaam in deploy/piper/config/voice_to_speaker.yaml en herstart: docker compose ... up -d piper"
