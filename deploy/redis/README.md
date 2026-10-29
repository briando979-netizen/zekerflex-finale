# Soevereine Redis (vervangt Upstash)

ZekerFlex gebruikt Redis voor snelheidslimieten, sloten, de login-lockout en
caches. De gratis Upstash-tier (500k commando's/maand) liep een keer vol, wat
inloggen platlegde (zie het Redis-incident). Met je eigen Redis op je eigen
server is dat quotum weg — en het past bij je voorkeur voor eigen infra.

> De code is sinds het incident **fail-open**: valt Redis weg, dan werkt inloggen
> gewoon door. Deze eigen Redis haalt de oorzaak weg en maakt alles weer snel.

## Wat je nodig hebt
- Een kleine Linux-server met Docker (1 GB RAM is zat).
- Een subdomein dat naar die server wijst, bv. `redis.zekerflex.com` (A-record).
- Poort **6380** open in de firewall (en 80 tijdelijk voor het certificaat).

## Stappen

```bash
cd deploy/redis
cp .env.example .env            # vul REDIS_PASSWORD (openssl rand -base64 32) + REDIS_DOMAIN
```

**1. Firewall:** laat 6380 (en kort 80) toe.

**2. Certificaat ophalen** (Let's Encrypt, eenmalig; vernieuwt met een cron):
```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d "$REDIS_DOMAIN"
mkdir -p certs
sudo cp /etc/letsencrypt/live/$REDIS_DOMAIN/fullchain.pem certs/fullchain.pem
sudo cp /etc/letsencrypt/live/$REDIS_DOMAIN/privkey.pem   certs/privkey.pem
sudo chown "$USER" certs/*.pem
```

**3. Starten:**
```bash
docker compose up -d
docker compose logs --tail=20 redis   # 'Ready to accept connections tls'
```

**4. Testen vanaf je laptop:**
```bash
redis-cli -h redis.zekerflex.com -p 6380 --tls -a '<REDIS_PASSWORD>' ping   # → PONG
```

**5. In Vercel** (Project → Settings → Environment Variables, Production) zet je
`REDIS_URL` om naar je eigen server en **redeploy**:
```
REDIS_URL=rediss://default:<REDIS_PASSWORD>@redis.zekerflex.com:6380
```
Laat `KV_REST_API_*` en `KV_URL` staan (die horen bij de Postgres-KV, los van dit).

## Onderhoud
- **Certificaat vernieuwt zichzelf.** Gebruik het meegeleverde `renew-cert.sh`
  (draait `certbot renew`, kopieert de pem's en herstart Redis **alleen** als er
  echt een nieuw certificaat is — via `--deploy-hook`). Zet het in een cron,
  bv. 2× per maand; handmatig vernieuwen kan ook met `./renew-cert.sh`:

```bash
chmod +x renew-cert.sh
( crontab -l 2>/dev/null; echo "0 3 1,15 * * $(pwd)/renew-cert.sh >> /var/log/zf-redis-renew.log 2>&1" ) | crontab -
```

- **Data** staat in het `redis-data`-volume (AOF + snapshots), dus een herstart
  verliest niets. Redis bevat alleen vluchtige dingen (limieten, sloten, caches),
  geen klantdata — een lege Redis na een crash is geen ramp.
- `maxmemory 384mb` met `allkeys-lru`: vol geheugen gooit de oudste caches weg
  i.p.v. te falen.

## Terug naar Upstash?
Zet `REDIS_URL` terug naar de Upstash-waarde en redeploy. Niets anders nodig.
