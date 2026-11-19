# FlikFlak — korte-video app, gehost binnen ZekerFlex

FlikFlak is de eigen korte-video app van de eigenaar (TikTok-achtig). Hij draait als
eigen kleine container naast ZekerFlex en is bereikbaar op een eigen subdomein
(standaard `flikflak.37-97-226-24.sslip.io`; met `FLIKFLAK_HOST=flikflak.zekerflex.com`
in `.env.production` op de nette naam, zodra het A/AAAA-record naar de VPS wijst).

## Waar het uit bestaat
- `server.js` — Express + multer + ws. Geen database van de app: eigen opslag.
- `public/` — de app zelf (één pagina) en `beheer.html` (de moderatiepagina `/beheer`).
- `seed/` — demo-inhoud voor de allereerste start (db.json + een paar video's). De
  demo-accounts zijn **niet** in te loggen (willekeurige wachtwoord-hash); het is
  alleen showcase. Opnieuw maken: `node seed-build` vanuit de lokale FlikFlak-map.
- `Dockerfile` + `entrypoint.sh` — bouwen en, bij een leeg volume, de demo erin zetten.

## Opslag
Alles wat de app schrijft (geüploade video's + `db.json`) staat op het volume
`flikflak-data` (`/data` in de container), dus het overleeft een uitrol. Nooit in de
container zelf: die wordt bij elke uitrol vervangen.

## Netwerk
Eigen netwerk `flikflak-net`; alleen Caddy praat ermee. FlikFlak kan **niet** bij de
echte database of Redis van ZekerFlex.

## Beheer / moderatie (openlijk gemeld)
`/beheer` toont meldingen, video's en accounts, en kan ze weghalen. Het is dicht
zonder `FF_ADMIN_TOKEN` (door `env-aanvullen.sh` aangemaakt in `.env.production`).
Bij het aanmelden ziet een gebruiker de huisregels: we bewaren gebruikersnaam, wat je
plaatst en je IP-adres (met tijdstip) om misbruik tegen te gaan en meldingen te
behandelen. Dat staat open in de app, niet verborgen.

## Lokaal draaien
`cd` naar de lokale FlikFlak-map en `node server.js` → http://localhost:3001.
De repo-kopie hier is de versie die live draait; houd beide gelijk.
