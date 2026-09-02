# The Sovereign Box — architectuuroverzicht

ZekerFlex draait als een **soevereine, self-hosted eenheid** ("The Sovereign
Box"). Doel: 0,01% handwerk, geen enkele Big-Tech-afhankelijkheid in het
kritieke pad, alles binnen de eigen infrastructuur.

## Stack

| Laag | Keuze | Waarom |
| --- | --- | --- |
| App | Next.js 14 App Router + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | één runtime voor UI + API |
| Data | PostgreSQL 16 + Prisma | relationeel, migraties in git |
| Cache / queues | Redis (ioredis) | locks, wave-queues, rate-limiters, governor-tellers |
| Auth | NextAuth v5 + jose (HS256) | Edge-verifieerbare sessie zonder Node-crypto |
| AI | Ollama / vLLM / llama.cpp via een OpenAI-compatibele adapter | lokaal, gratis, geen tokenkosten |
| Vectors | `Float[]`-kolom + JS-cosine (`lib/rag/store.ts`) | geen pgvector-extensie nodig |
| Push | Web Push (VAPID, RFC 8291) zelf geïmplementeerd | geen Firebase-account |
| Voice | Browser `speechSynthesis` + optioneel Piper | geen cloud-TTS |

## Poorten

- **App**: `http://localhost:3000` — alle UI en API.
- Postgres `5432`, Redis `6379`, Ollama `11434` zijn lokale
  achtergronddiensten op dezelfde machine (geen externe services).

## Startmodi

- `npm run dev` — kale Next-devserver.
- `npm run launch` — `scripts/launch.mjs`: pre-flight checks
  (Postgres/Redis/Ollama), `prisma migrate deploy`, start devserver, open
  browser.
- `npm run daemon` — `scripts/daemon.mjs`: **always-on**. Supervisor herstart
  `next dev` bij een crash (backoff 1s→30s), en een interne scheduler draait de
  achtergrondjobs zonder externe cron: `ai-watchdog` (20s), `matching/tick`
  (60s), `active-hours/recompute` (4h), `orchestration/tick` (6h),
  `rag/reindex` (12h).

## Kernmappen

```
app/                # Next App Router: pagina's + /api routes
  admin/            # PLATFORM_ADMIN: jarvis, analytics, disputes, ...
  api/internal/     # cron-endpoints (x-internal-token)
lib/
  ai/               # LLM-adapter, budget-governor, watchdog
  jarvis/           # conversational core + persona
  rag/              # chunking, embeddings, store, indexers, query
  orchestration/    # "Jarvis loop": observe -> interpret -> findings
  admin-console/    # NL admin console + advisory-guard
  voice/            # announce, TTS, briefing
  analytics/        # cookie-free tracking + reporting
  auth/, auth.ts    # sessie (jose), rbac, nextauth
  notifications/    # matching dispatcher + web push
  config/           # .env loader + startup self-check
prisma/schema.prisma
scripts/            # launch.mjs, daemon.mjs, vapid-keys.mjs
```

## Data-onaantastbaarheid

- `prisma/seed.ts` **wist nooit** een geïnitialiseerde database. Alleen
  `npm run db:seed:reset` doet dat. De admin-login
  (`admin@zekerflex.nl` / `Zeker!2026`) blijft permanent bestaan.
- Er zijn **geen purge-crons**. Redis-TTL's zitten alleen op locks en
  rate-limit-tellers, nooit op business-data (audit, sessies, analytics).

## Wat NIET autonoom gebeurt

- LLM-gegenereerde code wordt nooit toegepast — alleen voorgesteld (diff + uitleg).
- Data-mutaties via de admin-console vereisen een expliciete bevestiging
  (impact-analyse + confirm-token).
- Migraties draaien niet automatisch bij het opstarten (alleen gerapporteerd).
