# AGENTS.md — ZekerFlex (instructies voor coding-agents: Codex, Claude, de ZekerFlex Bouwer)

ZekerFlex is een Nederlands flexwerk-/uitzend-/zzp-marktplaatsplatform.
**Stack:** Next.js (App Router) · TypeScript (strict) · Prisma · Tailwind · draait op de **eigen TransIP-VPS** (Docker Compose + Caddy, `docker-compose.vps.yml`).

## Gouden regels (ALTIJD volgen)

1. **Verifieer vóór elke commit** en lees de output:
   - `npx tsc --noEmit -p .`  (moet 0 fouten geven)
   - `npx eslint <gewijzigde bestanden>`  (moet schoon zijn)
   - `npx vitest run <tests die je wijziging raken>` (of `npx vitest related <bestanden>`)
   Commit/push **alleen** als alles schoon is.
2. **Pushen naar `main` is nog niet live, maar wel de volgende uitrol.** Live zetten gaat via Admin → ZekerFlex AI → Live zetten (de live-zetter op de VPS) of `deploy/scripts/vps-update.sh`; die zetten GitHub `main` live. Migraties draaien **niet** vanzelf: alleen met `ZF_MIGREER=1`, na een droge proef (`BEGIN … ROLLBACK`). Push dus alleen gecontroleerde wijzigingen.
3. **Strikte TypeScript:** `noUncheckedIndexedAccess` (guard `arr[i]` met `?? …`) en `exactOptionalPropertyTypes` (nooit `prop: undefined` toekennen; laat de key weg of type `| undefined`).
4. **Volg de bestaande stijl** (naamgeving, comment-dichtheid, patronen van omringende code). Kijk eerst hoe iets elders is gedaan.
5. **Kleine, omkeerbare diffs.** Geen destructieve/riskante commando's. Bouw niet opnieuw wat al bestaat — het platform is zeer compleet; zoek echte gaten.
6. **Alle zichtbare tekst is gewoon Nederlands** (de eigenaar leest geen Engels).

## Valkuilen (lessen uit eerdere fouten)

### Tijd en gegevens

