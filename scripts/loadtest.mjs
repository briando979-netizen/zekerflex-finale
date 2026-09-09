#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Baseline load test. Node-native (autocannon) so it runs anywhere `npm` does
// — no separate binary. For a richer, multi-stage scenario there is also a k6
// script at perf/k6-load.js (k6 is optional).
//
//   npm run loadtest                      # localhost:3000, defaults below
//   BASE_URL=https://staging.zekerflex.nl npm run loadtest
//   LOAD_DURATION=60 LOAD_CONNECTIONS=50 npm run loadtest
//
// Exits non-zero if a threshold is breached, so it can gate a release.
// Acceptance criteria live in docs/PERFORMANCE.md; keep the two in sync.
// ---------------------------------------------------------------------------

import autocannon from "autocannon";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DURATION = Number(process.env.LOAD_DURATION ?? 20);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 20);

// Read-only, unauthenticated endpoints — a public-traffic spike. The money
// paths are covered by the E2E critical-path spec, not hammered here.
const TARGETS = [
  { name: "marketing home", path: "/" },
  { name: "voor-bedrijven", path: "/voor-bedrijven" },
  { name: "voor-freelancers", path: "/voor-freelancers" },
  { name: "status page", path: "/status" },
  { name: "health API", path: "/api/status" },
];

// Thresholds — mirror docs/PERFORMANCE.md. autocannon's histogram exposes
// p97.5 and p99 (no p95); p97.5 is used as the "p95-ish" tail check.
const THRESHOLDS = {
  p975_ms: Number(process.env.LOAD_P95_MS ?? 800),
  p99_ms: Number(process.env.LOAD_P99_MS ?? 1500),
  maxNon2xxRate: Number(process.env.LOAD_MAX_ERROR_RATE ?? 0.01),
  minRps: Number(process.env.LOAD_MIN_RPS ?? 50),
};

function runOne(target) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: `${BASE_URL}${target.path}`,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: { "accept-encoding": "gzip" },
      },
      (err, result) => (err ? reject(err) : resolve({ target, result })),
    );
  });
}

function evaluate({ target, result }) {
  const total = result.requests.total || 1;
  const non2xx = (result.non2xx ?? 0) + (result.errors ?? 0);
  const errorRate = non2xx / total;
  const p975 = result.latency.p97_5;
  const p99 = result.latency.p99;
  const rps = result.requests.average;

  const failures = [];
  if (p975 > THRESHOLDS.p975_ms) failures.push(`p97.5 ${p975}ms > ${THRESHOLDS.p975_ms}ms`);
  if (p99 > THRESHOLDS.p99_ms) failures.push(`p99 ${p99}ms > ${THRESHOLDS.p99_ms}ms`);
  if (errorRate > THRESHOLDS.maxNon2xxRate)
    failures.push(`error rate ${(errorRate * 100).toFixed(2)}% > ${THRESHOLDS.maxNon2xxRate * 100}%`);
  if (rps < THRESHOLDS.minRps) failures.push(`throughput ${rps.toFixed(0)} rps < ${THRESHOLDS.minRps} rps`);

  console.log(
    `${failures.length ? "✗" : "✓"} ${target.name.padEnd(18)} ` +
      `rps=${rps.toFixed(0)} p97.5=${p975}ms p99=${p99}ms err=${(errorRate * 100).toFixed(2)}%`,
  );
  for (const f of failures) console.log(`    - ${f}`);
  return failures.length === 0;
}

const main = async () => {
  console.log(
    `load test → ${BASE_URL}  (${CONNECTIONS} connections × ${DURATION}s per target)\n`,
  );
  let ok = true;
  for (const target of TARGETS) {
    const outcome = await runOne(target);
    ok = evaluate(outcome) && ok;
  }
  console.log(`\n${ok ? "PASS — within thresholds" : "FAIL — threshold breach (see above)"}`);
  process.exit(ok ? 0 : 1);
};

main().catch((err) => {
  console.error("loadtest failed to run:", err);
  process.exit(2);
});
