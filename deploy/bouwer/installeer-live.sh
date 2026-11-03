#!/usr/bin/env bash
# Installeert de ZekerFlex live-zetter (zf-live.py) als systemd-dienst op de VPS.
# Eenmalig, vanuit de projectmap op de server:
#   sudo bash deploy/bouwer/installeer-live.sh
# Daarna werkt Admin → ZekerFlex AI → Live zetten. De dienst start vanzelf mee
# met de server en herstart zichzelf na een fout. Logboek: journalctl -u zf-live -f
set -euo pipefail

GEBRUIKER="${SUDO_USER:-$USER}"
if [ "$GEBRUIKER" = "root" ]; then
  echo "Draai dit met sudo vanuit je gewone gebruiker (de eigenaar van ~/zekerflex), niet als root." >&2
  exit 1
fi
THUIS="$(getent passwd "$GEBRUIKER" | cut -d: -f6)"
ZF_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ZF_DIR/deploy/bouwer/zf-live.py"

command -v python3 >/dev/null || { echo "python3 ontbreekt (apt install python3)" >&2; exit 1; }
command -v git >/dev/null || { echo "git ontbreekt (apt install git)" >&2; exit 1; }
id -nG "$GEBRUIKER" | grep -qw docker || { echo "$GEBRUIKER zit niet in de docker-groep (usermod -aG docker $GEBRUIKER)" >&2; exit 1; }

cat > /etc/systemd/system/zf-live.service <<EOF
[Unit]
Description=ZekerFlex live-zetter (Admin -> ZekerFlex AI -> Live zetten)
After=docker.service network-online.target
Wants=network-online.target docker.service

[Service]
User=$GEBRUIKER
WorkingDirectory=$ZF_DIR
Environment=ZF_DIR=$ZF_DIR
Environment=ZF_SRC=$THUIS/.zf-bron
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $SCRIPT
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now zf-live.service
sleep 3
systemctl --no-pager --lines=5 status zf-live.service || true
echo
echo "Klaar. Open Admin -> ZekerFlex AI -> Live zetten; de server meldt zich binnen een halve minuut."
