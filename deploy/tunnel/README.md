# Eigen tunnel (frp) — je lokale diensten veilig online, zonder Cloudflare

Draai je AI-node, image-node of code-server thuis/op een GPU-box, en maak ze
bereikbaar voor je live app via **je eigen VPS** — met het open-source **frp**,
niet via Cloudflare of een andere managed tunneldienst. Alleen je eigen VPS is
nodig (onvermijdelijk voor een vast publiek adres); verder ben je van niemand
afhankelijk.

```text
[ thuis/GPU-box ]                         [ jouw VPS ]                 [ internet ]
 dienst :7860  ──frpc──►  (uitgaand) ──► frps :7000 ──► Caddy :443 ──►  gebruikers
                                          vhost :8080   (Let's Encrypt)
```

Waarom dit fijn is: je box hoeft **geen** inkomende poorten open te zetten — de
frpc-client maakt een *uitgaande* verbinding naar je VPS. Caddy regelt HTTPS.

## 1. Op je VPS (de tunnelserver)

- DNS: zet per dienst een A-record, bv. `image.jouwdomein.nl` → VPS-IP.
- Firewall: open **7000** (frpc verbindt), **80** en **443** (Caddy/TLS).

```bash
scp -r deploy/tunnel root@<vps-ip>:/opt/zf-tunnel && ssh root@<vps-ip>
cd /opt/zf-tunnel
cp .env.example .env          # vul DOMAIN + FRP_TOKEN (openssl rand -base64 32)
docker compose up -d
```

Meer diensten? Voeg een site-blok toe in de `Caddyfile` (`ai.{$DOMAIN}` /
`code.{$DOMAIN}`) en een proxy in `frpc.toml` op je box.

## 2. Op je thuis-/GPU-box (de client)

```bash
cp frpc.toml.example frpc.toml   # vul serverAddr + HETZELFDE token + je dienst(en)
# draai frpc (binary van github.com/fatedier/frp) of via Docker:
docker run -d --name zf-frpc --network host \
  -v "$PWD/frpc.toml:/etc/frp/frpc.toml:ro" snowdreamtech/frpc
```

Start ook de dienst zelf (bv. de image-node op :7860). Test daarna:
`curl https://image.jouwdomein.nl/sdapi/v1/sd-models`.

## 3. Koppelen aan ZekerFlex

Omdat de dienst nu op een eigen (niet-lokaal) adres draait, zet je in de app-env:

```ini
IMAGE_BASE_URL=https://image.jouwdomein.nl
IMAGE_ALLOW_REMOTE=true     # bewust: dit is je EIGEN server op afstand
IMAGE_API_KEY=<een-geheim>  # beveilig de endpoint
```

(Voor de AI-node wijs je `LLM_BASE_URL`/de node-config naar `https://ai.jouwdomein.nl`.)

## Eerlijk

- Je VPS is het enige vaste onderdeel (ergens moet een publiek IP staan). frp
  zelf, de TLS (Let's Encrypt via Caddy) en het token beheer je volledig zelf.
- Beveilig elke geëxposeerde dienst (API-key/auth): zodra iets via de tunnel
  online staat, is het bereikbaar. Zet een sterk `FRP_TOKEN` en unieke keys.
- Alternatief blijft de Cloudflare-tunnel uit `deploy/ai-node/` — deze frp-opzet
  is de volledig self-hoste variant daarvan.
