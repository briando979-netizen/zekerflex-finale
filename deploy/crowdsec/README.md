# Aanvalsbescherming (CrowdSec)

Beschermt de ZekerFlex-server tegen scanners, brute force, bekende aanvalssoftware en
adressen die wereldwijd al als aanvaller bekendstaan. Open source, draait helemaal op de
eigen server; er is geen abonnement of externe firewall-dienst.

## Hoe het werkt

1. **Caddy** schrijft een toegangslog (`deploy/caddy/Caddyfile`, snippet `(toegangslog)`)
   naar het volume `caddy-logs`: JSON per verzoek, zonder cookies, zonder sleutels in
   koppen en zonder querystring (daar staan getekende links in). Bestanden rollen op
   50 MB en gaan na 7 dagen weg.
2. De **engine** (container `crowdsec`, `docker-compose.vps.yml`) leest dat log en het
   ssh-log van de server (`acquis.yaml`). Collecties: `caddy`, `base-http-scenarios`,
   `http-cve`, `sshd`, `whitelist-good-actors` en GeoIP. Wie zich als aanvaller gedraagt,
   krijgt een blokkade (standaard 4 uur). De engine haalt ook de blokkadelijst van de
   CrowdSec-community op en meldt eigen blokkades (IP + soort aanval) terug.
3. De **firewall-bouncer** op de host (`installeer.sh`, pakket
   `crowdsec-firewall-bouncer-nftables`) haalt elke 10 s de blokkades op via
   `127.0.0.1:8085` en zet ze in een eigen nftables-tabel `crowdsec` met voorrang -10:
   vóór ufw en vóór Docker, op de input- én forward-hook. Dus alle poorten: web, ssh en
   de bel-relay. Een geblokkeerd adres krijgt geen antwoord meer (DROP).
4. De **app** leest mee via de LAPI (`lib/ops/crowdsec.ts`): Admin → Beveiliging toont
   blokkades en meldingen en kan een blokkade opheffen; `/beveiliging` toont de cijfers
   (elke 10 minuten ververst). Sleutels: `CROWDSEC_LAPI_URL`, `CROWDSEC_BOUNCER_KEY`,
   `CROWDSEC_MACHINE_ID`, `CROWDSEC_MACHINE_PASSWORD` in `.env.production`;
   `CROWDSEC_HOST_BOUNCER_KEY` is alleen voor de host-bouncer.

## Installeren (eenmalig, op de server)

```bash
cd ~/zekerflex
sudo bash deploy/crowdsec/installeer.sh <ip-van-de-eigenaar> --app
```

Daarna gaat de container met elke uitrol mee (`vps-update.sh` doet `up -d … crowdsec`).

## Uitzonderingen

Nooit blokkeren: de server zelf en interne netwerken (`whitelist.yaml`, vast) en de
computer van de eigenaar (dynamische lijst `zekerflex-eigen`, want dat adres wisselt):

```bash
sudo docker compose -f docker-compose.vps.yml --env-file .env.production exec crowdsec \
  cscli allowlists add zekerflex-eigen 1.2.3.4 -d "computer van de eigenaar"
```

**Let op bij testen vanaf een nieuw adres:** Playwright-rondes, loadtests en scripts die
in korte tijd veel pagina's of 404's opvragen, lijken op een scanner. Zet dat adres eerst
op de lijst, anders is die computer 4 uur geblokkeerd. Opheffen kan in Admin →
Beveiliging, of op de server:

```bash
… exec crowdsec cscli decisions delete --ip 1.2.3.4
```

## Kijken wat er gebeurt

```bash
… exec crowdsec cscli metrics            # gelezen regels, herkende scenario's
… exec crowdsec cscli decisions list     # actieve blokkades (eigen + community)
… exec crowdsec cscli alerts list        # meldingen met scenario en land
… exec crowdsec cscli bouncers list      # haalt de host-bouncer nog op? (laatste pull)
sudo nft list set ip crowdsec crowdsec-blacklists | head   # wat de kernel nu weggooit
journalctl -u crowdsec-firewall-bouncer -n 20
```

Een blokkade proefdraaien zonder iemand te raken: `cscli decisions add --ip 192.0.2.10
--duration 2m --reason proef`, dan `sudo nft list set ip crowdsec crowdsec-blacklists`
(adres staat erin) en na twee minuten is hij weer weg.
