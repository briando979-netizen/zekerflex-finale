#!/usr/bin/env bash
# Eén commando om ZekerFlex op een VERSE VPS "altijd live" te zetten — zonder
# Vercel. Draai als root op een schone Debian/Ubuntu, vanuit de geclonede repo:
#   sudo bash deploy/scripts/bootstrap.sh
# Idempotent: je kunt het veilig opnieuw draaien.
set -euo pipefail

cd "$(dirname "$0")/../.." # repo-root (deploy/scripts -> ../../)
REPO_DIR="$(pwd)"

echo "==> Docker + basisgereedschap"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-plugin git ufw curl
fi
systemctl enable --now docker

echo "==> Firewall: alleen SSH open (web loopt via de uitgaande Cloudflare-tunnel)"
if command -v ufw >/dev/null 2>&1; then
  ufw --force default deny incoming
  ufw --force default allow outgoing
  ufw allow OpenSSH
  ufw --force enable
fi

if [ ! -f .env.production ]; then
  echo "!! .env.production ontbreekt." >&2
  echo "   Kopieer deploy/.env.production.example naar .env.production en vul 'm in" >&2
  echo "   (node deploy/scripts/gen-secrets.mjs helpt met de secrets). Daarna opnieuw draaien." >&2
  exit 1
fi

echo "==> Eerste keer: bouwen + migreren + starten"
RUN_MIGRATIONS=yes bash deploy/scripts/deploy.sh

echo "==> systemd-units installeren (start bij boot + health-watchdog)"
chmod +x deploy/scripts/watchdog.sh deploy/scripts/deploy.sh
sed "s#__REPO__#${REPO_DIR}#g" deploy/systemd/zekerflex.service > /etc/systemd/system/zekerflex.service
sed "s#__REPO__#${REPO_DIR}#g" deploy/systemd/zekerflex-watchdog.service > /etc/systemd/system/zekerflex-watchdog.service
cp deploy/systemd/zekerflex-watchdog.timer /etc/systemd/system/zekerflex-watchdog.timer
systemctl daemon-reload
systemctl enable zekerflex.service            # komt na een reboot vanzelf op
systemctl enable --now zekerflex-watchdog.timer

echo ""
echo "==> Klaar. ZekerFlex draait nu zelf-gehost en komt na elke reboot/crash vanzelf terug."
echo "    Status:   systemctl status zekerflex"
echo "    Logs:     docker compose -f docker-compose.prod.yml logs -f app"
echo "    Watchdog: systemctl list-timers zekerflex-watchdog.timer"
