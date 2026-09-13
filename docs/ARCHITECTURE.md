# Architecture

ZekerFlex is a **single Next.js 15 application** (App Router, TypeScript strict)
backed by PostgreSQL and Redis, designed to run **100 % self-hosted** on one
box ("Sovereign Box") behind a Cloudflare Tunnel. Vercel is supported as a
demo/preview target only.

- **56 Prisma models**, one PostgreSQL database.
- **~40 domain modules** under `lib/` (pure logic), thin route handlers under
  `app/api/`, server components for the UI.
- **No external SaaS is required to run** — auth (jose), search/RAG + chat
  (Ollama), analytics, e-mail (Postfix), speech (Whisper), image gen (SD) all
  have a local implementation. Optional third parties (KVK, Didit KYC, Google
  Maps, Stripe, a SEPA PSP) degrade gracefully when unconfigured.

---

## 1. System context

```mermaid
flowchart TB
    subgraph users ["Users"]
        FL["Freelancer / flexwerker<br/>mobile-first PWA"]
        EM["Werkgever / opdrachtgever<br/>/werkgever"]
        AD["Platform-admin / dispute-manager<br/>/admin"]
        SR["Sales-buitendienst<br/>/sales"]
        VIS["Anonieme bezoeker<br/>marketing + kennisbank"]
    end

    ZF[["ZekerFlex<br/>Next.js 15 app"]]

    subgraph third ["Optional third parties (graceful-degrade)"]
        KVK["KVK Handelsregister<br/>+ VIES btw"]
        DIDIT["Didit KYC<br/>document + liveness"]
        GMAPS["Google Maps<br/>reistijden"]
        STRIPE["Stripe Checkout<br/>factuurbetaling"]
        SEPA["SEPA / PSD2 PSP<br/>uitbetalingen"]
        PDOK["PDOK / OpenOV<br/>adres + OV"]
    end

    subgraph side ["Self-hosted sidecars"]
        OLLAMA["Ollama<br/>LLM + embeddings"]
        WHISPER["Whisper<br/>spraak naar tekst"]
        SD["Stable Diffusion<br/>marketing-beeld"]
        POSTFIX["Postfix<br/>uitgaande e-mail"]
    end

    FL & EM & AD & SR & VIS --> ZF
    ZF -.->|"only if configured"| KVK & DIDIT & GMAPS & STRIPE & SEPA & PDOK
    ZF --> OLLAMA & WHISPER & SD & POSTFIX
```

---

## 2. Deployment topology — the Sovereign Box

`docker-compose.prod.yml` — one host, one Docker network, no inbound ports
(Cloudflare Tunnel dials out).

```mermaid
flowchart LR
    NET(("Internet")) --- CF[Cloudflare Tunnel]
    CF --- cloudflared

    subgraph "Docker host"
        cloudflared --> app["app<br/>next start (standalone)"]
        app --> pg[("postgres 16<br/>pg-data volume")]
        app --> redis[("redis 7<br/>redis-data volume")]
        app --> ollama["ollama<br/>ollama-models"]
        app --> whisper
        app --> sd
        app --> postfix
        app --> storage[("app-storage volume<br/>uploads (or S3)")]
        internal["internal<br/>scripts/daemon.mjs"] -->|"HTTP loopback<br/>+ INTERNAL_CRON_TOKEN"| app
    end

    app -.->|"nightly pg_dump + rclone"| OFFSITE[("Off-site backup<br/>S3 / B2")]
```

**K8s alternative:** `infra/helm/zekerflex` + `infra/k8s/base` — same containers
as a Deployment + CronJobs, `hostname: zekerflex.nl`, cert-manager TLS.

---