- **Tijd:** de server draait in UTC. Gebruik `lib/time/amsterdam.ts` (`amsterdamDayKey`, `amsterdamClock`, `amsterdamStartOfDay`, …); nooit `getHours()`/`toLocale*` zonder `timeZone: "Europe/Amsterdam"`. Ook in client-componenten die op de server renderen (anders hydratiefout #418). Tijden in `.ics` altijd UTC met `Z` (`toISOString`). Een `datetime-local`-waarde ("2026-11-05T09:00", zonder zone) op de server nooit met `new Date()` inlezen, maar met `parseAmsterdamLocal()`. Dagen optellen met `Date.UTC(y, m - 1, d + n)` + `amsterdamToUtc()`, niet met `setDate` op een tijdstip.
- **Annuleringen** tellen alleen tegen een werker via het begin van `cancelReason` ("Afgezegd door flexwerker…", "Niet opgekomen…"; `lib/profile/card.ts`). Een nieuw annuleringspad krijgt dus een herkenbaar begin.
- **Promise.all uitbreiden:** controleer de volgorde van de destructuring.
- **Na een PATCH** de teruggegeven serverversie overnemen in de lijst, niet lokaal één veld bijwerken (de server kan bijeffecten hebben).
- **Gedeelde staat in het geheugen** (wachtrijen, caches) via `globalThis`: Next bundelt routes apart, dus een gewone module-variabele bestaat per bundel.
- **Bestanden die de app zelf schrijft** (uploads, Studio-foto's) horen op het opslagvolume (`storage/`, volume app-storage), nooit in `public/`: de container wordt bij elke uitrol vervangen en alles daarin is dan weg (`lib/ontwerp/fotos-store.ts`, `lib/ontwerp/media.ts`).
- **Grote uploads:** met middleware kapt Next elke request-body stil af op `middlewareClientMaxBodySize` (in `next.config.mjs`, nu 210mb; standaard 10 MB, alleen een waarschuwing in het log). Staat een route grotere bestanden toe, verhoog dan die grens mee.
- **AuditLog** heeft bewust geen relatie met User (de hashketen); voeg die niet toe.

### Veiligheid en privacy

- **JSON-LD:** altijd via `ldJson()` uit `lib/seo/json-ld.ts`, nooit `JSON.stringify` in een `<script>`-tag (XSS).
- **AVG:** een nieuwe KV-sleutel per gebruiker → het voorvoegsel in `ERASABLE_KV_PREFIXES` (`lib/privacy/user-kv.ts`), anders ontbreekt hij bij export/wissen. Uitvoer naar gasten/klanten (account-API, export) bevat geen interne teamvelden: filter op één plek.
- **Nooit capability-URL's in een log** (push-endpoints, getekende links, tokens in een querystring); log alleen de host.
- **Herkomstcontrole achter Caddy:** `request.url` is `app:3000`; vergelijk `Origin` met `Host`/`X-Forwarded-Host` (`lib/rijschool/herkomst.ts`), anders krijgt elke echte POST een 403.
- **Een CSP hoort bij het document:** wie via een `<Link>` navigeert, houdt de CSP van de eerste pagina. Een versoepeling (bijv. `frame-src 'self'`) dus per hele omgeving zetten (alle `/admin`), niet per losse route (`lib/security/csp.ts`).
- **Nieuwe openbare API-route** → `lib/auth/public-routes.ts` + `tests/public-routes.test.ts`.
- **Storingen in Redis/KV mogen inloggen niet blokkeren** (fail-open voor slot/limiet).
- **Testen met mail of bedrijven:** alleen testadressen; nooit een echte lead. Let op: sendMail houdt alleen `.test`/`.example`/`.invalid`/localhost in de eigen postbus (`isReservedTestAddress`); `@example.com` gaat wél via SMTP (en kaatst terug). En een melding die je code naar een intern adres stuurt (sales@, info@) gaat altijd echt, ook bij een testklant: sla die over voor testadressen (zie `lib/domeinen/bestelling.ts`).

### Geld

- **Platformfee-staffel:** één bron, `lib/pricing/tiers.ts`. De uitzendopslag is niet openbaar.
- **Stripe-webhook:** elke functie een eigen tak op een metadata-sleutel, idempotent via unieke kolommen (Stripe stuurt soms dubbel).
- **Android-app (TWA):** bank, voorschot, snelle uitbetaling en doorverwijzen zijn in de app verborgen (`lib/app-mode.ts`). Nieuwe geldfuncties daar ook afschermen.

### Schermen

- **Werker-app (`/dashboard`) is vijftalig** (NL/EN/PL/RO/UK): nieuwe tekst in `lib/i18n/freelancer.ts`, client via `useFT()`. Importeer nooit `dictionary-en`, `lib/i18n/server` of `FREELANCER_DICTS` in een client-bestand dat de shop laadt (`tests/i18n-bundle.test.ts`). Een onderdeel dat werker én werkgever delen krijgt een `texts`-prop met NL-standaard (zoals `components/auth/two-factor-texts.ts`).
- **Push aan een werker** gaat in zijn app-taal: `sendLocalizedPush()` (`lib/notifications/localized-push.ts`) met de tekst in `WORKER_PUSH` (`lib/i18n/worker-push.ts`, vijf talen), nooit een losse `sendUserPush` met Nederlandse tekst. Pushes aan opdrachtgevers blijven Nederlands.
- **Een systeembericht in de chat** (`postMessage(…, "system")`) stuurt géén push. Moet iemand het echt weten (tijd verzet, geannuleerd, claim), stuur dan zelf een push mee.
- **Client-componenten** importeren nooit iets dat prisma, kv, mail of zod meeneemt; zet gedeelde lijsten/hulpjes in een los, puur bestand.
- **`sr-only` in een vegende rij** (`overflow-x-auto`): die tekst is `position: absolute`; zonder gepositioneerde ouder (`relative`) binnen de rij ontsnapt hij aan het afknippen en maakt hij de hele pagina breder dan het scherm (5 nov: /shop scrollWidth 841 op 390). Geef de kaart of het element eromheen `relative`.
- **Geen component binnen een component** definiëren (velden verliezen hun focus) en **geen `<form>` binnen een `<form>`**.
- **Chat (`components/chat/`):** de chat is `InboxPage`; het berichtpaneel van `ChatDock` staat uit (`hideDock`), die doet alleen bellen. Elke poll maakt een nieuwe berichtenlijst: scroll dus nooit op `messages` als dependency, maar via `useStickyScroll` (op het laatste bericht-id; anders springt het gesprek elke 3 s naar beneden). Een optimistisch bericht dat de server weigert krijgt `failed` + "Opnieuw", nooit een klokje dat blijft staan. Meldingen via de eigen balk (`say`), geen `window.alert`.
- **Portals en events:** React stuurt touch-/klik-events uit een `<Portal>` (paneel, viewer) langs de voorouders in de React-boom. Een rij met eigen touch-handlers (lang drukken, vegen) controleert daarom `rowRef.current.contains(e.target)`.
- **Admin:** elke pagina met de kit (`components/admin/kit.tsx` + `kit-client.tsx`: PageHead, KpiStrip, Panel, Chart, DataTable), opgenomen in `ADMIN_HUBS` (`lib/admin/nav.ts`) en strikt `PLATFORM_ADMIN` (`tests/admin-access.test.ts` en `tests/admin-nav.test.ts` bewaken dat).
- **Werkgeversmenu en -startscherm** volgen de werkruimte (personeel, rijschool, horeca, website): `menuVoor()` in `lib/werkgever/werkruimte.ts`. Een nieuw menu-item = een sleutel daar plus adres, label en icoon in `app/werkgever/layout.tsx` (`tests/werkgever-werkruimte.test.ts`). Wie klussen heeft, houdt altijd alle personeelsfuncties in het menu.
- **Kleuren:** één kleur = één betekenis — groen doen, blauw `plan` gepland, amber `warn` wacht op jou, violet `trust` verificatie, goud `money` geld, rood probleem. Kleuren die een klant kiest: tekst- en knopkleur via `lib/rijschool/kleuren.ts`; oranje op licht haalt geen AA voor kleine tekst (gebruik de donkere variant).
- **Donkere modus (werker- en werkgeversapp)** werkt alleen via de regels `.app-scope[data-theme="dark"] .<klasse>` in `app/globals.css`; Tailwind `dark:` volgt het systeem, niet de themaknop. Een kleurklasse zonder zo'n regel (ook `hover:…`) blijft licht en wordt onleesbaar: voeg hem daar toe, met de lichte tint uit het donkere beheerthema.
- **Toegankelijkheid:** foutmeldingen in formulieren krijgen `role="alert"`; labels aan velden koppelen.
- **Snelheid mag het uiterlijk nooit veranderen:** bewijs het met schermafbeeldingen per scrollpositie, vóór en na.
- **Lettertypes** staan zelf gehost (`public/fonts`, `app/fonts.css`); de build haalt niets bij Google.
- **Eigen `opengraph-image.tsx`** werkt alleen met `canonical(path, { fileImage: true })` (`lib/seo.ts`).
- **`sitemap.ts`/`robots.ts` zonder `revalidate` of dynamische API zijn statisch:** Next maakt ze tijdens de build, zonder database (gegevens ontbreken dan stil). Zet `export const revalidate = …` en controleer live dat `x-nextjs-cache`/`lastmod` niet de buildtijd blijven.
- **sharp** heeft geen lettertypes in de container: geen tekst in een SVG die naar PNG gaat, alleen vormen.

### Klantsites en websitevoorstellen

- Gebouwde sites (`lib/sites/render.ts`) hebben geen scripts en een sandbox-CSP; alles komt van de site zelf (foto's via `media/`, lettertypes via `assets/fonts/`), nooit van een derde partij.
- Bestaande klantsites en verstuurde voorstellen nooit ongevraagd van uiterlijk laten veranderen: een nieuwe stijl of nieuw blok is standaard alleen voor nieuwe sites; de klant kiest zelf.
- Een voorstel mailt nooit vanzelf (een mens verstuurt) en heeft een band "niet de officiële website", noindex, geen LocalBusiness-JSON-LD en een dicht formulier.

### Testen en fouten zoeken

- Pas je een bestaande route of functie aan, draai dan alle tests die dat pad raken (zoek in `tests/`), niet alleen je nieuwe.
- Pure hulpjes in `.ts`, niet `.tsx` (vitest leest geen JSX). Module met prisma testen: `vi.mock("@/lib/prisma", () => ({ prisma: {} }))`. `AppError.validation` geeft 422. Geen `.refine` binnen `z.discriminatedUnion`.
- **Fouten zoeken:** eerst het foutenlogboek (Admin → Systeem → Foutmeldingen, `lib/ops/error-journal.ts`); meet vóór je een oorzaak noemt.
- **Taken voor de eigenaar** (sleutels, accounts, iets in een extern portaal) horen in `lib/admin/owner-todos.ts` (Admin → Te doen); aan/uit zonder uitrol via `lib/flags`.

### Gedeelde werkmap en uitrollen (sessies op de pc; de Bouwer heeft een eigen kopie)

- Meerdere sessies delen één werkmap en `main`. Push op sha (`git push origin <sha>:main`) en rol een vaste hash uit, nooit HEAD. Gewoon pushen alleen als `git merge-base --is-ancestor origin/main main` waar is; anders je eigen commits in een losse worktree op `origin/main` cherry-picken. Nooit `pull --rebase`/`--autostash` in de gedeelde map (dat raakt onaf werk van anderen). Faalt tsc door onaf werk van een ander, controleer dan HEAD + je eigen bestanden in een losse `git worktree`.
- Vóór een uitrol: staat er op `main` een migratie van een ander die nog niet op prod is (`_prisma_migrations`), rol dan niet blind `main` uit. Meld een uitrol vooraf en "klaar" erna; test live nooit tijdens de uitrol van een ander.
- **Next zet `127.0.0.1` in een querystring om naar `localhost`** (NextURL): een API die een IP-adres als `?ip=` krijgt, ziet voor het loopback-adres `localhost`. Test zulke routes met een echt adres (bv. het Docker-adres van de container), niet met 127.0.0.1.
- **Nieuwe dienst in `docker-compose.vps.yml`:** zet hem ook in de `up -d`-regel van `deploy/scripts/vps-update.sh`, anders start een uitrol hem niet. Een poort die al bezet is (coturn heeft 3478 én 3479) laat `up -d` de container zonder netwerk achter: de app ziet hem dan niet (EAI_AGAIN). Controleer na de eerste uitrol `docker inspect` op het netwerk.
- **Caddy leest alleen `SITE_ADDRESS` en `BOUWER_VOORBEELD_HOST`** (`environment:` in `docker-compose.vps.yml`), niet heel `.env.production`: anders maakt elke nieuwe sleutel Caddy bij de volgende uitrol opnieuw aan en is de site even weg. Heeft de Caddyfile een nieuwe variabele nodig, zet die dan daar bij. Druk nooit `docker compose config` ongefilterd af: dat toont alle geheimen (ook van diensten waar hij van afhangt).
- PowerShell 5: `Out-File -Encoding utf8` zet een BOM; `git archive | ssh` beschadigt binaire data. Gebruik daarvoor Git Bash.
- **Script op de VPS via `ssh … 'bash -s' < script.sh`:** een `docker exec -i … psql -c` zonder heredoc leest de rest van het script als invoer en de controle stopt stil halverwege. `-i` alleen met een heredoc, anders weglaten.
- **`.env.production` is van root (600).** Scripts die er geheimen aan toevoegen (`deploy/scripts/env-aanvullen.sh`: SCRAPER_TOKEN, OUTLINE_*, OIDC_OUTLINE_SECRET, METABASE_ADMIN_PASSWORD) draaien met `sudo`; zonder sudo faalt het stil en start een dienst zonder token. Lees er nooit uit zonder sudo en druk hem nooit af (alleen namen: `grep -oE "^NAAM="`).
- **Nieuwe dienst in Docker:** eigen compose-service met `mem_limit`, eigen netwerk als hij code van buiten verwerkt (zoals `scraper` op `bronnen`), een Caddy-blok op `{$NAAM_HOST:<naam>.37-97-226-24.sslip.io}` (er is geen wildcard-DNS; de nette naam is een owner-todo), `up -d <dienst>` in `vps-update.sh`, en een eigen database via `deploy/scripts/databases-aanmaken.sh`. Een dienst die ingebed wordt (Metabase) hoort in de CSP `frame-src` van de héle omgeving (`lib/security/csp.ts`).
- **Eigen diensten loggen in met ZekerFlex** via OIDC (`lib/oidc`): een nieuwe client komt uit de omgeving (`clients()` in `lib/oidc/aanbieder.ts`), nooit uit een formulier; redirect_uri exact.
- Server-acties overleven een uitrol alleen door de vaste `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in `.env.production` (compose geeft hem als build-arg; in Docker maakt Next anders elke build een nieuwe). Haal die niet weg en wissel hem niet zonder reden. Een tabblad van vóór een uitrol herlaadt zichzelf via `lib/ops/stale-deployment.ts`.

## Autonoom doel

Blijf waardevolle, begrensde verbeteringen bouwen (feature, fix, polish, SEO/content, admin-tool, performance, toegankelijkheid): bedenk zelf → bouw → verifieer → commit + push → kort documenteren. Zit je vast op een mensbeslissing? Noteer het en pak een andere taak.

## Waar dingen staan

- `app/` — routes (App Router). Publieke marketing in `app/(marketing)/`, dashboards in `app/dashboard` (freelancer), `app/werkgever` (opdrachtgever), `app/admin` (beheer). API in `app/api/`.
- `lib/` — logica: `lib/ai/` (LLM-adapter + model-fleet), `lib/jarvis/` (admin-assistent), `lib/rag/` (kennisbank/corpus), `lib/matching/`, `lib/billing/`, `lib/timesheets/approve.ts` (uren→facturen+fee), `lib/sales/` (outreach-motor), `lib/bouwer/` (Bouwer + live-zetter), `lib/seo-sectors.ts` + `lib/seo-cities.ts` (programmatische landingspagina's).
- `components/` — UI (o.a. `components/marketing/`, `components/admin/`, `components/jarvis/`, `components/chat/`).
- `prisma/schema.prisma` — datamodel; migraties in `prisma/migrations/`.
- `deploy/` — VPS: `scripts/vps-update.sh` (uitrol), `bouwer/` (Bouwer + live-zetter), `caddy/`, `cron/`.

## Context / recent

- **AI:** de live AI is Gemini (via `AI_ALLOW_REMOTE`); Ollama draait ook op de VPS (eigen model, nu niet in gebruik). Admin → ZekerFlex AI beheert sleutel + modelkeuze per taak.
- **Zelf bouwen en uitrollen:** de ZekerFlex Bouwer (`deploy/bouwer/werker/`) maakt wijzigingen in een eigen werkkopie, met live voorbeeld en controle; de eigenaar keurt goed en zet live met één knop. Hij leest dit bestand als projectregels.
- **Organische groei (GTM):** config-gestuurde sector-SEO (werkgever + werker, 5 sectoren × 21 steden) via `lib/seo-sectors.ts` + `components/marketing/SectorLanding.tsx`. Een sector toevoegen = config + dunne route-map.
- **Geldstroom werkt:** bij goedgekeurde uren wordt automatisch een PLATFORM_FEE-factuur (€3,50/uur) aan de werkgever gemaakt; auto-matching draait bij het plaatsen van een klus.
- Fallback-coders staan in `deploy/local-coder/` (Aider/Codex op lokaal model of OpenAI).

## Commit-stijl

Conventionele commits in het Nederlands, bv. `feat(seo): …`, `fix(ai): …`. Houd berichten kort en concreet.
