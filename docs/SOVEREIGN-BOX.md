# ZekerFlex — The Sovereign Box · architectuur-export

Complete, lokaal toepasbare kennis-export. Compatibel met Next.js 14, Prisma,
TypeScript (strict) en Ollama. 100% soeverein: geen cloud, geen tokenkosten,
geen externe diensten voor de kernfuncties.

> Deze map is óók de RAG-kennisbank: `lib/rag/knowledge/*.md` wordt door
> `indexLegal()` geïndexeerd, zodat Jarvis er live uit kan antwoorden.

---

## 1. Bestandenstructuur

```
app/
  layout.tsx                     # root + <AnalyticsBeacon/>
  admin/
    layout.tsx                   # <VoiceAgent/> + eenmalige startup-check
    jarvis/page.tsx              # dubbele UI (activity stream + assistent)
    analytics/page.tsx           # live verkeersdashboard
    disputes/page.tsx
  api/
    analytics/track/             # publiek, cookie-vrij
    admin/{ai/budget, system, analytics/{live,summary},
            jarvis/{turn,turns,turns/[id]}, rag/{search,ask},
            orchestration/*, sales/*, console/*, audit, health,
            voice/briefing }
    internal/{ matching/tick, active-hours/recompute,
               orchestration/tick, rag/reindex, ai/watchdog }
    uploads/ , uploads/[id]/
lib/
  ai/         client.ts (adapter + retry) · governor.ts · watchdog.ts
  jarvis/     core.ts (turn engine) · persona.ts (system prompt)
  rag/        chunk.ts · embed.ts · store.ts · reindex.ts · query.ts
              knowledge/*.md
  orchestration/  snapshot.ts · core.ts · dev-advisor.ts
  admin-console/  types.ts · queries.ts · mutations.ts · parser.ts
                  advisory.ts · index.ts
  voice/      announce.ts · tts.ts · briefing.ts
  analytics/  track.ts · report.ts
  notifications/  dispatcher.ts · timing.ts · push/{encrypt,vapid,web-push,fcm,index}
  config/     load-env.ts · startup.ts
  storage/    local.ts
  auth/       session.ts · rbac.ts · nextauth.ts · login-throttle.ts
  auth.ts · audit.ts · env.ts · errors.ts · internal-auth.ts · prisma.ts · redis.ts
prisma/schema.prisma · prisma/migrations/ · prisma/seed.ts
scripts/  launch.mjs · daemon.mjs · vapid-keys.mjs
```

---

## 2. Core-bestanden (exacte implementaties)

De onderstaande bestanden zijn de canonieke bron. Lees ze rechtstreeks; ze zijn
strict-typed en zelf-documenterend.

| Onderdeel | Bestand | Contract |
| --- | --- | --- |
| LLM-adapter + fail-safe retry | `lib/ai/client.ts` | `chat(opts) → { text, model, raw }`, `chatJson<T>`, `embed`, `llmHealth`. `post()` = `postOnce()` + exponentiële-backoff retry op transient fouten. `keep_alive` meegestuurd. |
| Budget-governor | `lib/ai/governor.ts` | `withGovernor(purpose, fn)` — concurrency-cap, minuutvenster (wacht op tijdslot), min-interval, dagbudget-breaker, lokaal-only. Fail-open bij Redis-storing. `budgetSnapshot()`. |
| Watchdog | `lib/ai/watchdog.ts` | `checkLlm()` — pingt `llmHealth`, tracked up/down in Redis, meldt herstel. |
| RAG-geheugenhandler | `lib/rag/store.ts` | `cosine(a,b)`, `sanitizeText`, `upsertChunk`, `replaceSource`, `search(vec, opts)` (JS-cosine top-K), `chunkStats`. |
| RAG-indexers | `lib/rag/reindex.ts` | `reindexAll()` → CODE/AUDIT/LEGAL/SALES/DATABASE/INTERACTION, elk los afgeschermd. |
| RAG-bevraging | `lib/rag/query.ts` | `retrieveContext(q)`, `askWithMemory(q)` (met `[n]`-citaten). |
| Daemon-loop | `scripts/daemon.mjs` | supervisor voor `next dev` (restart + backoff) + interne scheduler (matching 60s, watchdog 20s, active-hours 4h, orchestration 6h, reindex 12h). |
| Launcher | `scripts/launch.mjs` | pre-flight (pg/redis/ollama) → `migrate deploy` → `next dev` → browser. |
| Jarvis turn-engine | `lib/jarvis/core.ts` | `startTurn` → `runTurn` (niet geawait) routeert + emit `JarvisEvent`. |
| Jarvis system prompt | `lib/jarvis/persona.ts` | `JARVIS_PERSONA` — zie §4. |
| Non-destructieve seed | `prisma/seed.ts` | wist nooit een gevulde DB; `--reset` / `SEED_RESET=true` vereist. |

