import { beforeEach, describe, expect, it, vi } from "vitest";

// De Bijwerken-ronde via de cron (18 nov 2026, lib/shop/cj/bijwerken-ronde.ts): verder vanaf de cursor, aan het eind
// weer bij 0, een slot tegen twee rondes tegelijk, en de auditregel krijgt "system:cj" als actor.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
  kvSetIfAbsent: vi.fn(async (k: string, v: unknown) => (kv.has(k) ? false : (kv.set(k, v), true))),
  kvDelete: vi.fn(async (k: string) => void kv.delete(k)),
  kvVerwijderAlsVeld: vi.fn(async (k: string, veld: string, waarde: string) => {
    const cur = kv.get(k) as Record<string, unknown> | undefined;
    if (cur && cur[veld] === waarde) kv.delete(k);
    return true;
  }),
}));
const bijwerkenVanCj = vi.fn();
vi.mock("@/lib/shop/cj/importeer", () => ({ bijwerkenVanCj: (...a: unknown[]) => bijwerkenVanCj(...a) }));

import { leesBijwerkStand, rondeBijwerken, RONDE_BUDGET_MS } from "@/lib/shop/cj/bijwerken-ronde";

const uitkomst = (over: Partial<{ bekeken: number; volgende: number | null; totaal: number }>) => ({ bekeken: 30, categorie: 2, voorraad: 20, vertaald: 5, fouten: 0, achterstand: 0, volgende: 30, totaal: 475, ...over });

beforeEach(() => {
  kv.clear();
  bijwerkenVanCj.mockReset();
});

describe("Bijwerken-ronde via de cron", () => {
  it("begint bij 0, gaat de volgende keer verder bij `volgende` en begint na het eind weer bij 0", async () => {
    const t1 = new Date("2026-11-18T17:05:00Z");
    bijwerkenVanCj.mockResolvedValueOnce(uitkomst({}));
    const r1 = await rondeBijwerken({ now: t1 });
    expect(r1).toMatchObject({ status: "gedaan", vanaf: 0, bekeken: 30, volgende: 30 });
    expect(bijwerkenVanCj).toHaveBeenCalledWith({ actorUserId: null, actorLabel: "system:cj", vanaf: 0, budgetMs: RONDE_BUDGET_MS });
    expect(await leesBijwerkStand()).toEqual({ vanaf: 30, laatsteRondeOp: t1.toISOString(), laatsteVolledigOp: null, rondes: 1, totaal: 475 });

    const t2 = new Date("2026-11-18T17:15:00Z");
    bijwerkenVanCj.mockResolvedValueOnce(uitkomst({ bekeken: 445, volgende: null }));
    const r2 = await rondeBijwerken({ now: t2 });
    expect(r2).toMatchObject({ status: "gedaan", vanaf: 30, volgende: null });
    expect(bijwerkenVanCj.mock.calls[1]?.[0]).toMatchObject({ vanaf: 30 });
    expect(await leesBijwerkStand()).toEqual({ vanaf: 0, laatsteRondeOp: t2.toISOString(), laatsteVolledigOp: t2.toISOString(), rondes: 2, totaal: 475 });
    // het slot is weer vrij
    expect(kv.has("shop:cj:bijwerken:slot")).toBe(false);
  });

  it("zonder CJ-producten telt het niet als een volledige ronde", async () => {
    bijwerkenVanCj.mockResolvedValueOnce(uitkomst({ bekeken: 0, volgende: null, totaal: 0 }));
    await rondeBijwerken({ now: new Date("2026-11-18T17:05:00Z") });
    expect((await leesBijwerkStand()).laatsteVolledigOp).toBeNull();
  });

  it("een lopende ronde (vers slot) houdt de volgende tegen; een oud slot (vastgelopen) niet", async () => {
    kv.set("shop:cj:bijwerken:slot", { bezig: "2026-11-18T17:04:00Z" });
    const r = await rondeBijwerken({ now: new Date("2026-11-18T17:05:00Z") });
    expect(r.status).toBe("bezet");
    expect(bijwerkenVanCj).not.toHaveBeenCalled();

    kv.set("shop:cj:bijwerken:slot", { bezig: "2026-11-18T16:50:00Z" });
    bijwerkenVanCj.mockResolvedValueOnce(uitkomst({}));
    const r2 = await rondeBijwerken({ now: new Date("2026-11-18T17:05:00Z") });
    expect(r2.status).toBe("gedaan");
    expect(bijwerkenVanCj).toHaveBeenCalledTimes(1);
  });

  it("een fout in de ronde laat het slot niet achter", async () => {
    bijwerkenVanCj.mockRejectedValueOnce(new Error("CJ weg"));
    await expect(rondeBijwerken({ now: new Date("2026-11-18T17:05:00Z") })).rejects.toThrow("CJ weg");
    expect(kv.has("shop:cj:bijwerken:slot")).toBe(false);
    expect((await leesBijwerkStand()).vanaf).toBe(0);
  });
});
