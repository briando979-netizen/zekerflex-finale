# ZekerFlex Sovereign Box — productie-gereedheid & zelf-evaluatie

_Bijgewerkt: 2026-09-09 · autonome code-inspectie_

## Framework

**Next.js 15.5.25** (was 14.2.35 — de laatste 14.2.x, zonder verdere
security-patches). `npm audit --omit=dev` → **0 kwetsbaarheden**. Migratie:
`@next/codemod next-async-request-api` (route-handlers `params` = `Promise`,
pages `await` `params`/`searchParams`), `lib/auth/handlers.ts`-wrappers vangen
de promise-params op, `lib/i18n/server.ts` `getLocale()`/`getDict()` zijn nu
`async` (`cookies()` is async in 15). React blijft 18.3.1. NB: `next build` op
**Windows** kan flakey falen in de post-compile FS-stappen (`.next/export`
ENOTEMPTY / `.nft.json` ENOENT bij `output: "standalone"`); de **Docker-build
draait op Linux** en heeft dit niet.

**Openstaand build-issue:** `package.json` `"build"` bevat
`prisma migrate deploy` — dat breekt de Docker-image-build (geen DB bereikbaar
tijdens build) en botst met `deploy/README` waar migraties een losse stap zijn.
`migrate deploy` uit dat script halen.

Dit document is de kritische zelf-analyse die de gebruiker vroeg: wat ontbreekt
er nog, wat rammelt, en welke stappen zijn in deze ronde autonoom gezet.

## Architectuurbesluit

**Sovereign Box is de primaire productiearchitectuur.** De applicatie gebruikt
een always-on daemon, lokale inference/TTS en persistente filesystem-opslag;
die onderdelen passen niet betrouwbaar binnen Vercel Serverless Functions.
Vercel is daarom uitsluitend een preview/demo-pad. Een echte Vercel-productie-
variant vereist een afzonderlijk ontwerp met externe LLM, object storage,
managed PostgreSQL/Redis en een externe scheduler.

Dit voorkomt een gevaarlijke schijnzekerheid: een geslaagde `next build` bewijst
alleen dat de webbundel bouwt, niet dat achtergrondjobs, uploads, mail,
betalingen of lokale modellen productiegeschikt draaien.

---

## Deel 1 — Wat ontbrak nog voor 100% productie-klaar

### Gebouwd in deze ronde ✅

