# Code-standaarden

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
  Gevolg: `arr[i]` is `T | undefined` — altijd narrowen. En een optioneel veld
  met `?: string` accepteert géén expliciete `undefined`; gebruik of
  `?: string | undefined` in de interface, of een conditional spread:
  `...(x ? { key: x } : {})`.
- `moduleResolution: "bundler"`, path-alias `@/*` → repo-root.
- Geen `any` in productiecode. In tests mag het beperkt (met een eslint-disable).

## Foutafhandeling

- `lib/errors.ts` — `AppError` met een `code`, `status` en optionele `details`.
  Fabrieksmethoden: `AppError.unauthenticated/forbidden/notFound/validation/
  conflict/precondition/complianceBlocked/paymentFailed/upstream`.
- `toErrorBody(err)` mapt naar `{ status, body }`:
  - `AppError` → eigen status.
  - `ZodError` (duck-typed op `issues` + `flatten`) → 422 `VALIDATION_FAILED`.
  - alles anders → 500 `INTERNAL` (geen interne details lekken).
- API-routes: `try { ... } catch (err) { const {status, body} = toErrorBody(err);
  return NextResponse.json(body, { status }); }`. Log alleen bij `status >= 500`.

## "Never throw" helpers

Best-effort neveneffecten mogen een businesstransactie nooit breken. Ze vangen
alles zelf op en loggen een warning:

- `recordAudit(input)` — audit-trail schrijven.
- `announce(input)` — voice-melding in de wachtrij.
- `recordEngagement(freelancerId, kind)` — analytics/timing-event.
- `sendShiftOffer(offer)` — push.

Aanroeppatroon: `void announce({...})` (niet awaiten) of `await recordAudit({...})`
ná de eigen transactie.

## Geld & tijd

- Alle bedragen zijn **integer centen** (`Int`), nooit floats.
- Coördinaten zijn `Float` graden; afstand via haversine in JS
  (`lib/geo/geofencing.ts`).
- Datums als `DateTime`; relatieve datums in seeds worden absoluut opgeslagen.

## Route-parameters

- ID-validatie is `z.string().min(1).max(128)` — **niet** `.cuid()`, omdat de
  seed leesbare id's gebruikt (`shift_ams_vakkenvullen`).

## Prisma-conventies

- Eén singleton client (`lib/prisma.ts`), gecachet op `globalThis` in dev.
- `Json`-velden krijgen een `@default("{}")`/`@default("[]")`.
- JSONB-writes: cast naar `Prisma.InputJsonValue`, of `JSON.parse(JSON.stringify(x))`
  om Dates/undefined te strippen.
- Tekst die van bestanden of externe payloads komt eerst door
  `sanitizeText()` (strip NUL / C0-controls — Postgres weigert `0x00`).

## Tests

- Vitest, `tests/setup.ts` zet minimale env (`??=`) zodat `lib/env.ts` valideert.
- Mock infra (`@/lib/prisma`, `@/lib/redis`, `@/lib/ai/*`) per test; gebruik
  `vi.hoisted(() => ...)` voor mock-objecten die in een `vi.mock`-factory nodig zijn.
- Pure functies (scoring, chunking, cosine, geofence, timing) worden direct getest.
- Doel: `tsc --noEmit` clean, `vitest` groen, `next build` clean.
