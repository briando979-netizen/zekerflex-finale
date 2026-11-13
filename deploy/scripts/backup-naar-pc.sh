#!/usr/bin/env bash
# ZekerFlex: de nieuwste versleutelde back-up van de server naar deze pc halen (Git Bash; uitleg in deploy/backup/OPHALEN.md).
# Elke dag via Taakplanner. Gebruikt één eigen ssh-sleutel die op de server alleen deploy/backup/ophalen.sh mag starten.
#   1. vraag de nieuwste volledige set op (namen, grootte, sha256 op de server)
#   2. haal elk bestand naar een tijdelijke map en controleer grootte en sha256
#   3. pas als alles klopt: hernoemen naar <doel>/<set>, oude sets weg (7 blijven), markering op de server zetten
# Eén regel per keer in <doel>/ophalen.log. Er komt nooit iets onversleuteld naar de pc; de wachtwoordzin staat hier niet.
set -uo pipefail
HOST="${ZF_OPHAAL_HOST:-briando@37.97.226.24}"
SLEUTEL="${ZF_OPHAAL_SLEUTEL:-$HOME/.ssh/zekerflex-ophalen}"
DOEL="${ZF_OPHAAL_DOEL:-/c/Users/pc/ZekerFlex-backups}"
BEWAAR="${ZF_OPHAAL_BEWAAR:-7}"
SSH_BIN="${ZF_OPHAAL_SSH:-ssh}"
LOG="$DOEL/ophalen.log"
TS_RE='^[0-9]{8}-[0-9]{4}$'
NAAM_RE='^(zekerflex-[0-9]{8}-[0-9]{4}\.dump|storage-[0-9]{8}-[0-9]{4}\.tar\.gz|forgejo-[0-9]{8}-[0-9]{4}\.tar\.gz)\.enc$'
# -n: ssh leest nooit van stdin (anders eet hij de lus hieronder op); geen wachtwoordvragen in een geplande taak
SSH=("$SSH_BIN" -n -i "$SLEUTEL" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=4 "$HOST")

mkdir -p "$DOEL" || exit 1
log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >> "$LOG"
  # het logboek blijft klein: de laatste 500 regels
  if [ "$(wc -l < "$LOG")" -gt 600 ]; then tail -n 500 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"; fi
}
tmp=""
stop() { # melding
  log "FOUT: $1"
  [ -n "$tmp" ] && rm -rf "$tmp"
  rmdir "$DOEL/.slot" 2>/dev/null
  exit 1
}

# niet twee keer tegelijk (de taak en een keer met de hand); een slot van een vastgelopen keer (> 3 uur) mag weg
if ! mkdir "$DOEL/.slot" 2>/dev/null; then
  if [ -n "$(find "$DOEL/.slot" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
    rmdir "$DOEL/.slot" 2>/dev/null
    mkdir "$DOEL/.slot" 2>/dev/null || { log "FOUT: slot bezet"; exit 1; }
  else
    log "overgeslagen: een andere keer is nog bezig"
    exit 0
  fi
fi
trap 'rmdir "$DOEL/.slot" 2>/dev/null' EXIT

lijst=$("${SSH[@]}" lijst 2>"$DOEL/.ssh.err") || stop "geen lijst van de server ($(head -c 160 "$DOEL/.ssh.err" | tr '\n' ' '))"
rm -f "$DOEL/.ssh.err"
set_ts=$(printf '%s\n' "$lijst" | sed -n 's/^set \([0-9]\{8\}-[0-9]\{4\}\)$/\1/p' | head -n 1)
[[ "$set_ts" =~ $TS_RE ]] || stop "geen volledige versleutelde set op de server"
bestanden=$(printf '%s\n' "$lijst" | grep -E '^(zekerflex|storage|forgejo)-' || true)
[ -n "$bestanden" ] || stop "set $set_ts heeft geen bestanden"

if [ -d "$DOEL/$set_ts" ]; then
  "${SSH[@]}" klaar "$set_ts" > /dev/null 2>&1 || log "let op: markering voor $set_ts niet gezet"
  log "al binnen: $set_ts"
  exit 0
fi

# genoeg ruimte? (de set plus 10%)
nodig=$(printf '%s\n' "$bestanden" | awk '{s += $2} END {printf "%d", s * 1.1 / 1024}')
vrij=$(df -Pk "$DOEL" | awk 'NR == 2 {print $4}')
[ "${vrij:-0}" -gt "$nodig" ] || stop "te weinig ruimte: nodig $((nodig / 1024)) MB, vrij $((${vrij:-0} / 1024)) MB"

tmp="$DOEL/.bezig-$set_ts"
rm -rf "$tmp"
mkdir -p "$tmp" || stop "tijdelijke map niet gemaakt"
aantal=0
totaal=0
while read -r naam bytes sha; do
  [[ "$naam" =~ $NAAM_RE ]] || stop "vreemde naam in de lijst"
  [[ "$naam" == *"$set_ts"* ]] || stop "$naam hoort niet bij set $set_ts"
  [[ "$bytes" =~ ^[0-9]+$ && "$sha" =~ ^[0-9a-f]{64}$ ]] || stop "lijst onleesbaar bij $naam"
  "${SSH[@]}" haal "$naam" > "$tmp/$naam" 2> /dev/null || stop "$naam niet opgehaald"
  [ "$(stat -c %s "$tmp/$naam")" = "$bytes" ] || stop "$naam: grootte klopt niet"
  [ "$(sha256sum "$tmp/$naam" | cut -d' ' -f1)" = "$sha" ] || stop "$naam: sha256 klopt niet"
  aantal=$((aantal + 1))
  totaal=$((totaal + bytes))
done <<< "$bestanden"
[ "$aantal" -gt 0 ] || stop "niets opgehaald"

mv "$tmp" "$DOEL/$set_ts" || stop "hernoemen mislukt"
tmp=""
# oude sets weg: de nieuwste $BEWAAR blijven (alleen mappen met een set-naam)
ls -1 "$DOEL" | grep -E "$TS_RE" | sort -r | tail -n +$((BEWAAR + 1)) | while read -r oud; do rm -rf "${DOEL:?}/$oud"; done
"${SSH[@]}" klaar "$set_ts" > /dev/null 2>&1 || log "let op: markering voor $set_ts niet gezet"
log "ok: $set_ts, $aantal bestanden, $((totaal / 1048576)) MB"
