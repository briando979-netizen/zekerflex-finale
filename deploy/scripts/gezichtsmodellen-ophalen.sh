#!/usr/bin/env bash
# Zet de twee gezichtsmodellen van de ID-controle (lib/kyc/gezicht) eenmalig op het opslagvolume van de app,
# zodat de app nooit zelf iets van buiten hoeft op te halen. Draait op de VPS: bash gezichtsmodellen-ophalen.sh
#
#   YuNet (MIT)        face_detection_yunet_2023mar.onnx      232.589 bytes
#   SFace (Apache 2.0) face_recognition_sface_2021dec.onnx 38.696.353 bytes
#   bron: https://github.com/opencv/opencv_zoo (models/face_detection_yunet, models/face_recognition_sface)
#
# De app controleert bij het laden dezelfde hash (lib/kyc/gezicht/motor.ts); een bestand dat niet klopt wordt
# nooit gebruikt. Veilig om vaker te draaien: een bestand dat al klopt wordt overgeslagen. Het volume
# overleeft een uitrol, dus dit is maar één keer nodig.
set -euo pipefail

APP="${APP_CONTAINER:-zekerflex-app-1}"
DOEL=/app/storage/gezicht
BRON=https://github.com/opencv/opencv_zoo/raw/main/models

zet() { # bestand, pad in de bron, sha256
  local bestand="$1" pad="$2" sha="$3"
  if sudo docker exec "$APP" sh -c "[ -f '$DOEL/$bestand' ] && echo '$sha  $DOEL/$bestand' | sha256sum -c - >/dev/null 2>&1"; then
    echo "ok (al aanwezig, hash klopt): $bestand"
    return 0
  fi
  echo "ophalen: $bestand"
  sudo docker exec -u nextjs "$APP" sh -c "mkdir -p '$DOEL' && wget -q -O '$DOEL/$bestand.tmp' '$BRON/$pad' && echo '$sha  $DOEL/$bestand.tmp' | sha256sum -c - >/dev/null && mv '$DOEL/$bestand.tmp' '$DOEL/$bestand'" \
    || { sudo docker exec "$APP" rm -f "$DOEL/$bestand.tmp" || true; echo "MISLUKT: $bestand (download of hash klopt niet)"; exit 1; }
  echo "klaar: $bestand"
}

zet face_detection_yunet_2023mar.onnx face_detection_yunet/face_detection_yunet_2023mar.onnx 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
zet face_recognition_sface_2021dec.onnx face_recognition_sface/face_recognition_sface_2021dec.onnx 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79
sudo docker exec "$APP" ls -l "$DOEL"
