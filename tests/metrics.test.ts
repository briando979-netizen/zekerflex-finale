import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    timesheet: { count: async () => 4 },
    shift: { count: async () => 7 },
    user: { count: async () => 1 },
  },
}));

import {
  recordCronRun,
  recordRateLimited,
  recordPayout,
  recordShiftOffer,
  renderMetrics,
  metricsContentType,
} from "@/lib/metrics";

beforeEach(() => {
  // fresh registry per test
  const g = globalThis as Record<PropertyKey, unknown>;
  delete g[Symbol.for("zekerflex.metrics")];
});
afterEach(() => vi.clearAllMocks());

describe("metrics", () => {
  it("exposes Prometheus text with default + custom series", async () => {
    recordCronRun("matching-tick", true);
    recordRateLimited("check-email");
    recordPayout("FAILED");
    recordShiftOffer(false);

    const body = await renderMetrics();

    expect(metricsContentType()).toContain("text/plain");
    expect(body).toContain("zf_process_cpu_user_seconds_total"); // default, zf_ prefixed
    expect(body).toContain("zf_build_info{");
    expect(body).toContain('zf_cron_last_run_success{job="matching-tick"} 1');
    expect(body).toContain('zf_rate_limited_total{name="check-email"} 1');
    expect(body).toContain('zf_payouts_total{status="failed"} 1');
    expect(body).toContain('zf_shift_offers_total{delivered="no"} 1');
    // scrape-time business gauges
    expect(body).toContain("zf_timesheets_pending 4");
    expect(body).toContain("zf_shifts_open 7");
  });

  it("recorders never throw", () => {
    expect(() => {
      recordCronRun("x", false);
      recordRateLimited("y");
      recordPayout("SETTLED");
      recordShiftOffer(true);
    }).not.toThrow();
  });

  it("a failed cron run flips last_run_success to 0", async () => {
    recordCronRun("rag-reindex", false);
    const body = await renderMetrics();
    expect(body).toContain('zf_cron_last_run_success{job="rag-reindex"} 0');
    expect(body).toContain('zf_cron_runs_total{job="rag-reindex",status="error"} 1');
  });
});
