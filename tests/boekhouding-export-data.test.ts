import { beforeEach, describe, expect, it, vi } from "vitest";

// De datalaag van de export met een nagemaakte database: wat er gevraagd wordt en hoe het in de kern terechtkomt.

const m = vi.hoisted(() => ({
  prisma: {
    boekAdministratie: { findUnique: vi.fn() },
    boekRekening: { findMany: vi.fn() },
    boekRegel: { groupBy: vi.fn(), aggregate: vi.fn() },
    boekBoeking: { findMany: vi.fn(), count: vi.fn() },
    boekPeriode: { findMany: vi.fn() },
    boekBtwPeriode: { findMany: vi.fn() },
  },
  bonnenZonderBoeking: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/boekhouding/lezen", () => ({ bonnenZonderBoeking: m.bonnenZonderBoeking }));

const { leesExport, leesExportControle, leesXaf } = await import("@/lib/boekhouding/export/export");

const ADMIN = { id: "adm1", naam: "Eigen", juridischeNaam: "Zekerflex, Inc.", land: "US", soort: "ECHT", valuta: "USD", boekjaarStartMaand: 1, btwPlichtig: true, btwNummer: null };
const REKENINGEN = [
  { id: "r1", nummer: "1000", naam: "Bank", soort: "ACTIVA" },
  { id: "r2", nummer: "2000", naam: "Eigen vermogen", soort: "PASSIVA" },
  { id: "r3", nummer: "8000", naam: "Omzet", soort: "OMZET" },
];
const som = (rekeningId: string, d: number, c: number) => ({ rekeningId, _sum: { debetCents: d, creditCents: c } });

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.boekAdministratie.findUnique.mockResolvedValue(ADMIN);
  m.prisma.boekRekening.findMany.mockResolvedValue(REKENINGEN);
  // eerste groupBy = opening, tweede = mutaties
  m.prisma.boekRegel.groupBy.mockResolvedValueOnce([som("r1", 5_000, 0), som("r2", 0, 5_000)]).mockResolvedValueOnce([som("r1", 12_100, 0), som("r3", 0, 12_100)]);
  m.prisma.boekRegel.aggregate.mockResolvedValue({ _sum: { debetCents: 0, creditCents: 0 } });
  m.prisma.boekBoeking.findMany.mockResolvedValue([]);
  m.prisma.boekBoeking.count.mockResolvedValue(0);
  m.prisma.boekPeriode.findMany.mockResolvedValue([]);
  m.prisma.boekBtwPeriode.findMany.mockResolvedValue([]);
  m.bonnenZonderBoeking.mockResolvedValue([]);
});

describe("leesExport", () => {
  it("combineert opening, mutaties en resultaat tot een kloppende balans in de valuta van de administratie", async () => {
    const g = await leesExport("adm1", { jaar: 2026 });
    expect(g.kolommen.valuta).toBe("USD");
    expect(g.kolommen.inBalans).toBe(true);
    expect(g.kolommen.rijen.find((r) => r.rekeningNummer === "1000")).toMatchObject({ openingDebetCents: 5_000, mutatieDebetCents: 12_100, eindDebetCents: 17_100 });
    expect(g.wv.resultaatCents).toBe(12_100);
    expect(g.periode).toMatchObject({ van: "2026-01-01", tot: "2026-12-31", heelBoekjaar: true });
  });

  it("rekent het resultaat van voorgaande boekjaren mee", async () => {
    m.prisma.boekRegel.aggregate.mockResolvedValue({ _sum: { debetCents: 1_000, creditCents: 6_000 } });
    m.prisma.boekRegel.groupBy.mockReset().mockResolvedValueOnce([som("r1", 5_000, 0)]).mockResolvedValueOnce([]);
    const g = await leesExport("adm1", { jaar: 2026 });
    expect(g.kolommen.rijen.find((r) => r.rekeningNummer === "RESVORIG")).toMatchObject({ openingCreditCents: 5_000 });
    expect(g.kolommen.inBalans).toBe(true);
  });

  it("een onbekende administratie geeft een Nederlandse 404", async () => {
    m.prisma.boekAdministratie.findUnique.mockResolvedValue(null);
    await expect(leesExport("weg", { jaar: 2026 })).rejects.toThrow("Deze administratie bestaat niet.");
  });

  it("een regel op een rekening buiten het schema valt niet stil weg maar wordt genegeerd door de koppeling", async () => {
    m.prisma.boekRegel.groupBy.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([som("onbekend", 100, 0)]);
    const g = await leesExport("adm1", { jaar: 2026 });
    expect(g.kolommen.rijen).toEqual([]);
  });
});

describe("leesXaf", () => {
  it("bouwt een auditfile met de bonnummers als docRef en de opening van de balans", async () => {
    m.prisma.boekBoeking.findMany.mockResolvedValue([
      {
        boekstuk: "IK-2026-000001",
        dagboek: "INKOOP",
        datum: new Date("2026-04-02T00:00:00.000Z"),
        omschrijving: "Bon x",
        bon: { id: "cm0bonabcdef12345" },
        regels: [
          { debetCents: 100, creditCents: 0, omschrijving: null, rekening: { nummer: "1000" } },
          { debetCents: 0, creditCents: 100, omschrijving: null, rekening: { nummer: "2000" } },
        ],
      },
    ]);
    const u = await leesXaf("adm1", 2026, new Date("2026-11-12T10:00:00+01:00"));
    expect(u.xaf.xml).toContain("<curCode>USD</curCode>");
    expect(u.xaf.xml).toContain("<dateCreated>2026-11-12</dateCreated>");
    expect(u.xaf.xml).toContain("<docRef>cm0bonabcdef12345</docRef>");
    expect(u.xaf.xml).toContain("<companyName>Zekerflex, Inc.</companyName>");
    expect(u.xaf.xml).toContain("<openingBalance>");
    expect(u.xaf.totalDebitCents).toBe(100);
  });
});

describe("leesExportControle", () => {
  it("vat bonnen, vergrendeling en btw samen tot meldingen", async () => {
    m.prisma.boekRegel.groupBy.mockReset().mockResolvedValue([]);
    m.prisma.boekBoeking.count.mockResolvedValue(3);
    m.bonnenZonderBoeking.mockResolvedValue([{ id: "b1", status: "EVEN_KIJKEN" }]);
    m.prisma.boekPeriode.findMany.mockResolvedValue([{ jaar: 2026, maand: 1 }]);
    m.prisma.boekBtwPeriode.findMany.mockResolvedValue([{ jaar: 2026, kwartaal: 1, aangiftes: [{ status: "BEREKEND", rubrieken: { meldingen: [{ ernst: "blokkeert" }, { ernst: "info" }] } }] }]);
    const u = await leesExportControle("adm1", { jaar: 2026 }, new Date("2027-02-01T12:00:00+01:00"));
    const codes = u.meldingen.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["BONNEN_EVEN_KIJKEN", "MAANDEN_NIET_VERGRENDELD", "BTW_NIET_INGEDIEND", "BTW_BLOKKADES", "BTW_GEEN_CONCEPT"]));
    expect(u.boekingAantal).toBe(3);
    expect(u.meldingen[0]?.ernst).toBe("blokkeert");
    expect(JSON.stringify(u)).not.toContain("Zekerflex");
  });

  it("een vervangen btw-concept telt als geen concept", async () => {
    m.prisma.boekRegel.groupBy.mockReset().mockResolvedValue([]);
    m.prisma.boekBtwPeriode.findMany.mockResolvedValue([{ jaar: 2026, kwartaal: 1, aangiftes: [{ status: "VERVANGEN", rubrieken: null }] }]);
    const u = await leesExportControle("adm1", { jaar: 2026 }, new Date("2027-02-01T12:00:00+01:00"));
    expect(u.meldingen.some((x) => x.code === "BTW_GEEN_CONCEPT" && x.tekst.includes("kwartaal 1 2026"))).toBe(true);
  });
});
