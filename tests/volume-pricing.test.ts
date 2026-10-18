import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { PLATFORM_FEE_PER_HOUR_CENTS: 350 } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { feePerHourFor, tierFor } from "@/lib/pricing/volume";

describe("staffelkorting", () => {
  it.each([
    [0, 350, "Basis"],
    [499, 350, "Basis"],
    [500, 325, "Groei"],
    [2_000, 300, "Volume"],
    [10_000, 275, "Enterprise"],
    [50_000, 250, "Mega"],
    [1_000_000, 250, "Mega"],
  ])("%i uur deze maand → %i cent per uur (%s)", (hours, cents, name) => {
    expect(feePerHourFor(hours)).toBe(cents);
    expect(tierFor(hours).tier.name).toBe(name);
  });

  it("points at the next tier", () => {
    expect(tierFor(600).next?.name).toBe("Volume");
    expect(tierFor(60_000).next).toBeNull();
  });
});
