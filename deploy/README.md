# ZekerFlex Sovereign Box — productie op een eigen VPS met Cloudflare Tunnel

Deze map bevat alles om de app op één VPS te draaien en veilig te ontsluiten via
een **Cloudflare Tunnel** — géén open poorten op de server, alle verkeer over een
uitgaande verbinding.

```
┌─────────────── jouw VPS ───────────────┐
│  cloudflared ──(uitgaand, versleuteld)──┼──▶ Cloudflare ──▶ app.jouwdomein.com
│      │                                  │
│  app:3000  ─ postgres ─ redis ─ ollama  │   (alleen intern docker-netwerk)
│  storage-volume (uploads/mail/prefs…)   │
└────────────────────────────────────────┘
   VPS-firewall: alleen SSH open.
```

> **Non-destructief.** Niets in deze map wist of reset de database. Migraties zijn
> forward-only (`prisma migrate deploy`) en staan standaard op *handmatig*.

---

## Overzicht van de bestanden

| Bestand | Doel |
|---|---|
| `../Dockerfile` | Productie-image van de Next.js-app (standalone build) |
| `../docker-compose.prod.yml` | De volledige stack: app + postgres + redis + ollama + cloudflared (+ optionele mail/voice/images) |
| `.env.production.example` | Alle omgevingsvariabelen, gedocumenteerd |
| `cloudflared/config.yml.template` | Tunnel-config (alleen nodig bij de CLI-methode) |
| `scripts/gen-secrets.mjs` | Genereert `AUTH_SECRET`, VAPID-keys, DB-wachtwoord |
| `scripts/deploy.sh` | Bouw → (optioneel) migreer → (her)start |
| `scripts/pull-models.sh` | Haalt de Ollama-modellen op (eenmalig) |
| `scripts/backup.sh` | `pg_dump` + storage-volume → `./backups/` (alleen-lezen) |
| `../docs/ENVIRONMENT.md` | Referentietabel: elke variabele, dev vs. VPS |

---

## 1 · VPS klaarzetten

Een kleine VPS volstaat om te starten (2 vCPU / 4–8 GB RAM / 40 GB schijf).
Een **8 GB+** machine is prettig als je een groter LLM draait; met een GPU-VPS
kun je in `docker-compose.prod.yml` de GPU aan `ollama` doorgeven.

```bash
# als root, verse Debian/Ubuntu
apt update && apt -y upgrade
apt -y install docker.io docker-compose-plugin git ufw

# firewall: alleen SSH
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

# een non-root gebruiker met docker-rechten
adduser --disabled-password --gecomment "" zeker
usermod -aG docker zeker
```

Verder als gebruiker `zeker`:

```bash
git clone <jouw-repo-url> zekerflex && cd zekerflex
```

## 2 · Cloudflare Tunnel aanmaken

**Dashboard-methode (aanrader — één token):**

1. Zorg dat je domein in Cloudflare staat (nameservers overgezet).
2. Ga naar **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
3. Geef hem een naam (`zekerflex`) en kies **Docker** bij "Install and run a connector".
4. Kopieer de **token** uit het getoonde commando (de string ná `--token`).
5. Bij **Public Hostnames** voeg je toe:
   - **Subdomain**: `app` — **Domain**: `jouwdomein.com`
   - **Service**: `HTTP` → `app:3000`
6. (Optioneel) een tweede hostname `mail.jouwdomein.com` → `HTTP` → `mailpit:8025`
   (alleen bij `--profile maildev`), beveiligd met een **Access**-policy.

De token gaat in `.env.production` als `CLOUDFLARE_TUNNEL_TOKEN`.

<details>
<summary>CLI-methode (credentials-bestand i.p.v. token)</summary>

