# ZekerFlex thuis draaien op Windows — gratis & publiek, zonder Vercel

Je eigen pc als server. Gratis (geen hosting-abonnement), publiek bereikbaar via
een Cloudflare-tunnel, en zo ingesteld dat het **blijft draaien als je de laptop
dichtklapt** (aan de stroom).

## Eerlijk eerst (natuurwet)

Een laptop die **slaapt of uit staat, rekent niet** — dan kan ZekerFlex niet
draaien. Daar is geen software-truc voor. Het script zet daarom:

- **niet slapen** aan de stroom, en
- **dichtklappen = blijven draaien** (scherm uit, cpu aan).

Dus: **laat de laptop aan de oplader staan.** Gaat de pc uit of van de stroom,
dan is de site offline tot je 'm weer aanzet. Wil je het echt 24/7 zonder erop te
letten? Dan is een VPS van ~€5/mnd (`deploy/scripts/install.sh`) beter — maar dit
is de **gratis** manier op je eigen pc.

## Wat je eenmalig nodig hebt

- **Docker Desktop** (gratis) — <https://www.docker.com/products/docker-desktop/>.
  Zet in Docker Desktop → Settings → General: **"Start Docker Desktop when you
  sign in"** aan, zodat alles na een herstart vanzelf terugkomt.

## Starten (één commando)

Open PowerShell **als Administrator** in de repo-map en draai:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\run-local.ps1
```

Het script: zet de stroominstellingen, genereert zelf alle secrets, start de hele
stack in Docker, past de database-migraties toe en opent een **gratis publieke
URL** (`https://iets.trycloudflare.com`). Laat dat venster open — dat is de tunnel.

Eerste keer duurt het bouwen + de AI-modellen ophalen langer dan 5 minuten; daarna
is opstarten snel.

## Vaste URL op je eigen domein (aanrader zodra het werkt)

De gratis quick-tunnel geeft elke keer een **andere** `trycloudflare.com`-URL. Voor
een **vaste** URL op je eigen domein (je gebruikt Cloudflare al voor DNS):

```powershell
deploy\windows\cloudflared.exe tunnel login
deploy\windows\cloudflared.exe tunnel create zekerflex
deploy\windows\cloudflared.exe tunnel route dns zekerflex app.jouwdomein.nl
# draai 'm als Windows-service zodat hij altijd aan staat:
deploy\windows\cloudflared.exe service install
```

Richt de tunnel op `http://localhost:3000` (in de Cloudflare Zero Trust → Tunnels
config, of een `config.yml`). Dan is ZekerFlex altijd bereikbaar op je eigen
domein, zolang de pc aan en aan de stroom staat.

## Beheer

- Status: `docker compose -f docker-compose.prod.yml ps`
- Logs: `docker compose -f docker-compose.prod.yml logs -f app`
- Stoppen: `docker compose -f docker-compose.prod.yml stop`
- De containers hebben `restart: unless-stopped`, dus ze komen na een herstart (met
  Docker Desktop op auto-start) vanzelf terug.