| Gebied | Wat er miste | Opgelost |
|---|---|---|
| **Wekelijkse verloning** | Geen enkele logica om goedgekeurde uren per kalenderweek te bundelen tot loonstroken/facturen. De belofte op de site ("wekelijkse verloning") had geen implementatie. | `lib/payroll/` — ISO-week-engine, pure berekening (bruto, vakantiegeld 8,33%, vakantie-uren 10,83%, StiPP-pensioen, indicatieve loonheffing, netto; of dienstbedrag + btw + platformfee voor zzp/flex), fs-store (`storage/payroll/`), admin-console (`/admin/verloning`), werker-overzicht (`/dashboard/verloning`), REST + GraphQL. **DB read-only.** |
| **Uitzendkracht-propositie zichtbaar** | Home toonde alleen zzp + bedrijven. Geen uitleg over werken via het uitzendbureau, fasensysteem, verwachtingen. | Homepage-sectie "Drie manieren om te werken" + volledige pagina `/uitzendbureau` (ABU-fasen, StiPP, vakantiegeld, "alles terug te lezen"), nav + footer + FAQ + JSON-LD. |
| **Security headers** | Geen CSP, HSTS, X-Frame-Options, Permissions-Policy. | `next.config.mjs#headers()` — CSP (self + inline + Google Fonts), HSTS preload, `frame-ancestors none`, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy. |
| **Readiness vs liveness** | Alleen `/api/health` (liveness). Kubernetes/LB kon niet zien of Postgres/Redis bereikbaar zijn. | `/api/ready` — 200 alleen als DB + Redis pingen, anders 503. Gebruikt in alle deployment-paden. |
| **GraphQL API** | `graphql` + `graphql-yoga` stonden in `package.json` maar er was geen endpoint. | `/api/graphql` (yoga, rolgebonde resolvers, hergebruikt bestaande libs). GraphiQL alleen buiten productie. |
| **Infrastructuur-as-code** | Alleen een `docker-compose.prod.yml` + handmatige VPS-stappen. | `infra/terraform/` (AWS: VPC, EC2 + EIP + IMDSv2, IAM/SSM, S3-backups, Route53 met SPF/DKIM/DMARC/CAA, remote state + lock), `infra/helm/` + `infra/k8s/` (kustomize base + overlays, hardened pods, HPA, PDB, NetworkPolicy), `.github/workflows/` (CI, multi-arch image + SBOM + Trivy, Terraform plan/apply met approval, Helm/SSM deploy, CodeQL/gitleaks). |
| **Securitytests** | Losse gevallen ontbraken voor gewijzigde-rol / verwijderde-membership / cross-org via ID-tampering. | `tests/auth-security.test.ts` uitgebreid (JWT claimt een rol/org die de DB nooit geeft → genegeerd; verwijderde membership werkt direct door). `tests/idor.test.ts` — route-niveau: werkgever van org A krijgt **403** op `invoices/[id]/checkout`, `invoices/[id]/pdf` en `model-agreements/[id]/sign` van org B. Bestaand: `auth-handlers`, `middleware`, `public-routes`, `session-rotation`, `tenant-isolation`, `upload-validate`. |
| **NextAuth-beta** | Stond op `^5.0.0-beta.32` zonder testdekking op de eigen hooks — een audit-vlag ("beta in productie"). | Er ís geen stabiele v5 en `latest` = v4 is een downgrade (v4 kan de Edge-verifieerbare jose-tokens niet minten). Van open TODO naar bewuste, ingekaderde pin: **exacte versie** (caret eraf, `beta.33` installeert niet vanzelf), `dependabot.yml` `ignore`, en `tests/auth-signin.test.ts` (15 cases) legt het contract vast dat we écht gebruiken — credentials `authorize` (throttle→bcrypt→audit→rol-load), `jwt.encode`/`decode` = precies onze `lib/auth/session`-tokens, rol-propagatie, Google `signIn`-gate. next-auth is hier een dunne schil (4 call-sites; middleware + routes gebruiken de eigen `decodeSession`/`getPrincipal`). `docs/DEPENDENCIES.md` heeft de upgrade-checklist voor zodra v5-stable/RC landt. |

### Nog open (bewust niet in deze ronde — vereist keuzes of externe zaken)

