# End-to-end tests

Browser tests for the critical paths. Kept out of `npm test` (the vitest unit
suite) because they need the whole stack up.

## Prerequisites

```bash
# 1. Postgres + Redis (any local instance matching .env / DATABASE_URL)
docker run -d --name zf-pg    -e POSTGRES_USER=zekerflex -e POSTGRES_PASSWORD=zekerflex \
  -e POSTGRES_DB=zekerflex -p 5432:5432 postgres:16-alpine
docker run -d --name zf-redis -p 6379:6379 redis:7-alpine

# 2. Schema (the run re-seeds itself, see below)
npm run prisma:deploy

# 3. Browser binary (first run only)
npx playwright install chromium
```

> **Note:** `next dev` reads `.env.local` before `.env`. If your `.env.local`
> points `DATABASE_URL` at a cloud database, export a local one for the run so
> the app and the seed agree:
> `DATABASE_URL=postgresql://zekerflex:zekerflex@localhost:5432/zekerflex?schema=public`

## Run

```bash
npm run test:e2e            # Playwright starts `next dev` itself
```

`globalSetup` re-runs `npm run db:seed` before the suite so state-mutating specs
(timesheet approval) are deterministic. Skip the reseed with
`PLAYWRIGHT_SKIP_SEED=1` when iterating on a spec.

Against an already-running server:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

## What is covered

| Spec | Path |
|---|---|
| `public.spec.ts` | Marketing pages + `/api/status` render without console errors; `/status` shows the deployment target |
| `auth.spec.ts` | Seeded login for freelancer / employer / platform-admin lands on the right home screen; bad password is rejected |
| `critical-path.spec.ts` | Employer approves the seeded submitted timesheet → reverse-billing invoices are issued and a payout row is created (SEPA provider unset → payout FAILED, which is the expected offline outcome) |
| `rate-limit.spec.ts` | Hammering `/api/auth/check-email` yields a `429` with a `Retry-After` header |

Seeded credentials (local only, password `Zeker!2026`): `admin@zekerflex.nl`,
`hq@supermarktketen.nl`, `liam.gold@freelancer.nl`.
