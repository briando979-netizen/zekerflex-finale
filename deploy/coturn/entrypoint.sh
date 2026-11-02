#!/bin/sh
# TURN-relay voor gesprekken in de chat (audio, video, scherm delen). Zonder TURN
# vinden twee mensen achter een strenge bedrijfsfirewall of symmetrische NAT
# elkaar nooit: STUN alleen is dan niet genoeg. De app geeft per gesprek een
# wachtwoord van een uur uit (lib/calls/turn-credentials.ts, /api/calls/turn).
#
# Veiligheid: de relay stuurt alleen door naar het publieke internet, nooit naar
# interne adressen (database, Redis en de app zitten op 172.16–31.x), en alleen
# UDP (meer heeft WebRTC niet nodig). Zonder sleutel van 32+ tekens blijft TURN
# uit: met een lege sleutel kan iedereen een wachtwoord maken en de relay gebruiken.
#
# TURN_DRY_RUN=1 toont alleen het commando, met de sleutel gemaskeerd (tests).
set -eu

off() {
  echo "TURN staat uit: $1"
  [ "${TURN_DRY_RUN:-}" = "1" ] && exit 0
  # Niet stoppen: dan herstart Docker de dienst eindeloos.
  exec sleep 2147483647
}

SECRET="${TURN_SHARED_SECRET:-}"
[ "${#SECRET}" -ge 32 ] || off "zet een TURN_SHARED_SECRET van minstens 32 tekens in .env.production"

# Het publieke adres (IPv4 en IPv6) waarlangs de server het internet op gaat, niet
# de docker-bruggen (172.x): een relay-adres daarop is van buiten onbereikbaar.
RELAY_IPS="${TURN_RELAY_IPS:-}"
if [ -z "$RELAY_IPS" ]; then
  V4=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
  V6=$(ip -6 route get 2606:4700:4700::1111 2>/dev/null | sed -n 's/.* src \([0-9a-fA-F:]*\).*/\1/p')
  RELAY_IPS="$V4 $V6"
fi

set --
for ip in $RELAY_IPS; do
  set -- "$@" "--listening-ip=$ip" "--relay-ip=$ip"
done
[ $# -gt 0 ] || off "geen publiek adres gevonden (zet TURN_RELAY_IPS in .env.production)"

# Nooit doorsturen naar: de eigen machine, privé- en docker-netwerken, CGNAT,
# link-local, multicast, documentatie- en gereserveerde blokken, en IPv6-vormen
# die naar IPv4 terugvertalen (mapped, NAT64, 6to4, Teredo).
# Geen bereik laten beginnen bij het nul-adres (0.0.0.0 of ::): coturn slaat dan
# de ondergrens over en weigert elk adres van de andere IP-familie (4.6.3:
# "::-::1" blokkeerde 1.1.1.1). Het nul-adres zelf weigert coturn al.
for range in \
  0.0.0.1-0.255.255.255 \
  10.0.0.0-10.255.255.255 \
  100.64.0.0-100.127.255.255 \
  127.0.0.0-127.255.255.255 \
  169.254.0.0-169.254.255.255 \
  172.16.0.0-172.31.255.255 \
  192.0.0.0-192.0.0.255 \
  192.0.2.0-192.0.2.255 \
  192.88.99.0-192.88.99.255 \
  192.168.0.0-192.168.255.255 \
  198.18.0.0-198.19.255.255 \
  198.51.100.0-198.51.100.255 \
  203.0.113.0-203.0.113.255 \
  224.0.0.0-255.255.255.255 \
  ::1 \
  ::ffff:0.0.0.0-::ffff:255.255.255.255 \
  64:ff9b::-64:ff9b::ffff:ffff \
  100::-100::ffff:ffff:ffff:ffff \
  2001::-2001:0:ffff:ffff:ffff:ffff:ffff:ffff \
  2001:db8::-2001:db8:ffff:ffff:ffff:ffff:ffff:ffff \
  2002::-2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff \
  fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff \
  fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff \
  ff00::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff; do
  set -- "$@" "--denied-peer-ip=$range"
done

# Poortbereik = de ufw-regel (deploy/scripts/deploy-vps.sh). Quota: 12 tegelijk per
# gebruiker, 100 in totaal (zoveel relaypoorten zijn er); 1 MB/s per sessie is
# ruim genoeg voor HD-video en begrenst misbruik.
set -- "$@" \
  -n \
  --listening-port=3478 \
  --min-port="${TURN_MIN_PORT:-49160}" \
  --max-port="${TURN_MAX_PORT:-49260}" \
  --fingerprint \
  --lt-cred-mech \
  --use-auth-secret \
  --static-auth-secret="$SECRET" \
  --realm="${TURN_REALM:-zekerflex.com}" \
  --no-tcp-relay \
  --no-multicast-peers \
  --no-tls \
  --no-dtls \
  --no-cli \
  --no-software-attribute \
  --stale-nonce=600 \
  --user-quota=12 \
  --total-quota=100 \
  --max-bps=1000000 \
  --pidfile=/tmp/turnserver.pid \
  --log-file=stdout

if [ "${TURN_DRY_RUN:-}" = "1" ]; then
  echo turnserver "$@" | sed 's/--static-auth-secret=[^ ]*/--static-auth-secret=***/'
  exit 0
fi
exec turnserver "$@"
