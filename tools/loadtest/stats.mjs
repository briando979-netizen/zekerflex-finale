// Latency statistics for the load-test harness (pure, unit-tested).

/** p-th percentile (0..100) of a numeric array. Linear interpolation. */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Summarise a batch of samples: { latencyMs: number, ok: boolean, status }[]. */
export function summarize(samples, wallMs) {
  const lat = samples.map((s) => s.latencyMs);
  const errors = samples.filter((s) => !s.ok).length;
  const byStatus = {};
  for (const s of samples) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  return {
    requests: samples.length,
    errors,
    errorRate: samples.length ? errors / samples.length : 0,
    throughputPerSec: wallMs > 0 ? (samples.length / wallMs) * 1000 : 0,
    p50: Math.round(percentile(lat, 50)),
    p95: Math.round(percentile(lat, 95)),
    p99: Math.round(percentile(lat, 99)),
    max: lat.length ? Math.round(Math.max(...lat)) : 0,
    byStatus,
  };
}
