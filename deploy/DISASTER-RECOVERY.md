# Noodplan

## Nu: zelf-gehost op de VPS (sinds okt 2026)

ZekerFlex draait op de TransIP-VPS met `docker-compose.vps.yml`: app, Postgres,
Redis, Caddy, Ollama, cron en **backup**. Database en uploads staan op die ene
server; de back-up is dus wat je data redt.

**Wat er elke nacht gebeurt** (`deploy/backup/entrypoint.sh`, 02:30 UTC):
- `pg_dump` van de database naar `~/zekerflex/backups/db/zekerflex-<datum>.dump`
  en de uploads naar `~/zekerflex/backups/storage/`. De nieuwste 14 blijven staan.
- De dump wordt proef-teruggezet in de wegwerp-database `zf_restore_check`
  (tabellen en gebruikers geteld, daarna weer weg). Lukt dat niet, dan telt de
  back-up als mislukt.
- Om 03:30 UTC controleert de app de uitkomst (`/api/internal/backup/check`).
  Mislukt, ontbrekend of ouder dan 26 uur → melding aan de eigenaar. Ook bij een
  serverschijf vanaf 85% vol. Zie Admin → Systeem → Back-ups.

**Elke zondag de diepgaande hersteltest** (`run_verify`, ook via Admin → Systeem →
Back-ups → "Hersteltest nu" of `bash /backup.sh verify`): vingerafdruk van het
bestand, `pg_restore --list`, terugzetten in `zf_restore_check` en **tabel voor
tabel het aantal rijen vergelijken** met de telling van het moment van de back-up
(`<dump>.counts`), het uploads-archief doorlezen, de versleutelde kopie ontcijferen
en vergelijken, en de kopie buiten de server nameten. Uitkomst in
`backups/verify.json` + geschiedenis in `backups/verificaties.jsonl`; de app meldt
een mislukte of uitgebleven test (hartslag `db-backup-verify`).

**Versleutelde kopie buiten de server.** Met `BACKUP_PASSPHRASE` in `.env.production`
staat naast elke back-up een `.enc` (AES-256-CBC, PBKDF2 210.000 rondes). Met
`BACKUP_OFFSITE=scp://gebruiker@host/pad` (sleutel in `~/zekerflex/offsite/id_ed25519`
+ `known_hosts`) of `BACKUP_OFFSITE=https://host/webdav/pad/` (+ `BACKUP_OFFSITE_USER`
/ `BACKUP_OFFSITE_PASS`) gaat die kopie elke nacht naar buiten. Ontcijferen:
```bash
openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 210000 -in zekerflex-20261105-0230.dump.enc -out zekerflex.dump
```
(de wachtwoordzin wordt gevraagd; daarna terugzetten zoals hieronder).

**Meteen een back-up maken** (bijv. vóór een riskante migratie):
```bash
cd ~/zekerflex
sudo docker compose -f docker-compose.vps.yml --env-file .env.production exec backup bash /backup.sh now
```

**Terugzetten** (overschrijft de live database; maak eerst een verse back-up hierboven):
```bash
cd ~/zekerflex
C="docker compose -f docker-compose.vps.yml --env-file .env.production"
sudo $C stop app cron
sudo $C exec -T postgres pg_restore -U zekerflex -d zekerflex --clean --if-exists --no-owner \
  < backups/db/zekerflex-20261103-0230.dump
sudo docker run --rm -v zekerflex_app-storage:/data -v "$PWD/backups/storage:/b:ro" alpine \
  sh -c 'tar xzf /b/storage-20261103-0230.tar.gz -C /data'
sudo $C up -d app cron
curl -fsS https://zekerflex.com/api/health
```

**De eigen Git-server (Forgejo) terugzetten.** Het archief in `backups/forgejo/` bevat
een momentopname van de database (`gitea/gitea.db`, gemaakt met sqlite3 `.backup`),
de repositories en de instellingen. Zolang GitHub er ook is, is de code zelf daar
ook nog; de spiegel haalt hem binnen 10 minuten weer op.
```bash
cd ~/zekerflex
C="docker compose -f docker-compose.vps.yml --env-file .env.production"
sudo $C stop forgejo
sudo docker run --rm -v zekerflex_forgejo-data:/data -v "$PWD/backups/forgejo:/b:ro" alpine \
  sh -c 'rm -f /data/gitea/gitea.db-wal /data/gitea/gitea.db-shm && tar xzf /b/forgejo-20261111-0230.tar.gz -C /data && chown -R 1000:1000 /data/gitea /data/git'
sudo $C up -d forgejo
```

**Kopie buiten de server.** De back-ups staan op dezelfde schijf als de database:
ze beschermen tegen fouten en per ongeluk wissen, niet tegen het verlies van de
hele VPS. Haal ze regelmatig naar een andere plek, bijvoorbeeld vanaf je eigen
computer (de bestanden zijn van de deploy-gebruiker, dus zonder sudo):
```bash
scp -i ~/.ssh/transip -r briando@37.97.226.24:zekerflex/backups/db ./zekerflex-backups/
```
of zet een S3/R2-bucket op en synchroniseer de map daarheen.

**Schijf vol?** Elke update (`deploy/scripts/vps-update.sh`) ruimt oude images
en build-cache zelf op. Handmatig: `sudo docker image prune -f && sudo docker builder prune -f --filter until=72h`.

---

## Vroeger: ZekerFlex draaiende houden als Vercel uitvalt

