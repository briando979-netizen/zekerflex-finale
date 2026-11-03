import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// De referentie van een uitzendovereenkomst draagt het jaar. Op 1 januari net na
// middernacht staat de UTC-server nog in het oude jaar; het Nederlandse jaar telt.

const h = vi.hoisted(() => ({ store: new Map<string, unknown[]>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.store.get(k) ?? null,
  kvAppend: async (k: string, v: unknown) => void h.store.set(k, [...(h.store.get(k) ?? []), v]),
}));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ bsnLast4: "1234" }) }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: async () => null }));

import { signUitzendContract } from "@/lib/agreements/uitzend-contract";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC"; // zoals de server
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});
afterEach(() => {
  vi.useRealTimers();
  h.store.clear();
});

describe("uitzendovereenkomst — jaar in de referentie", () => {
  it("gebruikt op 1 januari 00:30 Nederlandse tijd het nieuwe jaar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z")); // = 1 jan 2027 00:30 in Nederland
    const { contract } = await signUitzendContract("user_abc123", "Test Werker");
    expect(contract.reference).toMatch(/^ZF-UZO-2027-001-/);
  });
});
