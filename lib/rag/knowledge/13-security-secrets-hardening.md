# Beveiliging, secrets & hardening

## Env & secrets

- `lib/config/load-env.ts` — dependency-vrije `.env` / `.env.local`-parser,
  geladen bovenaan `lib/env.ts` (`loadLocalEnv()`), **overschrijft nooit** wat de
  runtime al zette. Zo zijn scripts/seed/tests zelfvoorzienend, onafhankelijk
  van editor- of terminal-instellingen.
- `lib/env.ts` — zod-gevalideerd, throwt bij boot bij misconfig. `AUTH_SECRET`
  min 32 tekens. Import `env`, lees nooit `process.env` direct.
- `.env` staat in `.gitignore`; `.env.example` bevat alleen placeholders.
- Live secrets (KVKBase-key, Google-secret) horen alléén in de lokale `.env`.

## Path-jailing

Overal waar een pad van buiten komt:

- `lib/orchestration/dev-advisor.ts#resolveInsideRepo` — geen absolute paden,
  geen `..`, ext-allowlist (`.ts .tsx .prisma .json .md .mjs .css`), max 6
  bestanden, 24 KB per bestand. Overtreding → `AppError.validation` (422).
- `lib/storage/local.ts` — uploads onder `UPLOADS_DIR`, `storageKey` gecheckt
  met `relative()` tegen de root (escape → 403), sha256, `UPLOAD_MAX_BYTES`.

## Input-sanitatie

- `lib/rag/store.ts#sanitizeText` — strip NUL (`0x00`) en C0-controls behalve
  tab/newline; Postgres weigert NUL.
- Route-bodies via zod `safeParse` of `parse` (ZodError → 422 via `toErrorBody`).

## Interne endpoints

`/api/internal/*` — `checkInternalToken`: `x-internal-token` /
`Authorization: Bearer` / `?token=`. Zonder `INTERNAL_CRON_TOKEN` in productie
geweigerd (412).

## Confirm-tokens (admin-console)

HS256-JWT, 5 min, `jti` + operator-`sub`. Single-use via Redis `SETNX` (faalt
dicht). Cross-operator hergebruik → 403.

## Audit-trail

`lib/audit.ts#recordAudit` — append-only `AuditLog`, **gooit nooit**. Aangesloten
op: login (succes/fail/lockout), timesheet-goedkeuring, dispuut-resolutie +
auto-open, KYC-beslissing, modelovereenkomst-ondertekening, admin-console-
mutaties, orchestratie, RAG-bevragingen, uploads.
`GET /api/admin/audit` (PLATFORM_ADMIN, cursor-paginated, filters op
category/action/actor/target/severity/since).

## Geen autonome destructie

- LLM-code wordt nooit toegepast — alleen voorgesteld.
- Data-mutaties vereisen expliciete bevestiging.
- De seed wist nooit een gevulde database; admin-inlog blijft intact.
- Geen purge-crons voor logs/sessies/analytics.

## Fraude-signalen

`DeviceFingerprint` (hardware-hash, `sharedWithUserIds` bij hergebruik),
mock-locatie-detectie bij check-in, KVK/VIES-validatie, Didit KYC met
webhook-HMAC (3 schema's, ±5 min venster).
