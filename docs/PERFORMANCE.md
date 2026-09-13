# Performance & load testing

## Tooling

| Layer | Tool | Command |
|---|---|---|
| Backend load / throughput | `autocannon` (Node, bundled devDep) | `npm run loadtest` |
| Multi-stage scenario (ramp, soak) | `k6` (optional external binary) | `k6 run perf/k6-load.js` |
| Frontend (Core Web Vitals) | Lighthouse CI / PageSpeed on the deployed URL | manual, per release |

`npm run loadtest` ([scripts/loadtest.mjs](../scripts/loadtest.mjs)) hits the
read-only public surface (`/`, `/voor-bedrijven`, `/voor-freelancers`,
`/status`, `/api/status`) with 20 concurrent connections for 20 s each and
**exits non-zero on a threshold breach**, so it can gate a deploy.

```bash
BASE_URL=https://staging.zekerflex.nl LOAD_DURATION=60 LOAD_CONNECTIONS=50 npm run loadtest
```

The money paths (matching, timesheet approval → billing) are correctness-
tested by the E2E critical-path spec, not load-hammered — they mutate state
and hold advisory locks by design.

## Acceptance criteria (public surface)

Mirrored as the defaults in `scripts/loadtest.mjs`; override with env vars.

| Metric | Threshold | Env override |
|---|---|---|
| p97.5 latency (autocannon has no p95) | ≤ 800 ms | `LOAD_P95_MS` |
| p99 latency | ≤ 1500 ms | `LOAD_P99_MS` |
| Non-2xx rate | ≤ 1 % | `LOAD_MAX_ERROR_RATE` |
| Throughput | ≥ 50 req/s per target | `LOAD_MIN_RPS` |

Frontend (Lighthouse, mobile, deployed): **LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤
200 ms, Performance score ≥ 85** on `/` and `/voor-bedrijven`.

## Notes on the render model

Since the CSP nonce work (see [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md)),
every route is server-rendered on demand — the root layout reads a per-request
nonce. Pages are cheap server components; put a CDN / reverse-proxy cache in
front of the marketing routes (`Cache-Control: s-maxage`) if public traffic
grows. The `loadtest` thresholds above assume no CDN (origin-direct).

## Baseline

Run `npm run loadtest` against a production build (`next build && node
.next/standalone/server.js`) on the target host and paste the summary here
with a date. Re-run before each release and after any dependency major.

> No baseline recorded yet — first run pending on the deploy host. A local
> `next start` smoke (10 conn × 4 s/target, dev laptop) cleared all thresholds
> with p97.5 ≤ 110 ms and 0 % errors, which only says the harness works.
