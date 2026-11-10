#!/bin/bash
# ---------------------------------------------------------------------------
# Richt de eigen Git-server in (Forgejo, docker-compose.vps.yml), na de eerste
# uitrol. Mag vaker draaien: alles wordt eerst gecontroleerd.
#   1. beheerder "zekerflex-beheer" met een willekeurig wachtwoord in
#      ~/zekerflex/.forgejo-beheer (alleen root, 600; wordt nooit afgedrukt);
#   2. organisatie "zekerflex" (privé);
#   3. spiegel van github.com/briando979-netizen/zekerflex-finale (privé, elke
#      10 minuten bijgewerkt door Forgejo zelf).
# Met `--eigenaar <e-mail>` komt er ook een account "eigenaar" bij, met een
# eenmalig wachtwoord dat bij de eerste keer inloggen gewijzigd moet worden.
#
# Gebruik op de VPS:  bash ~/zekerflex/deploy/forgejo/inrichten.sh [--eigenaar <e-mail>]
# Fase 2 (later): de live-zetter, controle en werkkopie halen de code hier op,
# met GitHub als reserve; dan hoort forgejo-data ook in de back-up.
# ---------------------------------------------------------------------------
set -euo pipefail
cd ~/zekerflex
F=zekerflex-forgejo-1
GEHEIM=.forgejo-beheer
EIGENAAR_BESTAND=/root/forgejo-eigenaar.txt
BRON=https://github.com/briando979-netizen/zekerflex-finale.git
fj() { sudo docker exec -u git "$F" forgejo "$@"; }

sudo docker inspect "$F" > /dev/null 2>&1 || { echo "forgejo draait niet (eerst uitrollen)"; exit 2; }

if ! sudo test -s "$GEHEIM"; then
  ww=$(openssl rand -hex 24)
  printf 'gebruiker=zekerflex-beheer\nwachtwoord=%s\n' "$ww" | sudo tee "$GEHEIM" > /dev/null
  sudo chmod 600 "$GEHEIM"
fi
ww=$(sudo sed -n 's/^wachtwoord=//p' "$GEHEIM")

if fj admin user list --admin | awk 'NR > 1 { print $2 }' | grep -qx zekerflex-beheer; then
  echo "beheerder: bestaat al"
else
  fj admin user create --admin --username zekerflex-beheer --email beheer@zekerflex.test --password "$ww" --must-change-password=false > /dev/null
  echo "beheerder: aangemaakt"
fi

# De API via het adres van de container (de host kan bij het git-netwerk), met het
# wachtwoord in een tijdelijk netrc-bestand van root (600): zo staat het niet in de
# procestabel en kan alleen root het lezen. Daarom draait curl hier met sudo.
IP=$(sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$F")
API="http://$IP:3000/api/v1"
NETRC=$(sudo mktemp)
trap 'sudo rm -f "$NETRC"' EXIT
sudo chown root:root "$NETRC"
sudo chmod 600 "$NETRC"
printf 'machine %s login zekerflex-beheer password %s\n' "$IP" "$ww" | sudo tee "$NETRC" > /dev/null
[ "$(sudo stat -c '%U %a' "$NETRC")" = "root 600" ] || { echo "netrc is niet van root/600"; exit 1; }
api() { sudo curl -sS --netrc-file "$NETRC" -H 'content-type: application/json' "$@"; }
status() { api -o /dev/null -w '%{http_code}' "$@" || true; }

for _ in $(seq 1 30); do
  [ "$(status "$API/version")" = 200 ] && break
  sleep 2
done

if [ "$(status "$API/orgs/zekerflex")" = 200 ]; then
  echo "organisatie: bestaat al"
else
  echo "organisatie: $(status -X POST "$API/orgs" -d '{"username":"zekerflex","full_name":"ZekerFlex","visibility":"private"}')"
fi

if [ "$(status "$API/repos/zekerflex/zekerflex-finale")" = 200 ]; then
  echo "spiegel: bestaat al"
else
  echo "spiegel: $(status --max-time 900 -X POST "$API/repos/migrate" -d "{\"clone_addr\":\"$BRON\",\"repo_owner\":\"zekerflex\",\"repo_name\":\"zekerflex-finale\",\"mirror\":true,\"mirror_interval\":\"10m\",\"private\":true,\"service\":\"git\",\"description\":\"Spiegel van GitHub, elke 10 minuten bijgewerkt\"}")"
fi

if [ "${1:-}" = "--eigenaar" ] && [ -n "${2:-}" ]; then
  if fj admin user list | awk 'NR > 1 { print $2 }' | grep -qx eigenaar; then
    echo "eigenaar: bestaat al"
  else
    ew=$(openssl rand -hex 8)
    fj admin user create --admin --username eigenaar --email "$2" --password "$ew" --must-change-password=true > /dev/null
    # nooit afdrukken (dan staat het in het transcript): naar een bestand van root
    printf 'gebruiker=eigenaar\neenmalig-wachtwoord=%s\n(bij de eerste keer inloggen wijzigen)\n' "$ew" | sudo tee "$EIGENAAR_BESTAND" > /dev/null
    sudo chown root:root "$EIGENAAR_BESTAND"
    sudo chmod 600 "$EIGENAAR_BESTAND"
    echo "eigenaar: aangemaakt; het eenmalige wachtwoord staat in $EIGENAAR_BESTAND (alleen root)"
  fi
fi

api "$API/repos/zekerflex/zekerflex-finale" | grep -o '"mirror":[a-z]*\|"mirror_updated":"[^"]*"\|"size":[0-9]*' | tr '\n' ' '
echo
