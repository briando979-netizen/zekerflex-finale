# ZekerFlex Sovereign Box — productie-gereedheid & zelf-evaluatie

_Bijgewerkt: 2026-08-31 · autonome code-inspectie, non-destructief_

Dit document is de kritische zelf-analyse die de gebruiker vroeg: wat ontbreekt
er nog, wat rammelt, en welke stappen zijn in deze ronde autonoom gezet.

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

### Nog open (bewust niet in deze ronde — vereist keuzes of externe zaken)

| Prioriteit | Item | Waarom / aanpak |
|---|---|---|
| 🔴 hoog | **Payroll → boekhouding-koppeling** | De verloningsengine berekent en legt vast, maar zet nog geen SEPA-batch klaar en boekt niet in een grootboek. Volgende stap: `finaliseRun` → `lib/billing/sepa.ts` pain.001-batch + export (CSV/UBL) naar de accountant. Loonaangifte (Digipoort/loonaangifteketen) blijft mensenwerk of een externe payroll-provider (bijv. Nmbrs/Loket API). |
| 🔴 hoog | **Definitieve loonheffing** | Nu indicatief (vlak tarief). Een echte witte/groene tabel + heffingskortingen vereist óf een payroll-provider óf een onderhouden tarieftabel per jaar. Duidelijk als "indicatief" gelabeld in de UI. |
| 🟠 mid | **Rate-limiting consolideren** | Elke route rolt zijn eigen Redis-teller. Eén `lib/http/rate-limit.ts` helper + een edge-middleware-laag voor `/api/*` zou dit strak trekken. |
| 🟠 mid | **CSP zonder `unsafe-inline`** | Next App Router injecteert inline bootstrap-scripts zonder nonce. Nonce-gebaseerde CSP vergt een middleware-nonce + `next.config` aanpassing; nu bewust `unsafe-inline` voor `script-src`. |
| 🟠 mid | **Observability in-app** | `/api/status` bestaat, maar er is geen Prometheus-`/metrics`. `infra/docker/docker-compose.observability.yml` levert de stack; de app mist nog een metrics-exporter (`prom-client`). |
| 🟠 mid | **Achtergrond-jobs buiten het web-proces** | `scripts/daemon.mjs` draait de cron-ticks in-process. Voor K8s: een aparte `CronJob`/worker-Deployment die de `/api/internal/*` endpoints hit, of BullMQ. |
| 🟢 laag | **E2E-tests** | 124 unit-tests, geen browser-flow. Playwright op de kritieke paden (registratie → verificatie → dienst → timesheet → verloning). |
| 🟢 laag | **Disaster recovery-draaiboek** | Backups gaan naar S3 (nightly `pg_dump`); een getest restore-script + RTO/RPO-document ontbreekt. |

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
