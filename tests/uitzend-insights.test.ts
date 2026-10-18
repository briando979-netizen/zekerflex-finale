import { describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/payroll/store", () => ({ listRuns: async () => [], getRun: async () => null }));
vi.mock("@/lib/env", () => ({ env: { UITZEND_MARKUP_RATE: 0.35 } }));

import { markupFor, phaseFor, setMarkup, signalsFor } from "@/lib/uitzendbureau/insights";

describe("ABU phases and signals", () => {
  it("maps worked weeks to phases", () => {
    expect(phaseFor(10)).toBe("A");
    expect(phaseFor(52)).toBe("A");
    expect(phaseFor(53)).toBe("B");
    expect(phaseFor(209)).toBe("C");
  });

  it("warns ahead of the phase B and C thresholds and the pension start", () => {
    const w = (weeksWorked: number) => signalsFor({ userId: "u", name: "Mo", weeksWorked });
    expect(w(49).some((s) => s.level === "warn" && s.text.includes("fase B"))).toBe(true);
    expect(w(206).some((s) => s.text.includes("fase C"))).toBe(true);
    expect(w(7).some((s) => s.text.includes("STIPP"))).toBe(true);
    expect(w(30)).toEqual([]);
  });
});

describe("markup per client", () => {
  it("falls back to the default, accepts an agreed rate and refuses nonsense", async () => {
    expect(await markupFor("t1")).toBe(0.35);
    await setMarkup("t1", 0.42);
    expect(await markupFor("t1")).toBe(0.42);
    await expect(setMarkup("t1", 3)).rejects.toThrow("tussen");
    await setMarkup("t1", null);
    expect(await markupFor("t1")).toBe(0.35);
  });
});
