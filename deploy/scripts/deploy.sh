#!/usr/bin/env bash
# Deploy / update the ZekerFlex stack on the VPS.
# Non-destructive: builds the app image, applies FORWARD-ONLY migrations
# (never resets), restarts. No seed, no wipe.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f docker-compose.prod.yml"

if [[ ! -f .env.production ]]; then
  echo "✖ .env.production ontbreekt. Kopieer deploy/.env.production.example en vul hem in." >&2
  exit 1
fi

PROFILES="${PROFILES:-}"   # e.g. PROFILES="--profile mail --profile voice"

echo "▸ Pull base images…"
$COMPOSE $PROFILES pull --ignore-buildable || true

echo "▸ Build app image…"
$COMPOSE build app

echo "▸ Start datastores…"
$COMPOSE up -d postgres redis ollama

echo "▸ Wachten op Postgres…"
until $COMPOSE exec -T postgres pg_isready -U zekerflex -d zekerflex >/dev/null 2>&1; do sleep 2; done

if [[ "${RUN_MIGRATIONS:-ask}" == "yes" ]]; then
  echo "▸ Migraties toepassen (forward-only)…"
  $COMPOSE run --rm --no-deps app npx prisma migrate deploy
else
  echo "▸ Migraties overgeslagen. Draai handmatig wanneer je klaar bent:"
  echo "    $COMPOSE run --rm --no-deps app npx prisma migrate deploy"
fi

echo "▸ (Her)start app + tunnel + extras…"
$COMPOSE $PROFILES up -d

echo "▸ Status:"
$COMPOSE ps
echo
echo "✓ Klaar. Healthcheck: docker compose -f docker-compose.prod.yml exec app wget -qO- http://127.0.0.1:3000/api/health"
