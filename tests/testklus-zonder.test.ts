import { beforeEach, describe, expect, it, vi } from "vitest";

// Beheer telt alleen echte vraag (14 nov 2026): de "10 open klussen" in de triage waren testklussen van één testbedrijf, met een
// vestigingsnaam zonder "test". zonderTestklussen() geeft het Prisma-filter dat ze uit tellingen en lijsten weglaat.

const h = vi.hoisted(() => ({
  rijen: [] as { id: string; title: string; createdAt: Date; branch: { tenantId: string; tenant: { name: string } } }[],
  stuk: false,
  vragen: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findMany: async (args: unknown) => {
        h.vragen.push(args);
        if (h.stuk) throw new Error("database weg");
        return h.rijen;
      },
    },
  },
}));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));

import { zonderTestklussen } from "@/lib/shifts/testklus-db";

const rij = (id: string, title: string, bedrijf: string) => ({ id, title, createdAt: new Date("2026-11-12T10:00:00Z"), branch: { tenantId: `t-${bedrijf}`, tenant: { name: bedrijf } } });

beforeEach(() => {
  h.rijen = [];
  h.stuk = false;
  h.vragen = [];
});

describe("zonderTestklussen", () => {
  it("sluit de klussen van een testbedrijf uit, ook als de vestigingsnaam geen test noemt", async () => {
    h.rijen = [rij("s1", "Afwasser", "Test Horeca BV"), rij("s2", "Magazijnmedewerker", "Test bedrijven"), rij("s3", "Echt werk", "Café De Brug")];
    expect(await zonderTestklussen()).toEqual({ id: { notIn: ["s1", "s2"] } });
  });

  it("laat een echte klus er nooit in", async () => {
    h.rijen = [rij("s3", "Afwasser", "Café De Brug")];
    expect(await zonderTestklussen()).toEqual({});
  });

  it("geeft een leeg filter als er geen testklussen zijn", async () => {
    expect(await zonderTestklussen()).toEqual({});
  });

  it("een storing bij het opzoeken laat het filter leeg: de cijfers zijn dan te hoog, niet weg", async () => {
    h.stuk = true;
    expect(await zonderTestklussen()).toEqual({});
  });

  it("zoekt vanaf de gevraagde startdatum", async () => {
    const vanaf = new Date("2026-11-01T00:00:00Z");
    await zonderTestklussen(vanaf);
    expect(JSON.stringify(h.vragen[0])).toContain("2026-11-01T00:00:00.000Z");
  });

  it("het resultaat past direct in een where met een andere id-voorwaarde niet: de sleutel is id", async () => {
    h.rijen = [rij("s1", "x", "Test BV")];
    const f = await zonderTestklussen();
    expect(Object.keys(f)).toEqual(["id"]);
  });
});
