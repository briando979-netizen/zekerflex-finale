# ZekerFlex Platform

Next-gen freelance & workforce management platform. Next.js 14 (App Router)
application with a Node.js serverless backend, PostgreSQL/Prisma and Redis.

## Folder structure

```
.
├── middleware.ts                 # Edge RBAC gate (jose session verification)
├── app/                          # Next.js App Router (UI + API routes)
│   ├── login/                    # Credentials sign-in (NextAuth v5)
│   ├── api/
│   │   ├── auth/[...nextauth]/   # NextAuth route handlers
│   │   ├── timesheets/approve/   # Reverse-billing + instant SEPA payout
│   │   ├── shifts/[shiftId]/
│   │   │   ├── match/            # Trigger / advance matching
│   │   │   └── offer/            # Freelancer accepts / declines an offer
│   │   ├── internal/matching/tick/  # Cron entrypoint for the follow-up worker
│   │   └── admin/                # PLATFORM_ADMIN-only, read-only
│   │       ├── audit/            #   audit-trail query
│   │       └── health/           #   sovereignty dashboard (db/redis/llm/push)
│   └── admin/
│       └── disputes/             # Dispute resolution console
├── components/disputes/          # Reusable React components
├── lib/
│   ├── auth/                     # session (jose) · rbac · nextauth · login-throttle
│   ├── auth.ts                   # Node-side session validator + RBAC helpers
│   ├── audit.ts                  # Append-only audit trail writer (never throws)
│   ├── matching-engine.ts        # Weighted geo/reliability/skill match + auto-accept
│   ├── matching/score.ts         # Pure scoring math (unit-tested)
│   ├── dba-compliance.ts         # Wet DBA monitor
│   ├── notifications/
│   │   ├── dispatcher.ts         # Redis-queued staged notification waves
│   │   ├── worker.ts             # setInterval follow-up worker
│   │   ├── timing.ts             # Quiet-hours contact window (pure)
│   │   └── push/                 # Web Push (VAPID, self-hosted) + FCM fallback
│   │       ├── encrypt.ts        #   RFC 8291 aes128gcm (zero deps, Node crypto)
│   │       ├── vapid.ts          #   RFC 8292 ES256 auth (jose)
│   │       ├── web-push.ts       #   sender
│   │       ├── fcm.ts            #   optional Firebase provider
│   │       └── index.ts          #   sendShiftOffer fan-out
│   ├── ai/                       # Self-hosted LLM adapter (OpenAI-compatible)
│   ├── geo/                      # Geofencing + travel-time estimation
│   ├── billing/                  # Self-billing + instant SEPA + numbering
│   └── integrations/             # Google Maps, KvK, VIES
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                   # Full enterprise-hierarchy seed
├── scripts/vapid-keys.mjs        # Generate a Web Push VAPID keypair
└── types/                        # Shared TypeScript contracts
```

## Getting started

```bash
cp .env.example .env          # set AUTH_SECRET (>=32 chars), DATABASE_URL, REDIS_URL
npm install

# infra (example)
docker run -d --name zekerflex-postgres -e POSTGRES_USER=zekerflex \
  -e POSTGRES_PASSWORD=zekerflex -e POSTGRES_DB=zekerflex -p 5432:5432 postgres:16-alpine
docker run -d --name redis-server -p 6379:6379 redis

npm run prisma:migrate        # apply migrations
npm run db:seed               # seed demo data (prints a login table)
npm run dev
```

### Seeded logins (password `Zeker!2026`)

| Role | E-mail |
| ---- | ------ |
| PLATFORM_ADMIN | admin@zekerflex.nl |
| HQ_ADMIN | hq@supermarktketen.nl |
| DISPUTE_MANAGER | disputes@supermarktketen.nl |
| LOCAL_MANAGER (Amsterdam) | manager.amsterdam@supermarktketen.nl |
| LOCAL_MANAGER (Utrecht) | manager.utrecht@supermarktketen.nl |
| FREELANCER (BRONZE…PLATINUM) | sam.bronze@ / noa.silver@ / liam.gold@ / eva.platinum@ / kai.pending@freelancer.nl |