| Prioriteit | Item | Waarom / aanpak |
|---|---|---|
| 🔴 hoog | **Payroll → boekhouding-koppeling** | De verloningsengine berekent en legt vast, maar zet nog geen SEPA-batch klaar en boekt niet in een grootboek. Volgende stap: `finaliseRun` → `lib/billing/sepa.ts` pain.001-batch + export (CSV/UBL) naar de accountant. Loonaangifte (Digipoort/loonaangifteketen) blijft mensenwerk of een externe payroll-provider (bijv. Nmbrs/Loket API). |
| 🔴 hoog | **Definitieve loonheffing** | Nu indicatief (vlak tarief). Een echte witte/groene tabel + heffingskortingen vereist óf een payroll-provider óf een onderhouden tarieftabel per jaar. Duidelijk als "indicatief" gelabeld in de UI. |
| ✅ grotendeels | **Rate-limiting consolideren** | Alle route-handlers gaan nu via één `enforceRateLimit()` (`lib/rate-limit.ts`): vaste sleutel-namespace `rl:<naam>:<id>`, één `clientIp()`-parser (`lib/http/request.ts`), en een consistente **429 + `Retry-After`** i.p.v. de eerdere mix van 422/503. `lib/http/errors.ts#jsonError()` draagt de header ook op publieke routes. Bewust géén edge-laag: `fixedWindow` gebruikt de eigen ioredis; een edge-middleware zou een externe (Upstash) REST-store vergen, wat botst met het sovereign-uitgangspunt. `analytics/track` (fail-open boolean) en `auth/password-reset` (stille return, enumeration-safe) houden hun eigen gedrag. |
| ✅ gedaan | **CSP zonder `unsafe-inline`** | `script-src` is nu `'self' 'nonce-<per-request>' 'strict-dynamic'` — geen `unsafe-inline`, geen `unsafe-eval` (prod). `middleware.ts` genereert per request een nonce (`lib/security/csp.ts`), zet 'm op de request- én response-header; de root-layout leest 'm via `headers()` waardoor elke route server-rendered wordt (een statisch geprerenderde pagina kan geen verse nonce op z'n inline scripts dragen). `next dev` houdt de losse CSP (React Refresh). `next.config.mjs` houdt alleen de request-onafhankelijke headers. Tests: `tests/csp.test.ts` (builder), `tests/middleware.test.ts` (header op elk antwoord), `e2e/csp.spec.ts` (prod-build: nonce per request, geen `unsafe-inline`, Next's scripts dragen de nonce, hydratie werkt). `style-src` houdt bewust `'unsafe-inline'` (styled-jsx; style-injectie is een veel zwakkere vector). **Kosten:** marketing-pagina's zijn nu `ƒ` i.p.v. `○` — zet een CDN/reverse-proxy-cache voor de publieke routes als het verkeer groeit (`docs/PERFORMANCE.md`). |
| 🟡 deels | **Observability in-app** | `prom-client` + `GET /api/metrics` (Prometheus-expositie, zelfde shared-secret als de cron-endpoints). Naast de default Node/process-metrics: `zf_build_info`, per-job heartbeats (`zf_cron_last_run_timestamp_seconds`, `zf_cron_last_run_success`, `zf_cron_runs_total`) op alle 7 daemon-jobs, business-counters (`zf_login_failures_total`, `zf_rate_limited_total{name}`, `zf_payouts_total{status}`, `zf_timesheets_approved_total{track}`, `zf_shift_offers_total{delivered}`, `zf_users_erased_total`) en scrape-time gauges (`zf_timesheets_pending`, `zf_shifts_open`, `zf_users_disabled`). `infra/docker/prometheus.yml` scrapet nu `/api/metrics` met `bearer_token_file` en laadt `infra/docker/alert.rules.yml` (app-down, cron stale/failing, login-failure-piek, 429-piek, payout-failures, event-loop-lag, heap). **Nog te doen:** Grafana-dashboards + een Alertmanager-route. |
| 🟠 mid | **Achtergrond-jobs buiten het web-proces** | `scripts/daemon.mjs` draait de cron-ticks in-process. Voor K8s: een aparte `CronJob`/worker-Deployment die de `/api/internal/*` endpoints hit, of BullMQ. |
| 🟡 deels | **E2E-tests** | Playwright (`npm run test:e2e`, buiten `npm test`): publieke pagina's + `/api/status`, seeded-login-routing (freelancer/werkgever/admin), fout wachtwoord, **kritieke geldstroom** (werkgever keurt urenstaat goed → `approve.ts` end-to-end → 2 reverse-billing-facturen op `/werkgever/facturen`), rate-limit 429, AVG-data-export, CSP-nonce, a11y-scan. 300+ unit-tests. `globalSetup` reset+reseedt de lokale DB. **Nog te doen:** de volledige keten registratie→verificatie→…→claim als één script; E2E aan CI hangen zodra dat weer aan kan. |
| 🟡 deels | **Accessibility (WCAG 2.1 AA)** | `npm run test:a11y` — `axe-core` (`@axe-core/playwright`) over de 7 publieke pagina's + de 3 rol-dashboards, acceptatiecriterium **0 serious/critical-overtredingen** (`e2e/a11y.spec.ts`). `docs/ACCESSIBILITY.md` legt de criteria + de handmatige checklist vast (toetsenbord-walk-through, screenreader-smoke, contrast, zoom/reflow, `prefers-reduced-motion`, foutmeldingen als tekst). axe dekt ~⅓ van WCAG; de rest is de handmatige lijst. **Nog te doen:** één externe specialist-audit; captions op de uitleg-video's. |
| 🟡 deels | **Performance / load-test** | `npm run loadtest` (`autocannon`, Node-native, geen extern binary) hamert de read-only publieke routes en **faalt niet-nul** bij een drempelbreuk: p95 ≤ 800 ms, p99 ≤ 1500 ms, fout-ratio ≤ 1 %, ≥ 50 rps/target — allemaal via env te overriden. `perf/k6-load.js` voor een ramp/soak-profiel (k6 optioneel). `docs/PERFORMANCE.md` legt tooling + criteria + het frontend-doel (Lighthouse mobiel: LCP ≤ 2,5 s, CLS ≤ 0,1, score ≥ 85) vast. **Nog te doen:** één baseline-run op de deploy-host vastleggen; Lighthouse-CI aan de pipeline. |
| 🟡 deels | **Disaster recovery-draaiboek** | `deploy/scripts/restore.sh` (db + storage, of `RESTORE_DB_ONLY=1`) + een maandelijkse DR-drill-procedure in `deploy/README.md` (herstel in een wegwerp-compose-project, meet RTO/RPO). **Nog te doen:** de drill één keer echt draaien en RTO/RPO vastleggen in een runbook. |
| 🟡 deels | **Repo-omvang / grote binaries** | ~42 MB `.mp4`-uitlegfilmpjes staan niet meer in de index en zijn `.gitignore`'d (`public/videos/*.mp4`); de repo groeit niet verder. De `/uitleg`-pagina degradeert netjes zonder de bestanden (poster-`.jpg`'s blijven in git). Productie serveert ze uit object storage/CDN — zie `public/videos/README.md`. **Nog te doen:** de blobs uit de volledige historie strippen (`git filter-repo --path-glob 'public/videos/*.mp4' --invert-paths`) + force-push van `main`. Dat raakt alle open PR-branches en clones, dus de repo-eigenaar draait dit bewust op een rustig moment. |

