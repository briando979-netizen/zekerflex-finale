#!/usr/bin/env bash
# ZekerFlex nachtelijke back-up (self-host, docker-compose.vps.yml). Draait in het
# postgres-image (deploy/backup/Dockerfile), zodat pg_dump precies de versie van
# de server heeft. Elke nacht om BACKUP_AT (UTC):
#   1. pg_dump (eigen formaat, gecomprimeerd) naar /backups/db/, met daarnaast de
#      sha256 en het aantal rijen per tabel op dat moment (voor de hersteltest)
#   2. het opslagvolume (uploads) als tar.gz naar /backups/storage/, en de eigen
#      Git-server (Forgejo, /forgejo) als tar.gz naar /backups/forgejo/: eerst een
#      momentopname van de SQLite-database (sqlite3 .backup, als de gebruiker van
#      Forgejo), dan de repositories en de rest
#   3. proef-terugzetting van de dump in een wegwerp-database: bewijst dat de
#      back-up echt terug te zetten is, en telt tabellen + gebruikers
#   4. met BACKUP_PASSPHRASE: een versleutelde kopie (.enc, AES-256) van dump en
#      uploads; met BACKUP_OFFSITE: die kopie naar een plek buiten de server
#      (scp naar een eigen reserveserver, of WebDAV-opslag via https)
#   5. oude back-ups opruimen (de nieuwste BACKUP_KEEP blijven staan)
# Elke zondag (en op verzoek: `bash /backup.sh verify`) volgt de diepgaande
# hersteltest: de nieuwste dump wordt teruggezet en tabel voor tabel vergeleken
# met de aantallen van het moment van de back-up; ook de versleutelde kopie wordt
# ontcijferd en gecontroleerd, en de kopie buiten de server wordt nagemeten.
# De uitkomsten staan in /backups/status.json en /backups/verify.json (+ de
# geschiedenis in verificaties.jsonl). De app ziet de map alleen-lezen en
# waarschuwt de eigenaar als iets mislukt of uitblijft (lib/ops/backup.ts).
#
# Meteen een back-up maken:  docker compose -f docker-compose.vps.yml exec backup bash /backup.sh now
# Hersteltest nu:            docker compose -f docker-compose.vps.yml exec backup bash /backup.sh verify
# Terugzetten: zie deploy/DISASTER-RECOVERY.md.
set -uo pipefail

: "${PGPASSWORD:?PGPASSWORD ontbreekt in de omgeving}"
export PGHOST="${PGHOST:-postgres}" PGUSER="${PGUSER:-zekerflex}"
DB="${PGDATABASE:-zekerflex}"
DIR=/backups
KEEP="${BACKUP_KEEP:-14}"
# de versleutelde kopieën (.enc) mogen korter blijven: de pc of de kopieplek bewaart er zelf meer (deploy/backup/OPHALEN.md)
KEEP_ENC="${BACKUP_KEEP_ENC:-$KEEP}"
case "$KEEP_ENC" in '' | *[!0-9]* | 0) KEEP_ENC="$KEEP" ;; esac
AT="${BACKUP_AT:-02:30}"
OWNER="${BACKUP_UID:-1000}"
PASS="${BACKUP_PASSPHRASE:-}"
# openssl leest de zin met -pass env:PASS uit de OMGEVING, niet uit een shellvariabele: zonder export faalde elke
# versleuteling ("No environment variable PASS", 13 nov 2026, de eerste keer dat er een zin stond)
export PASS
OFFSITE="${BACKUP_OFFSITE:-}"
OFFSITE_USER="${BACKUP_OFFSITE_USER:-}"
OFFSITE_PASS="${BACKUP_OFFSITE_PASS:-}"
CHECK_DB=zf_restore_check
SSH_OPTS=(-i /offsite/id_ed25519 -o UserKnownHostsFile=/offsite/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=20)
# de gebruiker van Forgejo in zijn container (USER_UID in docker-compose.vps.yml)
FJ_UID="${FORGEJO_UID:-1000}"

mkdir -p "$DIR/db" "$DIR/storage" "$DIR/forgejo"
chmod 755 "$DIR" "$DIR/db" "$DIR/storage" "$DIR/forgejo"

# foutmeldingen gaan als tekst in JSON: alleen veilige tekens, kort
clean() { printf '%s' "$1" | tr '\n' ' ' | tr -cd 'A-Za-z0-9 ._:/()=-' | cut -c1-300; }
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
jsonstr() { printf '"%s"' "$(clean "$1")"; }