## Auth & RBAC

* Session cookie is an HS256 JWT (jose), minted by NextAuth v5 via its
  `jwt.encode/decode` hooks so the **Edge middleware** can verify it without
  Prisma or Node crypto.
* `middleware.ts` gates routes from `lib/auth/rbac.ts`:
  * `/admin/disputes/*` → `DISPUTE_MANAGER`, `HQ_ADMIN`, `PLATFORM_ADMIN`
  * `/admin/*` → `HQ_ADMIN`, `PLATFORM_ADMIN`
  * `/api/timesheets/approve`, `/api/shifts/*/match` → `LOCAL_MANAGER`, `HQ_ADMIN`, `PLATFORM_ADMIN`
  * Denied page requests redirect to `/login`; denied API requests get JSON 401/403.
* `lib/auth.ts#getPrincipal()` re-hydrates `(role, organization, locations)`
  grants from the database on every request, so a role change is effective
  immediately.
* **Brute-force protection:** the credentials provider counts failed attempts
  per e-mail in Redis (`lib/auth/login-throttle.ts`); 5 failures inside 15 min
  set a 15-min lockout that holds even against the correct password. Every
  failure, lockout and success is written to the audit trail.
* **Providers:** Credentials (email + bcrypt) and Google OAuth. Google is only
  registered when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set, and the
  `signIn` callback only admits a Google login whose verified e-mail already
  matches an enabled `User` (no auto-provisioning); the token is then bound to
  that DB user id, not the Google sub. Add
  `{AUTH_URL}/api/auth/callback/google` to the Google console's redirect URIs.

## Matching → notification pipeline

1. `runMatchingForShift(shiftId)` scores the candidate pool, persists `ShiftMatch`
   rows, auto-assigns anyone clearing the branch's auto-accept gate.
2. Remaining seats hand off to `lib/notifications/dispatcher.ts`, which stores a
   score-ranked queue in Redis and pushes **wave 1** immediately. During a
   freelancer's local quiet-hours (`lib/notifications/timing.ts`) the offer is
   still made live in-app, but the push ping is held.
3. When a wave's TTL elapses, `processMatchingFollowups()` (called by the
   `worker.ts` interval **or** the `/api/internal/matching/tick` cron) expires
   unanswered offers and promotes the next wave until the shift is filled or the
   queue is exhausted.
4. `POST /api/shifts/:id/offer` records a freelancer's accept/decline; an accept
   creates a seat-checked assignment + draft timesheet and withdraws sibling offers.

## Launch & Always-On Daemon

```bash
npm run launch          # one-shot: pre-flight, migrate, start dev, open browser
npm run daemon          # supervised, always-on (recommended for a running box)
```

`scripts/launch.mjs` loads `.env`, pre-flights Postgres / Redis / local Ollama,
applies pending migrations, starts `next dev` on port 3000 and opens the browser.