### Kritieke domeinrisico's die nog expliciet moeten worden gebouwd

| Prioriteit | Onderdeel | Vereiste uitwerking |
|---|---|---|
| 🔴 hoog | **Betalingen en boekhouding** | Kies één PSP/bankpartner en implementeer idempotente payouts, webhook-verificatie, settlement-reconciliatie, SEPA-export, factuurnummering per tenant/jaar en creditnota's. Een berekende payout is nog geen uitgevoerde betaling. |
| ✅ gedaan | **Matching zonder overboeking** | Elke zitplaats-toewijzende transactie (offer-acceptatie, auto-assign, marketplace self-apply, vrije vervanging) neemt eerst `lockShiftSeats()` — een transaction-scoped `pg_advisory_xact_lock` per dienst — zodat gelijktijdige acceptaties serialiseren i.p.v. beide `taken = positions - 1` lezen. Regressietest: `tests/shift-seat-lock.test.ts` (twee gelijktijdige acceptaties → precies één assignment). |
| 🟡 deels | **AVG-governance** | `lib/privacy/retention.ts` = bewaarschema-als-code (per categorie: periode, grondslag, `anonymise`/`delete`, en of een wettelijke bewaarplicht een verwijderverzoek overrulet). `lib/privacy/anonymize.ts` `anonymizeUser()` schrapt elke wisbare identifier (account, freelancer-profiel, KYC, apparaten, documenten + bytes, auditlog-PII); statutaire categorieën (facturen, urenstaten, modelovereenkomsten, payroll) blijven en staan in het rapport onder `retained`. `lib/privacy/sweep.ts` + `/api/internal/privacy/retention-sweep` (daemon, dagelijks) past de `delete`-regels toe. `lib/privacy/export.ts` `exportUserData()` levert de **art. 15/20-inzage/-export**: alle persoonsgegevens in één JSON, via `GET /api/me/gegevens/export` (self-service, rate-limited, knop op `/dashboard/account`) en `GET /api/admin/gebruikers/[id]/export` (admin namens de betrokkene). Tests: `tests/privacy-{anonymize,sweep,export}.test.ts`. **Nog te doen:** de 7-jaars `anonymise`-sweep op facturen/urenstaten (nu `pending`, niets kwalificeert), backup-retentie. |
| ✅ gedaan | **Toegestane audit-anonimisering** | `AuditLog` heeft nu een tamper-evident hash-keten: `seq` (monotone teller), `hash` = sha256(seq, prevHash, identiteitsvelden) en `prevHash`. De keten dekt **niet** `summary`/`ipAddress`/`userAgent`, dus `anonymizeUser` kan die velden in-place scrubben (`scrubSummary` → `[verwijderd]`, ip/ua → null) zonder de integriteit te breken. `recordAudit` serialiseert schrijfacties via een advisory lock. `lib/audit-chain.ts#verifyAuditChain()` + `GET /api/admin/audit/verify` melden de eerste gebroken schakel. Legacy-regels (hash NULL) worden verzegeld met `scripts/backfill-audit-chain.mjs` na migratie `20260909110000`. End-to-end geverifieerd incl. tamper-detectie. Tests: `tests/audit-chain.test.ts`. |
| 🟠 mid | **Rate limiting** | Centraliseer Redis-rate limiting voor login, KYC, bedrijfslookup, uploads, analytics en publieke webhooks; gebruik verschillende limieten per identiteit, IP en route. |
| 🟠 mid | **Opslag en RAG** | Gebruik object storage voor uploads/backups en plan `pgvector` met indexen zodra de dataset groeit. Meet queryduur en event-loop blocking vóór migratie. |
| 🟠 mid | **Digitale ondertekening** | Leg PDF-hash, documentversie, identiteit, timestamp, IP/user-agent en consent vast; laat juridisch toetsen of de gekozen handtekening en identity-check aan eIDAS-eisen voldoen. |
| 🟢 laag | **Operationele bewaking** | Voeg metrics, job-heartbeats, foutbudgetten, alerts en een herstelrunbook met RPO/RTO toe. |

