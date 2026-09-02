# NL Admin-console & advisory-guard

`POST /api/admin/console` (PLATFORM_ADMIN) — een Nederlandse vraag/opdracht wordt
door het lokale model omgezet naar **precies één** item uit een vaste registry.
Er wordt nooit vrije SQL uitgevoerd.

## Registry

- **`lib/admin-console/queries.ts`** — alleen-lezen handlers via
  `defineQuery({ name, description, params: z.object(...), paramsHint, run })`:
  `platform_kpis`, `count_freelancers_by_status`, `search_freelancers`,
  `compliance_overview`, `active_shifts`. Elke handler is een vaste
  geparametriseerde Prisma-query.
- **`lib/admin-console/mutations.ts`** — wijzigende handlers via
  `defineMutation({ ..., risk, dryRun, execute })`:
  `deactivate_inactive_freelancers` (risk `high`), `cancel_past_due_open_shifts`,
  `block_freelancer_matching`. `dryRun` berekent de impact **zonder writes**;
  `execute` wordt alléén door het confirm-endpoint aangeroepen.

`ConsoleContext.principal` is optioneel — de orchestrator draait dezelfde
handlers met `{}` (systeemcontext).

## Parser & orchestrator

`parser.ts#parseIntent(question)` — `chatJson` met de catalogus; valideert de
gekozen naam tegen de registry (een gehallucineerde naam → `unknown`). Bij een
LLM-storing (`chatJson` throwt) → `runAdminConsole` geeft
`{ kind: "clarification", message: "reasoning-laag niet bereikbaar" }`.

- **query** → run + best-effort LLM-samenvatting → `{ kind: "answer", result,
  summary }`.
- **mutation-intentie** → `dryRun` + advisory + confirm-token →
  `{ kind: "advisory", impact, warnings, confirmToken }`. **Er verandert niets.**

## Advisory-guard & confirm-token

`advisory.ts` mint een HS256-JWT (jose, 5 min exp) met `action` + gevalideerde
`params` + operator-`sub` + een `jti`.

`POST /api/admin/console/confirm` `{ confirmToken }`:

1. `verifyConfirmToken` (issuer/audience/alg).
2. `claim.actorUserId === principal.userId` — anders 403.
3. `claimConfirmToken(jti)` = Redis `SETNX` → **single-use**, faalt dicht.
4. `dryRun` opnieuw (impact-drift check), dan `execute`.
5. Audit `admin.console.mutation.executed` op severity `critical` + gesproken melding.

`deactivate_inactive_freelancers.dryRun` voegt een vrijdagmiddag-waarschuwing toe
("accounts moeten maandag handmatig geheractiveerd worden").

## Jarvis

Jarvis' `console`-capability roept `runAdminConsole` aan met de echte principal.
Een advisory wordt in de chat getoond met de impact; de mens bevestigt apart.
