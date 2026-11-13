#!/usr/bin/env bash
# ZekerFlex: de versleutelde back-up ophalen naar de pc van de eigenaar (deploy/backup/OPHALEN.md).
#
# Dit is het VASTE commando achter één eigen ssh-sleutel. In ~/.ssh/authorized_keys staat die sleutel met
#   restrict,command="/usr/local/bin/zf-backup-ophalen"
# zodat de pc, wat hij ook vraagt, alleen dit script start: geen shell, geen terminal, geen tunnels, geen scp of sftp.
# Het script kent drie verzoeken (de rest wordt geweigerd):
#   lijst          de nieuwste volledige versleutelde set: "set <ts>", daarna per bestand "<naam> <bytes> <sha256>"
#   haal <naam>    één .enc-bestand van die set naar stdout (alleen een back-upnaam, nooit een pad)
#   klaar <ts>     de pc heeft set <ts> binnen en gecontroleerd: markering voor Beheer (backups/ophaal/laatst.json)
# Alleen de .enc-kopieën (AES-256, met BACKUP_PASSPHRASE, deploy/backup/entrypoint.sh): de onversleutelde dump komt
# nooit mee. Zonder BACKUP_PASSPHRASE is er niets op te halen.
#
# Volledig = de .enc van de dump, en van uploads en Forgejo zodra die nacht een archief had; en niet de nacht die
# status.json mislukt noemt. Een set die nog versleuteld wordt (02:30, ±1 minuut) is dus nog niet volledig.
set -uo pipefail
DIR="${ZF_BACKUP_DIR:-$HOME/zekerflex/backups}"
MARK="${ZF_OPHAAL_DIR:-$DIR/ophaal}"
TS_RE='^[0-9]{8}-[0-9]{4}$'
NAAM_RE='^(zekerflex-[0-9]{8}-[0-9]{4}\.dump|storage-[0-9]{8}-[0-9]{4}\.tar\.gz|forgejo-[0-9]{8}-[0-9]{4}\.tar\.gz)\.enc$'

fout() {
  echo "ophalen: $*" >&2
  exit 2
}

map_van() {
  case "$1" in
    zekerflex-*) echo db ;;
    storage-*) echo storage ;;
    forgejo-*) echo forgejo ;;
  esac
}

volledig() { # ts
  local ts="$1"
  [ -f "$DIR/db/zekerflex-$ts.dump.enc" ] || return 1
  [ ! -f "$DIR/storage/storage-$ts.tar.gz" ] || [ -f "$DIR/storage/storage-$ts.tar.gz.enc" ] || return 1
  [ ! -f "$DIR/forgejo/forgejo-$ts.tar.gz" ] || [ -f "$DIR/forgejo/forgejo-$ts.tar.gz.enc" ] || return 1
  # status.json is één regel in een vaste vorm: {"at":"…","ok":true|false,"file":"zekerflex-<ts>.dump",…}
  if [ -f "$DIR/status.json" ] && grep -q "\"file\":\"zekerflex-$ts.dump\"" "$DIR/status.json" && ! grep -q '^{"at":"[^"]*","ok":true,' "$DIR/status.json"; then
    return 1
  fi
  return 0
}

lijst() {
  local f naam ts g
  # nieuwste eerst, op de tijd in de naam (niet op de wijzigingstijd)
  for f in $(ls -1 "$DIR"/db/ 2>/dev/null | grep -E '^zekerflex-[0-9]{8}-[0-9]{4}\.dump\.enc$' | sort -r); do
    naam="${f#zekerflex-}"
    ts="${naam%.dump.enc}"
    [[ "$ts" =~ $TS_RE ]] || continue
    volledig "$ts" || continue
    echo "set $ts"
    for g in "$DIR/db/zekerflex-$ts.dump.enc" "$DIR/storage/storage-$ts.tar.gz.enc" "$DIR/forgejo/forgejo-$ts.tar.gz.enc"; do
      [ -f "$g" ] || continue
      printf '%s %s %s\n' "$(basename "$g")" "$(stat -c %s "$g")" "$(sha256sum "$g" | cut -d' ' -f1)"
    done
    return 0
  done
  fout "geen volledige versleutelde set (staat BACKUP_PASSPHRASE aan?)"
}

haal() { # naam
  local naam="$1" pad
  [[ "$naam" =~ $NAAM_RE ]] || fout "onbekende naam"
  pad="$DIR/$(map_van "$naam")/$naam"
  { [ -f "$pad" ] && [ ! -L "$pad" ]; } || fout "bestand bestaat niet"
  exec cat -- "$pad"
}

klaar() { # ts
  local ts="$1" tmp
  [[ "$ts" =~ $TS_RE ]] || fout "onbekende set"
  [ -f "$DIR/db/zekerflex-$ts.dump.enc" ] || fout "set bestaat niet"
  { [ -d "$MARK" ] && [ -w "$MARK" ]; } || fout "markeermap ontbreekt of is niet schrijfbaar (zie OPHALEN.md)"
  tmp="$MARK/.laatst.json.$$"
  printf '{"at":"%s","set":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ts" > "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$MARK/laatst.json" || fout "markering niet geschreven"
  echo ok
}

verzoek="${SSH_ORIGINAL_COMMAND:-}"
case "$verzoek" in *$'\n'* | *$'\r'*) fout "één regel" ;; esac
read -r -a woorden <<< "$verzoek"
case "${woorden[0]:-}" in
  lijst) [ "${#woorden[@]}" -eq 1 ] || fout "lijst zonder meer"; lijst ;;
  haal) [ "${#woorden[@]}" -eq 2 ] || fout "haal <naam>"; haal "${woorden[1]}" ;;
  klaar) [ "${#woorden[@]}" -eq 2 ] || fout "klaar <set>"; klaar "${woorden[1]}" ;;
  *) fout "alleen: lijst | haal <naam> | klaar <set>" ;;
esac
