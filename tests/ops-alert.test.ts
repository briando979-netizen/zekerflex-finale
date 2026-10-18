import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const m = vi.hoisted(() => ({ push: vi.fn(), mail: vi.fn() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/messaging/contacts", () => ({ platformAdminIds: async () => ["adm1", "adm2"] }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => m.push(...a) }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.mail(...a) }));

import { alertOwner, recentAlerts } from "@/lib/ops/alert";

beforeEach(() => {
  kv.clear();
  m.push.mockReset().mockResolvedValue(2);
  m.mail.mockReset().mockResolvedValue({ ok: true });
});

describe("owner alerts", () => {
  it("pushes to every platform admin and mails the admin address", async () => {
    expect(await alertOwner({ key: "payout:p1", title: "Uitbetaling mislukt", detail: "SEPA weigerde", url: "/admin/facturen" })).toBe("sent");
    expect(m.push).toHaveBeenCalledWith(["adm1", "adm2"], expect.objectContaining({ title: "🚨 Uitbetaling mislukt", data: expect.objectContaining({ url: "/admin/facturen" }) }));
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ subject: "🚨 ZekerFlex: Uitbetaling mislukt", kind: "ops-alert" }));
    const [logged] = await recentAlerts();
    expect(logged).toMatchObject({ key: "payout:p1", severity: "critical", sent: { push: 2, mail: true } });
  });

  it("reports the same problem at most once per hour (critical) / six hours (warning)", async () => {
    const t = 1_800_000_000_000;
    expect(await alertOwner({ key: "cron:sepa", title: "x", detail: "y" }, t)).toBe("sent");
    expect(await alertOwner({ key: "cron:sepa", title: "x", detail: "y" }, t + 30 * 60_000)).toBe("deduped");
    expect(await alertOwner({ key: "cron:sepa", title: "x", detail: "y" }, t + 61 * 60_000)).toBe("sent");
    expect(await alertOwner({ key: "w", title: "x", detail: "y", severity: "warning" }, t)).toBe("sent");
    expect(await alertOwner({ key: "w", title: "x", detail: "y", severity: "warning" }, t + 5 * 3600_000)).toBe("deduped");
    expect(m.push).toHaveBeenCalledTimes(3);
  });

  it("never throws when push or mail is down", async () => {
    m.push.mockRejectedValue(new Error("push down"));
    m.mail.mockRejectedValue(new Error("smtp down"));
    expect(await alertOwner({ key: "k", title: "x", detail: "y" })).toBe("sent");
    expect((await recentAlerts())[0]?.sent).toEqual({ push: 0, mail: false });
  });
});

describe("failed scheduled job", () => {
  it("recordCronRun(job, false) alerts the owner; a success doesn't", async () => {
    const { recordCronRun } = await import("@/lib/metrics");
    recordCronRun("sepa-batch", true);
    recordCronRun("sepa-batch", false);
    await vi.waitFor(() => expect(m.push).toHaveBeenCalledTimes(1));
    expect(m.push).toHaveBeenCalledWith(["adm1", "adm2"], expect.objectContaining({ title: "🚨 Geplande taak mislukt: sepa-batch" }));
  });
});
