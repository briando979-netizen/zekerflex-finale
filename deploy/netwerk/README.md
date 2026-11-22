# ZekerFlex Verbinding: de servers achter wifi en VPN

De pakketten (lib/netwerk) draaien op containers in `docker-compose.vps.yml`.
Ze gebruiken alleen vrije software en de eigen server; er gaat niets naar een
dienst van een ander.

## Wifi op de werkvloer: weg

De wifi-server (`freeradius`, poort 1812/udp, `deploy/netwerk/freeradius/` en de
routes `/api/netwerk/radius/*`) is op 22 november 2026 weggehaald: het product is
bij de opruiming van die dag verdwenen en de server ging van 16 naar 12 GB. Het
pakket wifi staat in de code nog als definitie (bestaande standen en Stripe-
abonnementen blijven leesbaar) maar is niet meer te leveren: wie zich aanmeldt
komt alleen op de lijst. Terugzetten kan uit git (commit vóór `diensten-weg-22nov`).
De poort 1812/udp in ufw hoeft niet meer open: `sudo ufw delete allow 1812/udp`.

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

## Veilig internet op vreemde wifi: `vpn-uitgang`

- Beeld `tailscale/tailscale:v1.104.7`, kernelmodus (`/dev/net/tun`, NET_ADMIN), eigen netwerk
  `vpn-uitgang` met alleen internet: niet op `internal`, dus geen weg naar Postgres of Redis.
- De knoop `zekerflex-uitgang` (gebruiker `zf-uitgang`) is een exit node; `policy.json` geeft
  iedereen `autogroup:internet`, dus wel internet via de server, geen andere apparaten.
- Geen poort open: de verbinding loopt via de relay van Headscale op `vpn.zekerflex.com:443`.
- Eenmalig aanmelden (en opnieuw na een nieuw volume): `bash deploy/netwerk/uitgang/aanmelden.sh`.
- Gebruiken: in de Tailscale-app bij *Exit node* `zekerflex-uitgang` kiezen. Controle: je IP-adres
  is dan dat van de server (37.97.226.24).

## Eigen 5G-netwerk

Geen container (nog): elk terrein vraagt een lokale 3,5 GHz-vergunning van de
RDI en apparatuur ter plaatse. Aanvragen komen als lead binnen (Admin → Pijplijn)
en staan op Admin → Verbinding.
