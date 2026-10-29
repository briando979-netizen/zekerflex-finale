# ZekerFlex installeren op je eigen server — kopieer-plak

Dit is alles wat iemand hoeft te doen op een **verse Debian/Ubuntu-VPS**. Eén keer,
~10 minuten. Nodig: een VPS (met root/sudo), een domein, en — om online te gaan —
een Cloudflare-tunnel-token (uit je Cloudflare-dashboard, zie `deploy/README.md` §2).

Plak dit blok één voor één (of in één keer) op de VPS:

```bash
# 1. Repo ophalen
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/briando979-netizen/zekerflex-finale.git zekerflex
cd zekerflex

# 2. Installeren — genereert ZELF alle secrets en maakt alles "altijd live"
sudo DOMAIN=jouwdomein.nl CLOUDFLARE_TUNNEL_TOKEN=plak-hier-je-token bash deploy/scripts/install.sh

# 3. (eenmalig) AI-modellen ophalen
sudo bash deploy/scripts/pull-models.sh
```

Klaar. ZekerFlex draait nu zelf-gehost, komt na reboot/crash/vastloper vanzelf
terug, en loopt via de tunnel — **geen Vercel nodig**.

- Status: `systemctl status zekerflex`
- Logs: `docker compose -f docker-compose.prod.yml logs -f app`
- Later bijwerken: `git pull && sudo bash deploy/scripts/deploy.sh` (of zet de
  GitHub auto-deploy aan, zie `.github/workflows/self-host-deploy.yml`).

Heb je nog geen `CLOUDFLARE_TUNNEL_TOKEN`? Laat 'm weg; de installatie draait dan
gewoon en je vult 'm later in `.env.production` in om live te gaan.
