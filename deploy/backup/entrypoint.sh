#!/usr/bin/env bash
# ZekerFlex nachtelijke back-up (self-host, docker-compose.vps.yml). Draait in het
# postgres-image, zodat pg_dump precies de versie van de server heeft. Elke nacht
# om BACKUP_AT (UTC):
#   1. pg_dump (eigen formaat, gecomprimeerd) naar /backups/db/
#   2. het opslagvolume (uploads) als tar.gz naar /backups/storage/
#   3. proef-terugzetting van de dump in een wegwerp-database: bewijst dat de
#      back-up echt terug te zetten is, en telt tabellen + gebruikers
#   4. oude back-ups opruimen (de nieuwste BACKUP_KEEP blijven staan)
# De uitkomst staat in /backups/status.json. De app ziet de map alleen-lezen en
# waarschuwt de eigenaar als een nacht mislukt of uitblijft (lib/ops/backup.ts).
#
# Meteen een back-up maken:  docker compose -f docker-compose.vps.yml exec backup bash /backup.sh now
# Terugzetten: zie deploy/DISASTER-RECOVERY.md.
set -uo pipefail

: "${PGPASSWORD:?PGPASSWORD ontbreekt in de omgeving}"
export PGHOST="${PGHOST:-postgres}" PGUSER="${PGUSER:-zekerflex}"
DB="${PGDATABASE:-zekerflex}"
DIR=/backups
KEEP="${BACKUP_KEEP:-14}"
AT="${BACKUP_AT:-02:30}"
OWNER="${BACKUP_UID:-1000}"
CHECK_DB=zf_restore_check

mkdir -p "$DIR/db" "$DIR/storage"
chmod 755 "$DIR" "$DIR/db" "$DIR/storage"

# foutmeldingen gaan als tekst in JSON: alleen veilige tekens, kort
clean() { printf '%s' "$1" | tr '\n' ' ' | tr -cd 'A-Za-z0-9 ._:/()=-' | cut -c1-300; }
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }

prune() { # map patroon
  ls -1t "$1"/$2 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
}

run_backup() {
  local start ts file sfile err="" bytes=0 sbytes=0 restore_ok=false tables=0 users=0 live=0 ok=false
  start=$(date +%s)
  ts=$(date -u +%Y%m%d-%H%M)
  file="zekerflex-$ts.dump"
  sfile="storage-$ts.tar.gz"
  echo "[zf-backup] start $ts"

  if pg_dump -d "$DB" -Fc -Z 6 -f "$DIR/db/$file.part" 2>/tmp/dump.err; then
    mv -f "$DIR/db/$file.part" "$DIR/db/$file"
    chown "$OWNER" "$DIR/db/$file" && chmod 600 "$DIR/db/$file"
    bytes=$(stat -c %s "$DIR/db/$file")
  else
    err="pg_dump: $(head -c 200 /tmp/dump.err)"
    rm -f "$DIR/db/$file.part"
    file=""
  fi

  if [ -d /storage ]; then
    if tar czf "$DIR/storage/$sfile.part" -C /storage . 2>/tmp/tar.err; then
      mv -f "$DIR/storage/$sfile.part" "$DIR/storage/$sfile"
      chown "$OWNER" "$DIR/storage/$sfile" && chmod 600 "$DIR/storage/$sfile"
      sbytes=$(stat -c %s "$DIR/storage/$sfile")
    else
      [ -n "$err" ] || err="uploads: $(head -c 200 /tmp/tar.err)"
      rm -f "$DIR/storage/$sfile.part"
      sfile=""
    fi
  else
    sfile=""
  fi

  if [ -n "$file" ]; then
    dropdb --if-exists "$CHECK_DB" 2>/dev/null
    if createdb "$CHECK_DB" 2>/tmp/restore.err &&
      pg_restore --no-owner --no-privileges --exit-on-error -d "$CHECK_DB" "$DIR/db/$file" 2>>/tmp/restore.err; then
      tables=$(num "$(psql -d "$CHECK_DB" -Atc "select count(*) from information_schema.tables where table_schema = 'public'" 2>/dev/null)")
      users=$(num "$(psql -d "$CHECK_DB" -Atc 'select count(*) from "User"' 2>/dev/null)")
      live=$(num "$(psql -d "$DB" -Atc 'select count(*) from "User"' 2>/dev/null)")
      [ "$tables" -gt 0 ] && restore_ok=true
    fi
    if [ "$restore_ok" != true ] && [ -z "$err" ]; then
      err="proef-terugzetting: $(head -c 200 /tmp/restore.err)"
    fi
    dropdb --if-exists "$CHECK_DB" 2>/dev/null
  fi

  [ -n "$file" ] && [ -z "$err" ] && [ "$restore_ok" = true ] && ok=true

  prune "$DIR/db" "*.dump"
  prune "$DIR/storage" "*.tar.gz"
  rm -f "$DIR"/db/*.part "$DIR"/storage/*.part

  local kept tmp="$DIR/.status.json.tmp"
  kept=$(ls -1 "$DIR"/db/*.dump 2>/dev/null | wc -l)
  cat > "$tmp" <<EOF
{"at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","ok":$ok,"file":"$file","bytes":$bytes,"storageFile":"$sfile","storageBytes":$sbytes,"seconds":$(( $(date +%s) - start )),"restore":{"ok":$restore_ok,"tables":$tables,"users":$users,"liveUsers":$live},"kept":$kept,"error":"$(clean "$err")"}
EOF
  chmod 644 "$tmp" && mv -f "$tmp" "$DIR/status.json"
  echo "[zf-backup] klaar: ok=$ok bestand=$file ($bytes bytes) terugzetten=$restore_ok tabellen=$tables"
}

seconds_until_next() {
  local now next
  now=$(date -u +%s)
  next=$(date -u -d "today $AT" +%s)
  [ "$next" -gt "$now" ] || next=$(date -u -d "tomorrow $AT" +%s)
  echo $((next - now))
}

if [ "${1:-}" = "now" ]; then
  run_backup
  exit 0
fi

trap 'exit 0' TERM INT

# Een nieuwe of herstarte server wacht niet tot de nacht als de laatste back-up
# ouder is dan een dag.
latest=$(ls -1t "$DIR"/db/*.dump 2>/dev/null | head -1)
if [ -z "$latest" ] || [ $(( $(date +%s) - $(stat -c %Y "$latest") )) -gt 86400 ]; then
  run_backup
fi

while true; do
  sleep "$(seconds_until_next)" &
  wait $!
  run_backup
done
