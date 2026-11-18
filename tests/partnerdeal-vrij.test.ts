import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// De gratis maand van de Partnerdeal (18 nov 2026): 30 dagen geen platformkosten, vanzelf voorbij, één keer per bedrijf.

const kv = new Map<string, unknown>();
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSetIfAbsent: async (k: string, v: unknown) => (kv.has(k) ? false : (kv.set(k, v), true)),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
const audit = vi.fn(async (_: unknown) => undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (x: unknown) => audit(x) }));

import { PARTNERDEAL_DAGEN, PARTNERDEAL_FEE_REDEN, geefPartnerdeal, lijstPartnerdeal, partnerdealZonderFee } from "@/lib/billing/partnerdeal-vrij";

const door = { userId: "u1", naam: "Beheerder" };
const bron = (pad: string) => readFileSync(join(process.cwd(), pad), "utf8");

beforeEach(() => {
  kv.clear();
  audit.mockClear();
});

describe("de gratis maand", () => {
  it("geldt 30 dagen vanaf de Amsterdamse dag waarop hij is gegeven, en stopt daarna vanzelf", async () => {
    // 18 nov 2026, 23:30 in Nederland (22:30 UTC): de eerste dag is 18 nov
    const r = await geefPartnerdeal({ tenantId: "t1", bedrijf: "Café De Proef", door, nu: new Date("2026-11-18T23:30:00+01:00") });
    expect(r.nieuw).toBe(true);
    expect(r.deal).toMatchObject({ gratisVanaf: "2026-11-18", gratisTot: "2026-12-18" });
    expect(PARTNERDEAL_DAGEN).toBe(30);
    expect(await partnerdealZonderFee("t1", new Date("2026-11-18T08:00:00+01:00"))).toBe(true);
    expect(await partnerdealZonderFee("t1", new Date("2026-12-17T23:59:00+01:00"))).toBe(true);
    // de dag erna en de dag ervoor: gewone platformkosten
    expect(await partnerdealZonderFee("t1", new Date("2026-12-18T00:30:00+01:00"))).toBe(false);
    expect(await partnerdealZonderFee("t1", new Date("2026-11-17T20:00:00+01:00"))).toBe(false);
    // een ander bedrijf merkt er niets van
    expect(await partnerdealZonderFee("t2", new Date("2026-11-20T08:00:00+01:00"))).toBe(false);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("wordt één keer gegeven: een tweede keer verlengt niets", async () => {
    await geefPartnerdeal({ tenantId: "t1", bedrijf: "Café De Proef", door, nu: new Date("2026-11-18T10:00:00+01:00") });
    const tweede = await geefPartnerdeal({ tenantId: "t1", bedrijf: "Café De Proef", door, nu: new Date("2026-12-10T10:00:00+01:00") });
    expect(tweede.nieuw).toBe(false);
    expect(tweede.deal.gratisTot).toBe("2026-12-18");
    expect(await partnerdealZonderFee("t1", new Date("2026-12-20T10:00:00+01:00"))).toBe(false);
    expect(audit).toHaveBeenCalledTimes(1);
    expect((await lijstPartnerdeal()).map((d) => d.tenantId)).toEqual(["t1"]);
  });

  it("laat een goedkeuring nooit hangen: een kapotte rij of een storing geeft gewone platformkosten", async () => {
    kv.set("partnerdeal-vrij:t3", { gratisVanaf: "onzin", gratisTot: 12 });
    expect(await partnerdealZonderFee("t3", new Date("2026-11-20T08:00:00+01:00"))).toBe(false);
    expect(await partnerdealZonderFee("bestaat-niet", new Date("2026-11-20T08:00:00+01:00"))).toBe(false);
  });

  it("haakt in op het goedkeuren van uren, met de reden op de factuurregel, en het beheer is alleen voor de platformbeheerder", () => {
    const s = bron("lib/timesheets/approve.ts");
    expect(s).toContain("const partnerdealVrij = !freeFee && !introductieVrij && (await partnerdealZonderFee(ts.branch.tenantId, ts.scheduledStart));");
    expect(s).toContain("...(partnerdealVrij ? { platformFeeReden: PARTNERDEAL_FEE_REDEN } : {}),");
    expect(PARTNERDEAL_FEE_REDEN).toContain("30 dagen");
    expect(bron("app/api/admin/partnerdeal/route.ts").match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)).toHaveLength(2);
  });
});
