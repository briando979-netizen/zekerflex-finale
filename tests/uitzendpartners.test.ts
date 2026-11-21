import { beforeEach, describe, expect, it, vi } from "vitest";

// Uitzendpartners (21 nov 2026, eigenaar): een uitzendbureau met een bedrijfsaccount, in het beheer gemarkeerd. Bij zijn
// klussen is het bureau de werkgever; ZekerFlex rekent alleen de platformvergoeding. De set staat in KV systeem:uitzendpartners.

const kv = vi.hoisted(() => new Map<string, unknown>());
const audit = vi.hoisted(() => [] as { action: string; targetId?: string }[]);
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; targetId?: string }) => void audit.push(a) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { isUitzendPartner, leesUitzendPartnersWaarde, schakelUitzendPartner } from "@/lib/uitzend/partners-kern";
import { isUitzendPartnerTenant, leesUitzendPartners, UITZENDPARTNERS_SLEUTEL, zetUitzendPartner } from "@/lib/uitzend/partners";

const NU = new Date("2026-11-21T04:30:00+01:00");

beforeEach(() => {
  kv.clear();
  audit.length = 0;
  (globalThis as { __zfUitzendPartners?: unknown }).__zfUitzendPartners = undefined;
});

describe("uitzendpartners (puur)", () => {
  it("aan houdt de oude datum, uit haalt het bedrijf eruit", () => {
    const a = schakelUitzendPartner({}, "t1", true, NU);
    expect(a).toEqual({ t1: NU.toISOString() });
    expect(schakelUitzendPartner(a, "t1", true, new Date("2027-01-01T00:00:00Z")).t1).toBe(NU.toISOString());
    expect(schakelUitzendPartner(a, "t1", false, NU)).toEqual({});
  });

  it("een rare waarde uit KV wordt een schone set; constructor telt niet als partner", () => {
    expect(leesUitzendPartnersWaarde(null)).toEqual({});
    expect(leesUitzendPartnersWaarde(["t1"])).toEqual({});
    expect(leesUitzendPartnersWaarde({ t1: "2026-11-21T00:00:00Z", t2: "onzin", t3: 5, "": "2026-11-21T00:00:00Z" })).toEqual({ t1: "2026-11-21T00:00:00Z" });
    expect(isUitzendPartner({ t1: "x" }, "t1")).toBe(true);
    expect(isUitzendPartner({ t1: "x" }, "constructor")).toBe(false);
    expect(isUitzendPartner({}, null)).toBe(false);
  });
});

describe("uitzendpartners (KV)", () => {
  it("schakelen schrijft de set, wist de cache en zet een regel in de audit", async () => {
    expect(await isUitzendPartnerTenant("t1")).toBe(false);
    await zetUitzendPartner("t1", true, { userId: "admin" }, NU);
    expect(kv.get(UITZENDPARTNERS_SLEUTEL)).toEqual({ t1: NU.toISOString() });
    expect(await isUitzendPartnerTenant("t1")).toBe(true);
    expect(audit.map((a) => a.action)).toEqual(["uitzendpartner.aan"]);
    await zetUitzendPartner("t1", false, { userId: "admin" }, NU);
    expect(await leesUitzendPartners()).toEqual({});
    expect(audit.map((a) => a.action)).toEqual(["uitzendpartner.aan", "uitzendpartner.uit"]);
  });
});
