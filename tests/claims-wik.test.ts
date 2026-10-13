import { describe, expect, it } from "vitest";
import { statutoryCollectionFeeCents } from "@/lib/claims/wik";

describe("statutoryCollectionFeeCents", () => {
  it("returns 0 for a non-positive principal", () => {
    expect(statutoryCollectionFeeCents(0)).toBe(0);
    expect(statutoryCollectionFeeCents(-500)).toBe(0);
  });

  it("applies the statutory minimum of €40 for small amounts", () => {
    // 15% of €50 would be €7,50 — the €40 floor applies instead.
    expect(statutoryCollectionFeeCents(50_00)).toBe(40_00);
  });

  it("charges 15% once above the minimum threshold", () => {
    // €300 * 15% = €45, above the €40 floor.
    expect(statutoryCollectionFeeCents(300_00)).toBe(45_00);
  });

  it("blends brackets correctly just past the first threshold", () => {
    // €2.600 = €2.500 * 15% (€375) + €100 * 10% (€10) = €385
    expect(statutoryCollectionFeeCents(2_600_00)).toBe(385_00);
  });

  it("never exceeds the statutory cap of €6.775", () => {
    expect(statutoryCollectionFeeCents(1_000_000_00)).toBe(6_775_00);
  });
});
