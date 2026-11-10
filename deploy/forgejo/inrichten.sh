#!/bin/bash
# ---------------------------------------------------------------------------
# Richt de eigen Git-server in (Forgejo, docker-compose.vps.yml), na de eerste
# uitrol. Mag vaker draaien: alles wordt eerst gecontroleerd.
#   1. beheerder "zekerflex-beheer" met een willekeurig wachtwoord in
#      ~/zekerflex/.forgejo-beheer (alleen root, 600; wordt nooit afgedrukt);
#   2. organisatie "zekerflex" (privé);
#   3. spiegel van github.com/briando979-netizen/zekerflex-finale (privé, elke
#      10 minuten bijgewerkt door Forgejo zelf).
# Opties:
#   --eigenaar <e-mail>  ook een account "eigenaar", met een eenmalig wachtwoord in
#                        /root/forgejo-eigenaar.txt (bij de eerste keer wijzigen);
#   --lezer              het leesaccount voor de uitrol (fase 2): "bouwer-lezen" in
#                        een team dat alleen mag lezen, met een token (alleen
#                        read:repository) in /root/forgejo-lezen.token (root, 600)
#                        voor de live-zetter, en als BOUWER_FORGEJO_TOKEN in
#                        .env.production voor de Bouwer (eerst een kopie). Daarna:
#                        up -d --no-deps bouwer, zodat de Bouwer het token ziet.
#   --github-token       de spiegel haalt GitHub voortaan op met het leestoken uit
#                        /root/github-lezen.token (nodig zodra de repo privé is).
#                        Forgejo kan de inloggegevens van een bestaande spiegel niet via
#                        de API wijzigen, dus de spiegel wordt opnieuw gemaakt; zolang
#                        valt de uitrol vanzelf terug op GitHub. Ook zonder deze optie
#                        gebruikt een nieuwe spiegel het token als het bestand er is.
#
# Gebruik op de VPS:  bash ~/zekerflex/deploy/forgejo/inrichten.sh [--eigenaar <e-mail>] [--lezer] [--github-token]
# ---------------------------------------------------------------------------
set -euo pipefail
cd ~/zekerflex
F=zekerflex-forgejo-1
GEHEIM=.forgejo-beheer
EIGENAAR_BESTAND=/root/forgejo-eigenaar.txt
LEZER_BESTAND=/root/forgejo-lezen.token
GITHUB_BESTAND=/root/github-lezen.token
BRON=https://github.com/briando979-netizen/zekerflex-finale.git
fj() { sudo docker exec -u git "$F" forgejo "$@"; }

EIGENAAR=""
LEZER=0
GITHUB_TOKEN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --eigenaar) EIGENAAR="${2:-}"; shift 2 ;;
    --lezer) LEZER=1; shift ;;
    --github-token) GITHUB_TOKEN=1; shift ;;
    *) echo "onbekende optie: $1"; exit 2 ;;
  esac
done

sudo docker inspect "$F" > /dev/null 2>&1 || { echo "forgejo draait niet (eerst uitrollen)"; exit 2; }

if ! sudo test -s "$GEHEIM"; then
  ww=$(openssl rand -hex 24)
  printf 'gebruiker=zekerflex-beheer\nwachtwoord=%s\n' "$ww" | sudo tee "$GEHEIM" > /dev/null
  sudo chmod 600 "$GEHEIM"
fi
ww=$(sudo sed -n 's/^wachtwoord=//p' "$GEHEIM")

gebruiker_bestaat() { fj admin user list | awk 'NR > 1 { print $2 }' | grep -qx "$1"; }

if gebruiker_bestaat zekerflex-beheer; then
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

# De spiegel maken. Staat er een GitHub-leestoken (/root/github-lezen.token), dan met
# inloggegevens (x-access-token + het token): nodig zodra de repo privé is. Het token gaat
# via een tijdelijk JSON-bestand van root (600) naar curl, nooit als argument.
maak_spiegel() {
  local body
  body=$(sudo mktemp)
  sudo chmod 600 "$body"
  if sudo test -s "$GITHUB_BESTAND"; then
    sudo sh -c 'tok=$(tr -d "[:space:]" < "$1"); printf "{\"clone_addr\":\"%s\",\"auth_username\":\"x-access-token\",\"auth_password\":\"%s\",\"repo_owner\":\"zekerflex\",\"repo_name\":\"zekerflex-finale\",\"mirror\":true,\"mirror_interval\":\"10m\",\"private\":true,\"service\":\"git\",\"description\":\"Spiegel van GitHub, elke 10 minuten bijgewerkt\"}" "$2" "$tok" > "$3"' _ "$GITHUB_BESTAND" "$BRON" "$body"
    echo "spiegel (met GitHub-leestoken): $(status --max-time 900 -X POST "$API/repos/migrate" --data @"$body")"
  else
    printf '{"clone_addr":"%s","repo_owner":"zekerflex","repo_name":"zekerflex-finale","mirror":true,"mirror_interval":"10m","private":true,"service":"git","description":"Spiegel van GitHub, elke 10 minuten bijgewerkt"}' "$BRON" | sudo tee "$body" > /dev/null
    echo "spiegel (zonder token, openbare repo): $(status --max-time 900 -X POST "$API/repos/migrate" --data @"$body")"
  fi
  sudo rm -f "$body"
}

