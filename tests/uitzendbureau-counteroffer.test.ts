import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// Same gate as applyToShift, on the counter-offer ("reageer") path — a
// zzp'er/flexwerker shouldn't be able to submit a tegenbod on a shift that's
// reserved for uitzendkrachten either.

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const payoutEligibility = vi.fn();
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: (...a: unknown[]) => payoutEligibility(...a) }));

const shiftFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) } },
}));

const createCounterOffer = vi.fn();
vi.mock("@/lib/offers/store", () => ({ createCounterOffer: (...a: unknown[]) => createCounterOffer(...a) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ delivered: true }) }));

import { counterOfferAction } from "@/app/dashboard/klussen/actions";

function freelancer(): Principal {
  return {
    userId: "u1",
    email: "f@example.com",
    fullName: "F",
    emailVerifiedAt: new Date(),
    grants: [{ role: "FREELANCER", organizationId: "org_platform", locationIds: [] }],
    memberships: [],
    managedBranchIds: [],
  } as Principal;
}

const uitzendShift = {
  title: "Magazijnmedewerker",
  hourlyRateCents: 1700,
  status: "OPEN",
  startsAt: new Date(Date.now() + 86_400_000),
  viaUitzendbureau: true,
  branch: { name: "Branch 1" },
};

afterEach(() => vi.clearAllMocks());

describe("counterOfferAction — viaUitzendbureau gate", () => {
  it("refuses a tegenbod from a non-uitzendkracht on a uitzendbureau-only shift", async () => {
    requirePrincipal.mockResolvedValue(freelancer());
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    shiftFindUnique.mockResolvedValue(uitzendShift);

    const result = await counterOfferAction("shift1", 1800, "");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("uitzendkrachten");
    expect(createCounterOffer).not.toHaveBeenCalled();
  });

  it("allows an uitzendkracht to submit a tegenbod on the same shift", async () => {
    requirePrincipal.mockResolvedValue(freelancer());
    payoutEligibility.mockResolvedValue({ ok: true, track: "payroll", reason: null });
    shiftFindUnique.mockResolvedValue(uitzendShift);
    createCounterOffer.mockResolvedValue({ id: "o1" });

    const result = await counterOfferAction("shift1", 1800, "");

    expect(result.ok).toBe(true);
    expect(createCounterOffer).toHaveBeenCalled();
  });
});
