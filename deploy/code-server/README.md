# Web-VS-Code + web-terminal op je eigen VPS

De **echte** web-based VS Code (`code-server`) en een **web-terminal** (`ttyd`),
op je eigen server — net als `deploy/ai-node` en `deploy/sovereign`. Je beheert
ZekerFlex-code en draait commando's vanuit je browser, overal vandaan.

## Waarom niet in de app op Vercel?

De ZekerFlex-app draait op Vercel (serverless): geen vaste processen, read-only
filesystem, geen interactieve shell. Een echte terminal of VS Code **kan daar
niet draaien**, en een shell-endpoint op de live site zou neerkomen op remote
code execution. Daarom draait dit op je VPS. In de app zelf zit wél een
**veilige** console (Admin → Terminal & VS Code) met een vaste set read-only
commando's, plus knoppen die naar deze stack linken.

## Wat je nodig hebt

- Een **VPS** met Docker + een vast publiek IPv4 (dezelfde als de AI-node kan).
- Twee **DNS A-records** naar dat IP: `code.jouwdomein.nl` en `term.jouwdomein.nl`
  (kan rechtstreeks via Admin → Hosting & domein → "Pas DNS toe op <provider>").
- Open poorten **80 + 443** (Caddy regelt de certificaten).

## Starten

```bash
# 1. Zet deze map op je VPS en ga erin
scp -r deploy/code-server root@<vps-ip>:/opt/zf-code && ssh root@<vps-ip>
cd /opt/zf-code

# 2. Config
cp .env.example .env            # vul DOMAIN + een sterk PASSWORD in
#   genereer de terminal-wachtwoordhash en zet die in .env (TTYD_PASS_HASH):
docker run --rm caddy:2.8 caddy hash-password --plaintext 'jouwterminalwachtwoord'

# 3. Starten
docker compose up -d

# 4. Open in je browser
#   https://code.jouwdomein.nl   (VS Code — inloggen met PASSWORD)
#   https://term.jouwdomein.nl   (terminal — basicauth met TTYD_USER/wachtwoord)
```

Je code/werkmap staat in `./workspace` (gedeeld tussen VS Code en de terminal) en
blijft bewaard. VS Code-instellingen + extensies in `./code-config`.

## Beveiliging — lees dit

Dit is krachtig: wie binnenkomt, kan code draaien op je server. Daarom:

- **Sterke, unieke wachtwoorden** voor zowel `PASSWORD` (VS Code) als de terminal.
- Caddy dwingt **HTTPS** af; de terminal zit bovendien achter **basicauth**.
- Overweeg een **IP-allowlist** (firewall / Caddy `@allowed` matcher) zodat alleen
  jouw IP's erbij kunnen, of zet het achter een VPN.
- Zet 2FA op je DNS/VPS-account; draai de containers als non-root waar mogelijk.
- Deze stack staat bewust los van de productie-app: compromittering raakt je VPS,
  niet direct de Vercel-deploy of de database (tenzij je die secrets erin zet).

## Koppeling met het paneel

In **Admin → Terminal & VS Code** vul je de twee URL's in (`https://code.…` en
`https://term.…`); daarna openen de knoppen jouw omgeving rechtstreeks. Daar vind
je ook de in-app veilige console voor snelle read-only checks.
