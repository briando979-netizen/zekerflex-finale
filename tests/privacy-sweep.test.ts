import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const calls: { model: string; op: string; where?: unknown; data?: unknown }[] = [];
  const mk = (model: string, count: number) => ({
    deleteMany: async ({ where }: { where: unknown }) => {
      calls.push({ model, op: "deleteMany", where });
      return { count };
    },
    updateMany: async ({ where, data }: { where: unknown; data: unknown }) => {
      calls.push({ model, op: "updateMany", where, data });
      return { count };
    },
    count: async ({ where }: { where: unknown }) => {
      calls.push({ model, op: "count", where });
      return count;
    },
  });
  return {
    calls,
    prisma: {
      gpsEvent: mk("gpsEvent", 5),
      deviceFingerprint: mk("deviceFingerprint", 2),
      engagementEvent: mk("engagementEvent", 9),
      passwordResetToken: mk("passwordResetToken", 1),
      identityVerification: mk("identityVerification", 3),
    },
    audits: [] as unknown[],
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/audit", () => ({
  recordAudit: async (a: unknown) => {
    h.audits.push(a);
  },
}));

import { runRetentionSweep } from "@/lib/privacy/sweep";

beforeEach(() => {
  h.calls.length = 0;
  h.audits.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("runRetentionSweep", () => {
  const now = new Date("2026-09-09T00:00:00Z");

  it("deletes expired rows and minimises old KYC, then audits", async () => {
    const res = await runRetentionSweep({ now });

    expect(res.dryRun).toBe(false);
    expect(res.cleared).toMatchObject({
      gps_events: 5,
      device_fingerprint: 2,
      engagement_events: 9,
      password_reset_tokens: 1,
      kyc: 3,
    });

    const kyc = h.calls.find((c) => c.model === "identityVerification");
    expect(kyc?.op).toBe("updateMany");
    expect(kyc?.data).toMatchObject({ rawPayload: {}, livenessScore: null });

    // gps cutoff is now - 2y
    const gps = h.calls.find((c) => c.model === "gpsEvent");
    expect((gps?.where as { recordedAt: { lt: Date } }).recordedAt.lt.getUTCFullYear()).toBe(2024);

    expect(res.pending).toContain("invoices_payments");
    expect(h.audits).toHaveLength(1);
  });

  it("dryRun counts without deleting or auditing", async () => {
    const res = await runRetentionSweep({ now, dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(h.calls.every((c) => c.op === "count")).toBe(true);
    expect(h.audits).toHaveLength(0);
  });
});