*Uit de tijd dat de site op Vercel + Neon draaide; alleen nog relevant als je
daarnaar teruggaat.*

De live site draait op Vercel. Valt Vercel langdurig uit, dan is de site offline
tot herstel. **Je data gaat niet verloren**: database (Neon), Redis en uploads
staan buiten Vercel. Dit plan brengt ZekerFlex binnen ~30–60 min elders terug op
dezelfde database, zodat er niets gesplitst raakt.

## 0. Eerst: is het echt Vercel?
- Check https://www.vercel-status.com en je eigen uptime-melding.
- Korte, regionale storingen (minuten) → gewoon afwachten; niet failoveren.
- Pas failoveren bij een lange, brede uitval (richtlijn: > 30–60 min en geen zicht op herstel).

## 1. Wat je nodig hebt (nu alvast klaarzetten)
- Een server of VPS met Docker (Hetzner/OVH/eigen machine). Mag uit staan tot het moment zelf.
- De huidige **Vercel-omgevingsvariabelen** (Production). Exporteer ze nu al en bewaar ze veilig buiten de repo:
  - `vercel env pull .env.production` (of kopieer ze handmatig uit het Vercel-dashboard).
- Belangrijk dat erin staat (dezelfde waarden als live, zodat je op dezelfde data draait):
  - `DATABASE_URL` en `DATABASE_URL_UNPOOLED` → de **Neon**-connectiestrings (NIET de lokale).
  - `REDIS_URL` → je externe Redis (bijv. Upstash). *Zie noot Redis onderaan.*
  - `AUTH_SECRET` (exact dezelfde, anders zijn alle sessies ongeldig).
  - `APP_BASE_URL=https://zekerflex.com` en `AUTH_URL` hetzelfde (zonder www: cookies gelden per host, dus www als hoofdadres breekt het inloggen), en alle Stripe/mail/LLM-sleutels.
  - `STORAGE_BACKEND=db` (uploads sinds 31 okt 2026 staan in Postgres; oudere uploads staan in de S3-bucket van de oude Vercel-omgeving).

## 2. Opstarten op de reserveserver
```bash
git clone <repo> zekerflex && cd zekerflex
cp /veilige-plek/.env.production .env.production     # de geëxporteerde Vercel-env
# Omdat DATABASE_URL naar Neon wijst, gebruikt de app die DB. De lokale
# postgres/redis uit de compose worden niet gestart. --env-file is nodig voor
# Compose-interpolatie; service env_file alleen is daarvoor niet voldoende.
docker compose --env-file .env.production -f docker-compose.prod.yml build app
```
- De Docker-build past **geen** migraties toe. Normaal staat Neon al op de
  migratie van de laatste Vercel-productiedeploy. Als deze checkout nieuwere,
  nog niet toegepaste migraties bevat, voer die dan bewust uit vóór je de app
  start:
  `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps app npx prisma migrate deploy`.
- Start daarna alleen de app:
  `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps app`.
- Check: `curl -sI http://localhost:3000/api/health` → 200.

## 3. Verkeer omzetten (DNS bij TransIP)
- Log in bij TransIP → DNS van `zekerflex.com`.
- Zet het A-record van `www` (en `@`) naar het IP van de reserveserver.
- **Zet de TTL van tevoren laag** (bijv. 300 s) zodat een omzetting snel pakt.
  Doe dit nu alvast; standaard-TTL van een uur kost je anders een uur extra downtime.
- Zorg dat de reserveserver HTTPS heeft (Caddy/Traefik ervoor, of de cloudflared-
  tunnel uit `docker-compose.prod.yml` naar een eigen domein).

## 4. Terug naar Vercel als het weer up is
- Zet de DNS-records terug naar Vercel (de originele waarden; noteer ze nu).
- `docker compose -f docker-compose.prod.yml down` op de reserveserver.
- Omdat beide op dezelfde Neon-DB draaiden, is er geen data om samen te voegen.

## Noot: Redis
Als je Redis óók extern is (Upstash e.d.), draait de reserveserver er gewoon op
mee — ideaal. Draait Redis alleen op Vercel-adjacent infra, zet dan in de
reserve-env de losse Redis uit de compose aan (`REDIS_URL=redis://redis:6379` en
start de `redis`-service mee). Redis bevat alleen vluchtige dingen (rate-limits,
sloten, login-lockouts, de AI-node-registratie) — geen klant­data — dus een lege
Redis bij failover is geen ramp.

## Wat NIET meegaat tijdens de failover
- Vercel-crons draaien niet (autopilot, matching, herinneringen). Allemaal
  idempotent en dagelijks — ze lopen vanzelf weer bij de eerstvolgende run na
  herstel. Geen handmatige actie nodig.
- De AI-laptop blijft gewoon werken (die hangt niet aan Vercel); zet in de
  reserve-env dezelfde `LLM_*`/`AI_ALLOW_REMOTE` waarden.

## Vooraf regelen (eenmalig, maakt het verschil)
1. `vercel env pull` en de `.env.production` veilig bewaren — nu, niet tijdens de storing.
2. DNS-TTL van `www`/`@` verlagen naar 300 s.
3. Originele Vercel-DNS-waarden noteren (om terug te zetten).
4. Een reserveserver klaar hebben (of weten waar je er binnen minuten een huurt).
5. Een uptime-melding instellen zodat je een storing meteen weet.


