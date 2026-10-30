#!/usr/bin/env bash
# ZekerFlex op een VPS met EIGEN PUBLIEK IP (TransIP, Hetzner, …) — zonder
# Vercel en zonder Cloudflare-tunnel. Verkeer komt rechtstreeks binnen via Caddy.
# Draai als root vanuit de repo-root op een verse Debian/Ubuntu:
#
#   sudo bash deploy/scripts/deploy-vps.sh
#   sudo DOMAIN=zekerflex.com bash deploy/scripts/deploy-vps.sh   # met TLS
#
# - Zonder DOMAIN: de site komt op http://<publiek-ip> (platte HTTP).
# - Met DOMAIN (en de A-record wijst al naar deze VPS): Caddy haalt automatisch
#   een Let's Encrypt-certificaat op en de site komt op https://<domein>.
# Idempotent: bestaande .env.production wordt niet overschreven; veilig opnieuw
# te draaien om bij te werken.
set -euo pipefail

cd "$(dirname "$0")/../.." # repo-root
REPO_DIR="$(pwd)"
COMPOSE_FILE="docker-compose.vps.yml"
DOMAIN="${DOMAIN:-}"

echo "==> 1/6 Docker + compose-plugin installeren (indien nodig)"
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  # Ubuntu levert docker.io + docker-compose-v2 (de `docker compose`-subcommando).
  apt-get install -y docker.io docker-compose-v2 git curl ufw || true
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "    compose-plugin ontbreekt — Docker's officiële installer proberen"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker --version
docker compose version

echo "==> 2/6 Firewall: SSH + HTTP(S) open (web komt rechtstreeks binnen)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp  || true
  ufw allow 80/tcp  || true
  ufw allow 443/tcp || true
  ufw --force enable || true
fi

if [ ! -f .env.production ]; then
  echo "==> 3/6 Secrets genereren en .env.production aanmaken (direct-IP)"
  PUBLIC_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  if [ -n "$DOMAIN" ]; then
    ORIGIN="https://${DOMAIN}"
    SITE_ADDRESS="${DOMAIN}"
  else
    ORIGIN="http://${PUBLIC_IP}"
    SITE_ADDRESS=":80"
  fi
  gen="$(docker run --rm -v "$PWD/deploy/scripts:/s:ro" node:22-alpine node /s/gen-secrets.mjs)"
  val() { printf '%s\n' "$gen" | grep -m1 "^$1=" | cut -d= -f2-; }
  AUTH_SECRET="$(val AUTH_SECRET)"
  INTERNAL_CRON_TOKEN="$(val INTERNAL_CRON_TOKEN)"
  POSTGRES_PASSWORD="$(val POSTGRES_PASSWORD)"
  VAPID_PUB="$(val WEBPUSH_VAPID_PUBLIC_KEY)"
  VAPID_PRIV="$(val WEBPUSH_VAPID_PRIVATE_KEY)"

  umask 077
  cat > .env.production <<EOF
# Automatisch gegenereerd door deploy/scripts/deploy-vps.sh — $(date -u +%FT%TZ)
NODE_ENV=production

# Publieke origin (voor e-maillinks, auth-callbacks, SEO-canonicals).
# Zet dit op https://<jouwdomein> zodra het domein naar deze VPS wijst.
APP_BASE_URL=${ORIGIN}
AUTH_URL=${ORIGIN}
AUTH_TRUST_HOST=true

# Reverse proxy (Caddy): ":80" = platte HTTP; een domein = automatische HTTPS.
SITE_ADDRESS=${SITE_ADDRESS}
ACME_EMAIL=

# Secrets (automatisch gegenereerd).
AUTH_SECRET=${AUTH_SECRET}
INTERNAL_CRON_TOKEN=${INTERNAL_CRON_TOKEN}

# Datastores in de compose-stack.
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://zekerflex:${POSTGRES_PASSWORD}@postgres:5432/zekerflex?schema=public
# Zelf-gehoste Postgres kent geen aparte pooled/direct-URL; Prisma's directUrl
# (gebruikt door 'migrate deploy') wijst naar dezelfde verbinding.
DATABASE_URL_UNPOOLED=postgresql://zekerflex:${POSTGRES_PASSWORD}@postgres:5432/zekerflex?schema=public
REDIS_URL=redis://redis:6379

# Web Push (self-hosted VAPID).
WEBPUSH_VAPID_PUBLIC_KEY=${VAPID_PUB}
WEBPUSH_VAPID_PRIVATE_KEY=${VAPID_PRIV}
WEBPUSH_CONTACT=mailto:info@zekerflex.com

# AI: standaard uit (geen lokale LLM op een CPU-VPS). Zet een externe LLM aan
# met LLM_API_KEY + LLM_BASE_URL als je snelle AI wilt; anders valt de app
# netjes terug op sjablonen.
AI_ALLOW_REMOTE=false
WHISPER_ENABLED=false
IMAGE_ENABLED=false
RAG_ENABLED=true

# E-mail: zonder SMTP_HOST wordt elke mail alleen vastgelegd in /admin/mail
# (geen echte bezorging). Vul later een relay in om echt te versturen.
SMTP_HOST=
MAIL_FROM=noreply@zekerflex.com
MAIL_FROM_NAME=ZekerFlex
MAIL_ADMIN=info@zekerflex.com

# Betalingen/KYC/Maps/SEPA: leeg = die features staan uit tot je sleutels invult.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF
  chmod 600 .env.production
  echo "    .env.production aangemaakt. Origin: ${ORIGIN}"
else
  echo "==> 3/6 .env.production bestaat al — ongemoeid gelaten."
fi

COMPOSE="docker compose --env-file .env.production -f ${COMPOSE_FILE}"

echo "==> 4/6 App-image bouwen (kan een paar minuten duren)"
$COMPOSE build app

echo "==> 5/6 Datastores starten + migraties toepassen (forward-only)"
$COMPOSE up -d postgres redis
until $COMPOSE exec -T postgres pg_isready -U zekerflex -d zekerflex >/dev/null 2>&1; do sleep 2; done
$COMPOSE run --rm --no-deps app npx prisma migrate deploy

echo "==> 6/6 Volledige stack starten (app + caddy + datastores)"
$COMPOSE up -d

echo ""
echo "==> Status:"
$COMPOSE ps
echo ""
echo "✓ Klaar. ZekerFlex draait zelf-gehost en komt na reboot/crash vanzelf terug."
if [ -n "$DOMAIN" ]; then
  echo "   Site: https://${DOMAIN}  (zodra de A-record naar deze VPS wijst)"
else
  echo "   Site: http://$(curl -fsS https://api.ipify.org 2>/dev/null || echo '<publiek-ip>')"
  echo "   TLS aanzetten? Zet SITE_ADDRESS + APP_BASE_URL/AUTH_URL op je domein in"
  echo "   .env.production en draai: ${COMPOSE} up -d"
fi
echo "   Logs:   ${COMPOSE} logs -f app"
