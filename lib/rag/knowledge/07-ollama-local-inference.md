# Lokale inferentie (Ollama) & fail-safe

## Setup

1. Installeer Ollama (Windows: https://ollama.com/download). Het draait daarna
   als achtergronddienst op `http://localhost:11434`.
2. Haal de modellen:
   ```
   ollama pull llama3.1:8b
   ollama pull nomic-embed-text
   ```
3. In `.env`:
   ```
   LLM_BASE_URL=http://localhost:11434/v1
   LLM_MODEL=llama3.1:8b
   LLM_EMBED_MODEL=nomic-embed-text
   ```

`LLM_BASE_URL` wijst standaard al naar `http://localhost:11434/v1`; ZekerFlex
verbindt automatisch, geen handmatig commando nodig.

## De adapter — `lib/ai/client.ts`

OpenAI-compatibel: `POST {base}/chat/completions` en `{base}/embeddings`. Werkt
met Ollama's `/v1`, vLLM, llama.cpp-server, LocalAI.

- `chat({ messages, temperature?, maxTokens?, json?, purpose? })` → `{ text,
  model, raw }`. `json: true` zet `response_format: { type: "json_object" }`.
- `chatJson<T>(opts)` → `extractJson<T>` (tolereert ```-fences en preambule).
- `embed(input)` → `number[][]`.
- Elke call gaat door `withGovernor(purpose, ...)`.
- `keep_alive: LLM_KEEP_ALIVE` ("30m") wordt meegestuurd zodat Ollama het model
  geladen houdt tussen requests.

## Fail-safe auto-retry

`post()` wrapt `postOnce()` in een retry-loop met exponentiële backoff:

- **Transient** = `TypeError`/`AbortError`/`TimeoutError` (netwerk/timeout) of
  een LLM-status `429`/`500`/`502`/`503`/`504`.
- Herhaalt tot `LLM_RETRY_MAX` (6) keer of `LLM_RETRY_MAX_WAIT_MS` (120000) totaal.
- Wachttijd: `LLM_RETRY_BASE_MS * 2^(n-1) + jitter`.
- Elke retry logt een warning `"llm transient failure - retrying"`; de gebruiker
  ziet niets.
- Een **harde** fout (400, of budget op) of het opraken van de retry-budget →
  `AppError.upstream` (503). Callers degraderen dan netjes (de briefing/
  orchestratie vangen dit op met hun eigen try/catch).

`llmHealth()` doet **geen** retry en gaat **niet** door de governor — het is een
snelle liveness-probe voor de watchdog en `/api/admin/health`.

## Watchdog — `lib/ai/watchdog.ts`

`checkLlm()` pingt `llmHealth`, onthoudt "up"/"down" in Redis
(`ai:watchdog:state`/`since`). Bij een **down → up**-overgang: log "hersteld" +
best-effort een gesproken melding *"Jarvis is weer online. De lokale AI was Xs
niet bereikbaar."*

De daemon roept dit elke 20s aan via `/api/internal/ai/watchdog` — dat houdt het
model ook warm.

## Env

```
LLM_TIMEOUT_MS=30000
LLM_RETRY_MAX=6
LLM_RETRY_BASE_MS=600
LLM_RETRY_MAX_WAIT_MS=120000
LLM_KEEP_ALIVE=30m
```
