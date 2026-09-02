# AI budget-governor

`lib/ai/governor.ts` zit vóór **elke** aanroep van het lokale model. Lokale
inferentie is gratis; de governor bestaat om een vastgelopen loop nooit tokens,
geld of een provider-limiet te laten verspillen, en om lokaal te blijven.

## `withGovernor(purpose, fn)`

`fn` retourneert `{ value, usage: { promptTokens, completionTokens, totalTokens,
model } }`. De governor:

1. **Soevereiniteitsgrendel** — als `AI_ALLOW_REMOTE=false` (default) en de host
   van `LLM_BASE_URL` niet lokaal/privé is → `AppError.upstream` (geweigerd).
2. **Dagbudget-breaker** — Redis-teller `ai:gov:tokens:<YYYY-MM-DD>`. Bij
   `>= AI_DAILY_TOKEN_BUDGET`: hard weigeren (`AI_BUDGET_HARD=true`) of alleen
   waarschuwen.
3. **Minimum tussenpauze** (`AI_MIN_INTERVAL_MS`) — spacing tussen requests.
4. **Per-minuut venster** (`AI_REQUESTS_PER_MIN`) — teller
   `ai:gov:rate:<minuut>`. Bij vol: teller teruggeven en **wachten tot het
   volgende minuutvenster** (het "tijdslot"), niet falen.
5. **Concurrency-cap** (`AI_MAX_CONCURRENCY`) — `INCR ai:gov:concurrency`, bij
   overschrijding kort wachten en opnieuw.
6. Alle wachttijd samen is afgetopt op `AI_MAX_WAIT_MS`; daarna een nette fout.

Redis-storing = **fail-open** op throttling (lokaal draaien is toch gratis); de
budget-check en usage-log worden dan overgeslagen met een warning.

## Boekhouding

Na afloop (ook bij een exception): één `AiUsageLog`-rij met `purpose`, `model`,
`endpointHost`, token-tellingen, `durationMs`, `throttledMs`, `ok`. En de
dag-tokenteller wordt opgehoogd.

`GET /api/admin/ai/budget` toont: `budgetSnapshot()` (tokens vandaag,
concurrency, requests deze minuut, `localInference`), spend per `purpose`
vandaag, en de laatste 15 calls.

## Env

```
AI_MAX_CONCURRENCY=2
AI_REQUESTS_PER_MIN=30
AI_MIN_INTERVAL_MS=0
AI_DAILY_TOKEN_BUDGET=3000000
AI_MAX_WAIT_MS=45000
AI_BUDGET_HARD=true
AI_ALLOW_REMOTE=false
```

## Aansluiten

`lib/ai/client.ts#chat` en `#embed` zijn de enige plekken die `withGovernor`
aanroepen. Elke agent (orchestrator, RAG, sales, jarvis, voice) gaat via `chat`
en geeft een `purpose` mee zodat de kosten per functie zichtbaar zijn:
`"orchestration"`, `"rag"`, `"jarvis-router"`, `"jarvis-chat"`, `"jarvis-report"`,
`"voice-briefing"`, `"embed"`, ...
