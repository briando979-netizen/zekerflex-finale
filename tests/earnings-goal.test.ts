import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (store.has(k) ? store.get(k) : null),
  kvSet: async (k: string, v: unknown) => {
    store.set(k, v);
  },
  kvDelete: async (k: string) => {
    store.delete(k);
  },
}));

import { getEarningsGoal, setEarningsGoal } from "@/lib/dashboard/earnings-goal";
import { goalProgress } from "@/lib/dashboard/goal-progress";

afterEach(() => store.clear());

describe("verdiendoel", () => {
  it("slaat een doel op, valideert en wist het weer", async () => {
    expect(await getEarningsGoal("u1")).toBeNull();
    await setEarningsGoal("u1", 2_000_00);
    expect(await getEarningsGoal("u1")).toBe(2_000_00);
    await expect(setEarningsGoal("u1", 50_00)).rejects.toThrow(/tussen € 100 en € 50.000/);
    await expect(setEarningsGoal("u1", 99_999_00)).rejects.toThrow(/tussen/);
    await setEarningsGoal("u1", null);
    expect(await getEarningsGoal("u1")).toBeNull();
  });

  it("rekent de voortgang uit, gewerkt en gepland apart", () => {
    expect(goalProgress(2_000_00, 500_00, 1_500_00)).toEqual({ workedPct: 25, expectedPct: 75, remainingCents: 500_00, reached: false });
    expect(goalProgress(2_000_00, 2_100_00, 2_400_00)).toEqual({ workedPct: 100, expectedPct: 100, remainingCents: 0, reached: true });
  });
});
