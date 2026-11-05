#!/usr/bin/env bash
# Aanvalsbescherming (CrowdSec) op de ZekerFlex-VPS, eenmalig. De engine zelf draait
# als container (docker-compose.vps.yml, service crowdsec); dit script zet de rest klaar:
#   1. sleutels in .env.production: een bouncer-sleutel voor de app, één voor de
#      firewall op de host, en een machine-login waarmee de app meldingen leest en
#      een blokkade kan opheffen (Admin → Beveiliging)
#   2. de container starten en de machine-login registreren
#   3. de firewall-bouncer op de host (nftables): haalt elke 10 s de blokkades op en
#      laat de kernel die adressen weggooien, vóór ufw en vóór Docker (prioriteit -10),
#      dus voor alle poorten: web, ssh en de bel-relay
#   4. een uitzonderingslijst met de eigen server en de computer van de eigenaar
# Draai als: sudo bash deploy/crowdsec/installeer.sh [ip-van-de-eigenaar] [--app]
# Met --app wordt de app meteen opnieuw gestart zodat hij de sleutels leest; anders
# gebeurt dat bij de volgende uitrol. Nog een keer draaien kan altijd (idempotent).
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV=.env.production
C="docker compose -f docker-compose.vps.yml --env-file $ENV"
EIGENAAR_IP=""
HERSTART_APP=""
for arg in "$@"; do
  case "$arg" in
    --app) HERSTART_APP=1 ;;
    *) EIGENAAR_IP="$arg" ;;
  esac
done
[ -f "$ENV" ] || { echo "$ENV ontbreekt; draai dit op de server in ~/zekerflex"; exit 2; }

# alleen toevoegen als de sleutel er nog niet staat; nooit overschrijven
zet_env() {
  if grep -q "^$1=" "$ENV"; then echo "  $1 stond er al"; else echo "$1=$2" >> "$ENV"; echo "  $1 gezet"; fi
}
lees_env() { grep "^$1=" "$ENV" | head -1 | cut -d= -f2-; }
sleutel() { openssl rand -hex 24; }

echo "== 1. sleutels in $ENV"
zet_env CROWDSEC_LAPI_URL http://crowdsec:8080
zet_env CROWDSEC_BOUNCER_KEY "$(sleutel)"
zet_env CROWDSEC_HOST_BOUNCER_KEY "$(sleutel)"
zet_env CROWDSEC_MACHINE_ID zekerflex-app
zet_env CROWDSEC_MACHINE_PASSWORD "$(sleutel)"
chmod 600 "$ENV"

echo "== 2. container starten"
$C up -d crowdsec
for i in $(seq 1 40); do
  if $C exec -T crowdsec cscli lapi status > /dev/null 2>&1; then break; fi
  sleep 3
done
$C exec -T crowdsec cscli lapi status
# De machine-login van de app. -f naar een wegwerpbestand: zonder -f overschrijft cscli
# de eigen inloggegevens van de engine in de container.
$C exec -T crowdsec cscli machines add "$(lees_env CROWDSEC_MACHINE_ID)" \
  --password "$(lees_env CROWDSEC_MACHINE_PASSWORD)" --force -f /tmp/zf-machine.yaml > /dev/null
$C exec -T crowdsec rm -f /tmp/zf-machine.yaml
echo "  machine-login geregistreerd"
echo "  bouncers:"
$C exec -T crowdsec cscli bouncers list -o raw | cut -d, -f1,2 | sed 's/^/    /'

echo "== 3. firewall-bouncer op de host (nftables)"
if ! command -v crowdsec-firewall-bouncer > /dev/null 2>&1; then
  # de officiële pakketbron van CrowdSec (packagecloud) toevoegen en het pakket zetten
  curl -fsS https://install.crowdsec.net | bash
  DEBIAN_FRONTEND=noninteractive apt-get install -y crowdsec-firewall-bouncer-nftables
fi
HOST_KEY="$(lees_env CROWDSEC_HOST_BOUNCER_KEY)"
install -d -m 755 /etc/crowdsec/bouncers
cat > /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml <<EOF
# Door deploy/crowdsec/installeer.sh gemaakt. De engine draait in de container
# crowdsec (docker-compose.vps.yml) en is op 127.0.0.1:8085 te bereiken.
mode: nftables
update_frequency: 10s
log_mode: file
log_dir: /var/log/
log_level: info
log_compression: true
log_max_size: 20
log_max_backups: 3
log_max_age: 7
api_url: http://127.0.0.1:8085/
api_key: ${HOST_KEY}
insecure_skip_verify: false
disable_ipv6: false
deny_action: DROP
deny_log: false
supported_decisions_types:
  - ban
# Eigen nftables-tabel met voorrang (-10) op ufw en Docker. Ook de forward-hook:
# verkeer naar de containers (poort 80/443 wordt doorgestuurd) loopt daarlangs.
nftables:
  ipv4:
    enabled: true
    set-only: false
    table: crowdsec
    chain: crowdsec-chain
    priority: -10
  ipv6:
    enabled: true
    set-only: false
    table: crowdsec6
    chain: crowdsec6-chain
    priority: -10
nftables_hooks:
  - input
  - forward
prometheus:
  enabled: false
EOF
chmod 600 /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml
systemctl enable crowdsec-firewall-bouncer > /dev/null 2>&1 || true
systemctl restart crowdsec-firewall-bouncer
sleep 4
systemctl is-active crowdsec-firewall-bouncer
nft list tables | grep crowdsec || { echo "!! nftables-tabel crowdsec ontbreekt; zie journalctl -u crowdsec-firewall-bouncer"; exit 3; }
echo "  firewall-bouncer actief"

echo "== 4. uitzonderingen (nooit blokkeren)"
$C exec -T crowdsec cscli allowlists create zekerflex-eigen -d "Eigen server en de computer van de eigenaar" > /dev/null 2>&1 || true
$C exec -T crowdsec cscli allowlists add zekerflex-eigen 37.97.226.24 2a01:7c8:fffd:26f:5054:ff:fe08:a3eb -d "eigen server" > /dev/null 2>&1 || true
if [ -n "$EIGENAAR_IP" ]; then
  $C exec -T crowdsec cscli allowlists add zekerflex-eigen "$EIGENAAR_IP" -d "computer van de eigenaar" > /dev/null 2>&1 || true
  echo "  $EIGENAAR_IP toegevoegd"
fi
$C exec -T crowdsec cscli allowlists inspect zekerflex-eigen 2> /dev/null | sed 's/^/    /' || true

if [ -n "$HERSTART_APP" ]; then
  echo "== 5. app opnieuw starten (leest nu de CROWDSEC_*-sleutels)"
  $C up -d app
else
  echo "== 5. de app leest de sleutels bij de volgende uitrol (of nu: sudo $C up -d app)"
fi
echo "KLAAR. Controleren: $C exec crowdsec cscli metrics | head -40"
