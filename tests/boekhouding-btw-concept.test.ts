import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Rij = Record<string, any>;
const m = vi.hoisted(() => ({
  admin: { id: "adminAAAAAA1", btwPlichtig: true } as Rij | null,
  perioden: [] as Rij[],
  aangiftes: [] as Rij[],
  regels: [] as Rij[],
  rekeningRegels: [] as Rij[],
  bonBoekingen: [] as Rij[],
  bonnen: [] as Rij[],
  n: 0,
  dubbelBijCreate: 0,
}));

vi.mock("@/lib/boekhouding/lezen", () => ({ bonnenZonderBoeking: async () => m.bonnen }));
vi.mock("@/lib/prisma", () => {
  const metPeriode = (a: Rij) => ({ ...a, periode: m.perioden.find((p) => p.id === a.periodeId) });
  const db: Rij = {
    boekAdministratie: { findUnique: async () => m.admin },
    boekRegel: {
      findMany: async ({ where }: Rij) => (where.rekening?.nummer ? m.rekeningRegels : m.regels),
    },
    boekBon: { findMany: async () => m.bonBoekingen },
    boekBtwPeriode: {
      upsert: async ({ create }: Rij) => {
        let p = m.perioden.find((x) => x.administratieId === create.administratieId && x.jaar === create.jaar && x.kwartaal === create.kwartaal);
        if (!p) {
          p = { id: `per${m.perioden.length + 1}`, ...create };
          m.perioden.push(p);
        }
        return { id: p.id };
      },
      findUnique: async ({ where }: Rij) => {
        const k = where.administratieId_jaar_kwartaal;
        const p = m.perioden.find((x) => x.administratieId === k.administratieId && x.jaar === k.jaar && x.kwartaal === k.kwartaal);
        return p ? { id: p.id } : null;
      },
    },
    boekBtwAangifte: {
      findFirst: async ({ where }: Rij) => {
        const lijst = m.aangiftes.filter((a) => a.periodeId === where.periodeId).sort((a, b) => b.versie - a.versie);
        return lijst[0] ? metPeriode(lijst[0]) : null;
      },
      count: async ({ where }: Rij) => m.aangiftes.filter((a) => a.periodeId === where.periodeId).length,
      findUnique: async ({ where }: Rij) => {
        const a = m.aangiftes.find((x) => x.id === where.id);
        return a ? metPeriode(a) : null;
      },
      updateMany: async ({ where, data }: Rij) => {
        let count = 0;
        for (const a of m.aangiftes) {
          const statusOk = where.status === undefined || (typeof where.status === "string" ? a.status === where.status : where.status.in.includes(a.status));
          const idOk = where.id === undefined || a.id === where.id;
          const periodeOk = where.periodeId === undefined || a.periodeId === where.periodeId;
          if (statusOk && idOk && periodeOk) {
            Object.assign(a, data);
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }: Rij) => {
        if (m.dubbelBijCreate > 0) {
          m.dubbelBijCreate -= 1;
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const rij = { id: `aang${(m.n += 1)}`, goedgekeurdOp: null, ingediendOp: null, indieningReferentie: null, ...data };
        m.aangiftes.push(rij);
        return metPeriode(rij);
      },
    },
    $transaction: async (cb: (tx: Rij) => Promise<unknown>) => cb(db),
  };
  return { prisma: db };
});

const { maakBtwConcept, markeerIngediend, markeerKlaarVoorIndienen, leesBtwConcept, btwConceptOpId, snapshotHash } = await import("@/lib/boekhouding/btw/concept");

const NU = new Date("2026-04-10T10:00:00+02:00");
const ADMIN = "adminAAAAAA1";

const code21 = { code: "NL21-V", richting: "VERKOOP", tariefBasispunten: 2100, grondslagRubriek: "1a", btwRubriek: "1a" };
const nette = () => [
  { boekingId: "b1", debetCents: 0, creditCents: 10000, isBtwRegel: false, btwBasisCents: 10000, rekening: { soort: "OMZET" }, btwCode: code21 },
  { boekingId: "b1", debetCents: 0, creditCents: 2100, isBtwRegel: true, btwBasisCents: null, rekening: { soort: "PASSIVA" }, btwCode: code21 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  m.admin = { id: ADMIN, btwPlichtig: true };
  m.perioden = [];
  m.aangiftes = [];
  m.regels = nette();
  m.rekeningRegels = [{ debetCents: 0, creditCents: 2100 }];
  m.bonBoekingen = [];
  m.bonnen = [];
  m.n = 0;
  m.dubbelBijCreate = 0;
});
afterEach(() => vi.useRealTimers());

describe("maakBtwConcept", () => {
  it("bewaart een concept met status BEREKEND, de rubrieken, het saldo, de deadline en een hash", async () => {
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    expect(c).toMatchObject({ jaar: 2026, kwartaal: 1, versie: 1, status: "BEREKEND", statusTekst: "Concept", saldoCents: 2100, deadline: "2026-04-30" });
    expect(c.inhoud.rubrieken.find((r) => r.rubriek === "1a")).toMatchObject({ grondslagEuro: 100, btwCents: 2100 });
    expect(c.inhoud.meldingen).toEqual([]);
    const opgeslagen = m.aangiftes[0] as Rij;
    expect(opgeslagen.totaalTeBetalenCents).toBe(2100);
    expect(opgeslagen.snapshotHash).toBe(snapshotHash(c.inhoud));
    expect(opgeslagen.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.perioden[0]).toMatchObject({ vanaf: new Date("2026-01-01T00:00:00.000Z"), totEnMet: new Date("2026-03-31T00:00:00.000Z") });
  });

  it("een nieuw concept is een nieuwe versie en vervangt de vorige die nog niet is ingediend", async () => {
    await maakBtwConcept(ADMIN, 2026, 1, NU);
    const tweede = await maakBtwConcept(ADMIN, 2026, 1, NU);
    expect(tweede.versie).toBe(2);
    expect(m.aangiftes.map((a) => a.status)).toEqual(["VERVANGEN", "BEREKEND"]);
    expect(m.perioden).toHaveLength(1);
  });

  it("een ingediende versie blijft staan als er een nieuwe wordt gemaakt", async () => {
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    await markeerKlaarVoorIndienen(c.id, "u1");
    await markeerIngediend(c.id, { ingediendOp: "2026-04-09", referentie: "ONTV-123" }, NU);
    await maakBtwConcept(ADMIN, 2026, 1, NU);
    expect(m.aangiftes.map((a) => a.status)).toEqual(["INGEDIEND", "BEREKEND"]);
  });

  it("probeert het opnieuw als twee mensen tegelijk een versie maken", async () => {
    m.dubbelBijCreate = 1;
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    expect(c.versie).toBe(1);
  });

  it("geeft een Nederlandse fout bij een onbekende administratie en een ongeldig kwartaal", async () => {
    m.admin = null;
    await expect(maakBtwConcept("nietbestaand1", 2026, 1, NU)).rejects.toThrow("Deze administratie bestaat niet.");
    m.admin = { id: ADMIN, btwPlichtig: true };
    await expect(maakBtwConcept(ADMIN, 2026, 5, NU)).rejects.toThrow("Een kwartaal is 1, 2, 3 of 4.");
    await expect(maakBtwConcept(ADMIN, 1999, 1, NU)).rejects.toThrow("geen geldig jaar");
  });

  it("neemt afwijkingen op als meldingen: rekeningen wijken af en een bon wacht", async () => {
    m.rekeningRegels = [{ debetCents: 0, creditCents: 1000 }];
    m.bonnen = [{ id: "bon1", status: "EVEN_KIJKEN", geuploadOp: "2026-02-02" }];
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    expect(c.inhoud.meldingen.map((x) => x.code)).toEqual(expect.arrayContaining(["BTW_WIJKT_AF_VAN_REKENINGEN", "EVEN_KIJKEN_OPEN"]));
  });

  it("de momentopname bevat geen persoonsgegevens: alleen bedragen, id's en vaste teksten", async () => {
    m.bonnen = [{ id: "bon1", status: "GELEZEN", geuploadOp: "2026-02-02", leverancier: "Jansen BV", evenKijkenReden: "Jan Jansen" }];
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    expect(JSON.stringify(c.inhoud)).not.toMatch(/Jansen/);
  });
});

describe("markeerKlaarVoorIndienen en markeerIngediend", () => {
  it("zonder blokkades gaat een concept naar GOEDGEKEURD (klaar om in te dienen) met wie en wanneer", async () => {
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    const uit = await markeerKlaarVoorIndienen(c.id, "user-1");
    expect(uit).toMatchObject({ overschreven: false, concept: { status: "GOEDGEKEURD", statusTekst: "Klaar om in te dienen" } });
    expect(m.aangiftes[0]).toMatchObject({ goedgekeurdDoor: "user-1" });
    expect(m.aangiftes[0]?.goedgekeurdOp).toEqual(NU);
  });

  it("met een blokkerende melding is een reden van minstens 10 tekens nodig", async () => {
    m.rekeningRegels = [{ debetCents: 0, creditCents: 1000 }];
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    await expect(markeerKlaarVoorIndienen(c.id, "u1")).rejects.toThrow(/eerst opgelost moeten worden/);
    await expect(markeerKlaarVoorIndienen(c.id, "u1", "te kort")).rejects.toThrow(/minstens 10 tekens/);
    expect(m.aangiftes[0]?.status).toBe("BEREKEND");
    const uit = await markeerKlaarVoorIndienen(c.id, "u1", "  Accountant heeft het verschil bevestigd  ");
    expect(uit.overschreven).toBe(true);
    expect(uit.reden).toBe("Accountant heeft het verschil bevestigd");
    expect(uit.concept.status).toBe("GOEDGEKEURD");
  });

  it("een vervangen, al klaar of al ingediend concept kan niet opnieuw klaar worden gezet", async () => {
    const eerste = await maakBtwConcept(ADMIN, 2026, 1, NU);
    const tweede = await maakBtwConcept(ADMIN, 2026, 1, NU);
    await expect(markeerKlaarVoorIndienen(eerste.id, "u1")).rejects.toThrow("nieuwere versie");
    await markeerKlaarVoorIndienen(tweede.id, "u1");
    await expect(markeerKlaarVoorIndienen(tweede.id, "u1")).rejects.toThrow("staat al klaar");
    await markeerIngediend(tweede.id, { ingediendOp: "2026-04-10", referentie: "REF-1" }, NU);
    await expect(markeerKlaarVoorIndienen(tweede.id, "u1")).rejects.toThrow("al ingediend");
  });

  it("ingediend markeren kan alleen vanuit klaar, met geldige dag en referentie, en alleen eenmaal", async () => {
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    await expect(markeerIngediend(c.id, { ingediendOp: "2026-04-10", referentie: "REF-1" }, NU)).rejects.toThrow(/eerst op 'klaar om in te dienen'/);
    await markeerKlaarVoorIndienen(c.id, "u1");
    await expect(markeerIngediend(c.id, { ingediendOp: "10-04-2026", referentie: "REF-1" }, NU)).rejects.toThrow("geen geldige dag");
    await expect(markeerIngediend(c.id, { ingediendOp: "2026-04-11", referentie: "REF-1" }, NU)).rejects.toThrow("in de toekomst");
    await expect(markeerIngediend(c.id, { ingediendOp: "2026-04-10", referentie: " a " }, NU)).rejects.toThrow("minstens 3 tekens");
    const ingediend = await markeerIngediend(c.id, { ingediendOp: "2026-04-09", referentie: " ONTV-777 " }, NU);
    expect(ingediend).toMatchObject({ status: "INGEDIEND", ingediendOp: "2026-04-09", indieningReferentie: "ONTV-777" });
    await expect(markeerIngediend(c.id, { ingediendOp: "2026-04-09", referentie: "ONTV-778" }, NU)).rejects.toThrow("al als ingediend");
  });

  it("de momentopname zelf (rubrieken, saldo, hash) verandert niet bij een statuswijziging", async () => {
    const c = await maakBtwConcept(ADMIN, 2026, 1, NU);
    const voor = JSON.stringify({ r: m.aangiftes[0]?.rubrieken, t: m.aangiftes[0]?.totaalTeBetalenCents, h: m.aangiftes[0]?.snapshotHash });
    await markeerKlaarVoorIndienen(c.id, "u1");
    await markeerIngediend(c.id, { ingediendOp: "2026-04-10", referentie: "REF-1" }, NU);
    expect(JSON.stringify({ r: m.aangiftes[0]?.rubrieken, t: m.aangiftes[0]?.totaalTeBetalenCents, h: m.aangiftes[0]?.snapshotHash })).toBe(voor);
  });

  it("een onbekend concept geeft een Nederlandse fout", async () => {
    await expect(btwConceptOpId("onbekend123456")).rejects.toThrow("Dit btw-concept bestaat niet.");
  });
});

describe("leesBtwConcept", () => {
  it("geeft null en de deadline als er nog niets is, en daarna de nieuwste versie", async () => {
    expect(await leesBtwConcept(ADMIN, 2026, 1)).toEqual({ laatste: null, versies: 0, deadline: "2026-04-30" });
    await maakBtwConcept(ADMIN, 2026, 1, NU);
    await maakBtwConcept(ADMIN, 2026, 1, NU);
    const r = await leesBtwConcept(ADMIN, 2026, 1);
    expect(r.versies).toBe(2);
    expect(r.laatste?.versie).toBe(2);
  });
});
