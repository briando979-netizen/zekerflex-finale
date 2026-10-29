#!/usr/bin/env bash
# ZekerFlex zero-config installer — zelf-gehost, altijd live, zonder Vercel.
# Genereert ALLE secrets zelf en vult .env.production automatisch in; jij hoeft
# alleen je domein te geven. Draai als root op een verse Debian/Ubuntu-VPS,
# vanuit de geclonede repo:
#
#   sudo DOMAIN=jouwdomein.nl CLOUDFLARE_TUNNEL_TOKEN=... bash deploy/scripts/install.sh
#
# CLOUDFLARE_TUNNEL_TOKEN mag je ook later invullen (in .env.production) als je
# 'm nog niet hebt. Idempotent: bestaande .env.production wordt niet overschreven.
set -euo pipefail

cd "$(dirname "$0")/../.." # repo-root

DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  read -rp "Domein (bv. zekerflex.nl): " DOMAIN
fi
if [ -z "$DOMAIN" ]; then
  echo "!! Geen domein opgegeven." >&2
  exit 1
fi
CFTOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"

echo "==> Docker installeren (nodig om de secrets te genereren en de stack te draaien)"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-plugin git ufw curl
fi
systemctl enable --now docker

if [ ! -f .env.production ]; then
  echo "==> Secrets genereren en .env.production automatisch invullen"
  gen="$(docker run --rm -v "$PWD/deploy/scripts:/s:ro" node:22-alpine node /s/gen-secrets.mjs)"
  val() { printf '%s\n' "$gen" | grep -m1 "^$1=" | cut -d= -f2-; }
  AUTH_SECRET="$(val AUTH_SECRET)"
  INTERNAL_CRON_TOKEN="$(val INTERNAL_CRON_TOKEN)"
  POSTGRES_PASSWORD="$(val POSTGRES_PASSWORD)"
  VAPID_PUB="$(val WEBPUSH_VAPID_PUBLIC_KEY)"
  VAPID_PRIV="$(val WEBPUSH_VAPID_PRIVATE_KEY)"
  TURN_SECRET="$(val TURN_SHARED_SECRET)"

  cp deploy/.env.production.example .env.production
  sed -i \
    -e "s#^APP_BASE_URL=.*#APP_BASE_URL=https://${DOMAIN}#" \
    -e "s#^AUTH_URL=.*#AUTH_URL=https://${DOMAIN}#" \
    -e "s#^AUTH_SECRET=.*#AUTH_SECRET=${AUTH_SECRET}#" \
    -e "s#^INTERNAL_CRON_TOKEN=.*#INTERNAL_CRON_TOKEN=${INTERNAL_CRON_TOKEN}#" \
    -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${POSTGRES_PASSWORD}#" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://zekerflex:${POSTGRES_PASSWORD}@postgres:5432/zekerflex?schema=public#" \
    -e "s#^CLOUDFLARE_TUNNEL_TOKEN=.*#CLOUDFLARE_TUNNEL_TOKEN=${CFTOKEN}#" \
    -e "s#^WEBPUSH_VAPID_PUBLIC_KEY=.*#WEBPUSH_VAPID_PUBLIC_KEY=${VAPID_PUB}#" \
    -e "s#^WEBPUSH_VAPID_PRIVATE_KEY=.*#WEBPUSH_VAPID_PRIVATE_KEY=${VAPID_PRIV}#" \
    -e "s#^TURN_SHARED_SECRET=.*#TURN_SHARED_SECRET=${TURN_SECRET}#" \
    -e "s#^MAIL_FROM=.*#MAIL_FROM=noreply@${DOMAIN}#" \
    -e "s#^MAIL_ADMIN=.*#MAIL_ADMIN=info@${DOMAIN}#" \
    -e "s#^MAIL_DOMAIN=.*#MAIL_DOMAIN=${DOMAIN}#" \
    -e "s#^MAIL_HOSTNAME=.*#MAIL_HOSTNAME=mail.${DOMAIN}#" \
    .env.production
  chmod 600 .env.production
  echo "    .env.production aangemaakt (secrets automatisch ingevuld)."
  [ -z "$CFTOKEN" ] && echo "    LET OP: CLOUDFLARE_TUNNEL_TOKEN is leeg — vul 'm later in .env.production in om online te gaan."
else
  echo "==> .env.production bestaat al — laat 'm ongemoeid."
fi

echo "==> Rest van de opzet (bouwen, migreren, starten, altijd-live-units)"
exec bash deploy/scripts/bootstrap.sh
