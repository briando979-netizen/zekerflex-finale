# Foutafhandeling & veerkracht

Doel: de server crasht nooit door een trage Ollama, een hapernde Redis of een
mislukte neventaak.

## Lagen van bescherming

### 1. LLM auto-retry (`lib/ai/client.ts`)

`post()` herhaalt een transient fout (netwerk/timeout, of 429/50x) met
exponentiële backoff tot `LLM_RETRY_MAX` / `LLM_RETRY_MAX_WAIT_MS`. Alleen een
harde fout of het opraken van de budget throwt. Zie de Ollama-handleiding.

### 2. Governor fail-open (`lib/ai/governor.ts`)

Als Redis onbereikbaar is bij de throttle-checks: log een warning en **ga door**
(lokaal is toch gratis). Alleen de expliciete "limiet bereikt"-gevallen throwen.

### 3. Best-effort neventaken

`recordAudit`, `announce`, `recordEngagement`, `sendShiftOffer`, `sendFcm`,
`recordUsage` — vangen alles zelf op, loggen een warning, retourneren `null`/void.
Ze breken nooit de bovenliggende businesstransactie.

### 4. Route-handlers

Elke route: één `try/catch` rond de hele handler → `toErrorBody(err)` →
`NextResponse.json(body, { status })`. Nooit een stacktrace naar de client.
`ZodError` → 422. Onbekend → 500 met een generieke boodschap.

### 5. Agents degraderen

- `askWithMemory` → "geheugen niet geconfigureerd" i.p.v. een throw als
  `LLM_EMBED_MODEL` ontbreekt.
- `runOrchestrationCycle` → `Run.status = FAILED` + audit `orchestration.cycle.failed`,
  geeft `{ status: "FAILED", summary }` terug (geen throw voor niet-AppError).
- `speakBriefing` → gebruikt de kale compose-tekst als het herschrijven faalt.
- `runAdminConsole` → `{ kind: "clarification" }` als de parser faalt.
- `getTurn` → een turn die >5 min `RUNNING` staat wordt `FAILED` gemarkeerd
  (proces-herstart-recovery).

### 6. Daemon-supervisor (`scripts/daemon.mjs`)

`next dev` herstart bij een crash met backoff. Achtergrondjobs die tijdens een
herstart een `ECONNREFUSED` krijgen worden stil overgeslagen. `uncaughtException`
en `unhandledRejection` in de daemon zelf worden gelogd, niet fataal.

### 7. Watchdog (`lib/ai/watchdog.ts`)

Detecteert down→up van de lokale AI en meldt het herstel. De daemon draait dit
elke 20s.

## Wat NIET afgevangen wordt (bewust)

Een ongeldig verzoek (400/422), een RBAC-weigering (401/403) en een echte
programmeerfout (500) horen zichtbaar te zijn. `AUTH_SECRET` te kort → boot
faalt hard (fail-fast is hier beter dan fail-open).
