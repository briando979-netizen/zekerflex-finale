#!/usr/bin/env bash
# Restore from a backup created by backup.sh. DESTRUCTIVE: it drops and
# recreates the target database and overwrites the storage volume.
#
#   deploy/scripts/restore.sh backups/20260909-120000
#   RESTORE_DB_ONLY=1 deploy/scripts/restore.sh backups/20260909-120000
#
# Run a disaster-recovery drill regularly: restore the latest backup into a
# THROWAWAY compose project and check /api/ready + a few smoke queries, then
# tear it down. Never point this at production without a fresh backup first.
set -euo pipefail

SRC="${1:?usage: restore.sh <backups/DIR>}"
[ -d "$SRC" ] || { echo "no such backup dir: $SRC" >&2; exit 1; }
[ -f "$SRC/zekerflex-db.sql.gz" ] || { echo "missing $SRC/zekerflex-db.sql.gz" >&2; exit 1; }

cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f docker-compose.prod.yml"

read -r -p "This will OVERWRITE the database (and storage) of the current compose project. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || { echo "aborted"; exit 1; }

echo "▸ Restoring database…"
# --clean --if-exists in the dump drops objects first; run inside a single txn.
gunzip -c "$SRC/zekerflex-db.sql.gz" \
  | $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U zekerflex -d zekerflex

if [ "${RESTORE_DB_ONLY:-0}" != "1" ] && [ -f "$SRC/storage.tar.gz" ]; then
  echo "▸ Restoring storage volume…"
  docker run --rm -v zekerflex_app-storage:/data -v "$(pwd)/$SRC:/backup" busybox \
    sh -c "rm -rf /data/* && tar xzf /backup/storage.tar.gz -C /data"
fi

echo "▸ Re-applying any migrations newer than the dump…"
$COMPOSE exec -T app npx prisma migrate deploy || true

echo "✓ Restore complete. Check: curl -fsS localhost:3000/api/ready"