## 3. Request lifecycle

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as middleware.ts (Edge)
    participant R as Route handler / RSC
    participant S as Domain service (lib)
    participant DB as Postgres
    participant RX as Redis

    B->>MW: request (cookie: session JWT)
    MW->>MW: generate CSP nonce
    MW->>MW: decodeSession() — jose HS256, no DB
    alt path in ROUTE_RULES
        MW->>MW: hasAnyRole() vs rule
    else /api/* not in public allowlist
        MW->>MW: default-deny unless valid session
    end
    MW->>R: forward + x-nonce, x-correlation-id, identity hint
    R->>R: requirePrincipal() → getPrincipal() re-reads memberships
    Note over R,DB: DB is authoritative — stale JWT role claims ignored
    R->>S: call domain logic
    S->>RX: advisory lock / rate-limit / cache
    S->>DB: prisma (integer-cents money, tx-scoped locks)
    S-->>R: result
    R-->>B: JSON / streamed RSC + per-request CSP
```

Key invariants:

- **Money** is always integer cents (`Int`), never float.
- **Seat allocation** (offer accept, auto-assign, marketplace apply, free
  replacement) takes `lockShiftSeats()` — a transaction-scoped
  `pg_advisory_xact_lock` — before reading `taken`.
- **Invoice numbers** are gap-free per `(type, year)` via a row-locked counter.
- **Audit log** is append-only with a tamper-evident SHA-256 hash chain
  (`lib/audit-chain.ts`).
- **CSP** `script-src` is `'self' 'nonce-…' 'strict-dynamic'` in prod — every
  route is server-rendered so the nonce is fresh.

---

## 4. Application module map

```mermaid
flowchart TB
    subgraph ident ["Identity and access"]
        AUTH["lib/auth<br/>jose session, RBAC, throttle"]
        KYCM["lib/kyc, lib/company<br/>Didit + KVK/VIES"]
    end
    subgraph core ["Marketplace core"]
        SHIFT["lib/shifts, lib/offers<br/>seat locks, dispatch waves"]
        MATCH["lib/matching<br/>score = reliability x travel x skill"]
        TS["lib/timesheets<br/>GPS check-in + geofence"]
        DISP["lib/disputes<br/>auto-raised on off-site / mock GPS"]
        REPL["lib/replacements"]
    end
    subgraph money ["Money"]
        BILL["lib/billing<br/>reverse-billing invoices"]
        PAY["lib/payouts<br/>freelancer-chosen speed/fee"]
        PAYROLL["lib/payroll<br/>ISO-week engine (read-only DB)"]
        FISCAL["lib/fiscal, lib/compliance<br/>Wet DBA signals, model agreements"]
    end
    subgraph growth ["Growth"]
        SALES["lib/sales<br/>discovery, lead scoring, outreach"]
        MKT["lib/marketing, lib/kennis, lib/newsletter<br/>lead-magnets to SalesLead"]
        SHOP["lib/shop<br/>PBM webshop + klus-koppeling"]
    end
    subgraph plat ["Platform services"]
        AI["lib/ai, lib/rag<br/>Ollama governor + vector search"]
        JARVIS["lib/jarvis, lib/orchestration<br/>agentic admin assistant"]
        VOICE["lib/voice, lib/notifications"]
        AUD["lib/audit + audit-chain"]
        PRIV["lib/privacy<br/>retention, anonymise, DSAR export"]
        ANALYTICS["lib/analytics, lib/metrics<br/>events + Prometheus"]
    end

    AUTH --> SHIFT & BILL & SALES
    SHIFT --> MATCH --> TS --> DISP
    TS --> BILL --> PAY
    TS --> PAYROLL
    SHIFT --> FISCAL
    MKT --> SALES
    AI --> JARVIS --> AUD
    PRIV --> AUD
```

Each `lib/<domain>` is **pure-ish logic + a Prisma dependency**; `app/api/<x>`
handlers are thin (parse → `requireRole` → call service → shape response).
Cross-cutting: `lib/errors.ts` (`AppError`), `lib/rate-limit.ts`
(`enforceRateLimit`), `lib/http/*`, `lib/logger.ts` (correlation-id bound).

---

## 5. Data stores

```mermaid
flowchart LR
    subgraph pg ["PostgreSQL - system of record"]
        CORE["56 models<br/>Tenant / User / Shift / Timesheet /<br/>Invoice / Payment / ..."]
        KV["KeyValueStore<br/>demo requests, job applications,<br/>reviews (was local disk)"]
        EVT["AnalyticsEvent<br/>PAGEVIEW / CLICK / INTERACTION / CUSTOM"]
        ENG["EngagementEvent<br/>freelancer lifecycle"]
        RAG["RagChunk<br/>no pgvector: Float[] embedding + cosine in SQL"]
        AUDIT["AuditLog<br/>append-only + hash chain"]
    end
    subgraph rd ["Redis"]
        LOCK["advisory-lock fallbacks,<br/>rate-limit windows,<br/>notification-wave queue,<br/>AI governor counters"]
    end
    subgraph obj ["Object storage"]
        UP["Upload store<br/>local volume OR S3<br/>(STORAGE_BACKEND)"]
    end
```

- **No data warehouse today.** Analytics reads run directly off the OLTP DB
  (`lib/analytics/report.ts`, `lib/admin/overview.ts`). See
  [DATA-ANALYST-ROADMAP.md](./DATA-ANALYST-ROADMAP.md).
- `directUrl` (`DATABASE_URL_UNPOOLED`) is used for migrations; the app uses the
  pooled URL.

---

## 6. AI & automation layer

```mermaid
flowchart TB
    DAEMON["scripts/daemon.mjs<br/>(or K8s CronJobs)"]
    DAEMON -->|"every 20s"| WD["/api/internal/ai/watchdog"]
    DAEMON -->|"every 60s"| MT["/api/internal/matching/tick"]
    DAEMON -->|"4h"| AH["/api/internal/active-hours/recompute"]
    DAEMON -->|"15m"| SM["/api/internal/sales/tick"]
    DAEMON -->|"6h"| ORT["/api/internal/orchestration/tick"]
    DAEMON -->|"12h"| RI["/api/internal/rag/reindex"]
    DAEMON -->|"24h"| RS["/api/internal/privacy/retention-sweep"]

    MT --> DISPATCH["lib/offers dispatcher<br/>next wave of offers"]
    SM --> SALESMOTOR["lib/sales<br/>careers-crawl, KVK discovery, scoring<br/>outreach drafted, never auto-sent"]
    ORT --> ORCH["lib/orchestration<br/>self-audit findings to /admin"]
    RI --> EMBED["Ollama embeddings to RagChunk"]

    subgraph gov_box ["AI governor (lib/ai/governor)"]
        GOV["concurrency cap, req/min,<br/>daily token budget, AI_ALLOW_REMOTE=false"]
    end
    DISPATCH & SALESMOTOR & ORCH -.-> GOV --> OLLAMA["Ollama /v1"]
    JARVIS["Jarvis (/admin)<br/>agentic assistant"] --> GOV
```

Every internal endpoint is `INTERNAL_CRON_TOKEN`-gated and records a
`zf_cron_last_run_*` metric + heartbeat.

---

## 7. Auth & security

- **Session**: `lib/auth/session.ts` mints a plain **jose HS256 JWT** (8 h, or
  30 d "ingelogd blijven"); NextAuth v5-beta is wired to mint/read exactly that
  token via its `jwt.encode`/`decode` hooks — so the Edge middleware verifies
  sessions without Prisma. `AUTH_SECRET_PREVIOUS` allows key rotation.
- **RBAC**: `getPrincipal()` re-reads `Membership` rows on every request → a
  revoked role takes effect immediately; JWT `roles` claims are a hint only.
- **Middleware**: default-deny for any `/api/*` not in the public allowlist;
  role rules for `/dashboard`, `/werkgever`, `/sales`, `/admin`.
- **Headers**: nonce CSP (per request, in middleware), HSTS preload,
  `frame-ancestors 'none'`, Permissions-Policy.
- **Rate limiting**: one `enforceRateLimit()` → 429 + `Retry-After`, keyed
  `rl:<name>:<ip|id>` in Redis.
- **AVG/GDPR**: `lib/privacy` — retention schedule as code, deep
  `anonymizeUser()`, daily sweep, art. 15/20 self-service export. Statutory
  retention (7-yr fiscal) overrides erasure.
- **Audit**: `recordAudit()` → append-only `AuditLog` with a SHA-256 hash chain
  over immutable identity fields (scrubbing PII doesn't break the chain);
  `verifyAuditChain()` + `/api/admin/audit/verify`.

---

## 8. Observability

| Signal | Where |
|---|---|
| Metrics | `GET /api/metrics` (Prometheus, shared-secret) — Node defaults + `zf_*` business counters + cron heartbeats |
| Alerts | `infra/docker/alert.rules.yml` (app-down, cron stale/failing, login-failure spike, 429 spike, payout failures, event-loop lag) |
| Logs | `lib/logger.ts` — structured JSON, correlation-id per request |
| Health | `/api/health` (liveness), `/api/ready` (DB + Redis), `/api/status` (public, per-component + deployment target) |
| Product analytics | `AnalyticsEvent` + `/admin/analytics` + `/admin` Control Center |
| Traces | not yet (OpenTelemetry is a roadmap item) |

---

## 9. What changes on Vercel

- No `next start` — Vercel's own adapter; `output: "standalone"` is ignored.
- The `internal` daemon container is replaced by `vercel.json` `crons`.
- Ollama / Whisper / SD / Postfix are **not available** →
  `deploymentTarget()` returns `vercel-demo` and the UI shows a banner.
- `prisma migrate deploy` runs in `build:with-migrate` against the Vercel
  `DATABASE_URL` (a Neon instance).
- Every route is a serverless function (the nonce CSP already forces dynamic).
