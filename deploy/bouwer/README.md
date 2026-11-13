# ZekerFlex bouwt zichzelf

Twee onderdelen op de VPS, allebei te bedienen vanuit **Admin → ZekerFlex AI**.
Geen Claude en geen ssh-sessie nodig.

## 1. Live zetten (`zf-live.py`)

Een systemd-dienst op de server (buiten Docker). De knop **Live zetten** legt een
verzoek in de database; de dienst pakt het binnen enkele seconden op en doet dit:

1. Hij haalt de nieuwste GitHub `main` op, in een eigen kopie in `~/.zf-bron`.
2. Hij controleert of de live versie op `main` staat. Database-wijzigingen
   (migraties) toont hij eerst met hun SQL. Ze gaan alleen mee na akkoord op
   precies die wijzigingen; een destructieve wijziging vraagt een extra vinkje.
3. Hij pakt de code uit over `~/zekerflex` en draait `deploy/scripts/vps-update.sh`.
   Met akkoord op migraties draait dat script met `ZF_MIGREER=1`.
4. Hij wacht tot de app gezond is. Is ze dat niet, dan zet hij zelf
   `zekerflex-app:rollback` terug.

`git archive` voegt bestanden toe, maar wist niets. Na het uitpakken zet de
live-zetter daarom elk bestand in `app/`, `components/`, `lib/`, `public/`,
`prisma/` of `types/` dat niet in git staat in quarantaine, in
`~/zekerflex-weg/<tijd>/`. Terugzetten is terugverplaatsen. Zijn het er meer dan
50, dan doet hij niets en meldt hij het in het log.

Installeren (eenmalig): `sudo bash deploy/bouwer/installeer-live.sh`
Logboek: `journalctl -u zf-live -f`

## 2. De Bouwer (`werker/`)

Een AI-programmeur in een eigen container (service `bouwer` in
`docker-compose.vps.yml`). Je geeft een opdracht in gewone taal. Hij zoekt, leest
en wijzigt in een eigen kopie van de codebase en draait de controles uit
AGENTS.md (`tsc` + `eslint`). Elke stap zie je live.

Daarna kies je wat er met de wijziging gebeurt:

- **Goedkeuren**: de Bouwer commit en werkt bij met de nieuwste `main`. Is `main`
  intussen veranderd, dan controleert hij opnieuw. Daarna pusht hij naar GitHub,
  en desgewenst gaat het meteen via de live-zetter live.
- **Bijsturen**: hij gaat verder in hetzelfde gesprek.
- **Weggooien**: de wijziging verdwijnt.

Waar hij wel en niet bij kan:

- Hij draait op hetzelfde taalmodel als de rest van ZekerFlex (`LLM_BASE_URL`,
  bijvoorbeeld Gemini of een eigen Ollama/vLLM). Het model kies je in de
  instellingen.
- Hij heeft geen database en geen app-geheimen. Het model en de GitHub-sleutel
  geeft de app per opdracht mee. Die sleutel staat versleuteld in de KV.
- Hij kan de database niet wijzigen (`prisma/`), en ook de pakketten, de
  beveiliging (`lib/auth`, `lib/security`, middleware) en de uitrol
  (`deploy/`, Dockerfile) niet. Dat blijft mensenwerk.
- Zware stappen wachten op een lopende uitrol, via `.zf-slot/deploy.lock`. Zo
  komen een uitrol-build en een controle nooit tegelijk op het geheugen.

De werkbank heeft ook een **echte terminal** op deze werkkopie: Terminal →
"werkkopie (echte shell)". Daar kun je bijvoorbeeld `git log`, `npx tsc` of
`npx vitest run` draaien. De terminal draait in dezelfde afgeschermde container
(geen database, geen geheimen), elk commando mag maximaal 2 minuten duren, en elk
commando komt in het auditlog.

**Live voorbeeld** (`werker/voorbeeld.mjs`): bij een open opdracht start je met
"Start voorbeeld" de gewijzigde site als `next dev` in de container. Daarachter:

