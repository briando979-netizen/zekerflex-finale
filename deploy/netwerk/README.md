# ZekerFlex Verbinding: de servers achter wifi en VPN

De pakketten (lib/netwerk) draaien op twee containers in `docker-compose.vps.yml`.
Beide gebruiken alleen vrije software en de eigen server; er gaat niets naar een
dienst van een ander.

## Wifi op de werkvloer: `freeradius`

- Beeld `freeradius/freeradius-server:3.2.10-alpine`, poort **1812/udp** open in ufw.
- De configuratie staat in `freeradius/` en wordt over de standaardbestanden
  heen gezet (zie de volumes in compose). Niets staat vast in de container:
  - `clients.conf`: elk IP mag een verzoek sturen; welk geheim erbij hoort
    vraagt `zf-clients` aan de app (`GET /api/netwerk/radius/client?ip=`).
  - `zf-rest`: de twee koppelingen met de app, met `NETWERK_RADIUS_TOKEN` als
    wachtwoord in Basic-auth (rlm_rest 3 kent geen eigen koppen).
  - `default` / `inner-tunnel`: EAP (PEAP met MSCHAPv2) naar binnen; daar vraagt
    `zf_toegang` de app (`POST /api/netwerk/radius/authorize`) of deze persoon
    nu mag en krijgt zijn wifi-wachtwoord (`control:Cleartext-Password`) en
    `reply:Session-Timeout` terug, zodat de wifi vanzelf stopt na de dienst.
  - `eap`: het echte Let's Encrypt-certificaat van vps.zekerflex.com, gekopieerd
    van Caddy bij elke start (`entrypoint.sh`). Telefoons herkennen de server
    dus zonder eigen certificaat (domein: vps.zekerflex.com).
- Klanten zetten in hun wifi-apparatuur: WPA2/WPA3-Enterprise, RADIUS-server
  `vps.zekerflex.com`, poort 1812, het geheim uit Werkgever → Wifi en VPN → vestiging.
  Hun vaste IP-adres hoort daar bij de vestiging; zonder dat IP negeert de server hen.
- Proef vanuit de container (PAP, zonder EAP): zet in de app een vestiging met
  IP `127.0.0.1` op een testbedrijf en draai
  `docker exec zekerflex-freeradius-1 sh -c 'PATH=/opt/bin:$PATH radtest <e-mail> <wifi-wachtwoord> 127.0.0.1 0 <geheim>'`.

## Veilige werkplek (VPN): `headscale`

- Beeld `headscale/headscale:0.29.7`, config `headscale/config.yaml`, gegevens in
  volume `headscale-data`. STUN van de ingebouwde relay op **3490/udp** (3478 en
  3479 zijn van coturn); geen relays van Tailscale.
- Caddy zet `vpn.zekerflex.com` door naar poort 8080 (DNS: A-record naar de VPS;
  Admin → Te doen). De app praat intern met `http://headscale:8080`.
- API-sleutel maken (eenmalig, 10 jaar):
  `docker exec zekerflex-headscale-1 headscale apikeys create --expiration 3650d`
  → in `.env.production`: `HEADSCALE_URL=https://vpn.zekerflex.com`,
  `HEADSCALE_API_KEY=<sleutel>`; daarna `up -d app`.
- Elk bedrijf is één Headscale-gebruiker (`zf-<tenantId>`); toegangscodes zijn
  eenmalig en verlopen (Werkgever → Wifi en VPN → "Maak een toegangscode").
- `headscale/policy.json`: apparaten zien alleen apparaten van dezelfde
  gebruiker (`autogroup:self`), dus nooit die van een ander bedrijf. Staat in de
  database van headscale; zetten (eenmalig, en opnieuw na een nieuw volume):
  `docker exec -i zekerflex-headscale-1 headscale policy set -f /dev/stdin < deploy/netwerk/headscale/policy.json`
  en controleren met `headscale policy get`.

## Eigen 5G-netwerk

Geen container (nog): elk terrein vraagt een lokale 3,5 GHz-vergunning van de
RDI en apparatuur ter plaatse. Aanvragen komen als lead binnen (Admin → Pijplijn)
en staan op Admin → Verbinding.