`scripts/daemon.mjs` is the permanent mode: it **supervises `next dev`** on one
port (restarts on crash, exponential backoff), runs every background job on an
internal schedule (no external cron) — `matching/tick` (60s), `active-hours`
(4h), `orchestration` (6h), `rag/reindex` (12h) — and **pings the local model
every 20s** (keeps it warm + `/api/internal/ai/watchdog` announces "Jarvis is
weer online" on recovery). Ctrl-C stops it cleanly.

### Data protection

`npm run db:seed` **never wipes an initialised database** — it prints
"overgeslagen" and exits. Only `npm run db:seed:reset` (`-- --reset`) rebuilds
from scratch. There are no cron jobs that purge audit logs, sessions or
analytics; Redis TTLs only cover locks / rate-limit counters, never data.

### Architecture export & knowledge base

`docs/SOVEREIGN-BOX.md` is the full architecture export (file structure, core
contracts, code excerpts, the Jarvis system prompt). `lib/rag/knowledge/*.md`
holds 15 deep technical guides (sovereign overview, code standards, AI governor,
RAG memory, daemon, auth/RBAC, migrations, Ollama, workflows, analytics, voice,
admin console, orchestration, security, error handling, Wet DBA) — these are
indexed into RAG so Jarvis answers from them.

### Fail-safe local inference

`lib/ai/client.ts` retries a transient LLM failure (Ollama loading a model,
restarting, briefly unreachable) with exponential backoff up to `LLM_RETRY_MAX`
attempts / `LLM_RETRY_MAX_WAIT_MS` total, and sends `keep_alive` so the model
stays resident. A brief hiccup never surfaces; a hard failure still degrades
gracefully.

## Sovereign analytics (local, cookie-free)

A full local alternative to Google Analytics — nothing leaves the box.

* **`components/analytics/AnalyticsBeacon.tsx`** (mounted in the root layout) —
  the session id is a random string in `sessionStorage` (**not a cookie**);
  sends pageviews on navigation and clicks on `data-track` / button / link
  elements, batched, `sendBeacon` on unload.
* **`POST /api/analytics/track`** — public, per-session rate-limited, stores the
  user-agent only as a 16-char hash.
* **`/admin/analytics`** (`PLATFORM_ADMIN`) — live `activeVisitors` (distinct
  sessions in 5 min), pageviews, active pages, recent clicks, a 7-day bar chart
  and top paths / referrers. Polls `GET /api/admin/analytics/live` every 4s.
* Jarvis briefings include "`X` bezoekers vandaag, `Y` nu actief".

## Admin control center

**`/admin`** (`HQ_ADMIN` / `PLATFORM_ADMIN`) — `components/admin/ControlCenter.tsx`
polls one aggregated endpoint (`GET /api/admin/overview`,
`lib/admin/overview.ts#buildAdminOverview`, every 5s) and shows the whole box on
one screen: system health (db / Redis / local LLM + model / Web Push), AI token
budget bar + concurrency, work queues (disputes, timesheets, failed payments,
open findings), live traffic, the four sub-agents with their last task, recent
orchestration findings, and quick links. Every field is best-effort — a slow
dependency degrades to a number, never an error.

## Jarvis console + AI budget governor

**`/admin/jarvis`** (`PLATFORM_ADMIN`) — a Claude-Code-CLI-style **two-pane** console — a live "Activity stream" (left, terminal-styled: routing, tool calls, RAG search, diff proposals) and a structured Markdown "Assistent" report (right) — plus a bottom
chatbar with **+** (local file upload), a **mic** that transcribes, auto-submits and **speaks the answer back** (nl-NL; "voorlezen" + "continu gesprek" toggles) (`nl-NL` `SpeechRecognition`), a
**status-lock** while a turn runs, live **collapsible progress blocks**
("Verzoek analyseren", "RAG: geheugen doorzoeken", "Orchestratiecyclus"…), and a
**multi-agent strip** showing which sub-agent (`analyst` / `developer:tom` /
`sales` / `jarvis`) is active.

* **`lib/jarvis/core.ts`** — `startTurn` creates a `JarvisTurn`, kicks off
  `runTurn` (not awaited), returns the id. `runTurn` routes the message with the
  local model → `memory` (RAG) / `console` (admin console) / `orchestration` /
  `briefing` / `chat`, emitting `JarvisEvent` rows. The UI polls
  `GET /api/admin/jarvis/turns/:id?since=<seq>`.
* **`lib/ai/governor.ts`** — every model call goes through `withGovernor`:
  concurrency cap, a per-minute request window (**waits for the next slot**
  rather than failing), minimum request spacing, a **daily token budget** as a
  runaway-loop breaker, and **local-only** inference unless `AI_ALLOW_REMOTE=true`.
  Total wait is capped (`AI_MAX_WAIT_MS`). Every call is billed to `AiUsageLog`;
  `GET /api/admin/ai/budget` shows the live picture.
* **`lib/voice/briefing.ts`** — `speakBriefing()` pulls **live** numbers (KPIs,
  revenue from invoices, payouts, sales backlog, open findings, agent activity,
  today's AI spend), composes Dutch, rephrases via the local model and queues it
  for the voice agent. `POST /api/admin/voice/briefing`; also on boot when
  `JARVIS_BOOT_BRIEFING=true`.

## Sovereign startup & storage

* **`lib/config/load-env.ts`** — a dependency-free `.env` / `.env.local` parser
  loaded before `lib/env.ts` validates, so scripts, the seed and tests are
  self-sufficient (never overrides what the runtime already set).
* **`lib/config/startup.ts`** — `instrumentation.ts` runs `runStartupChecks()`
  once on boot: env, DB reachability + **pending-migration report** (it reports,
  it does **not** auto-apply — schema changes are a deliberate deploy step),
  Redis, local LLM health, RAG table + chunk count, uploads dir writability.
  `GET /api/admin/system` on demand.
* **`lib/storage/local.ts`** — chatbar uploads are written to `UPLOADS_DIR` on
  the box's own disk (path-jailed, size-capped, sha256'd), `Upload` row holds
  the metadata. `POST /api/uploads`, `GET /api/uploads/:id`.

## Local total memory (RAG)

`lib/rag/` indexes **everything the box knows** into a plain-Postgres vector
store — `Float[]` embeddings from the self-hosted embedding model
(`LLM_EMBED_MODEL`), cosine similarity in JS. **No pgvector, no external vector
service** (pgvector + an IVFFlat index is the drop-in scale path).

* **`reindex.ts`** indexers: `CODE` (the codebase), `AUDIT` (the audit log),
  `LEGAL` (`lib/rag/knowledge/wet-dba.md` — a maintained Wet DBA reference),
  `SALES` (leads + outreach), `DATABASE` (live branches / shifts / freelancers /
  DBA history), `INTERACTION` (the orchestrator's own findings).
* **`store.ts`** — `upsertChunk` (hash-deduped), `replaceSource`, `search`
  (dimension-filtered candidate fetch → JS cosine → top-K).
* **`query.ts`** — `retrieveContext(q)` and `askWithMemory(q)` (retrieve →
  answer with `[n]` citations, "not in memory" when it isn't).

The orchestration cycle pulls historical context from memory before it
interprets. Endpoints: `GET /api/admin/rag/search`, `POST /api/admin/rag/ask`
(`PLATFORM_ADMIN`); cron `POST /api/internal/rag/reindex` (every 12h).

## Voice / TTS

`lib/voice/` gives the box a spoken voice — **100% local, no cloud TTS**.

* **`announce.ts`** — events push a `VoiceAnnouncement` (optionally rephrased by
  the local LLM into natural spoken Dutch). Wired into: orchestration cycle
  complete, new sales lead, admin-console mutation executed. `POST
  /api/voice/announce` (internal token or `PLATFORM_ADMIN`) is the hook for
  "build is groen" from CI / a post-build script.
* **`tts.ts`** — optional server-side [Piper](https://github.com/rhasspy/piper)
  (`PIPER_BIN` + `PIPER_MODEL`) → WAV. Falls back to the browser's built-in
  speech synthesis (also fully local).
* **`components/voice/VoiceAgent.tsx`** — mounted in `app/admin/layout.tsx`,
  connects to `GET /api/voice/stream` (SSE) and speaks each announcement in
  `nl-NL`; a mute toggle persists in `localStorage`.

## Autonomous Orchestration Core (the "Jarvis loop")

`lib/orchestration/` runs a periodic **observe → interpret → record** cycle on the
self-hosted LLM. It **never applies code and never runs an un-confirmed mutation.**

1. **`snapshot.ts`** gathers a compact operational picture — health of Postgres /
   Redis / the LLM, queue depths (open disputes, timesheets awaiting approval,
   failed payments, stale shifts), 24h warning/critical audit counts, DBA
   HIGH/CRITICAL counts, sales backlog.
2. **`core.ts`** feeds that to the LLM, which returns a summary + typed findings.
   Each finding's suggested action is bounded:
   * `CONSOLE_QUERY` → a read-only admin-console query name; auto-run, result attached.
   * `CONSOLE_MUTATION` → a mutation name + params + **dry-run impact** only; a human
     confirms it through the admin console.
   * `CODE_PATCH` → `dev-advisor.ts` reads the named repo files (path-jailed, ext
     allow-list) and asks the LLM for a **proposed unified diff + rationale**. It is
     stored as text with a "not applied" disclaimer — a human applies it via git.
   * `MANUAL` / `NONE` → informational.
3. Findings land in `OrchestrationFinding` (status `OPEN` → `ACKNOWLEDGED` /
   `ACTIONED` / `DISMISSED`); every cycle is audited.

Endpoints (all `PLATFORM_ADMIN`): `POST /api/admin/orchestration/run`,
`GET …/runs`, `GET …/findings`, `PATCH …/findings/:id`,
`POST …/orchestration/patch` (code advisor on demand). Cron:
`GET /api/internal/orchestration/tick` (every 6h).

## Sales-AI

`lib/sales/` — a lead pipeline with LLM-drafted outreach **that a human sends**.

* `leads.ts` — `createLead`, `enrichLead` (KVKBase Handelsregister lookup),
  `scoreLead` (LLM fit score 0-100, heuristic fallback).
* `outreach.ts` — `draftOutreach` (LLM writes a Dutch cold email → `DRAFT`),
  `editOutreach`, `approveOutreach` (`DRAFT` → `APPROVED`), `markOutreachSent`
  (`APPROVED` → `SENT`; the platform records it, it does not send mail).

Endpoints (`PLATFORM_ADMIN`): `GET|POST /api/admin/sales/leads`,
`GET|PATCH /api/admin/sales/leads/:id` (`action: enrich | score | draft`),
`PATCH /api/admin/sales/outreach/:id` (`action: edit | approve | sent`).

## Behavioural Timing Notifier v2

`lib/engagement/events.ts` timestamps every meaningful in-app action
(`EngagementEvent`). `computeActiveHours` turns the last ~200 events into the
local hours the freelancer is genuinely active; a cron
(`/api/internal/active-hours/recompute`, every 4h) caches them on
`FreelancerProfile.learnedActiveHours`. The dispatcher's `mayPingNow` prefers
the learned hours over the manually configured quiet-hours window. The app posts
`POST /api/engagement { kind }` on open.

## Natural-language admin console

`POST /api/admin/console` (PLATFORM_ADMIN) — ask the platform a question in Dutch.
`lib/admin-console/` turns it into **exactly one** entry from a fixed registry:

* **`queries.ts`** — read-only handlers (`platform_kpis`, `count_freelancers_by_status`,
  `search_freelancers`, `compliance_overview`, `active_shifts`). Each is a fixed
  parameterised Prisma query — the LLM only ever picks a *name + params*, never
  writes a query.
* **`mutations.ts`** — data-changing handlers (`deactivate_inactive_freelancers`,
  `cancel_past_due_open_shifts`, `block_freelancer_matching`). Each has a
  `dryRun` (blast radius, **no writes**) and an `execute`.
* **`parser.ts`** — `chatJson` call against the self-hosted LLM; validates the
  choice against the registry (a hallucinated name → `unknown`).
* **`advisory.ts`** — mints a 5-min HS256 confirm token carrying the action +
  validated params + operator id.

A **query** returns `{ kind: "answer", result, summary }` (the summary is a
best-effort LLM paraphrase). A **mutation intent** returns
`{ kind: "advisory", impact, warnings, confirmToken }` and changes **nothing** —
the operator must `POST /api/admin/console/confirm` with the token, which
re-checks the impact, executes, and audits at severity `critical`. If the LLM is
unreachable the console degrades to a clarification message, never a guess.

## Sovereign / self-hosted infrastructure

The platform is built to run inside its own box with no Big-Tech SaaS in the
critical path. `GET /api/admin/health` (PLATFORM_ADMIN) reports the live state
of every in-box dependency and returns `sovereign: true` only when Postgres,
Redis, the LLM **and** self-hosted Web Push are all up.

### Push notifications — Web Push (VAPID), self-hosted

`lib/notifications/push/` implements the W3C Web Push protocol directly:

* **`encrypt.ts`** — RFC 8291 `aes128gcm` payload encryption using only Node's
  `crypto` (ephemeral ECDH P-256 + HKDF + AES-128-GCM). Zero dependencies.
* **`vapid.ts`** — RFC 8292 `Authorization: vapid t=…,k=…` ES256 JWT (via `jose`).
* **`web-push.ts`** — a plain `POST` to the subscription endpoint; 404/410 flags
  the subscription for cleanup.
* **`index.ts`** — `sendShiftOffer` fans out over every Web Push subscription and
  (optionally) every FCM token a freelancer has, disabling dead ones.

Firebase FCM (`fcm.ts`) is now an **optional** secondary provider — the platform
works fully with `FIREBASE_*` unset.

```bash
npm run vapid:keys          # → WEBPUSH_VAPID_PUBLIC_KEY / _PRIVATE_KEY for .env
```

The browser client subscribes with `applicationServerKey = <public key>` and
`POST`s `{ endpoint, keys: { p256dh, auth } }` to be stored as a
`WebPushSubscription`.

### Reasoning — self-hosted LLM

`lib/ai/client.ts` talks to any **OpenAI-compatible** endpoint running in the box
(Ollama, vLLM, llama.cpp server, LocalAI) — no Anthropic/OpenAI SaaS. Config:
`LLM_BASE_URL` (default `http://localhost:11434/v1`), `LLM_MODEL`, optional
`LLM_API_KEY` / `LLM_EMBED_MODEL`. Exposes `chat()`, `chatJson<T>()` (tolerant
JSON extraction), `embed()`, `llmHealth()`. Every failure (down, timeout, bad
JSON) surfaces as a clean `503` `AppError`, so a missing model degrades a
feature rather than crashing it. This is the single seam every autonomous agent
plugs into.

## Onboarding integrations

### KVKBase (company registration & validation)

Live API `https://api.kvkbase.nl/v1`, `Authorization: Bearer <KVKBASE_API_KEY>`.

| Our endpoint | KVKBase call | Purpose |
| --- | --- | --- |
| `GET /api/company/lookup?kvk=12345678[&enrich=true]` | `GET /v1/lookup/{kvk}` | Handelsregister profile (enrich adds VAT + SBI activities) |
| `GET /api/company/lookup?q=acme` | `GET /v1/search` | De-duped search hits |
| `POST /api/company/register` | enriched lookup + `/v1/validate/vat` | Snapshot + validate, flip `kvkValid` / `vatValid` |

`lib/integrations/kvkbase.ts` is the only file that knows KVKBase's wire format —
`normalizeCompany()` / `normalizeHit()` map it to the neutral `CompanyProfile`
(`types/company.ts`), handling `isActive: null` (→ ACTIVE only on an enriched
basisprofiel), insolvency, `"Onbekend"` legal forms and `country: "Nederland"`.
`registerFreelancerCompany` / `registerTenantCompany` store a `CompanyRegistration`
snapshot (1:1 with the freelancer profile or tenant) and only then set the
matching-engine's `kvkValid` gate. Verified end-to-end against the live API.

### Didit (KYC / identity verification)

| Endpoint | Purpose |
| --- | --- |
| `POST /api/kyc/start` | Create/resume a Didit session, returns the hosted URL |
| `GET /api/kyc/status[?refresh=1]` | Current KYC state (optionally polls Didit) |
| `POST /api/webhooks/didit` | Signed webhook → updates `IdentityVerification` + `User.kycStatus` |

`lib/integrations/didit.ts` wraps the v3 API (`POST /v3/session/`,
`GET /v3/session/{id}/decision/`, `X-API-Key` header) and verifies inbound
webhooks against all three published signature schemes (V2 sorted-keys, Simple
field-canonical, Original raw-body) with a ±5 min timestamp window. Decisions
flow through `lib/kyc/verification.ts`, which maps Didit statuses to `KycStatus`
and never silently downgrades a VERIFIED user. `kycStatus = VERIFIED` is one of
the gates the matching engine enforces.

Configure `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`,
`DIDIT_CALLBACK_URL` (from business.didit.me) — the routes return a clean 503
until they are set.

## Core modules

| Module | Path | Responsibility |
| ------ | ---- | -------------- |
| Matching Engine | `lib/matching-engine.ts` | Weighted geo/reliability/skill/badge match + auto-accept |
| Notification Dispatcher | `lib/notifications/dispatcher.ts` | Redis-queued staged push waves + follow-up worker + quiet-hours ping suppression |
| Push delivery | `lib/notifications/push/` | Self-hosted Web Push (RFC 8291/8292, zero deps) with optional FCM fallback |
| LLM adapter | `lib/ai/client.ts` | Single seam to a self-hosted OpenAI-compatible model (Ollama/vLLM/llama.cpp) |
| Timesheet Approval | `app/api/timesheets/approve/route.ts` | Approve hours, emit 2 reverse-billing invoices, trigger instant SEPA |
| GPS check-in ingestion | `app/api/timesheets/[timesheetId]/gps/route.ts` | Freelancer CHECK_IN / HEARTBEAT / CHECK_OUT, geofenced against the branch at record time (`lib/geo/geofencing.ts`), sets `actualStart` / `actualEnd` + billable minutes. An off-site or mock-location CHECK_IN/CHECK_OUT auto-opens a system-raised `Dispute` (`origin` GEOFENCE_VIOLATION / MOCK_LOCATION) that shows in the console immediately |
| Dispute Console | `app/admin/disputes/page.tsx` | Review hour deltas vs GPS check-ins, overrule / approve |
| DBA Compliance | `lib/dba-compliance.ts` | Detect false-employment risk, warn / throttle / block |
| Model agreements | `lib/agreements/model-agreement.ts` | On accept / auto-assign, `ensureModelAgreement` provisions an unsigned Wet DBA modelovereenkomst for the freelancer↔client pair (reused across engagements); `POST /api/model-agreements/:id/sign` collects the two signatures → ACTIVE |
| Audit trail | `lib/audit.ts` | `recordAudit()` (never throws) appends an `AuditLog` row for money-/security-sensitive actions: login success/failure/lockout, timesheet approval, dispute resolution + auto-raise, KYC decision, model-agreement signature. Read-only surface `GET /api/admin/audit` (PLATFORM_ADMIN, cursor-paginated, filterable by category/action/actor/target/severity/since) |
| Notification timing | `lib/notifications/timing.ts` | A freelancer's local quiet-hours window (`FreelancerProfile.timezone` + `quietHoursStart/End`, midnight-wrapping); the dispatcher still makes the offer live in-app during quiet hours but holds the push ping |

## Verification

```bash
npm run typecheck   # tsc --noEmit — clean
npm run test        # vitest — 124 passing
npm run build       # next build — clean (middleware compiles to Edge)
```

## Production Deployment

The platform is configured for [**Vercel**](https://vercel.com/docs/git) deployment. Every push to the `main` branch automatically triggers a production deploy.

### Setup

1. Connect your GitHub repository to Vercel: https://vercel.com/new
2. Select this repository (`briando979-netizen/zekerflex-finale`)
3. Configure environment variables in Vercel project settings:
   - `AUTH_SECRET` (≥32 random chars)
   - `DATABASE_URL` (PostgreSQL connection string)
   - `REDIS_URL` (Redis connection string)
   - `LLM_BASE_URL` (self-hosted model endpoint)
   - All other vars from `.env.example`

4. On the "Deployments" tab, Vercel will auto-deploy every push to `main`

### Deployment Flow

```
git push origin main
  → GitHub webhook → Vercel detects push
    → Runs `npm run build`
      → Compiles Next.js + Edge middleware
        → Type-checks, runs tests, builds to `.next/`
          → Deploys to Vercel's CDN (Edge Functions for middleware)
```

### Monitoring

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Analytics**: Real-time request volume, latency, error rates
- **Logs**: `Deployments` → select deployment → `Functions` tab
- **Health check**: `GET /api/health` returns system status (platform admin-only)

### Rollback

In Vercel's "Deployments" tab, click "Promote to Production" on any previous build to instantly roll back.