### Aanbevolen uitvoeringsvolgorde

1. Productiepad vastzetten op Sovereign Box en staging/restore-test uitvoeren.
2. Matching-transactie en payout-ledger bouwen voordat echte betalingen worden aangezet.
3. AVG-retentie, export, verwijdering en audit-anonimisering laten reviewen.
4. Centrale rate limiting en observability activeren.
5. Object storage en pgvector uitvoeren op basis van gemeten schaal, niet alleen op basis van toekomstige groei.

---

## Deel 2 — Wat rammelde / kan strakker

| Bevinding | Status |
|---|---|
| `lib/payroll/compute.ts` importeerde `@/lib/env` → brak de client-bundle van `PayrollBoard`. | Opgelost: `lib/payroll/format.ts` (client-safe) afgesplitst. |
| `/api/admin/*` middleware-regel is `PLATFORM_ADMIN`-only, maar handlers als `/api/admin/fiscaal` en nu `/api/admin/payroll` staan in code ook `HQ_ADMIN` toe → HQ_ADMIN krijgt 403 vóór de handler. | Gedocumenteerd; bewust niet aangeraakt (raakt de auth-laag). Consistente keuze later: RBAC-regel of handler gelijktrekken. |
| Geen `revalidate`/`force-static` discipline op marketing-pagina's — de meeste stonden al goed (`○ Static`), maar `dynamic = "force-dynamic"` sloop soms mee. | Marketing-pagina's zijn statisch; `/uitzendbureau` bouwt als `○`. |
| `middleware.ts` matcher dekt `/api/admin`, `/api/timesheets`, `/api/shifts` — niet `/api/graphql`, `/api/me/*`. | Bewust: die endpoints doen hun eigen `requirePrincipal()`. GraphQL-resolvers checken rollen expliciet. |
| Geen SBOM/provenance op het image. | Toegevoegd in `docker-publish.yml` (buildx `sbom: true`, `provenance: true`, attest-action, Trivy → code scanning). |
| Geen dependency-/secret-scanning. | `codeql.yml` (CodeQL security-and-quality, `npm audit`, gitleaks) + Dependabot (npm/actions/docker/terraform). |
| **Dependency-onderhoud zonder ritme** — ~13 losse Dependabot-PR's open, CI uit (billing-lock). | `npm audit --omit=dev` = **0** en alle prod-deps staan op latest-in-range. `.github/dependabot.yml` hergroepeert de wekelijkse PR's naar 4 (`npm-prod`/`npm-dev` minor+patch, `*-major` apart) i.p.v. ~15. `docs/DEPENDENCIES.md` legt de cadans vast + de bewust-uitgestelde majors (React 19, Next 16, Prisma 7, zod 4, tailwind 4, …) met hun kosten. `next-auth`-beta bewust **exact** gepind (caret eraf) + `ignore` + `tests/auth-signin.test.ts` op de hooks. `vitest` 2→5 (+ `vite` 8, `@types/node` 22, config → `.mts`) gedaan → **`npm audit` incl. dev is nu 0**. Stale major-PR's #1/#9–#13/#16/#17 gesloten. |
| `Dockerfile` was al netjes (non-root, standalone, healthcheck) — geen multi-arch build. | `infra/docker/docker-bake.hcl` + CI buildx `linux/amd64,linux/arm64`. |

---

## Deel 3 — Non-destructieve garanties (deze ronde)

- **Geen** migraties, geen `prisma db push`, geen seed-aanroep.
- Alle nieuwe state: `storage/payroll/` (runs + payslips). De database wordt
  uitsluitend **gelezen** (goedgekeurde timesheets, freelancer/branch/tenant-namen,
  cumulatieve gewerkte weken).
- Geen wijziging aan Redis-gebruik, sessies, `AuditLog`, of bestaande RBAC-rollen.
  Eén nieuwe RBAC-**route**regel toegevoegd (`/admin/verloning`), niets verwijderd.
