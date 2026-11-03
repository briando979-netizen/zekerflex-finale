import { describe, expect, it, vi } from "vitest";

// Doorloopt getWorkerMilestones voor een zzp'er, zodat de volgorde van de queries
// (dit jaar / laatste 12 maanden / facturen) niet stilletjes kan verwisselen.
const timesheetFindMany = vi.fn(async (args: { select: Record<string, unknown> }) =>
  args.select.branch
    ? [
        { billableMinutes: 50 * 60, hourlyRateCents: 3000, branch: { tenantId: "a", tenant: { name: "Café A" } } },
        { billableMinutes: 50 * 60, hourlyRateCents: 1000, branch: { tenantId: "b", tenant: { name: "Hotel B" } } },
      ]
    : [{ billableMinutes: 100 * 60 }],
);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ id: "fp1" }) },
    timesheet: { findMany: (args: { select: Record<string, unknown> }) => timesheetFindMany(args) },
    invoice: { findMany: async () => [{ subtotalCents: 200_000, vatCents: 42_000, createdAt: new Date("2026-10-10T10:00:00Z") }] },
  },
}));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => ({ workerKind: "zzp", korApplies: false, vatValid: true }),
  invoiceModeFor: () => "reverse-billing",
}));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: vi.fn() }));

import { getWorkerMilestones } from "@/lib/worker/milestones";

describe("getWorkerMilestones (zzp)", () => {
  it("bevat urencriterium, spreiding en btw uit de juiste bronnen", async () => {
    const data = await getWorkerMilestones("u1", new Date("2026-11-03T10:00:00Z"));
    const ids = data!.milestones.map((m) => m.id);
    expect(ids).toEqual(["urencriterium", "spreiding", "btw"]);

    const uren = data!.milestones.find((m) => m.id === "urencriterium")!;
    expect(uren.headline).toBe("100 / 1225 uur");

    const spread = data!.milestones.find((m) => m.id === "spreiding")!;
    expect(spread.headline).toBe("75% bij Café A");
    expect(spread.status).toBe("action");

    const btw = data!.milestones.find((m) => m.id === "btw")!;
    expect(btw.headline).toBe("± € 420 te betalen");
  });
});
