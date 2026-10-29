#!/usr/bin/env bash
# Automatische Let's Encrypt-vernieuwing voor de soevereine Redis.
# Draai dit via cron (zie README). certbot vernieuwt alleen als het certificaat
# bijna verloopt; Redis wordt ALLEEN herstart als er echt een nieuw certificaat
# is (via --deploy-hook), zodat de cron verder niets verstoort.
set -euo pipefail

cd "$(dirname "$0")"

# Laad REDIS_DOMAIN uit .env (naast dit script).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
: "${REDIS_DOMAIN:?Zet REDIS_DOMAIN in deploy/redis/.env}"

CERT_SRC="/etc/letsencrypt/live/${REDIS_DOMAIN}"
CERT_DST="$(pwd)/certs"
OWNER="$(id -u):$(id -g)"
COMPOSE="$(pwd)/docker-compose.yml"

sudo certbot renew --standalone --quiet \
  --deploy-hook "cp '${CERT_SRC}/fullchain.pem' '${CERT_DST}/fullchain.pem' && cp '${CERT_SRC}/privkey.pem' '${CERT_DST}/privkey.pem' && chown ${OWNER} '${CERT_DST}'/*.pem && docker compose -f '${COMPOSE}' restart redis"

echo "renew-cert: klaar (Redis is alleen herstart als er een nieuw certificaat was)."