prune() { # map patroon [aantal, standaard KEEP]
  ls -1t "$1"/$2 2>/dev/null | tail -n +$((${3:-$KEEP} + 1)) | xargs -r rm -f
}

# De eigen Git-server (Forgejo) als één archief. De database is SQLite met een WAL:
# het losse bestand kan midden in een schrijfactie zitten, dus eerst een
# momentopname via sqlite3 .backup (de juiste weg terwijl Forgejo draait). Die draait
# als de gebruiker van Forgejo: zo komt er nooit een bestand van root in zijn map
# (dan zou Forgejo zijn eigen database niet meer kunnen schrijven). Daarna de rest,
# zonder de losse database-bestanden en wat elke minuut verandert (log, wachtrij,
# tmp). tar meldt 1 als een bestand tijdens het lezen veranderde (een spiegel die
# net bijwerkt); dat is geen fout, 2 wel. Twee stappen: de uitsluiting van
# ./gitea/gitea.db zou anders ook de momentopname treffen (zelfde naam), dus eerst
# de map zonder, dan de momentopname erbij (tar rf), en pas daarna comprimeren.
forgejo_archief() { # doel (.tar.gz) → 0 = gelukt
  local doel="$1" tmp rc ok=1
  : > /tmp/fj.err
  tmp=$(mktemp -d) || return 1
  mkdir "$tmp/gitea" && chown -R "$FJ_UID:$FJ_UID" "$tmp" || { rm -rf "$tmp"; return 1; }
  if ! setpriv --reuid="$FJ_UID" --regid="$FJ_UID" --clear-groups sqlite3 /forgejo/gitea/gitea.db ".backup '$tmp/gitea/gitea.db'" 2>>/tmp/fj.err; then
    rm -rf "$tmp"; return 1
  fi
  if [ "$(sqlite3 "$tmp/gitea/gitea.db" 'PRAGMA integrity_check' 2>>/tmp/fj.err)" != ok ]; then
    echo "momentopname van de database niet in orde" >> /tmp/fj.err
    rm -rf "$tmp"; return 1
  fi
  tar cf "$doel.tar" -C /forgejo \
    --exclude=./gitea/gitea.db --exclude=./gitea/gitea.db-wal --exclude=./gitea/gitea.db-shm \
    --exclude=./gitea/log --exclude=./gitea/queues --exclude=./gitea/tmp \
    . 2>>/tmp/fj.err
  rc=$?
  if [ "$rc" -le 1 ] && tar rf "$doel.tar" -C "$tmp" ./gitea/gitea.db 2>>/tmp/fj.err && gzip -6 -c "$doel.tar" > "$doel" 2>>/tmp/fj.err; then
    ok=0
  fi
  rm -rf "$tmp" "$doel.tar"
  return "$ok"
}

# Rijen per tabel (public), gesorteerd: "tabel<TAB>aantal". Voor de hersteltest.
tel_tabellen() { # database
  local t
  for t in $(psql -d "$1" -Atc "select tablename from pg_tables where schemaname = 'public' order by 1" 2>/dev/null); do
    printf '%s\t%s\n' "$t" "$(num "$(psql -d "$1" -Atc "select count(*) from \"$t\"" 2>/dev/null)")"
  done
}

# ---------------------------------------------------------------------------
# Versleutelen en buiten de server zetten
# ---------------------------------------------------------------------------
versleutel() { # bron doel
  openssl enc -aes-256-cbc -md sha256 -pbkdf2 -iter 210000 -salt -pass env:PASS -in "$1" -out "$2.part" 2>/tmp/enc.err && mv -f "$2.part" "$2" && chown "$OWNER" "$2" && chmod 600 "$2"
}
ontcijfer() { # bron doel
  openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 210000 -pass env:PASS -in "$1" -out "$2" 2>/tmp/dec.err
}

