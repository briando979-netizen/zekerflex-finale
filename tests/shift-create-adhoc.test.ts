import { afterEach, describe, expect, it, vi } from "vitest";
import { createShiftSchema } from "@/lib/shifts/create";

describe("createShiftSchema — branchId vs adHocAddress", () => {
  const base = {
    title: "Demo op locatie",
    startsAt: "2027-01-10T09:00",
    endsAt: "2027-01-10T17:00",
    hourlyRateCents: 1700,
  };
  const address = { label: "Dam 1, Amsterdam", postalCode: "1012JS", city: "Amsterdam", latitude: 52.37, longitude: 4.89 };

  it("accepts a saved vestiging without an ad-hoc address", () => {
    expect(createShiftSchema.safeParse({ ...base, branchId: "b1" }).success).toBe(true);
  });

  it("accepts an ad-hoc address without a branchId", () => {
    expect(createShiftSchema.safeParse({ ...base, adHocAddress: address }).success).toBe(true);
  });

  it("rejects neither branchId nor adHocAddress", () => {
    expect(createShiftSchema.safeParse({ ...base }).success).toBe(false);
  });

  it("rejects both branchId and adHocAddress at once", () => {
    expect(createShiftSchema.safeParse({ ...base, branchId: "b1", adHocAddress: address }).success).toBe(false);
  });
});

const resolveEmployerScope = vi.fn();
const branchCreate = vi.fn();
const shiftCreate = vi.fn();
const txRunner = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ shift: { create: (...a: unknown[]) => shiftCreate(...a) }, shiftPoolInvite: { createMany: vi.fn() } }),
);

vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: vi.fn().mockResolvedValue({ rankedCount: 0 }) }));
vi.mock("@/lib/pools/store", () => ({ listPools: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    branch: { create: (...a: unknown[]) => branchCreate(...a), findFirst: vi.fn() },
    $transaction: (fn: (tx: unknown) => unknown) => txRunner(fn),
  },
}));

import { createShift } from "@/lib/shifts/create";

afterEach(() => vi.clearAllMocks());

describe("createShift — eenmalige locatie", () => {
  it("creates an AD_HOC branch with a wider default geofence and uses it for the shift", async () => {
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchCreate.mockResolvedValue({ id: "adhoc1", name: "Eenmalige locatie — Dam 1, Amsterdam", matchingConfig: {}, tenantId: "t1" });
    shiftCreate.mockResolvedValue({ id: "shift1" });

    await createShift(
      { userId: "u1", email: "a@b.nl" } as never,
      {
        adHocAddress: { label: "Dam 1, Amsterdam", postalCode: "1012JS", city: "Amsterdam", latitude: 52.37, longitude: 4.89 },
        title: "Demo op locatie",
        startsAt: "2027-01-10T09:00",
        endsAt: "2027-01-10T17:00",
        hourlyRateCents: 1700,
        breakMinutes: 0,
        positions: 1,
      } as never,
    );

    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", kind: "AD_HOC", geofenceRadiusMeters: 300 }),
      }),
    );
    expect(shiftCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: "adhoc1" }) }),
    );
  });
});
