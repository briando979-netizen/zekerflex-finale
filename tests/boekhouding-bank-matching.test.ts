import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

// De datalaag van het koppelen: vanzelf boeken (alleen bij zekerheid), even kijken, handmatig koppelen, negeren.
// Een kleine nep-database in het geheugen; boek zelf wordt vervangen door een opname van wat er geboekt zou worden.

type Rij = Record<string, any>;
const m = vi.hoisted(() => {
  const state = {
    transacties: new Map<string, Record<string, any>>(),
    posten: [] as Record<string, any>[],
    invoices: [] as Record<string, any>[],
    bonnen: [] as Record<string, any>[],
    rekeningen: new Map<string, Record<string, any>>(),
    boekingen: [] as Record<string, any>[],
    boekFout: null as Error | null,
  };
  return { state, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

const dag = (s: string) => new Date(`${s}T00:00:00.000Z`);
const tx = (id: string, o: Rij = {}) => ({
  id,
  bankRekeningId: "bank1",
  status: "NIEUW",
  boekdatum: dag("2026-11-02"),
  bedragCents: 12100,
  valuta: "EUR",
  tegenIban: "NL02ABNA0123456789",
  tegenNaam: "Klant BV",
  omschrijving: "Betaling ZF-2026-000123",
  voorstel: null,
  matchScorePromille: null,
  boekingId: null,
  createdAt: new Date(),
  ...o,
});

vi.mock("@/lib/logger", () => ({ logger: m.logger }));
vi.mock("@/lib/boekhouding/lezen", () => ({ openPosten: async () => m.state.posten }));
vi.mock("@/lib/boekhouding/boek", () => ({
  boekInTransactie: async (_tx: unknown, invoer: Rij) => {
    if (m.state.boekFout) throw m.state.boekFout;
    m.state.boekingen.push(invoer);
    return { boekingId: `bk${m.state.boekingen.length}`, boekstuk: `BK-2026-00000${m.state.boekingen.length}`, nieuw: true };
  },
}));
vi.mock("@/lib/prisma", () => {
  const passend = (r: Rij, where: Rij): boolean => {
    if (where.id && typeof where.id === "string" && r.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(r.id)) return false;
    if (where.status) {
      if (typeof where.status === "string" && r.status !== where.status) return false;
      if (where.status.in && !where.status.in.includes(r.status)) return false;
    }
    if (Object.hasOwn(where, "boekingId") && where.boekingId === null && r.boekingId !== null) return false;
    return true;
  };
  const db: Rij = {
    boekBankRekening: {
      findUnique: async () => ({ id: "bank1", administratieId: "adm1", rekeningId: "r1100", valuta: "EUR", actief: true, administratie: { valuta: "EUR", actief: true } }),
    },
    boekBankTransactie: {
      findMany: async ({ where }: Rij) => {
        if (where.boekingId?.in) return [];
        if (where.status === "GEKOPPELD") return [...m.state.transacties.values()].filter((r) => r.status === "GEKOPPELD" && r.tegenIban);
        return [...m.state.transacties.values()].filter((r) => passend(r, where) && r.boekingId === null);
      },
      findUnique: async ({ where }: Rij) => m.state.transacties.get(where.id) ?? null,
      count: async () => 0,
      updateMany: async ({ where, data }: Rij) => {
        const rij = m.state.transacties.get(where.id?.in ? "" : where.id);
        const doel = where.id?.in ? where.id.in.map((i: string) => m.state.transacties.get(i)).filter(Boolean) : rij ? [rij] : [];
        let count = 0;
        for (const r of doel as Rij[]) {
          if (!passend(r, where) || (where.boekingId === null && r.boekingId !== null)) continue;
          Object.assign(r, data);
          count += 1;
        }
        return { count };
      },
      update: async ({ where, data }: Rij) => Object.assign(m.state.transacties.get(where.id) as Rij, data),
    },
    boekRekening: {
      findFirst: async ({ where }: Rij) => m.state.rekeningen.get(where.nummer) ?? null,
    },
    invoice: { findMany: async ({ where }: Rij) => m.state.invoices.filter((i) => where.id.in.includes(i.id)), findUnique: async ({ where }: Rij) => m.state.invoices.find((i) => i.id === where.id) ?? null },
    boekBon: {
      findMany: async ({ where }: Rij) => (where.status === "GEBOEKT" ? [] : m.state.bonnen.filter((b) => where.id.in.includes(b.id))),
      findUnique: async ({ where }: Rij) => m.state.bonnen.find((b) => b.id === where.id) ?? null,
    },
    // Zoals een echte rollback: gooit de functie, dan staat de database weer zoals hij was.
    $transaction: async (fn: (t: unknown) => unknown) => {
      const momentopname = new Map([...m.state.transacties].map(([k, v]) => [k, { ...v }] as const));
      try {
        return await fn(db);
      } catch (e) {
        m.state.transacties.clear();
        for (const [k, v] of momentopname) m.state.transacties.set(k, v);
        throw e;
      }
    },
  };
  return { prisma: db };
});

const { verwerkNieuweTransacties, koppelTransactie, negeerTransactie, heropenTransactie } = await import("@/lib/boekhouding/bank/matching");

const post = (sleutel: string, o: Rij = {}) => ({ postSleutel: sleutel, rekeningNummer: "1200", saldoCents: 12100, oudsteDatum: "2026-10-30", soort: "DEBITEUR", ...o });

beforeEach(() => {
  vi.clearAllMocks();
  m.state.transacties.clear();
  m.state.boekingen.length = 0;
  m.state.boekFout = null;
  m.state.posten = [post("factuur:inv1")];
  m.state.invoices = [{ id: "inv1", number: "ZF-2026-000123", recipientTenantId: "t1" }];
  m.state.bonnen = [];
  m.state.rekeningen = new Map([
    ["1200", { id: "r1200", soort: "ACTIVA" }],
    ["2200", { id: "r2200", soort: "PASSIVA" }],
    ["4800", { id: "r4800", soort: "KOSTEN" }],
    ["8000", { id: "r8000", soort: "OMZET" }],
  ]);
});

const zet = (r: Rij) => m.state.transacties.set(r.id, r);
const rij = (id: string) => m.state.transacties.get(id) as Rij;

describe("verwerkNieuweTransacties", () => {
  it("boekt vanzelf bij exact factuurnummer + exact bedrag: bank debet, debiteuren credit, bron BANK", async () => {
    zet(tx("t1"));
    const uit = await verwerkNieuweTransacties("adm1", { door: "admin-1" });
    expect(uit).toMatchObject({ bekeken: 1, geboekt: 1, evenKijken: 0 });
    expect(m.state.boekingen).toHaveLength(1);
    expect(m.state.boekingen[0]).toMatchObject({
      administratieId: "adm1",
      dagboek: "BANK",
      bron: "BANK",
      bronId: "t1",
      datum: "2026-11-02",
      regels: [
        { rekeningId: "r1100", debetCents: 12100 },
        { rekeningId: "r1200", creditCents: 12100, postSleutel: "factuur:inv1" },
      ],
    });
    expect(rij("t1")).toMatchObject({ status: "GEKOPPELD", boekingId: "bk1", matchScorePromille: 1000 });
    expect(JSON.stringify(m.state.boekingen)).not.toMatch(/NL02|Klant/);
    expect(JSON.stringify(rij("t1").voorstel)).not.toMatch(/NL02|Klant/);
  });

  it("boekt een tweede betaling van dezelfde factuur niet nog eens", async () => {
    zet(tx("t1"));
    zet(tx("t2", { createdAt: new Date(Date.now() + 1000) }));
    const uit = await verwerkNieuweTransacties("adm1", { door: "admin-1" });
    expect(uit).toMatchObject({ bekeken: 2, geboekt: 1, evenKijken: 1 });
    expect(m.state.boekingen).toHaveLength(1);
    expect(rij("t2").status).toBe("TWIJFEL");
  });

  it("zet een afwijkend bedrag bij even kijken met het voorstel erbij", async () => {
    zet(tx("t1", { bedragCents: 6000 }));
    const uit = await verwerkNieuweTransacties("adm1", { door: "admin-1" });
    expect(uit).toMatchObject({ geboekt: 0, evenKijken: 1 });
    expect(m.state.boekingen).toHaveLength(0);
    expect(rij("t1")).toMatchObject({ status: "TWIJFEL", matchScorePromille: 700 });
    expect(rij("t1").voorstel.kandidaten[0].voorstel).toMatchObject({ soort: "factuur", invoiceId: "inv1" });
  });

  it("zet een transactie zonder kandidaat bij even kijken met een uitleg", async () => {
    zet(tx("t1", { omschrijving: "Onbekend", bedragCents: 777 }));
    await verwerkNieuweTransacties("adm1", { door: "admin-1" });
    expect(rij("t1")).toMatchObject({ status: "TWIJFEL", matchScorePromille: 0 });
    expect(rij("t1").voorstel.reden).toMatch(/Geen openstaande factuur/);
  });

  it("als boeken mislukt (bv. vergrendelde periode) blijft de transactie even kijken, met de reden", async () => {
    zet(tx("t1"));
    m.state.boekFout = AppError.validation("De periode 2026-11 is vergrendeld.");
    const uit = await verwerkNieuweTransacties("adm1", { door: "admin-1" });
    expect(uit).toMatchObject({ geboekt: 0, mislukt: 1, evenKijken: 1 });
    expect(rij("t1")).toMatchObject({ status: "TWIJFEL", boekingId: null });
    expect(rij("t1").voorstel.reden).toMatch(/vergrendeld/);
  });

  it("laat een al gekoppelde transactie met rust en beoordeelt 'even kijken' alleen op verzoek opnieuw", async () => {
    zet(tx("t1", { status: "GEKOPPELD", boekingId: "bkX" }));
    zet(tx("t2", { status: "TWIJFEL" }));
    expect((await verwerkNieuweTransacties("adm1", { door: "a" })).bekeken).toBe(0);
    const opnieuw = await verwerkNieuweTransacties("adm1", { door: "a", ookTwijfel: true });
    expect(opnieuw).toMatchObject({ bekeken: 1, geboekt: 1 });
    expect(rij("t1").boekingId).toBe("bkX");
    expect(m.state.boekingen[0]?.bronId).toBe("t2");
  });

  it("markeert een Stripe-uitbetaling zonder te boeken", async () => {
    zet(tx("t1", { tegenNaam: "Stripe Payments Europe", omschrijving: "STRIPE PAYOUT", bedragCents: 50000 }));
    await verwerkNieuweTransacties("adm1", { door: "a" });
    expect(m.state.boekingen).toHaveLength(0);
    expect(rij("t1").status).toBe("TWIJFEL");
    expect(rij("t1").voorstel.kandidaten[0].voorstel.soort).toBe("stripe");
  });
});

describe("koppelTransactie (een mens)", () => {
  it("koppelt aan een open factuur en boekt (ook een deelbetaling)", async () => {
    zet(tx("t1", { status: "TWIJFEL", bedragCents: 6000, omschrijving: "x" }));
    const r = await koppelTransactie("t1", { factuurId: "inv1" }, "admin-1");
    expect(r.boekstuk).toBe("BK-2026-000001");
    expect(m.state.boekingen[0]?.regels).toEqual([
      { rekeningId: "r1100", debetCents: 6000 },
      { rekeningId: "r1200", creditCents: 6000, postSleutel: "factuur:inv1" },
    ]);
    expect(rij("t1")).toMatchObject({ status: "GEKOPPELD", boekingId: "bk1" });
    expect(rij("t1").voorstel).toMatchObject({ handmatig: true, gekoppeldAan: { soort: "factuur", invoiceId: "inv1" } });
  });

  it("weigert een bedrag boven wat openstaat, een factuur die niet open is, en een al gekoppelde transactie", async () => {
    zet(tx("t1", { bedragCents: 20000 }));
    await expect(koppelTransactie("t1", { factuurId: "inv1" }, "a")).rejects.toThrow(/meer dan er op deze factuur openstaat/);
    zet(tx("t2"));
    await expect(koppelTransactie("t2", { factuurId: "onbekend" }, "a")).rejects.toThrow(/niet \(meer\) open/);
    zet(tx("t3", { status: "GEKOPPELD", boekingId: "bk9" }));
    await expect(koppelTransactie("t3", { factuurId: "inv1" }, "a")).rejects.toThrow(/al gekoppeld/);
    expect(m.state.boekingen).toHaveLength(0);
  });

  it("betaalt een open bon op crediteuren: crediteuren debet met de postSleutel van de bon, bank credit", async () => {
    m.state.posten = [post("bon:bon1", { rekeningNummer: "2200", saldoCents: 1210, soort: "CREDITEUR" })];
    zet(tx("t1", { bedragCents: -1210 }));
    await koppelTransactie("t1", { bonId: "bon1" }, "a");
    expect(m.state.boekingen[0]?.regels).toEqual([
      { rekeningId: "r2200", debetCents: 1210, postSleutel: "bon:bon1" },
      { rekeningId: "r1100", creditCents: 1210 },
    ]);
  });

  it("een bon die al 'met de bank betaald' is geboekt wordt alleen gekoppeld, niet nog eens geboekt", async () => {
    m.state.posten = [];
    m.state.bonnen = [{ id: "bon2", administratieId: "adm1", status: "GEBOEKT", boekingId: "bkBon", totaalCents: 1210, boeking: { dagboek: "BANK" } }];
    zet(tx("t1", { bedragCents: -1210 }));
    const r = await koppelTransactie("t1", { bonId: "bon2" }, "a");
    expect(r.boekstuk).toBeNull();
    expect(m.state.boekingen).toHaveLength(0);
    expect(rij("t1")).toMatchObject({ status: "GEKOPPELD", boekingId: "bkBon" });
  });

  it("weigert een bon die nog niet is geboekt of een ander bedrag heeft", async () => {
    m.state.posten = [];
    m.state.bonnen = [{ id: "bon3", administratieId: "adm1", status: "EVEN_KIJKEN", boekingId: null, totaalCents: 1210, boeking: null }];
    zet(tx("t1", { bedragCents: -1210 }));
    await expect(koppelTransactie("t1", { bonId: "bon3" }, "a")).rejects.toThrow(/nog niet geboekt/);
    m.state.bonnen = [{ id: "bon4", administratieId: "adm1", status: "GEBOEKT", boekingId: "bkB", totaalCents: 999, boeking: { dagboek: "BANK" } }];
    await expect(koppelTransactie("t1", { bonId: "bon4" }, "a")).rejects.toThrow(/niet gelijk aan het totaal/);
    m.state.bonnen = [{ id: "bon5", administratieId: "ander", status: "GEBOEKT", boekingId: "bkC", totaalCents: 1210, boeking: { dagboek: "BANK" } }];
    await expect(koppelTransactie("t1", { bonId: "bon5" }, "a")).rejects.toThrow(/niet bij deze administratie/);
  });

  it("boekt een uitgave als kosten op een kostenrekening, zonder btw en zonder postSleutel", async () => {
    zet(tx("t1", { bedragCents: -250 }));
    await koppelTransactie("t1", { rekeningNummer: "4800" }, "a");
    expect(m.state.boekingen[0]?.regels).toEqual([
      { rekeningId: "r4800", debetCents: 250 },
      { rekeningId: "r1100", creditCents: 250 },
    ]);
  });

  it("weigert kosten voor een ontvangen bedrag en een rekening die geen kostenrekening is", async () => {
    zet(tx("t1", { bedragCents: 250 }));
    await expect(koppelTransactie("t1", { rekeningNummer: "4800" }, "a")).rejects.toThrow(/Omzet zonder btw-controle/);
    zet(tx("t2", { bedragCents: -250 }));
    await expect(koppelTransactie("t2", { rekeningNummer: "8000" }, "a")).rejects.toThrow(/kostenrekening/);
    await expect(koppelTransactie("t2", { rekeningNummer: "9999" }, "a")).rejects.toThrow(/bestaat niet/);
    expect(m.state.boekingen).toHaveLength(0);
  });

  it("een fout bij het boeken laat de transactie ongewijzigd (alles in één databasetransactie)", async () => {
    zet(tx("t1", { bedragCents: -250 }));
    m.state.boekFout = AppError.validation("vergrendeld");
    await expect(koppelTransactie("t1", { rekeningNummer: "4800" }, "a")).rejects.toThrow(/vergrendeld/);
    expect(rij("t1")).toMatchObject({ status: "NIEUW", boekingId: null });
  });
});

describe("negeren en heropenen", () => {
  it("negeert met een reden en zet hem terug", async () => {
    zet(tx("t1", { status: "TWIJFEL" }));
    await negeerTransactie("t1", "Privé-overschrijving van de eigenaar", "admin-1");
    expect(rij("t1")).toMatchObject({ status: "GENEGEERD", boekingId: null });
    expect(rij("t1").voorstel).toMatchObject({ genegeerdReden: "Privé-overschrijving van de eigenaar", handmatig: true });
    await heropenTransactie("t1");
    expect(rij("t1").status).toBe("TWIJFEL");
    await expect(heropenTransactie("t1")).rejects.toThrow(/Alleen een genegeerde/);
  });

  it("weigert een te korte reden, een reden met IBAN of e-mailadres, en een gekoppelde transactie", async () => {
    zet(tx("t1", { status: "TWIJFEL" }));
    await expect(negeerTransactie("t1", "ab", "a")).rejects.toThrow(/reden/);
    await expect(negeerTransactie("t1", "van NL91ABNA0417164300 privé", "a")).rejects.toThrow(/IBAN/);
    await expect(negeerTransactie("t1", "mail jan@example.com", "a")).rejects.toThrow(/IBAN/);
    zet(tx("t2", { status: "GEKOPPELD", boekingId: "bk1" }));
    await expect(negeerTransactie("t2", "Waarom ook niet", "a")).rejects.toThrow(/al gekoppeld/);
    expect(rij("t1").status).toBe("TWIJFEL");
  });
});
