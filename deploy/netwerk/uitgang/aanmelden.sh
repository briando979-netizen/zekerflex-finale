#!/bin/bash
# Eenmalig (en veilig om te herhalen): de uitgang van de ZekerFlex VPN aanmelden bij Headscale.
#   1. gebruiker zf-uitgang in Headscale (als hij er nog niet is)
#   2. een toegangscode van 1 uur, alleen in deze shell (nooit afgedrukt of bewaard)
#   3. de container vpn-uitgang meldt zich aan als exit node (zekerflex-uitgang)
#   4. de routes 0.0.0.0/0 en ::/0 goedkeuren
#   5. de VPN-regels (deploy/netwerk/headscale/policy.json) eerst controleren, dan zetten
# Draaien op de VPS vanuit ~/zekerflex:  bash deploy/netwerk/uitgang/aanmelden.sh
set -euo pipefail
HS="sudo docker exec zekerflex-headscale-1 headscale"
UIT="zekerflex-vpn-uitgang-1"
cd "$(dirname "$0")/../../.."

json_id() { python3 -c 'import json,sys; naam=sys.argv[1]; veld=sys.argv[2]; d=json.load(sys.stdin); d=d if isinstance(d,list) else [d]; print(next((str(x.get("id","")) for x in d if x.get(veld)==naam), ""))' "$1" "$2"; }

if ! sudo docker ps --format '{{.Names}}' | grep -qx "$UIT"; then echo "De container $UIT draait niet (eerst een uitrol met vpn-uitgang)"; exit 1; fi

GID=$($HS users list -o json | json_id zf-uitgang name)
if [ -z "$GID" ]; then $HS users create zf-uitgang > /dev/null; GID=$($HS users list -o json | json_id zf-uitgang name); fi
echo "gebruiker zf-uitgang: id $GID"

if sudo docker exec "$UIT" tailscale status > /dev/null 2>&1; then
  echo "uitgang is al aangemeld"
else
  SLEUTEL=$($HS preauthkeys create --user "$GID" --expiration 1h -o json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("key",""))')
  [ -n "$SLEUTEL" ] || { echo "geen toegangscode gekregen"; exit 1; }
  sudo docker exec "$UIT" tailscale up --reset --login-server=https://vpn.zekerflex.com --advertise-exit-node --hostname=zekerflex-uitgang --accept-dns=false --authkey="$SLEUTEL" > /dev/null
  unset SLEUTEL
  echo "uitgang aangemeld"
fi

NID=$($HS nodes list -o json | json_id zekerflex-uitgang given_name)
[ -n "$NID" ] || { echo "knoop zekerflex-uitgang niet gevonden"; exit 1; }
$HS nodes approve-routes --identifier "$NID" --routes "0.0.0.0/0,::/0" > /dev/null
echo "routes goedgekeurd voor knoop $NID"

sudo docker exec -i zekerflex-headscale-1 headscale policy check -f /dev/stdin < deploy/netwerk/headscale/policy.json
sudo docker exec -i zekerflex-headscale-1 headscale policy set -f /dev/stdin < deploy/netwerk/headscale/policy.json > /dev/null
echo "VPN-regels gezet"
$HS nodes list-routes 2>/dev/null | sed -E 's/\x1b\[[0-9;]*m//g' | head -5
