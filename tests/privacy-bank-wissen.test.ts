import { afterEach, describe, expect, it, vi } from "vitest";

// De ZekerFlex-bankrekening van een gewiste gebruiker (lib/privacy/bank-wissen.ts): leeg = weg, met boekingen = naam en
// IBAN eruit en bevroren (bewaarplicht), en de nachtelijke opruiming vindt rekeningen van gewiste of verdwenen accounts.

const h = vi.hoisted(() => ({
  rekeningen: new Map<string, { id: string; userId: string | null; ownerType: string; balanceCents: number; holderName: string; payoutIban: string | null; payoutName: string | null; entries: number }>(),
  users: [] as { id: string; email: string }[],
  verwijderd: [] as string[],
  bijgewerkt: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: {
      findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
        const r = [...h.rekeningen.values()].find((x) => (where.id ? x.id === where.id : x.userId === where.userId));
        return r ? { ...r, _count: { entries: r.entries } } : null;
      },
      findMany: async () => [...h.rekeningen.values()].filter((r) => r.ownerType === "USER" && r.userId !== null),
      delete: async ({ where }: { where: { id: string } }) => {
        h.verwijderd.push(where.id);
        h.rekeningen.delete(where.id);
        return {};
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        h.bijgewerkt.push({ id: where.id, data });
        const r = h.rekeningen.get(where.id)!;
        h.rekeningen.set(where.id, { ...r, ...(data as object) } as typeof r);
        return {};
      },
    },
    user: { findMany: async () => h.users },
  },
}));

import { GEWIST_HOUDER, ruimWeesrekeningenOp, wisBankrekeningVan } from "@/lib/privacy/bank-wissen";

const zet = (id: string, userId: string | null, balanceCents: number, entries: number, holderName = "Jan Test") =>
  h.rekeningen.set(id, { id, userId, ownerType: "USER", balanceCents, holderName, payoutIban: "NL91ABNA0417164300", payoutName: holderName, entries });

afterEach(() => {
  h.rekeningen.clear();
  h.users = [];
  h.verwijderd.length = 0;
  h.bijgewerkt.length = 0;
});

describe("wisBankrekeningVan (bij het wissen van een account)", () => {
  it("een lege rekening gaat helemaal weg", async () => {
    zet("b1", "u1", 0, 0);
    expect(await wisBankrekeningVan("u1")).toBe("verwijderd");
    expect(h.verwijderd).toEqual(["b1"]);
  });

  it("met boekingen: naam, IBAN en uitbetaalnaam eruit, bevroren, de rekening blijft", async () => {
    zet("b2", "u2", 0, 3);
    expect(await wisBankrekeningVan("u2", new Date("2026-11-12T18:00:00+01:00"))).toBe("geanonimiseerd");
    expect(h.verwijderd).toEqual([]);
    expect(h.bijgewerkt[0]?.data).toMatchObject({ holderName: GEWIST_HOUDER, payoutIban: null, payoutName: null, frozenReason: "account gewist (AVG)" });
  });

  it("geen rekening: niets te doen; een tweede keer ook niet", async () => {
    expect(await wisBankrekeningVan("u-zonder")).toBe("geen");
    zet("b3", "u3", 500, 1);
    await wisBankrekeningVan("u3");
    expect(await wisBankrekeningVan("u3")).toBe("geen");
  });
});

describe("ruimWeesrekeningenOp (nachtelijke opruiming)", () => {
  it("telt droog alleen rekeningen van een gewist of verdwenen account met nog gegevens", async () => {
    zet("levend", "u-levend", 0, 0);
    zet("gewist", "u-gewist", 0, 0);
    zet("weg", "u-weg", 1200, 2);
    zet("al-schoon", "u-weg2", 1200, 2, GEWIST_HOUDER);
    h.rekeningen.set("al-schoon", { ...h.rekeningen.get("al-schoon")!, payoutIban: null, payoutName: null });
    h.users = [
      { id: "u-levend", email: "jan@example.test" },
      { id: "u-gewist", email: "verwijderd-u-gewist@verwijderd.zekerflex.invalid" },
    ];
    expect(await ruimWeesrekeningenOp({ dryRun: true })).toBe(2);
    expect(h.verwijderd).toEqual([]);
    expect(h.bijgewerkt).toEqual([]);
  });

  it("ruimt op: leeg weg, met boekingen geanonimiseerd, de levende rekening blijft", async () => {
    zet("levend", "u-levend", 0, 0);
    zet("gewist", "u-gewist", 0, 0);
    zet("weg", "u-weg", 1200, 2);
    h.users = [
      { id: "u-levend", email: "jan@example.test" },
      { id: "u-gewist", email: "verwijderd-u-gewist@verwijderd.zekerflex.invalid" },
    ];
    expect(await ruimWeesrekeningenOp({ dryRun: false })).toBe(2);
    expect(h.verwijderd).toEqual(["gewist"]);
    expect(h.bijgewerkt.map((b) => b.id)).toEqual(["weg"]);
    expect(h.rekeningen.has("levend")).toBe(true);
    // een tweede keer: niets meer
    expect(await ruimWeesrekeningenOp({ dryRun: true })).toBe(0);
  });
});