- Een eigen database `bouwer-db` met **alleen demogegevens**, gezaaid met
  `prisma/seed.ts` en `scripts/demo-shifts.mjs`, plus een eigen `bouwer-redis`.
  Beide staan op een netwerk zonder internet; de echte database komt er niet bij.
- Caddy maakt het voorbeeld bereikbaar op `BOUWER_VOORBEELD_HOST` (standaard
  `voorbeeld.37-97-226-24.sslip.io`, dus geen DNS nodig).
- Toegang alleen met een getekende link uit Admin, 2 uur geldig.
- Na 30 minuten zonder bezoek stopt het voorbeeld, en altijd zodra de Bouwer
  weer aan het werk gaat. tsc en `next dev` passen samen niet in de 3 GB van de
  container.
- Inloggen in het voorbeeld met de demo-accounts, bijvoorbeeld
  `admin@zekerflex.nl` / `Zeker!2026`.

Installeren (eenmalig): `sudo bash deploy/bouwer/installeer-bouwer.sh`

Dit script zet `BOUWER_TOKEN` in `.env.production`, zet 4 GB swap aan en start de
container. Vul daarna in de Bouwer-instellingen een fine-grained GitHub-sleutel
in: alleen deze repo, met "Contents: Read and write".

## 3. Auto-uitrol (zonder GitHub Actions)

Na elke push naar `main` controleert en rolt de **eigen server** vanzelf uit; GitHub Actions blijft **uit** (het account had een
billing-lock en de eigenaar wil niets aan GitHub betalen; de bestanden in `.github/workflows.disabled/` doen niets). De lus is
een cron-taak elke 2 minuten (`/api/internal/auto-uitrol`, `lib/bouwer/auto-uitrol.ts`); de beslisregels staan puur in
`lib/bouwer/auto-uitrol-regels.ts` (met test). De lus bouwt zelf niets: hij legt een verzoek bij de live-zetter, die zijn eigen
controle, migratie-eis en terugzetten houdt.

Beslisregels, in volgorde: noodrem aan, niets. Schakelaar uit, niets (standaard uit). Main niet te lezen, wacht. Live is al main,
niets. Deze sha eerder geweigerd, niets (een nieuwe sha wel). Migratie wacht voor deze sha, niets. Rustperiode van 3 minuten
zonder nieuwe push, wacht (daarna de nieuwste). Live-zetter oud of stil, of er loopt al een uitrol, wacht. Controle ontbreekt:
starten; loopt: wachten; **rood: weigeren, nooit uitrollen**. **Wachtende migratie: nooit uitrollen** (droge proef en
`ZF_MIGREER=1` blijven handwerk), melding. Venster van het eigen model 11:50 tot 12:40 UTC of minder dan 6 GB vrij geheugen:
wachten. Anders: uitrollen. Faalt de uitrol of wordt hij teruggezet, dan wordt die sha nooit opnieuw geprobeerd en gaat de lus door
met een nieuwe sha. De controle (`werker/controle.mjs`) doet `prisma validate`, tsc, eslint, `vitest related` en de bewakers.

Bedienen: **Admin → ZekerFlex AI → Live zetten**, blok *Auto-uitrol* (aan/uit, **noodrem**, laatste ronde en reden). De vlag
`auto-uitrol` staat standaard UIT. Bewaking: hartslag `auto-uitrol` (Admin → Systeem), en een taak in Te doen als een versie
geweigerd wordt, een migratie wacht, of main meer dan 30 minuten voorloopt op live.

**Installatie (door 16 of de eigenaar, niet door de code):**
1. Rol deze versie uit zoals gewoonlijk (Live zetten). `zf-live.py` is dan nieuw, maar de draaiende dienst nog de oude:
   `sudo systemctl restart zf-live` (zonder deze herstart blijft de Auto-uitrol wachten: hij eist live-zetter-versie 3 in de hartslag).
2. Herstart de planner zodat de nieuwe cron-regel meekomt: `docker compose -f docker-compose.vps.yml --env-file .env.production restart cron`.
3. Controleer in Live zetten dat de hartslag versie 3 toont en dat de Auto-uitrol *Laatste ronde* een tijd laat zien. Zet hem daarna zelf aan.