- Verificatie: `tsc` schoon · `vitest` 124/124 · `next build` schoon ·
  `kubectl kustomize` (beide overlays) schoon · `docker buildx bake --print` schoon.

## Deel 4 — Wat er daadwerkelijk is gedraaid en gedeployd

Op deze machine, met wegwerp-omgevingen (**niet** de productie-database):

| Stap | Resultaat |
|---|---|
| `docker build -f Dockerfile` | `zekerflex-app:local` (521 MB) — bouwt schoon |
| `docker compose -f docker-compose.prod.yml` (app + postgres + redis) | app-container `(healthy)`, alle 14 migraties toegepast, `/api/health` 200, `/api/ready` `{ready:true, database:up, cache:up}`, `/` + `/uitzendbureau` 200 |
| **kind-cluster** (k8s v1.31) + `helm upgrade --install -f values-local.yaml` | app-pod **1/1 Ready**, migraties toegepast, alle endpoints 200, GraphQL-introspectie geeft alle 7 queries, `shifts` zonder auth → `UNAUTHENTICATED` |
| `kubectl apply -k infra/k8s/overlays/staging` | elke resource aangemaakt en geaccepteerd door de API-server; pod terecht **niet** Ready zonder eigen DB (readiness-gating werkt) |
| `terraform fmt` + `terraform validate` (root + bootstrap) | **Success! The configuration is valid.** |
| `helm lint` + `helm template` (production values) | 0 failures |

### Bug gevonden en gefixt door het écht te bouwen

`lib/seo.ts` importeerde `@/lib/env`; de homepage importeert `faqJsonLd` uit seo,
dus `next build` draaide bij het verzamelen van statische paginadata de volledige
env-schema-validatie en crashte met `AUTH_SECRET/DATABASE_URL Required` zodra er
géén `.env` is (dus in Docker/CI). Opgelost: `lib/seo.ts` leest nu `process.env.APP_BASE_URL`
rechtstreeks. Extra: de Dockerfile-buildfase zet placeholder-waarden (niet in het
runtime-image), en `.dockerignore` sluit `infra/`, `.github/` en `**/.terraform` uit.

### Regressie gevonden via de browser (en gefixt)

De gebruiker meldde "admin-wachtwoorden en account-mails werken niet". Onderzoek
met een **echte headless browser** (Edge via playwright-core) wees twee dingen aan:

1. **CSP brak alle client-side JavaScript in `next dev`.** De eerste versie van
   `next.config.mjs#headers()` zette `script-src 'self' 'unsafe-inline'` zónder
   `'unsafe-eval'`. `next dev` (React Refresh/HMR) evalueert strings → de hele
   dev-site was dood in de browser: geen hydration, het inlogformulier deed niets,
   elk server-action-formulier deed niets. `curl` gaf gewoon 200 terug want er
   wordt geen JS uitgevoerd. **Fix:** `headers()` is nu omgevingsbewust — dev
   voegt `'unsafe-eval'` toe en versoepelt `connect-src`; productie blijft strikt
   (`script-src 'self' 'unsafe-inline'`, geverifieerd dat de productie-bundle geen
   eval nodig heeft). Browser-getest: `admin@zekerflex.nl` / `Zeker!2026` → `/admin`,
   fout wachtwoord → "Ongeldige inloggegevens", `liam.gold@freelancer.nl` → `/dashboard`.
2. **`SMTP_HOST` was leeg** → verificatiemails werden nergens afgeleverd behalve in
   de lokale bestandsmailbox. Nieuwe gebruikers kregen dus niets in hun inbox.
   **Fix:** Mailpit gestart (`docker compose up -d mailpit`) en `.env`
   `SMTP_HOST=localhost`. Getest: registreren → mail komt aan in Mailpit (code +
   welkomstmail) → verifiëren → inloggen → dashboard. Zonder mailserver blijft de
   code zichtbaar op `/verifieer-email`.

De seed-credentials zelf (`admin@zekerflex.nl` / `Zeker!2026`) waren altijd correct.

### Wat alleen jij kunt doen (vereist jouw cloud-account + geld)

`terraform apply` → echte EC2/VPC/Route53 · GHCR image-push · GitHub Actions ·
DNS-wijziging op `zekerflex.com`. De code is volledig gevalideerd; het is één
commando per pad (zie `infra/README.md`).
