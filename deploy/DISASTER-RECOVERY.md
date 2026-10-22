# Noodplan — ZekerFlex draaiende houden als Vercel uitvalt

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
  - `APP_BASE_URL=https://www.zekerflex.com`, en alle Stripe/mail/LLM-sleutels.
  - `STORAGE_BACKEND=db` (uploads staan in Postgres, net als op Vercel).

## 2. Opstarten op de reserveserver
```bash
git clone <repo> zekerflex && cd zekerflex
cp /veilige-plek/.env.production .env.production     # de geëxporteerde Vercel-env
# Omdat DATABASE_URL naar Neon wijst, gebruikt de app die DB. De lokale
# postgres/redis uit de compose worden dan genegeerd — start alleen de app:
docker compose -f docker-compose.prod.yml up -d --build app
```
- De build draait automatisch de migraties (`build:with-migrate`). Omdat de DB al
  op de laatste migratie staat (die liep bij de laatste Vercel-deploy) is dit een no-op.
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