```bash
cloudflared tunnel login
cloudflared tunnel create zekerflex
cloudflared tunnel route dns zekerflex app.jouwdomein.com
cp deploy/cloudflared/config.yml.template deploy/cloudflared/config.yml
# vul <TUNNEL_ID> in en zet ~/.cloudflared/<TUNNEL_ID>.json ernaast
```
Zet in `docker-compose.prod.yml` bij de `cloudflared`-service:
`volumes: [ ./deploy/cloudflared:/etc/cloudflared ]` en
`command: tunnel run zekerflex`, en verwijder de `TUNNEL_TOKEN`-regel.
</details>

## 3 · Omgeving invullen

```bash
cp deploy/.env.production.example .env.production
node deploy/scripts/gen-secrets.mjs        # kopieer de output in .env.production
nano .env.production
```

Minimaal in te vullen:

| Variabele | Waarde |
|---|---|
| `APP_BASE_URL`, `AUTH_URL` | `https://app.jouwdomein.com` |
| `AUTH_SECRET`, `INTERNAL_CRON_TOKEN` | uit `gen-secrets` |
| `POSTGRES_PASSWORD` + `DATABASE_URL` | zelfde sterke wachtwoord |
| `CLOUDFLARE_TUNNEL_TOKEN` | uit het Cloudflare-dashboard |
| `WEBPUSH_VAPID_*` | uit `gen-secrets` |
| `MAIL_FROM` | `noreply@jouwdomein.com` |
| `SMTP_HOST` | `postfix` (met `--profile mail`) — verstuurt bevestigingscodes echt |
| `KVKBASE_API_KEY` | jouw live sleutel (indien je KVK-validatie wilt) |

### E-mail echt laten aankomen

Start de stack met `--profile mail`. Dat draait een zelf-gehoste **Postfix**-relay
(`postfix:587`, alleen intern). De app stuurt bij accountregistratie automatisch een
mail met een **6-cijferige bevestigingscode** én een link — de template wordt per
gebeurtenis gekozen (`verification`, `welcome`, `replacement`, …).

Zet in je DNS (bij Cloudflare):

| Record | Waarde |
|---|---|
| `TXT @` (SPF) | `v=spf1 mx a ip4:<VPS-IP> ~all` |
| `TXT mail._domainkey` (DKIM) | de key die Postfix genereert (`docker compose exec postfix cat /etc/opendkim/keys/*/mail.txt`) |
| `TXT _dmarc` | `v=DMARC1; p=quarantine; rua=mailto:info@zekerflex.com` |
| `MX @` | `mail.jouwdomein.com` (prioriteit 10) |

Wil je geen eigen mailserver beheren? Zet `RELAYHOST=smtp.postmarkapp.com:587`
+ `RELAYHOST_USERNAME/PASSWORD` (of gebruik direct `SMTP_HOST=smtp.postmarkapp.com`
met `SMTP_USER/PASS` en laat Postfix weg).

Optioneel: `GOOGLE_CLIENT_ID/SECRET` (voeg
`https://app.jouwdomein.com/api/auth/callback/google` toe als redirect-URI),
`DIDIT_*`, `SEPA_*`. Zie `../docs/ENVIRONMENT.md`.

## 4 · Eerste deploy

```bash
# app + datastores omhoog, tunnel erbij
RUN_MIGRATIONS=yes bash deploy/scripts/deploy.sh

# LLM-modellen ophalen (eenmalig, duurt even)
bash deploy/scripts/pull-models.sh
```

`RUN_MIGRATIONS=yes` past bij een **verse database** de schema-migraties toe
(forward-only, geen dataverlies). Laat je `RUN_MIGRATIONS` weg, dan print het
script het commando en doe je het zelf wanneer je klaar bent.

**Demo-data (optioneel, alleen op een lege database):**
```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps app npx prisma db seed
```
De seed is non-destructief: op een gevulde database doet hij niets tenzij je
expliciet `-- --reset` meegeeft.

Open daarna `https://app.jouwdomein.com` — je hoort de app te zien.

## 5 · Optionele diensten

