import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const alertOwner = vi.fn(async () => "sent" as const);
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));

import { checkCronHeartbeats, cronHeartbeats, recordCronHeartbeat, WATCHED_CRONS } from "@/lib/ops/heartbeat";

const NOW = new Date("2026-10-23T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("cron heartbeat watchdog", () => {
  it("records a durable heartbeat and reads it back as fresh", async () => {
    await recordCronHeartbeat("matching-tick", true);
    const h = (await cronHeartbeats()).find((x) => x.job === "matching-tick")!;
    expect(h.lastRunOk).toBe(true);
    expect(h.stale).toBe(false);
  });

  it("flags a job that hasn't run within its window and alerts once", async () => {
    // every watched job ran recently except one that went silent 30h ago
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(2), ok: true };
    kv["cron-heartbeat:matching-tick"] = { at: hoursAgo(30), ok: true };
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1000) };
    const res = await checkCronHeartbeats(NOW);
    expect(res.stale).toEqual(["matching-tick"]);
    expect(alertOwner).toHaveBeenCalledTimes(1);
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ key: "cron-missing:matching-tick", severity: "critical" });
  });

  it("does not alert on a fresh deployment for jobs never seen yet (grace window)", async () => {
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1) }; // deployed 1h ago
    const res = await checkCronHeartbeats(NOW);
    expect(res.stale).toEqual([]);
    expect(alertOwner).not.toHaveBeenCalled();
  });

  it("alerts for a job never seen once the deployment is old enough", async () => {
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(2), ok: true };
    delete kv["cron-heartbeat:ai-watchdog"]; // never recorded
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1000) };
    const res = await checkCronHeartbeats(NOW);
    expect(res.stale).toEqual(["ai-watchdog"]);
  });
});
