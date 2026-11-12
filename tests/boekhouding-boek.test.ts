import { beforeEach, describe, expect, it, vi } from "vitest";

// Een kleine nep-database in het geheugen met precies de delegates die lib/boekhouding gebruikt. $transaction maakt een
// momentopname en zet die terug als de functie gooit (zoals een echte rollback, ook van de boekstuk-teller).
type Rij = Record<string, any>;
const m = vi.hoisted(() => {
  const state = {
    adm: new Map<string, Rij>(),
    rek: new Map<string, Rij>(),
    btw: new Map<string, Rij>(),
    boekingen: new Map<string, Rij>(),
    periodes: new Map<string, Rij>(),
    tellers: new Map<string, number>(),
    n: 0,
    log: [] as string[],
    verbergBestaandeInTx: false,
  };
  const volgende = (p: string) => `${p}${(state.n += 1)}`;

  const delegates = (inTx: boolean) => ({
    boekAdministratie: {
      findUnique: async ({ where }: Rij) => state.adm.get(where.id) ?? null,
      create: async ({ data }: Rij) => {
        const rij = { id: volgende("nieuw"), actief: true, ...data };
        state.adm.set(rij.id, rij);
        state.log.push("administratie.create");
        return { id: rij.id };
      },
      delete: async ({ where }: Rij) => {
        state.adm.delete(where.id);
        state.log.push("BoekAdministratie");
      },
    },
    boekBoeking: {
      findUnique: async ({ where }: Rij) => {
        const alle = [...state.boekingen.values()];
        if (where.administratieId_bron_bronId) {
          if (inTx && state.verbergBestaandeInTx) return null;
          const k = where.administratieId_bron_bronId;
          return alle.find((b) => b.administratieId === k.administratieId && b.bron === k.bron && b.bronId === k.bronId) ?? null;
        }
        if (where.keertBoekingId) return alle.find((b) => b.keertBoekingId === where.keertBoekingId) ?? null;
        const b = state.boekingen.get(where.id);
        if (!b) return null;
        return { ...b, administratie: { valuta: state.adm.get(b.administratieId)?.valuta } };
      },
      create: async ({ data }: Rij) => {
        const dubbel = [...state.boekingen.values()].some(
          (b) => b.administratieId === data.administratieId && b.bron === data.bron && b.bronId === data.bronId,
        );
        if (dubbel) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        const { regels, ...rest } = data;
        const rij = { id: volgende("bk"), keertBoekingId: null, ...rest, regels: regels.create.map((r: Rij) => ({ omschrijving: null, btwCodeId: null, btwBasisCents: null, postSleutel: null, origineleValuta: null, origineelCents: null, koersMicro: null, ...r })) };
        state.boekingen.set(rij.id, rij);
        return { id: rij.id, boekstuk: rij.boekstuk };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    boekPeriode: {
      findUnique: async ({ where }: Rij) => {
        const k = where.administratieId_jaar_maand;
        return state.periodes.get(`${k.administratieId}|${k.jaar}|${k.maand}`) ?? null;
      },
    },
    boekRekening: {
      findMany: async ({ where }: Rij) => {
        const alle = [...state.rek.values()].filter((r) => r.administratieId === where.administratieId);
        return where.id ? alle.filter((r) => where.id.in.includes(r.id)) : alle;
      },
      create: async ({ data }: Rij) => {
        const rij = { id: volgende("rek"), actief: true, ...data };
        state.rek.set(rij.id, rij);
        return { id: rij.id };
      },
    },
    boekBtwCode: {
      count: async ({ where }: Rij) => [...state.btw.values()].filter((c) => c.administratieId === where.administratieId && where.id.in.includes(c.id)).length,
      createMany: async ({ data }: Rij) => {
        for (const c of data) state.btw.set(volgende("btw"), { ...c });
        return { count: data.length };
      },
    },
    boekVolgnummer: {
      upsert: async ({ where }: Rij) => {
        const k = where.administratieId_dagboek_jaar;
        const sleutel = `${k.administratieId}|${k.dagboek}|${k.jaar}`;
        const nieuw = (state.tellers.get(sleutel) ?? 0) + 1;
        state.tellers.set(sleutel, nieuw);
        return { lastValue: nieuw };
      },
    },
  });

  const prisma = {
    ...delegates(false),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const foto = structuredClone({ adm: state.adm, rek: state.rek, btw: state.btw, boekingen: state.boekingen, periodes: state.periodes, tellers: state.tellers });
      try {
        return await fn(delegates(true));
      } catch (e) {
        state.adm = foto.adm;
        state.rek = foto.rek;
        state.btw = foto.btw;
        state.boekingen = foto.boekingen;
        state.periodes = foto.periodes;
        state.tellers = foto.tellers;
        throw e;
      }
    },
  };
  return { state, prisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));

import { AppError } from "@/lib/errors";
import { maakAdministratie } from "@/lib/boekhouding/administratie";
import { boek, keerOm } from "@/lib/boekhouding/boek";
import { BASIS_BTW_CODES, BASIS_REKENINGSCHEMA } from "@/lib/boekhouding/rgs-schema";
import type { BoekInvoer } from "@/lib/boekhouding/types";

function zaai(valuta = "EUR") {
  m.state.adm.set("adm1", { id: "adm1", valuta, actief: true, soort: "ECHT" });
  m.state.rek.set("r1", { id: "r1", administratieId: "adm1", nummer: "1200", boekbaar: true, actief: true });
  m.state.rek.set("r2", { id: "r2", administratieId: "adm1", nummer: "8000", boekbaar: true, actief: true });
  m.state.rek.set("r3", { id: "r3", administratieId: "adm1", nummer: "2300", boekbaar: true, actief: true });
  m.state.rek.set("kop", { id: "kop", administratieId: "adm1", nummer: "1", boekbaar: false, actief: true });
  m.state.rek.set("uit", { id: "uit", administratieId: "adm1", nummer: "9999", boekbaar: true, actief: false });
  m.state.rek.set("vreemd", { id: "vreemd", administratieId: "adm2", nummer: "1200", boekbaar: true, actief: true });
}

function factuur(over: Partial<BoekInvoer> = {}): BoekInvoer {
  return {
    administratieId: "adm1",
    dagboek: "VERKOOP",
    datum: "2026-04-10",
    bron: "FACTUUR",
    bronId: "inv1",
    omschrijving: "Factuur F-2026-0012",
    valuta: "EUR",
    regels: [
      { rekeningId: "r1", debetCents: 12100, postSleutel: "factuur:inv1" },
      { rekeningId: "r2", creditCents: 10000, btwBasisCents: 10000 },
      { rekeningId: "r3", creditCents: 2100, isBtwRegel: true },
    ],
    ...over,
  };
}

async function weigering(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error("er kwam geen fout");
}

beforeEach(() => {
  m.state.adm.clear();
  m.state.rek.clear();
  m.state.btw.clear();
  m.state.boekingen.clear();
  m.state.periodes.clear();
  m.state.tellers.clear();
  m.state.log.length = 0;
  m.state.n = 0;
  m.state.verbergBestaandeInTx = false;
  zaai();
});

describe("boek()", () => {
  it("schrijft een boeking met een boekstuknummer en genummerde regels", async () => {
    const r = await boek(factuur());
    expect(r).toMatchObject({ boekstuk: "VK-2026-000001", nieuw: true });
    const b = m.state.boekingen.get(r.boekingId)!;
    expect(b.datum.toISOString()).toBe("2026-04-10T00:00:00.000Z");
    expect(b.aangemaaktDoor).toBe("systeem");
    expect(b.regels.map((x: Rij) => x.volgorde)).toEqual([1, 2, 3]);
    expect(b.regels[0].postSleutel).toBe("factuur:inv1");
    expect(b.regels[2].isBtwRegel).toBe(true);
  });

  it("is idempotent: dezelfde (administratie, bron, bronId) geeft de bestaande boeking terug, zonder nieuw nummer", async () => {
    const eerste = await boek(factuur());
    const tweede = await boek(factuur());
    expect(tweede).toEqual({ boekingId: eerste.boekingId, boekstuk: eerste.boekstuk, nieuw: false });
    expect(m.state.boekingen.size).toBe(1);
    expect(m.state.tellers.get("adm1|VERKOOP|2026")).toBe(1);
  });

  it("geeft gapvrije nummers per dagboek en jaar", async () => {
    expect((await boek(factuur({ bronId: "a" }))).boekstuk).toBe("VK-2026-000001");
    expect((await boek(factuur({ bronId: "b" }))).boekstuk).toBe("VK-2026-000002");
    expect((await boek(factuur({ bronId: "c", datum: "2027-01-02" }))).boekstuk).toBe("VK-2027-000001");
    expect((await boek(factuur({ bronId: "d", dagboek: "INKOOP" }))).boekstuk).toBe("IK-2026-000001");
  });

  it("weigert een boeking die niet sluit, en schrijft dan niets (ook geen nummer)", async () => {
    const f = await weigering(boek(factuur({ regels: [{ rekeningId: "r1", debetCents: 12100 }, { rekeningId: "r2", creditCents: 12000 }] })));
    expect(f.status).toBe(422);
    expect(f.message).toContain("sluit niet");
    expect(m.state.boekingen.size).toBe(0);
    expect(m.state.tellers.size).toBe(0);
  });

  it("weigert een regel boven 2.000.000.000 cent", async () => {
    const f = await weigering(boek(factuur({ regels: [{ rekeningId: "r1", debetCents: 2_000_000_001 }, { rekeningId: "r2", creditCents: 2_000_000_001 }] })));
    expect(f.message).toContain("te groot");
  });

  it("weigert een andere valuta dan de administratie", async () => {
    zaai("USD");
    expect((await weigering(boek(factuur()))).message).toContain("USD");
  });

  it("weigert een onbekende of niet-actieve administratie", async () => {
    expect((await weigering(boek(factuur({ administratieId: "nergens" })))).status).toBe(404);
    m.state.adm.set("adm1", { id: "adm1", valuta: "EUR", actief: false, soort: "ECHT" });
    expect((await weigering(boek(factuur()))).message).toContain("niet actief");
  });

  it("weigert een rekening van een andere administratie, een kopje en een niet-actieve rekening", async () => {
    const met = (id: string) => factuur({ regels: [{ rekeningId: id, debetCents: 5 }, { rekeningId: "r2", creditCents: 5 }] });
    expect((await weigering(boek(met("vreemd")))).message).toContain("niet bij deze administratie");
    expect((await weigering(boek(met("kop")))).message).toContain("kopje");
    expect((await weigering(boek(met("uit")))).message).toContain("niet meer actief");
  });

  it("weigert een btw-code van een andere administratie", async () => {
    const f = await weigering(boek(factuur({ regels: [{ rekeningId: "r1", debetCents: 5, btwCodeId: "onbekend" }, { rekeningId: "r2", creditCents: 5 }] })));
    expect(f.message).toContain("btw-code");
  });

  it("weigert een boeking in een vergrendelde maand, maar niet in de maand erna", async () => {
    m.state.periodes.set("adm1|2026|3", { status: "VERGRENDELD" });
    const f = await weigering(boek(factuur({ datum: "2026-03-31", bronId: "x" })));
    expect(f.message).toContain("2026-03 is vergrendeld");
    await expect(boek(factuur({ datum: "2026-04-01", bronId: "y" }))).resolves.toMatchObject({ nieuw: true });
  });

  it("geeft een al bestaande boeking terug, ook als de maand intussen vergrendeld is", async () => {
    const eerste = await boek(factuur());
    m.state.periodes.set("adm1|2026|4", { status: "VERGRENDELD" });
    await expect(boek(factuur())).resolves.toMatchObject({ boekingId: eerste.boekingId, nieuw: false });
  });

  it("weigert persoonsgegevens in de omschrijving", async () => {
    expect((await weigering(boek(factuur({ omschrijving: "Factuur van jan@voorbeeld.nl" })))).message).toContain("persoonsgegevens");
    expect(m.state.boekingen.size).toBe(0);
  });

  it("vangt een gelijktijdige dubbele aanroep op: de ander was eerst, onze teller rolt terug", async () => {
    const eerste = await boek(factuur());
    m.state.verbergBestaandeInTx = true; // onze transactie ziet de boeking van de ander nog niet
    const tweede = await boek(factuur());
    expect(tweede).toEqual({ boekingId: eerste.boekingId, boekstuk: eerste.boekstuk, nieuw: false });
    expect(m.state.tellers.get("adm1|VERKOOP|2026")).toBe(1);
    expect(m.state.boekingen.size).toBe(1);
  });
});

describe("keerOm()", () => {
  it("maakt een tegenboeking met omgewisselde regels en dezelfde postsleutel", async () => {
    const orig = await boek(factuur());
    const r = await keerOm(orig.boekingId, "Factuur ingetrokken", { datum: "2026-04-12" });
    expect(r).toMatchObject({ nieuw: true, boekstuk: "VK-2026-000002" });
    const t = m.state.boekingen.get(r.boekingId)!;
    expect(t.bron).toBe("TEGENBOEKING");
    expect(t.bronId).toBe(`terug:${orig.boekingId}`);
    expect(t.keertBoekingId).toBe(orig.boekingId);
    expect(t.reden).toBe("Factuur ingetrokken");
    expect(t.omschrijving).toBe("Tegenboeking VK-2026-000001");
    expect(t.regels.map((x: Rij) => [x.rekeningId, x.debetCents, x.creditCents])).toEqual([
      ["r1", 0, 12100],
      ["r2", 10000, 0],
      ["r3", 2100, 0],
    ]);
    expect(t.regels[0].postSleutel).toBe("factuur:inv1");
    expect(t.regels[2].isBtwRegel).toBe(true);
    // de oorspronkelijke boeking is ongemoeid
    expect(m.state.boekingen.get(orig.boekingId)!.regels[0].debetCents).toBe(12100);
  });

  it("is idempotent: een boeking kan maar een keer worden opgeheven", async () => {
    const orig = await boek(factuur());
    const een = await keerOm(orig.boekingId, "Fout");
    const twee = await keerOm(orig.boekingId, "Fout");
    expect(twee).toEqual({ boekingId: een.boekingId, boekstuk: een.boekstuk, nieuw: false });
    expect(m.state.boekingen.size).toBe(2);
  });

  it("keert een tegenboeking niet om", async () => {
    const orig = await boek(factuur());
    const tegen = await keerOm(orig.boekingId, "Fout");
    expect((await weigering(keerOm(tegen.boekingId, "Toch niet"))).message).toContain("zelf een tegenboeking");
  });

  it("eist een reden zonder persoonsgegevens en een bestaande boeking", async () => {
    const orig = await boek(factuur());
    expect((await weigering(keerOm(orig.boekingId, "  "))).message).toContain("reden");
    expect((await weigering(keerOm(orig.boekingId, "mail jan@voorbeeld.nl"))).message).toContain("persoonsgegevens");
    expect((await weigering(keerOm("bestaatniet", "Fout"))).status).toBe(404);
  });

  it("boekt standaard op de Amsterdamse dag van 'nu' en weigert een vergrendelde maand", async () => {
    const orig = await boek(factuur());
    // 2026-04-30 22:30 UTC is in Amsterdam al 1 mei (zomertijd)
    const r = await keerOm(orig.boekingId, "Fout", { now: new Date("2026-04-30T22:30:00Z") });
    expect(m.state.boekingen.get(r.boekingId)!.datum.toISOString()).toBe("2026-05-01T00:00:00.000Z");

    const orig2 = await boek(factuur({ bronId: "inv2" }));
    m.state.periodes.set("adm1|2026|6", { status: "VERGRENDELD" });
    expect((await weigering(keerOm(orig2.boekingId, "Fout", { datum: "2026-06-10" }))).message).toContain("vergrendeld");
  });
});

describe("maakAdministratie()", () => {
  it("maakt een administratie en zaait rekeningschema en btw-codes, met een kopje als ouder", async () => {
    const r = await maakAdministratie({ naam: "Zekerflex, Inc.", soort: "ECHT", valuta: "USD", land: "US" });
    expect(r).toMatchObject({ soort: "ECHT", rekeningen: BASIS_REKENINGSCHEMA.length, btwCodes: BASIS_BTW_CODES.length });
    const adm = m.state.adm.get(r.id)!;
    expect(adm).toMatchObject({ naam: "Zekerflex, Inc.", juridischeNaam: "Zekerflex, Inc.", land: "US", valuta: "USD", soort: "ECHT" });
    const bank = [...m.state.rek.values()].find((x) => x.administratieId === r.id && x.nummer === "1100")!;
    const kop = m.state.rek.get(bank.parentId)!;
    expect(kop.boekbaar).toBe(false);
    expect(bank.rgsCode).toBeUndefined();
  });

  it("maakt standaard een ECHTE administratie in EUR en kan een TEST maken", async () => {
    const echt = await maakAdministratie({ naam: "Boeken" });
    expect(m.state.adm.get(echt.id)).toMatchObject({ soort: "ECHT", valuta: "EUR", land: "NL" });
    const test = await maakAdministratie({ naam: "Proef", soort: "TEST" });
    expect(m.state.adm.get(test.id)).toMatchObject({ soort: "TEST" });
  });

  it("zaait dubbel niet: een tweede keer voegt niets toe", async () => {
    const r = await maakAdministratie({ naam: "Boeken" });
    const { importeerRekeningschema } = await import("@/lib/boekhouding/rgs-import");
    const tx = { boekRekening: m.prisma.boekRekening } as never;
    expect(await importeerRekeningschema(tx, r.id)).toBe(0);
  });

  it("weigert een ongeldige naam, valuta, land of soort", async () => {
    expect((await weigering(maakAdministratie({ naam: "  " }))).status).toBe(422);
    expect((await weigering(maakAdministratie({ naam: "x", valuta: "euro" }))).message).toContain("valuta");
    expect((await weigering(maakAdministratie({ naam: "x", land: "Nederland" }))).message).toContain("land");
    expect((await weigering(maakAdministratie({ naam: "x", soort: "DEMO" as never }))).message).toContain("ECHT of TEST");
  });
});