### Representatief excerpt — de retry-kern (`lib/ai/client.ts`)

```ts
function isTransient(err: unknown): boolean {
  if (err instanceof AppError) return /LLM (50[234]|429)\b/.test(err.message);
  const name = (err as Error)?.name;
  return name === "TypeError" || name === "AbortError" || name === "TimeoutError";
}

async function post(path, payload, timeoutMs) {
  const deadline = Date.now() + env.LLM_RETRY_MAX_WAIT_MS;
  let attempt = 0;
  for (;;) {
    try { return await postOnce(path, payload, timeoutMs); }
    catch (err) {
      attempt += 1;
      const canRetry = isTransient(err) && attempt <= env.LLM_RETRY_MAX && Date.now() < deadline;
      if (!canRetry) throw err;
      const jitter = Math.random() * env.LLM_RETRY_BASE_MS;
      const wait = Math.min(env.LLM_RETRY_BASE_MS * 2 ** (attempt - 1) + jitter,
                            Math.max(0, deadline - Date.now()));
      logger.warn("llm transient failure - retrying", { attempt, waitMs: Math.round(wait) });
      await sleep(wait);
    }
  }
}
```

### Representatief excerpt — vector search (`lib/rag/store.ts`)

```ts
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] as number, y = b[i] as number;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
// search(): fetch rows where embedDim === queryVector.length (cap RAG_MAX_CHUNKS),
// score with cosine(), filter >= minScore, sort desc, slice(0, limit).
```

---

## 3. Kennisbank (RAG-chunks)

Diepgaande handleidingen in `lib/rag/knowledge/`:

| # | Bestand | Onderwerp |
| --- | --- | --- |
| 00 | `00-sovereign-overview.md` | architectuur, stack, poorten, startmodi |
| 01 | `01-code-standards.md` | TS-strict, foutafhandeling, never-throw, conventies |
| 02 | `02-ai-governor.md` | throttling, dagbudget, tijdsloten, boekhouding |
| 03 | `03-local-rag-memory.md` | chunking, embeddings, JS-cosine, indexers |
| 04 | `04-daemon-supervision.md` | always-on daemon, jobs, herstart |
| 05 | `05-auth-rbac-sessions.md` | jose-sessies, middleware, rollen, brute-force |
| 06 | `06-database-prisma-migrations.md` | migratie-workflow, non-destructieve seed |
| 07 | `07-ollama-local-inference.md` | Ollama-setup, retry, watchdog, keep_alive |
| 08 | `08-workflows-matching-to-payout.md` | matching → aanbod → uren → reverse billing |
| 09 | `09-sovereign-analytics.md` | cookie-vrije tracking + dashboard |
| 10 | `10-voice-notifications-webpush.md` | Web Push (VAPID), TTS, briefing |
| 11 | `11-admin-console-advisory-guard.md` | NL-console, confirm-token, single-use |
| 12 | `12-orchestration-jarvis-loop.md` | observe→interpret→findings, turn-engine |
| 13 | `13-security-secrets-hardening.md` | env, path-jailing, sanitatie, audit |
| 14 | `14-error-handling-resilience.md` | 7 lagen veerkracht |
| — | `wet-dba.md` | Wet DBA / schijnzelfstandigheid referentie |

---

## 4. Jarvis system-prompt / persona

De exacte prompt die naar de lokale Ollama-instantie gaat staat in
`lib/jarvis/persona.ts` als `JARVIS_PERSONA` en wordt gebruikt door:

- de **router-stap** (`JARVIS_ROUTER_PREFIX` + de capability-catalogus),
- de **chat-capability** (volledige `JARVIS_PERSONA`),
- de **rapport-stap** (`JARVIS_PERSONA` + `JARVIS_REPORT_RULES`).

Kern: lokaal, Nederlands, bondig, gestructureerd Markdown (kopjes + lijsten +
inline code), en de harde grenzen — geen code uitvoeren (alleen voorstellen),
geen onbevestigde mutaties, nooit logs/sessies/wachtwoorden wissen, geen externe
afhankelijkheid.

---

## 5. Databescherming (permanent)

- `prisma/seed.ts` → non-destructief (§2). `admin@zekerflex.nl` / `Zeker!2026`
  blijft altijd bestaan.
- Geen purge-crons. Redis-TTL's alleen op locks + rate-limit-tellers.
- Migraties draaien nooit automatisch bij boot (alleen gerapporteerd).
- `docker run --restart unless-stopped` voor pg + redis; daemon voor de app.

---

## 6. Verificatie

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run build       # next build
npm run daemon      # always-on op http://localhost:3000
```
