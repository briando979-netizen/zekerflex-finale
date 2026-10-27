#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ZekerFlex load-test harness — zero-install (Node 22+ fetch).
//
// Simuleert piekbelasting (bijv. vrijdag 17:00: duizenden gelijktijdige
// acties) tegen de PUBLIEKE, read-only endpoints en rapporteert latency
// (p50/p95/p99), doorvoer en foutpercentage per endpoint.
//
//   BASE_URL=https://staging.zekerflex.com CONCURRENCY=200 DURATION=30 \
//     node tools/loadtest/run.mjs
//
// Standaard alleen GET's (geen schrijfacties, geen login). Draai tegen een
// STAGING-omgeving, niet tegen productie met echte gebruikers. Voeg eigen
// endpoints toe via ENDPOINTS="/x,/y".
// ---------------------------------------------------------------------------
import { summarize } from "./stats.mjs";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);
const DURATION_S = Number(process.env.DURATION ?? 20);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 15000);

// Public, read-only endpoints that model real peak traffic. Writes/login are
// intentionally excluded so the harness never mutates data or trips auth locks.
const DEFAULT_ENDPOINTS = ["/", "/klussen", "/api/status", "/api/ready", "/kennis/faq", "/kennis", "/sitemap.xml"];
const ENDPOINTS = (process.env.ENDPOINTS ? process.env.ENDPOINTS.split(",") : DEFAULT_ENDPOINTS).map((s) => s.trim()).filter(Boolean);

async function hit(path) {
  const t = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "zekerflex-loadtest" } });
    // drain the body so the connection is reused realistically
    await res.arrayBuffer().catch(() => undefined);
    return { latencyMs: performance.now() - t, ok: res.ok, status: res.status, path };
  } catch (err) {
    return { latencyMs: performance.now() - t, ok: false, status: err.name === "TimeoutError" ? "timeout" : "error", path };
  }
}

async function worker(deadline, samples) {
  while (performance.now() < deadline) {
    const path = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    samples.push(await hit(path));
  }
}

async function main() {
  console.log(`▸ Load test ${BASE_URL} — ${CONCURRENCY} gelijktijdig, ${DURATION_S}s, endpoints: ${ENDPOINTS.join(", ")}`);
  // warm-up ping (also validates the target is reachable)
  const warm = await hit("/api/ready");
  if (!warm.ok && warm.status !== 200) console.log(`  ⚠ /api/ready gaf ${warm.status} — draait de doelomgeving?`);

  const samples = [];
  const start = performance.now();
  const deadline = start + DURATION_S * 1000;
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(deadline, samples)));
  const wall = performance.now() - start;

  const overall = summarize(samples, wall);
  console.log(`\n== TOTAAL ==`);
  console.log(`  verzoeken: ${overall.requests}  fouten: ${overall.errors} (${(overall.errorRate * 100).toFixed(2)}%)  doorvoer: ${overall.throughputPerSec.toFixed(0)}/s`);
  console.log(`  latency ms — p50 ${overall.p50}  p95 ${overall.p95}  p99 ${overall.p99}  max ${overall.max}`);
  console.log(`  statussen: ${JSON.stringify(overall.byStatus)}`);

  console.log(`\n== PER ENDPOINT ==`);
  for (const path of ENDPOINTS) {
    const sub = samples.filter((s) => s.path === path);
    if (!sub.length) continue;
    const st = summarize(sub, wall);
    console.log(`  ${path.padEnd(16)} n=${String(st.requests).padStart(5)}  p95 ${String(st.p95).padStart(5)}ms  fouten ${(st.errorRate * 100).toFixed(1)}%`);
  }

  // non-zero exit on an unhealthy result, so CI/scripts can gate on it
  const bad = overall.errorRate > 0.02 || overall.p95 > 3000;
  if (bad) {
    console.log(`\n✗ Boven de drempel (foutpercentage > 2% of p95 > 3000ms).`);
    process.exit(1);
  }
  console.log(`\n✓ Binnen de drempels.`);
}

main().catch((err) => {
  console.error("load test failed:", err.message);
  process.exit(1);
});
