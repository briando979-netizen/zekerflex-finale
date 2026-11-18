import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const alertOwner = vi.fn(async (..._a: unknown[]) => "sent" as const);
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
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(0.2), ok: true };
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
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(0.2), ok: true };
    delete kv["cron-heartbeat:ai-watchdog"]; // never recorded
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1000) };
    const res = await checkCronHeartbeats(NOW);
    expect(res.stale).toEqual(["ai-watchdog"]);
  });

  it("een nieuwe taak (sinds) die nog nooit liep, telt de eerste 48 uur niet als stale, daarna wel (18 nov: melder-wacht)", async () => {
    const nieuw = WATCHED_CRONS.find((c) => c.job === "melder-wacht");
    expect(nieuw?.sinds).toBe("2026-11-18T22:00:00Z");
    const alleBehalveDeze = (nu: number) => {
      for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: new Date(nu - 0.2 * 3_600_000).toISOString(), ok: true };
      delete kv["cron-heartbeat:melder-wacht"];
      kv["cron-heartbeat:first-seen"] = { at: new Date(nu - 1000 * 3_600_000).toISOString() };
    };
    const ochtend = Date.parse("2026-11-19T07:00:00Z"); // de watchdog, voor de eerste keer van melder-wacht (07:30)
    alleBehalveDeze(ochtend);
    expect((await checkCronHeartbeats(ochtend)).stale).toEqual([]);
    expect(alertOwner).not.toHaveBeenCalled();
    const later = Date.parse("2026-11-21T00:00:00Z"); // meer dan 48 uur na de uitrol en nog nooit gelopen: dat is wel stuk
    alleBehalveDeze(later);
    expect((await checkCronHeartbeats(later)).stale).toEqual(["melder-wacht"]);
    // een taak zonder 'sinds' blijft werken zoals vroeger
    expect(WATCHED_CRONS.find((c) => c.job === "matching-tick")?.sinds).toBeUndefined();
  });

  it("bewaakt de dagelijkse taken die eerst geen hartslagbewaking hadden", () => {
    for (const job of ["markten-scan", "winkel-agent", "invoice-reminders", "domein-verlengen", "onboarding-reminders"]) {
      expect(WATCHED_CRONS.find((c) => c.job === job)?.maxAgeHours, job).toBe(26);
    }
  });

  it("bewaakt ai-warm niet: die schrijft geen hartslag als 'alles gratis' uit staat", () => {
    expect(WATCHED_CRONS.some((c) => c.job === "ai-warm")).toBe(false);
  });

  it("verwijst in de melding naar de cron-container, niet naar Vercel", async () => {
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(0.2), ok: true };
    kv["cron-heartbeat:winkel-agent"] = { at: hoursAgo(30), ok: true };
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1000) };
    await checkCronHeartbeats(NOW);
    const detail = String((alertOwner.mock.calls[0]![0] as { detail: string }).detail);
    expect(detail).toContain("cron-container");
    expect(detail).not.toMatch(/vercel/i);
  });
  it("meldt een taak die wel draait maar al langer dan een uur achter elkaar mislukt", async () => {
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(0.1), ok: true };
    kv["cron-heartbeat:boekhouding-bonnen-mail"] = { at: hoursAgo(0.1), ok: false, since: hoursAgo(5) };
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1000) };
    const res = await checkCronHeartbeats(NOW);
    expect(res.stale).toEqual([]);
    expect(res.failing).toEqual(["boekhouding-bonnen-mail"]);
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ key: "cron-failing:boekhouding-bonnen-mail", severity: "warning" });
  });

  it("slaat geen alarm bij één misser: pas na een uur onafgebroken mislukken", async () => {
    for (const c of WATCHED_CRONS) kv[`cron-heartbeat:${c.job}`] = { at: hoursAgo(0.1), ok: true };
    kv["cron-heartbeat:matching-tick"] = { at: hoursAgo(0.1), ok: false, since: hoursAgo(0.2) };
    kv["cron-heartbeat:first-seen"] = { at: hoursAgo(1000) };
    const res = await checkCronHeartbeats(NOW);
    expect(res.failing).toEqual([]);
    expect(alertOwner).not.toHaveBeenCalled();
  });

  it("onthoudt sinds wanneer een taak mislukt en wist dat bij een geslaagde run", async () => {
    await recordCronHeartbeat("matching-tick", false);
    const eerste = (kv["cron-heartbeat:matching-tick"] as { since?: string }).since;
    expect(eerste).toBeTruthy();
    await recordCronHeartbeat("matching-tick", false);
    expect((kv["cron-heartbeat:matching-tick"] as { since?: string }).since).toBe(eerste);
    await recordCronHeartbeat("matching-tick", true);
    expect((kv["cron-heartbeat:matching-tick"] as { since?: string }).since).toBeUndefined();
  });
});