# Eén bestand naar de kopieplek. scp://gebruiker@host/pad  of  https://host/webdav/pad/
offsite_put() { # bestand
  local f="$1" naam; naam=$(basename "$f")
  case "$OFFSITE" in
    scp://*)
      local rest="${OFFSITE#scp://}" host="${rest%%/*}" pad="/${rest#*/}"
      scp "${SSH_OPTS[@]}" -q "$f" "$host:$pad/$naam" 2>/tmp/offsite.err ;;
    https://*)
      curl -fsS --max-time 1800 -u "$OFFSITE_USER:$OFFSITE_PASS" -T "$f" "${OFFSITE%/}/$naam" -o /dev/null 2>/tmp/offsite.err ;;
    *) echo "onbekend doel (gebruik scp://gebruiker@host/pad of https://host/pad/)" > /tmp/offsite.err; return 1 ;;
  esac
}
# Grootte van een bestand op de kopieplek (0 = niet gevonden).
offsite_size() { # bestandsnaam
  case "$OFFSITE" in
    scp://*)
      local rest="${OFFSITE#scp://}" host="${rest%%/*}" pad="/${rest#*/}"
      num "$(ssh "${SSH_OPTS[@]}" "$host" "stat -c %s '$pad/$1' 2>/dev/null || wc -c < '$pad/$1' 2>/dev/null" 2>/dev/null | tr -dc '0-9')" ;;
    https://*)
      num "$(curl -fsSI --max-time 60 -u "$OFFSITE_USER:$OFFSITE_PASS" "${OFFSITE%/}/$1" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-length:" {print $2}' | tail -1)" ;;
    *) echo 0 ;;
  esac
}
# Alleen de nieuwste BACKUP_KEEP blijven ook daar staan (zelfde patroon, oudste weg).
offsite_prune() {
  case "$OFFSITE" in
    scp://*)
      local rest="${OFFSITE#scp://}" host="${rest%%/*}" pad="/${rest#*/}"
      ssh "${SSH_OPTS[@]}" "$host" "cd '$pad' 2>/dev/null && ls -1t zekerflex-*.dump.enc storage-*.tar.gz.enc forgejo-*.tar.gz.enc 2>/dev/null | awk -v k=$KEEP 'BEGIN{a=0;b=0;c=0} /^zekerflex-/{a++; if(a>k) print} /^storage-/{b++; if(b>k) print} /^forgejo-/{c++; if(c>k) print}' | xargs -r rm -f" 2>/dev/null ;;
    *) : ;; # WebDAV: opruimen laten we aan de opslag zelf (quota/levenscyclus)
  esac
}

