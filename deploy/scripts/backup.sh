#!/usr/bin/env bash
# Read-only backup: pg_dump + the storage volume (uploads, mailbox, prefs,
# fiscal, replacements). Writes only to ./backups. Touches nothing in the
# running system.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f docker-compose.prod.yml"
OUT="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "▸ Database dump…"
$COMPOSE exec -T postgres pg_dump -U zekerflex -d zekerflex --no-owner --clean --if-exists \
  | gzip > "$OUT/zekerflex-db.sql.gz"

echo "▸ Storage volume…"
$COMPOSE run --rm --no-deps -v "$(pwd)/$OUT:/backup" app \
  sh -c "tar czf /backup/storage.tar.gz -C /app storage" 2>/dev/null \
  || docker run --rm -v zekerflex_app-storage:/data -v "$(pwd)/$OUT:/backup" busybox \
       sh -c "tar czf /backup/storage.tar.gz -C /data ."

echo "✓ Backup in $OUT"
ls -lh "$OUT"

# Keep the last 14 backups.
ls -1dt backups/*/ 2>/dev/null | tail -n +15 | xargs -r rm -rf
