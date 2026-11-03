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

Installeren (eenmalig): `sudo bash deploy/bouwer/installeer-bouwer.sh`

Dit script zet `BOUWER_TOKEN` in `.env.production`, zet 4 GB swap aan en start de
container. Vul daarna in de Bouwer-instellingen een fine-grained GitHub-sleutel
in: alleen deze repo, met "Contents: Read and write".