# ---------------------------------------------------------------------------
# De nachtelijke back-up
# ---------------------------------------------------------------------------
run_backup() {
  local start ts file sfile ffile="" err="" bytes=0 sbytes=0 fbytes=0 restore_ok=false tables=0 users=0 live=0 ok=false
  local encrypted=false off_ok=false off_err="" off_target=""
  start=$(date +%s)
  ts=$(date -u +%Y%m%d-%H%M)
  file="zekerflex-$ts.dump"
  sfile="storage-$ts.tar.gz"
  echo "[zf-backup] start $ts"

  if pg_dump -d "$DB" -Fc -Z 6 -f "$DIR/db/$file.part" 2>/tmp/dump.err; then
    mv -f "$DIR/db/$file.part" "$DIR/db/$file"
    chown "$OWNER" "$DIR/db/$file" && chmod 600 "$DIR/db/$file"
    bytes=$(stat -c %s "$DIR/db/$file")
    # voor de hersteltest: de vingerafdruk en de rijen per tabel van dit moment
    sha "$DIR/db/$file" > "$DIR/db/$file.sha256"
    tel_tabellen "$DB" > "$DIR/db/$file.counts"
    chown "$OWNER" "$DIR/db/$file.sha256" "$DIR/db/$file.counts"
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

  # de eigen Git-server (Forgejo): alleen als zijn volume er is
  if [ -f /forgejo/gitea/gitea.db ]; then
    ffile="forgejo-$ts.tar.gz"
    if forgejo_archief "$DIR/forgejo/$ffile.part"; then
      mv -f "$DIR/forgejo/$ffile.part" "$DIR/forgejo/$ffile"
      chown "$OWNER" "$DIR/forgejo/$ffile" && chmod 600 "$DIR/forgejo/$ffile"
      fbytes=$(stat -c %s "$DIR/forgejo/$ffile")
    else
      [ -n "$err" ] || err="forgejo: $(head -c 200 /tmp/fj.err)"
      rm -f "$DIR/forgejo/$ffile.part"
      ffile=""
    fi
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

  # versleutelde kopie (alleen met een wachtwoordzin), daarna buiten de server
  if [ -n "$PASS" ] && [ -n "$file" ]; then
    if versleutel "$DIR/db/$file" "$DIR/db/$file.enc" && { [ -z "$sfile" ] || versleutel "$DIR/storage/$sfile" "$DIR/storage/$sfile.enc"; } && { [ -z "$ffile" ] || versleutel "$DIR/forgejo/$ffile" "$DIR/forgejo/$ffile.enc"; }; then
      encrypted=true
    else
      [ -n "$err" ] || err="versleutelen: $(head -c 200 /tmp/enc.err)"
    fi
  fi
  if [ -n "$OFFSITE" ] && [ -n "$file" ]; then
    off_target="${OFFSITE%%\?*}"
    if [ "$encrypted" != true ]; then
      off_err="geen BACKUP_PASSPHRASE: onversleuteld gaat er niets naar buiten"
    elif offsite_put "$DIR/db/$file.enc" && { [ -z "$sfile" ] || offsite_put "$DIR/storage/$sfile.enc"; } && { [ -z "$ffile" ] || offsite_put "$DIR/forgejo/$ffile.enc"; }; then
      off_ok=true
      offsite_prune
    else
      off_err="$(head -c 200 /tmp/offsite.err)"
    fi
  fi

  [ -n "$file" ] && [ -z "$err" ] && [ "$restore_ok" = true ] && ok=true

  prune "$DIR/db" "*.dump"
  prune "$DIR/db" "*.dump.enc" "$KEEP_ENC"
  prune "$DIR/storage" "*.tar.gz"
  prune "$DIR/storage" "*.tar.gz.enc" "$KEEP_ENC"
  prune "$DIR/forgejo" "*.tar.gz"
  prune "$DIR/forgejo" "*.tar.gz.enc" "$KEEP_ENC"
  # hulpbestanden zonder dump: weg
  for h in "$DIR"/db/*.sha256 "$DIR"/db/*.counts; do
    [ -e "$h" ] || continue
    [ -e "${h%.*}" ] || rm -f "$h"
  done
  rm -f "$DIR"/db/*.part "$DIR"/storage/*.part "$DIR"/forgejo/*.part "$DIR"/forgejo/*.part.tar

  local kept tmp="$DIR/.status.json.tmp"
  kept=$(ls -1 "$DIR"/db/*.dump 2>/dev/null | wc -l)
  cat > "$tmp" <<EOF
{"at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","ok":$ok,"file":"$file","bytes":$bytes,"storageFile":"$sfile","storageBytes":$sbytes,"forgejoFile":"$ffile","forgejoBytes":$fbytes,"seconds":$(( $(date +%s) - start )),"restore":{"ok":$restore_ok,"tables":$tables,"users":$users,"liveUsers":$live},"kept":$kept,"encrypted":$encrypted,"offsite":{"configured":$([ -n "$OFFSITE" ] && echo true || echo false),"target":$(jsonstr "$off_target"),"ok":$off_ok,"error":$(jsonstr "$off_err")},"error":$(jsonstr "$err")}
EOF
  chmod 644 "$tmp" && mv -f "$tmp" "$DIR/status.json"
  echo "[zf-backup] klaar: ok=$ok bestand=$file ($bytes bytes) terugzetten=$restore_ok tabellen=$tables versleuteld=$encrypted buiten=$off_ok"
}

# ---------------------------------------------------------------------------
# De diepgaande hersteltest (wekelijks en op verzoek)
# ---------------------------------------------------------------------------
run_verify() {
  local start file="" err="" ok=false sha_ok=false list_ok=false restore_ok=false tables=0
  local mismatches="[]" missing=0 afwijkend=0 vergeleken=0 storage_ok=false storage_files=0 sfile=""
  local enc_state="none" off_state="none" off_bytes=0 expected=0
  local fj_ok=false fj_file="" fj_repos=0 fj_tmp
  start=$(date +%s)
  file=$(ls -1t "$DIR"/db/*.dump 2>/dev/null | head -1)
  [ -n "$file" ] && file=$(basename "$file")
  echo "[zf-backup] hersteltest van ${file:-(geen back-up)}"
  if [ -z "$file" ]; then
    err="er is nog geen back-up om te testen"
  else
    # 1. vingerafdruk: is het bestand nog precies wat er is weggeschreven?
    if [ -f "$DIR/db/$file.sha256" ]; then
      [ "$(sha "$DIR/db/$file")" = "$(cat "$DIR/db/$file.sha256")" ] && sha_ok=true || err="de vingerafdruk van $file klopt niet meer (bestand beschadigd?)"
    else
      sha_ok=true # oudere back-up zonder vingerafdruk
    fi
    # 2. is het archief leesbaar?
    pg_restore --list "$DIR/db/$file" > /dev/null 2>/tmp/list.err && list_ok=true || { [ -n "$err" ] || err="archief niet leesbaar: $(head -c 160 /tmp/list.err)"; }
    # 3. terugzetten en tabel voor tabel vergelijken met het moment van de back-up
    if [ "$list_ok" = true ]; then
      dropdb --if-exists "$CHECK_DB" 2>/dev/null
      if createdb "$CHECK_DB" 2>/tmp/restore.err && pg_restore --no-owner --no-privileges --exit-on-error -d "$CHECK_DB" "$DIR/db/$file" 2>>/tmp/restore.err; then
        restore_ok=true
        tables=$(num "$(psql -d "$CHECK_DB" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")")
        if [ -f "$DIR/db/$file.counts" ]; then
          tel_tabellen "$CHECK_DB" > /tmp/na.counts
          # join op tabelnaam: verwacht (bij de back-up) tegenover teruggezet
          mismatches=$(join -t $'\t' -a 1 -e MISSING -o '0,1.2,2.2' <(sort "$DIR/db/$file.counts") <(sort /tmp/na.counts) | awk -F'\t' '
            BEGIN { n = 0; printf "[" }
            {
              if ($3 == "MISSING") { if (n++) printf ","; printf "{\"table\":\"%s\",\"expected\":%d,\"got\":null}", $1, $2 }
              else if ($2 != $3) { if (n++) printf ","; printf "{\"table\":\"%s\",\"expected\":%d,\"got\":%d}", $1, $2, $3 }
            }
            END { printf "]" }')
          vergeleken=$(wc -l < "$DIR/db/$file.counts" | tr -dc '0-9')
          missing=$(printf '%s' "$mismatches" | grep -o '"got":null' | wc -l | tr -dc '0-9')
          afwijkend=$(printf '%s' "$mismatches" | grep -o '"table"' | wc -l | tr -dc '0-9')
          [ "$missing" -gt 0 ] && [ -z "$err" ] && err="$missing tabel(len) ontbreken na het terugzetten"
          [ "$afwijkend" -gt 0 ] && [ -z "$err" ] && [ "$missing" -eq 0 ] && err="$afwijkend tabel(len) hebben na het terugzetten een ander aantal rijen"
        fi
      else
        err="terugzetten: $(head -c 200 /tmp/restore.err)"
      fi
      dropdb --if-exists "$CHECK_DB" 2>/dev/null
    fi
    # 4. de uploads: is het archief compleet te lezen?
    sfile=$(ls -1t "$DIR"/storage/*.tar.gz 2>/dev/null | head -1)
    if [ -n "$sfile" ]; then
      sfile=$(basename "$sfile")
      storage_files=$(tar -tzf "$DIR/storage/$sfile" 2>/tmp/tar.err | wc -l | tr -dc '0-9') && storage_ok=true
      [ "$storage_ok" = true ] || { [ -n "$err" ] || err="uploads-archief niet leesbaar: $(head -c 160 /tmp/tar.err)"; }
    else
      storage_ok=true # geen uploads-map (bv. lokaal)
    fi
    # 4b. de eigen Git-server: archief leesbaar, database heel, repositories aanwezig
    fj_file=$(ls -1t "$DIR"/forgejo/*.tar.gz 2>/dev/null | head -1)
    if [ -n "$fj_file" ]; then
      fj_file=$(basename "$fj_file")
      fj_tmp=$(mktemp -d)
      : > /tmp/fj.err
      if tar -xzf "$DIR/forgejo/$fj_file" -C "$fj_tmp" ./gitea/gitea.db 2>>/tmp/fj.err &&
        [ "$(sqlite3 "$fj_tmp/gitea/gitea.db" 'PRAGMA integrity_check' 2>>/tmp/fj.err)" = ok ]; then
        fj_repos=$(num "$(tar -tzf "$DIR/forgejo/$fj_file" 2>/dev/null | grep -c '\.git/HEAD$')")
        [ "$fj_repos" -gt 0 ] && fj_ok=true || echo "geen repositories in het archief" >> /tmp/fj.err
      fi
      [ "$fj_ok" = true ] || { [ -n "$err" ] || err="forgejo-archief niet in orde: $(head -c 160 /tmp/fj.err)"; }
      rm -rf "$fj_tmp"
    else
      fj_ok=true # (nog) geen eigen Git-server
    fi
    # 5. de versleutelde kopie: ontcijferen moet precies het origineel geven
    if [ -f "$DIR/db/$file.enc" ]; then
      if [ -z "$PASS" ]; then enc_state="no-passphrase"
      elif ontcijfer "$DIR/db/$file.enc" /tmp/dec.dump && [ "$(sha /tmp/dec.dump)" = "$(sha "$DIR/db/$file")" ]; then enc_state="ok"
      else enc_state="failed"; [ -n "$err" ] || err="de versleutelde kopie is niet te ontcijferen met de huidige BACKUP_PASSPHRASE"; fi
      rm -f /tmp/dec.dump
    fi
    # 6. de kopie buiten de server: staat hij er, even groot?
    if [ -n "$OFFSITE" ] && [ -f "$DIR/db/$file.enc" ]; then
      expected=$(stat -c %s "$DIR/db/$file.enc")
      off_bytes=$(offsite_size "$file.enc")
      if [ "$off_bytes" -eq "$expected" ]; then off_state="ok"
      elif [ "$off_bytes" -eq 0 ]; then off_state="missing"; [ -n "$err" ] || err="de kopie buiten de server ontbreekt ($file.enc)"
      else off_state="size-mismatch"; [ -n "$err" ] || err="de kopie buiten de server heeft een andere grootte ($off_bytes in plaats van $expected bytes)"; fi
    elif [ -n "$OFFSITE" ]; then
      off_state="no-encrypted-copy"
    fi
  fi
  [ -z "$err" ] && [ "$restore_ok" = true ] && [ "$sha_ok" = true ] && [ "$storage_ok" = true ] && [ "$fj_ok" = true ] && [ "$enc_state" != failed ] && ok=true

  local regel tmp="$DIR/.verify.json.tmp"
  regel=$(printf '{"at":"%s","ok":%s,"file":%s,"seconds":%d,"shaOk":%s,"listOk":%s,"restoreOk":%s,"tables":%d,"compared":%d,"missing":%d,"mismatched":%d,"mismatches":%s,"storage":{"ok":%s,"file":%s,"files":%d},"forgejo":{"ok":%s,"file":%s,"repos":%d},"encrypted":"%s","offsite":"%s","error":%s}' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ok" "$(jsonstr "$file")" $(( $(date +%s) - start )) "$sha_ok" "$list_ok" "$restore_ok" "$tables" "$vergeleken" "$missing" "$afwijkend" "$mismatches" "$storage_ok" "$(jsonstr "$sfile")" "$storage_files" "$fj_ok" "$(jsonstr "$fj_file")" "$fj_repos" "$enc_state" "$off_state" "$(jsonstr "$err")")
  printf '%s\n' "$regel" > "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$DIR/verify.json"
  # geschiedenis: de laatste 60 hersteltests
  { [ -f "$DIR/verificaties.jsonl" ] && tail -n 59 "$DIR/verificaties.jsonl"; printf '%s\n' "$regel"; } > "$DIR/.verificaties.tmp" && chmod 644 "$DIR/.verificaties.tmp" && mv -f "$DIR/.verificaties.tmp" "$DIR/verificaties.jsonl"
  echo "[zf-backup] hersteltest klaar: ok=$ok tabellen=$tables vergeleken=$vergeleken afwijkend=$afwijkend ontbrekend=$missing uploads=$storage_ok forgejo=$fj_ok versleuteld=$enc_state buiten=$off_state ${err:+fout=$err}"
}

seconds_until_next() {
  local now next
  now=$(date -u +%s)
  next=$(date -u -d "today $AT" +%s)
  [ "$next" -gt "$now" ] || next=$(date -u -d "tomorrow $AT" +%s)
  echo $((next - now))
}

case "${1:-}" in
  now) run_backup; exit 0 ;;
  verify) run_verify; exit 0 ;;
esac

trap 'exit 0' TERM INT

# Een nieuwe of herstarte server wacht niet tot de nacht als de laatste back-up
# ouder is dan een dag; een eerste hersteltest volgt als die er nog nooit was.
latest=$(ls -1t "$DIR"/db/*.dump 2>/dev/null | head -1)
if [ -z "$latest" ] || [ $(( $(date +%s) - $(stat -c %Y "$latest") )) -gt 86400 ]; then
  run_backup
fi
[ -f "$DIR/verify.json" ] || run_verify

while true; do
  sleep "$(seconds_until_next)" &
  wait $!
  run_backup
  # elke zondag de diepgaande hersteltest, meteen na de back-up van die nacht
  [ "$(date -u +%u)" = 7 ] && run_verify
done
