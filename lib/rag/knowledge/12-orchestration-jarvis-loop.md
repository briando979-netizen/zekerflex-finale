# Autonome Orchestration Core ("de Jarvis-loop")

`lib/orchestration/` draait een **observe → interpret → record**-cyclus op het
lokale model. Hij **past nooit code toe** en voert **nooit een onbevestigde
mutatie** uit.

## 1. Observe — `snapshot.ts#gatherSnapshot()`

Compacte JSON: health (db/redis/llm/webPush), wachtrijdieptes (open geschillen,
in te keuren urenbriefjes, mislukte betalingen, verlopen shifts, geblokkeerde
freelancers), 24u audit-warnings/criticals + samples, DBA HIGH/CRITICAL,
sales-backlog.

## 2. Interpret — `core.ts#runOrchestrationCycle({ trigger })`

- Maakt een `OrchestrationRun` (`RUNNING`), haalt historische context uit het
  RAG-geheugen (AUDIT/INTERACTION/LEGAL).
- `chatJson` → `{ summary, findings[] }`. Elke finding: `severity`, `category`,
  `title`, `detail`, `actionKind`, `action?`.
- `actionKind`:
  - `CONSOLE_QUERY` → `{ query, params }` uit de query-registry; **auto-uitgevoerd**
    (alleen-lezen), resultaat in `actionPayload`.
  - `CONSOLE_MUTATION` → `{ mutation, params }`; alleen de **dry-run-impact** in
    `actionPayload` — een mens bevestigt via de admin-console.
  - `CODE_PATCH` → `{ description, files[] }` → `dev-advisor.ts#proposePatch`
    (path-jailed tot de repo + ext-allowlist, leest de bestanden, LLM geeft een
    unified diff + rationale als **tekst**, nooit geschreven).
  - `MANUAL` / `NONE` → informatief.
- Persisteert `OrchestrationFinding`-rijen, `Run` → `COMPLETED` + `summary`.
- Audit `orchestration.cycle.completed` + gesproken melding (severity `HIGH` bij
  hoge bevindingen).

## 3. Findings afhandelen

`OrchestrationFinding.status`: `OPEN` → `ACKNOWLEDGED` / `ACTIONED` / `DISMISSED`
via `PATCH /api/admin/orchestration/findings/[id]`.

Endpoints (PLATFORM_ADMIN): `POST .../run`, `GET .../runs`, `GET .../findings`,
`PATCH .../findings/[id]`, `POST .../patch` (code-advisor op aanvraag). Cron:
`GET /api/internal/orchestration/tick` (6u).

## Jarvis-turn — `lib/jarvis/core.ts`

`startTurn` maakt een `JarvisTurn` en start `runTurn` (**niet geawait**;
self-heal van turns die >5 min `RUNNING` staan → `FAILED`). `runTurn`:

1. Routeert via het lokale model → `memory` / `console` / `orchestration` /
   `briefing` / `chat` + een sub-agent (`analyst` / `developer:tom` / `sales` /
   `jarvis`).
2. Schrijft `JarvisEvent`-rijen (de inklapbare voortgangsblokken links in de UI).
3. Structureert het eindantwoord tot een Markdown-rapport (`structureAnswer`,
   overgeslagen voor briefing-turns).

De UI pollt `GET /api/admin/jarvis/turns/[id]?since=<seq>` (700ms) tot
`status != RUNNING`.
