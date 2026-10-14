import { describe, expect, it } from "vitest";
import { recordCronRun, cronStatusSnapshot } from "@/lib/metrics";

// Uses the real in-process Prometheus registry (lib/metrics/registry.ts) —
// it's plain JS state, nothing to mock. This is exactly what the Sim view's
// /api/admin/cron-status route reads from, so these recordCronRun() calls
// stand in for what scripts/daemon.mjs does on every real tick.
describe("cronStatusSnapshot", () => {
  it("reports null for a job that has never run", async () => {
    const result = await cronStatusSnapshot(["__never-run-job__"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.lastRunAt).toBeNull();
    expect(result[0]!.lastRunOk).toBeNull();
  });

  it("reflects a real recordCronRun(success) call", async () => {
    recordCronRun("__test-job-ok__", true);
    const result = await cronStatusSnapshot(["__test-job-ok__"]);
    const status = result[0]!;
    expect(status.lastRunAt).toBeTruthy();
    expect(status.lastRunOk).toBe(true);
    expect(new Date(status.lastRunAt!).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("reflects a real recordCronRun(failure) call", async () => {
    recordCronRun("__test-job-fail__", false);
    const result = await cronStatusSnapshot(["__test-job-fail__"]);
    expect(result[0]!.lastRunOk).toBe(false);
  });

  it("only returns entries for the jobs asked for, in order", async () => {
    recordCronRun("__job-a__", true);
    recordCronRun("__job-b__", false);
    const result = await cronStatusSnapshot(["__job-b__", "__job-a__"]);
    expect(result.map((r) => r.job)).toEqual(["__job-b__", "__job-a__"]);
  });
});