```bash
# echte e-mailaflevering + webview
PROFILES="--profile mail" bash deploy/scripts/deploy.sh
# zet in .env.production: SMTP_HOST=mailpit  SMTP_PORT=1025

# soevereine spraakherkenning voor de Jarvis-microfoon
PROFILES="--profile voice" bash deploy/scripts/deploy.sh
# .env.production heeft al: WHISPER_ENABLED=true  WHISPER_BASE_URL=http://whisper:8000/v1

# lokale beeldgeneratie (zwaar — GPU aanbevolen)
PROFILES="--profile images" bash deploy/scripts/deploy.sh
```

Statuscontrole in de app: **`/admin/systeem`** toont per component (Postgres,
Redis, Ollama, Whisper, SMTP, Studio) of hij bereikbaar is.

## 6 · Updaten

```bash
git pull
bash deploy/scripts/deploy.sh                     # bouwt + herstart, migraties handmatig
# of, als de update een migratie bevat:
RUN_MIGRATIONS=yes bash deploy/scripts/deploy.sh
```

Alleen het `app`-image wordt opnieuw gebouwd; Postgres/Redis/Ollama en hun
volumes blijven ongemoeid.

## 7 · Back-ups

```bash
bash deploy/scripts/backup.sh          # → ./backups/<datum>/  (db + storage)
```

Zet dit in een cron (`crontab -e`):
```
15 3 * * *  cd /home/zeker/zekerflex && bash deploy/scripts/backup.sh >> backups/cron.log 2>&1
```
Kopieer `./backups/` regelmatig naar een andere locatie (S3-compatible bucket,
tweede server, …).

**Herstellen** (op een lege stack):
```bash
gunzip -c backups/<datum>/zekerflex-db.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U zekerflex -d zekerflex
docker run --rm -v zekerflex_app-storage:/data -v "$(pwd)/backups/<datum>:/b" busybox \
  sh -c "cd /data && tar xzf /b/storage.tar.gz"
```

## 8 · Beveiliging & hardening

- **Geen inbound poorten.** De VPS-firewall staat alleen op SSH; alle
  web-toegang loopt via de tunnel.
- **SSH**: sleutel-only, root-login uit (`PermitRootLogin no`), overweeg
  `fail2ban`.
- **Cloudflare**: zet SSL/TLS-mode op *Full (strict)* niet nodig — de tunnel
  regelt TLS end-to-end; laat "Always Use HTTPS" aan. Overweeg een WAF-rate-limit
  regel en Bot Fight Mode.
- **Access-policies** voor `/admin` of de mail-webview (Cloudflare Zero Trust →
  Access → Applications) als extra slot bovenop de app-login.
- **Secrets** staan alleen in `.env.production` op de server (mode `600`),
  nooit in git. `.gitignore` sluit `.env*` al uit.
- **`AI_ALLOW_REMOTE=false`** houdt de soevereiniteitsgrendel dicht: de app
  weigert een niet-lokale LLM-host.
- **Updates**: `docker compose -f docker-compose.prod.yml pull` + redeploy voor
  de base-images; `apt upgrade` op de host.

## 9 · Probleemoplossing

| Symptoom | Kijk hier |
|---|---|
| Site laadt niet | `docker compose -f docker-compose.prod.yml logs -f cloudflared app` |
| 502 via Cloudflare | app-container gezond? `... exec app wget -qO- http://127.0.0.1:3000/api/health` |
| Login/redirect klopt niet | `APP_BASE_URL` / `AUTH_URL` = exact je https-domein? `AUTH_TRUST_HOST=true`? |
| Google-login faalt | redirect-URI `…/api/auth/callback/google` toegevoegd in Google Cloud? |
| AI traag / offline | `... exec ollama ollama list` — modellen aanwezig? `/admin/systeem` |
| Geen e-mail | `SMTP_HOST` gezet? anders staat alles in `/admin/mail` |
| Migratie nodig | `... run --rm --no-deps app npx prisma migrate deploy` |

Handige commando's:
```bash
C="docker compose -f docker-compose.prod.yml"
$C ps
$C logs -f app
$C exec app node -e "console.log(process.env.APP_BASE_URL)"
$C exec postgres psql -U zekerflex -d zekerflex -c "\dt"
$C restart app
```
