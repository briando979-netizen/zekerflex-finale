import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const userFindUnique = vi.fn();
const assignmentFindMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
const membershipFindMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    shiftAssignment: { findMany: (...a: unknown[]) => assignmentFindMany(...a) },
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
  },
}));
const getFiscal = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: (...a: unknown[]) => getFiscal(...a) }));
const createReplacementRequest = vi.fn(async (..._a: unknown[]) => ({ id: "r1" }));
const getOpenRequestForShift = vi.fn(async (..._a: unknown[]) => null as unknown);
vi.mock("@/lib/replacements/store", () => ({
  createReplacementRequest: (...a: unknown[]) => createReplacementRequest(...a),
  getOpenRequestForShift: (...a: unknown[]) => getOpenRequestForShift(...a),
}));
const sendUserPush = vi.fn(async (..._a: unknown[]) => 1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...(a as [])) }));
const alertOwnerLater = vi.fn();
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => alertOwnerLater(...a) }));
vi.mock("@/lib/env", () => ({ env: { ZW_REPORT_ENDPOINT: undefined, ZW_REPORT_TOKEN: undefined } }));

import { reportSick } from "@/lib/uitzend/ziekmelding";

const future = new Date(Date.now() + 2 * 86_400_000);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
  assignmentFindMany.mockResolvedValue([]);
  membershipFindMany.mockResolvedValue([]);
});

describe("reportSick", () => {
  it("auto-creates a replacement for each upcoming shift and notifies the employer", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan Ziek", freelancerProfile: { id: "f1" } });
    getFiscal.mockResolvedValue({ workerKind: "uitzendkracht" });
    assignmentFindMany.mockResolvedValue([
      { id: "a1", shift: { id: "s1", title: "Kassa", startsAt: future, branch: { name: "AH", tenantId: "t1" } } },
    ]);
    membershipFindMany.mockResolvedValue([{ userId: "boss" }]);

    const rec = await reportSick({ userId: "u1", from: isoDay(new Date()) });
    expect(createReplacementRequest).toHaveBeenCalledTimes(1);
    expect(rec.shifts[0]!.replacementId).toBe("r1");
    expect(sendUserPush).toHaveBeenCalledWith(["boss"], expect.objectContaining({ title: expect.stringContaining("Ziekmelding") }));
    // no UWV channel configured → owner gets a task
    expect(rec.uwvReported).toBe(false);
    expect(alertOwnerLater).toHaveBeenCalled();
  });

  it("does not file a ZW/UWV report for a zzp'er (no loondoorbetaling)", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Zara ZZP", freelancerProfile: { id: "f2" } });
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    const rec = await reportSick({ userId: "u2", from: isoDay(new Date()) });
    expect(rec.uwvReported).toBe(false);
    expect(rec.uwvDetail).toBeNull();
    expect(alertOwnerLater).not.toHaveBeenCalled();
  });

  it("telt hele Nederlandse dagen: van 00:00 op de eerste dag tot 00:00 na de laatste", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
    userFindUnique.mockResolvedValue({ fullName: "Jan", freelancerProfile: { id: "f1" } });
    getFiscal.mockResolvedValue({ workerKind: "zzp" });
    await reportSick({ userId: "u1", from: "2026-11-20", to: "2026-11-21" });
    vi.useRealTimers();
    const where = (assignmentFindMany.mock.calls[0]?.[0] as { where: { shift: { startsAt: { gte: Date; lte: Date } } } }).where;
    // 20 nov 00:00 NL = 19 nov 23:00 UTC; tot en met 21 nov 23:59:59,999 NL = 22:59:59,999 UTC
    expect(where.shift.startsAt.gte.toISOString()).toBe("2026-11-19T23:00:00.000Z");
    expect(where.shift.startsAt.lte.toISOString()).toBe("2026-11-21T22:59:59.999Z");
  });

  it("reuses an existing open replacement instead of making a second one", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan", freelancerProfile: { id: "f1" } });
    getFiscal.mockResolvedValue({ workerKind: "uitzendkracht" });
    assignmentFindMany.mockResolvedValue([{ id: "a1", shift: { id: "s1", title: "Kassa", startsAt: future, branch: { name: "AH", tenantId: "t1" } } }]);
    getOpenRequestForShift.mockResolvedValue({ id: "existing" });
    const rec = await reportSick({ userId: "u1", from: isoDay(new Date()) });
    expect(createReplacementRequest).not.toHaveBeenCalled();
    expect(rec.shifts[0]!.replacementId).toBe("existing");
  });
});
