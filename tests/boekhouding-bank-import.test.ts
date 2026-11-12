import { beforeEach, describe, expect, it, vi } from "vitest";

// Het importeren van een afschrift met een kleine nep-database: idempotent, overlappende periodes, saldo, valuta, rekening.

const EIGEN = "NL91ABNA0417164300";
const KLANT = "NL02ABNA0123456789";

type Rij = Record<string, any>;
const m = vi.hoisted(() => {
  const state = {
    rekening: null as Record<string, any> | null,
    afschriften: new Map<string, Record<string, any>>(),
    transacties: new Map<string, Record<string, any>>(),
    n: 0,
    botsOpCreate: false,
  };
  return {
    state,
    verwerk: vi.fn(async (_administratieId: string, _opties: unknown) => ({ bekeken: 0, geboekt: 0, gekoppeld: 0, evenKijken: 0, mislukt: 0 })),
    schrijf: vi.fn(async (_pad: string, _bytes: Uint8Array) => ({ nieuw: true })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock("@/lib/logger", () => ({ logger: m.logger }));
vi.mock("@/lib/boekhouding/bank/matching", () => ({ verwerkNieuweTransacties: m.verwerk }));
vi.mock("@/lib/boekhouding/bank/opslag", async (orig) => ({ ...(await orig<typeof import("@/lib/boekhouding/bank/opslag")>()), schrijfBankBestand: m.schrijf }));
vi.mock("@/lib/prisma", () => {
  const db = {
    boekBankRekening: { findUnique: async () => m.state.rekening },
    boekBankAfschrift: {
      findUnique: async ({ where }: Rij) => m.state.afschriften.get(where.bankRekeningId_bestandSha256.bestandSha256) ?? null,
      create: async ({ data }: Rij) => {
        if (m.state.botsOpCreate) {
          m.state.botsOpCreate = false;
          m.state.afschriften.set(data.bestandSha256, { id: "al-bezig" });
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const rij = { id: `afs${(m.state.n += 1)}`, ...data };
        m.state.afschriften.set(data.bestandSha256, rij);
        return { id: rij.id };
      },
    },
    boekBankTransactie: {
      createMany: async ({ data, skipDuplicates }: Rij) => {
        let count = 0;
        for (const r of data as Rij[]) {
          const sleutel = `${r.bankRekeningId}|${r.dedupeSleutel}`;
          if (m.state.transacties.has(sleutel)) {
            if (!skipDuplicates) throw new Error("dubbel");
            continue;
          }
          m.state.transacties.set(sleutel, r);
          count += 1;
        }
        return { count };
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { prisma: db };
});

const { importeerAfschrift } = await import("@/lib/boekhouding/bank/import");

const ING_KOP = '"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"';
const ingRij = (dag: string, bedrag: string, af: "Af" | "Bij", mededeling: string, rekening = EIGEN) =>
  `"${dag}","Klant BV","${rekening}","${KLANT}","OV","${af}","${bedrag}","Overschrijving","${mededeling}"`;
const ing = (...rijen: string[]) => Buffer.from([ING_KOP, ...rijen].join("\n"), "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  m.state.afschriften.clear();
  m.state.transacties.clear();
  m.state.n = 0;
  m.state.botsOpCreate = false;
  m.state.rekening = { id: "bankrek1", administratieId: "adm123456", iban: EIGEN, valuta: "EUR", actief: true, administratie: { actief: true } };
});

const importeer = (bytes: Buffer) => importeerAfschrift({ bankRekeningId: "bankrek1", bytes, door: "admin-1" });

describe("importeerAfschrift", () => {
  it("leest een afschrift in, bewaart het bestand en laat het koppelen volgen", async () => {
    const uit = await importeer(ing(ingRij("20261102", "121,00", "Bij", "ZF-2026-000123"), ingRij("20261103", "10,00", "Af", "Koffie")));
    expect(uit).toMatchObject({ alIngelezen: false, totaal: 2, nieuw: 2, alBekend: 0, herkend: "ING (csv)", formaat: "CSV" });
    expect(m.state.transacties.size).toBe(2);
    expect(m.schrijf).toHaveBeenCalledTimes(1);
    expect(m.schrijf.mock.calls[0]?.[0]).toMatch(/^boekhouding\/bank\/adm123456\/[0-9a-f]{2}\/[0-9a-f]{64}\.csv$/);
    expect(m.verwerk).toHaveBeenCalledWith("adm123456", { bankRekeningId: "bankrek1", door: "admin-1" });
    const eerste = [...m.state.transacties.values()][0] as Rij;
    expect(eerste).toMatchObject({ bankRekeningId: "bankrek1", bedragCents: 12100, valuta: "EUR", tegenIban: KLANT, tegenNaam: "Klant BV" });
    expect(eerste.boekdatum.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    const afschrift = [...m.state.afschriften.values()][0] as Rij;
    expect(afschrift).toMatchObject({ formaat: "CSV", geuploadDoor: "admin-1" });
  });

  it("hetzelfde bestand twee keer geeft hetzelfde afschrift en niets dubbels", async () => {
    const bytes = ing(ingRij("20261102", "121,00", "Bij", "A"));
    const een = await importeer(bytes);
    const twee = await importeer(bytes);
    expect(twee).toMatchObject({ alIngelezen: true, afschriftId: een.afschriftId, nieuw: 0, alBekend: 1, verwerkt: null });
    expect(m.state.transacties.size).toBe(1);
    expect(m.state.afschriften.size).toBe(1);
    expect(m.schrijf).toHaveBeenCalledTimes(1);
  });

  it("overlappende periodes geven nooit dubbele transacties, ook niet bij twee gelijke betalingen", async () => {
    const a = ingRij("20261102", "10,00", "Af", "Koffie");
    const b = ingRij("20261103", "20,00", "Af", "Lunch");
    const c = ingRij("20261104", "30,00", "Af", "Diner");
    const eerste = await importeer(ing(a, a, b));
    expect(eerste).toMatchObject({ totaal: 3, nieuw: 3 });
    const tweede = await importeer(ing(a, a, b, c));
    expect(tweede).toMatchObject({ totaal: 4, nieuw: 1, alBekend: 3, alIngelezen: false });
    expect(m.state.transacties.size).toBe(4);
    const derde = await importeer(ing(b, c));
    expect(derde).toMatchObject({ nieuw: 0, alBekend: 2 });
    expect(m.state.transacties.size).toBe(4);
    expect(m.state.afschriften.size).toBe(3);
  });

  it("twee gelijktijdige uploads van hetzelfde bestand: de tweede ziet het afschrift van de eerste", async () => {
    m.state.botsOpCreate = true;
    const uit = await importeer(ing(ingRij("20261102", "121,00", "Bij", "A")));
    expect(uit).toMatchObject({ alIngelezen: true, afschriftId: "al-bezig", nieuw: 0 });
  });

  it("weigert een afschrift van een andere rekening, zonder het hele IBAN te noemen", async () => {
    const bytes = ing(ingRij("20261102", "121,00", "Bij", "A", KLANT));
    await expect(importeer(bytes)).rejects.toThrow(/andere bankrekening/);
    const melding = await importeer(bytes).then(
      () => "",
      (e: Error) => e.message,
    );
    expect(melding).not.toMatch(/NL02ABNA|NL91ABNA|0417|0123/);
    expect(m.state.transacties.size).toBe(0);
    expect(m.schrijf).not.toHaveBeenCalled();
  });

  it("weigert een afschrift in een andere munt dan de rekening", async () => {
    m.state.rekening = { ...(m.state.rekening as Rij), valuta: "USD" };
    await expect(importeer(ing(ingRij("20261102", "1,00", "Bij", "A")))).rejects.toThrow(/niet \(alleen\) in USD/);
  });

  it("weigert een onbekende of niet-actieve rekening en onleesbare bestanden", async () => {
    m.state.rekening = { ...(m.state.rekening as Rij), actief: false };
    await expect(importeer(ing(ingRij("20261102", "1,00", "Bij", "A")))).rejects.toThrow(/niet actief/);
    m.state.rekening = null;
    await expect(importeer(ing(ingRij("20261102", "1,00", "Bij", "A")))).rejects.toThrow(/bestaat niet/);
    m.state.rekening = { id: "bankrek1", administratieId: "adm123456", iban: EIGEN, valuta: "EUR", actief: true, administratie: { actief: true } };
    await expect(importeer(Buffer.from("kolom een;kolom twee\n1;2\n"))).rejects.toThrow(/Formaat niet herkend/);
  });

  it("geeft een saldoverschil als waarschuwing door en blokkeert niet", async () => {
    const camt = `<?xml version="1.0"?><Document><BkToCstmrStmt><Stmt><Id>1</Id><Acct><Id><IBAN>${EIGEN}</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">999.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
      <Ntry><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-02</Dt></BookgDt><AcctSvcrRef>R1</AcctSvcrRef></Ntry>
      </Stmt></BkToCstmrStmt></Document>`;
    const uit = await importeer(Buffer.from(camt));
    expect(uit.formaat).toBe("CAMT053");
    expect(uit.nieuw).toBe(1);
    expect(uit.waarschuwingen[0]).toMatch(/niet gelijk aan het eindsaldo/);
    const afschrift = [...m.state.afschriften.values()][0] as Rij;
    expect(afschrift).toMatchObject({ beginSaldoCents: 10000, eindSaldoCents: 99900 });
    expect(m.schrijf.mock.calls[0]?.[0]).toMatch(/\.xml$/);
    expect([...m.state.transacties.keys()][0]).toBe("bankrek1|ref:R1");
  });

  it("een fout bij het koppelen laat het inlezen staan en geeft een waarschuwing", async () => {
    m.verwerk.mockRejectedValueOnce(new Error("kapot"));
    const uit = await importeer(ing(ingRij("20261102", "121,00", "Bij", "A")));
    expect(uit.nieuw).toBe(1);
    expect(uit.verwerkt).toBeNull();
    expect(uit.waarschuwingen.join(" ")).toMatch(/Opnieuw zoeken/);
  });

  it("zet geen IBAN of naam in het logboek", async () => {
    await importeer(ing(ingRij("20261102", "121,00", "Bij", "A")));
    const alles = JSON.stringify([m.logger.info.mock.calls, m.logger.warn.mock.calls]);
    expect(alles).not.toMatch(/NL91|NL02|Klant/);
  });
});