if [ "$GITHUB_TOKEN" = 1 ]; then
  sudo test -s "$GITHUB_BESTAND" || { echo "github-token: $GITHUB_BESTAND ontbreekt (eerst neerzetten, root 600)"; exit 1; }
  # Forgejo kan de inloggegevens van een bestaande spiegel niet via de API wijzigen: opnieuw maken.
  # Zolang de spiegel er niet is, halen de live-zetter en de controle alles bij GitHub.
  if [ "$(status "$API/repos/zekerflex/zekerflex-finale")" = 200 ]; then
    echo "oude spiegel weg: $(status -X DELETE "$API/repos/zekerflex/zekerflex-finale")"
  fi
  maak_spiegel
elif [ "$(status "$API/repos/zekerflex/zekerflex-finale")" = 200 ]; then
  echo "spiegel: bestaat al"
else
  maak_spiegel
fi

if [ -n "$EIGENAAR" ]; then
  if gebruiker_bestaat eigenaar; then
    echo "eigenaar: bestaat al"
  else
    ew=$(openssl rand -hex 8)
    fj admin user create --admin --username eigenaar --email "$EIGENAAR" --password "$ew" --must-change-password=true > /dev/null
    # nooit afdrukken (dan staat het in het transcript): naar een bestand van root
    printf 'gebruiker=eigenaar\neenmalig-wachtwoord=%s\n(bij de eerste keer inloggen wijzigen)\n' "$ew" | sudo tee "$EIGENAAR_BESTAND" > /dev/null
    sudo chown root:root "$EIGENAAR_BESTAND"
    sudo chmod 600 "$EIGENAAR_BESTAND"
    echo "eigenaar: aangemaakt; het eenmalige wachtwoord staat in $EIGENAAR_BESTAND (alleen root)"
  fi
fi

if [ "$LEZER" = 1 ]; then
  if gebruiker_bestaat bouwer-lezen; then
    echo "lezer: bestaat al"
  else
    # willekeurig wachtwoord dat niemand kent (de CLI drukt het af: weggegooid); inloggen gaat alleen met het token
    fj admin user create --username bouwer-lezen --email bouwer-lezen@zekerflex.test --random-password --must-change-password=false > /dev/null
    echo "lezer: aangemaakt"
  fi
  # team "lezen": alleen lezen, alle repositories van de organisatie
  team=$(api "$API/orgs/zekerflex/teams" | python3 -c 'import json,sys; print(next((t["id"] for t in json.load(sys.stdin) if t.get("name") == "lezen"), ""))')
  if [ -z "$team" ]; then
    team=$(api -X POST "$API/orgs/zekerflex/teams" -d '{"name":"lezen","description":"Alleen lezen (uitrol en controle)","permission":"read","includes_all_repositories":true,"units":["repo.code"]}' | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id", ""))')
    echo "team lezen: aangemaakt"
  else
    echo "team lezen: bestaat al"
  fi
  [ -n "$team" ] || { echo "team lezen: niet gevonden of aangemaakt"; exit 1; }
  echo "lid van team lezen: $(status -X PUT "$API/teams/$team/members/bouwer-lezen")"

  if sudo test -s "$LEZER_BESTAND"; then
    echo "token: bestaat al ($LEZER_BESTAND)"
  else
    fj admin user generate-access-token --username bouwer-lezen --token-name uitrol --scopes read:repository --raw | sudo tee "$LEZER_BESTAND" > /dev/null
    sudo chown root:root "$LEZER_BESTAND"
    sudo chmod 600 "$LEZER_BESTAND"
    sudo test -s "$LEZER_BESTAND" || { echo "token: aanmaken mislukt"; exit 1; }
    echo "token: aangemaakt in $LEZER_BESTAND (alleen root)"
  fi

  # Ook voor de Bouwer-container: BOUWER_FORGEJO_TOKEN in .env.production (eerst een
  # kopie; eigenaar en rechten blijven gelijk). Het token gaat via een variabele in een
  # root-shell, nooit als argument op de opdrachtregel.
  sudo cp -p .env.production ".env.production.voor-forgejo-lezer-$(date +%Y%m%d%H%M%S)"
  sudo sh -c 'tok=$(cat "$1"); grep -v "^BOUWER_FORGEJO_TOKEN=" .env.production > .env.production.nieuw; printf "BOUWER_FORGEJO_TOKEN=%s\n" "$tok" >> .env.production.nieuw; chown --reference=.env.production .env.production.nieuw; chmod --reference=.env.production .env.production.nieuw; mv .env.production.nieuw .env.production' _ "$LEZER_BESTAND"
  echo ".env.production: BOUWER_FORGEJO_TOKEN staat er ($(sudo grep -c '^BOUWER_FORGEJO_TOKEN=' .env.production) regel); de Bouwer ziet hem na up -d --no-deps bouwer"
fi

api "$API/repos/zekerflex/zekerflex-finale" | grep -o '"mirror":[a-z]*\|"mirror_updated":"[^"]*"\|"size":[0-9]*' | tr '\n' ' '
echo
