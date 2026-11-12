import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { MAX_REGEL_CENTS, btwBedrag, formatCenten, splitsBruto } from "@/lib/boekhouding/bedrag";
import { boekDatum, formatBoekstuk, periodeVan } from "@/lib/boekhouding/boekstuk";
import { bevatPersoonsgegevens, omschrijvingVoor } from "@/lib/boekhouding/omschrijving";
import { BASIS_BTW_CODES, BASIS_REKENINGSCHEMA } from "@/lib/boekhouding/rgs-schema";
import { controleerRekeningschema } from "@/lib/boekhouding/rgs-import";
import { isGeldigeBoekdag, valideerBoeking } from "@/lib/boekhouding/sluiting";
import { isTestAdministratie } from "@/lib/boekhouding/soort";
import type { BoekInvoer } from "@/lib/boekhouding/types";

function basis(over: Partial<BoekInvoer> = {}): BoekInvoer {
  return {
    administratieId: "adm1",
    dagboek: "VERKOOP",
    datum: "2026-04-10",
    bron: "FACTUUR",
    bronId: "inv1",
    omschrijving: "Factuur F-2026-0012",
    valuta: "EUR",
    regels: [
      { rekeningId: "r1", debetCents: 12100 },
      { rekeningId: "r2", creditCents: 10000 },
      { rekeningId: "r3", creditCents: 2100, isBtwRegel: true },
    ],
    ...over,
  };
}

function fout(f: () => unknown): AppError {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error("er kwam geen fout");
}

describe("btw-afronding (basispunten, half-up op centen)", () => {
  it("rekent het gewone geval exact", () => {
    expect(btwBedrag(10000, 2100)).toBe(2100);
    expect(btwBedrag(10000, 900)).toBe(900);
    expect(btwBedrag(12345, 0)).toBe(0);
  });
  it("rondt op de halve cent naar boven af", () => {
    // 2,50 x 21% = 0,525 -> 0,53 ; 2,49 x 21% = 0,5229 -> 0,52
    expect(btwBedrag(250, 2100)).toBe(53);
    expect(btwBedrag(249, 2100)).toBe(52);
    // 50 cent x 9% = 4,5 cent -> 5
    expect(btwBedrag(50, 900)).toBe(5);
    expect(btwBedrag(49, 900)).toBe(4);
  });
  it("geeft een creditnota precies het tegengestelde van de factuur", () => {
    for (const g of [1, 50, 249, 250, 9999, 123456]) {
      expect(btwBedrag(-g, 2100)).toBe(-btwBedrag(g, 2100));
    }
  });
  it("blijft exact bij grote bedragen (geen kommagetal-afronding)", () => {
    expect(btwBedrag(MAX_REGEL_CENTS, 2100)).toBe(420_000_000);
    expect(btwBedrag(1_999_999_999, 2100)).toBe(420_000_000); // 419.999.999,79 -> 420.000.000
  });
  it("weigert kommagetallen en een tarief buiten 0-10000", () => {
    expect(() => btwBedrag(10.5, 2100)).toThrow(RangeError);
    expect(() => btwBedrag(100, 21)).not.toThrow();
    expect(() => btwBedrag(100, 10001)).toThrow(RangeError);
    expect(() => btwBedrag(100, -1)).toThrow(RangeError);
    expect(() => btwBedrag(100, 20.5)).toThrow(RangeError);
  });
  it("splitst een brutobedrag zo dat grondslag + btw altijd het bruto is", () => {
    expect(splitsBruto(12100, 2100)).toEqual({ grondslagCents: 10000, btwCents: 2100 });
  });
  it("splitsBruto: 1000 cent bij 21% is 173,55 cent btw, dus 174 (half-up)", () => {
    // 1000 x 2100 / 12100 = 173,553...: half-up op centen geeft 174, niet 173.
    expect(splitsBruto(1000, 2100).btwCents).toBe(174);
    for (const bruto of [1, 99, 100, 1000, 12345, 99999, 1_000_000]) {
      for (const bp of [0, 900, 2100]) {
        const { grondslagCents, btwCents } = splitsBruto(bruto, bp);
        expect(grondslagCents + btwCents).toBe(bruto);
      }
    }
    expect(splitsBruto(-12100, 2100)).toEqual({ grondslagCents: -10000, btwCents: -2100 });
  });
  it("formatteert centen in gewoon Nederlands", () => {
    expect(formatCenten(121000)).toBe("EUR 1.210,00");
    expect(formatCenten(5, "USD")).toBe("USD 0,05");
    expect(formatCenten(MAX_REGEL_CENTS)).toBe("EUR 20.000.000,00");
  });
});

describe("omschrijving zonder persoonsgegevens", () => {
  it("bouwt de omschrijving uit een soort bron en een nummer", () => {
    expect(omschrijvingVoor("FACTUUR", "F-2026-0012")).toBe("Factuur F-2026-0012");
    expect(omschrijvingVoor("BON", "B-2026-0003")).toBe("Bon B-2026-0003");
    expect(omschrijvingVoor("BANK", 41)).toBe("Banktransactie 41");
    expect(omschrijvingVoor("TEGENBOEKING", "VK-2026-000012")).toBe("Tegenboeking VK-2026-000012");
    expect(omschrijvingVoor("FACTUUR", "ZF-PF-2026-000012")).toBe("Factuur ZF-PF-2026-000012");
  });
  it("weigert een nummer met een @, een IBAN of vrije tekst", () => {
    expect(() => omschrijvingVoor("FACTUUR", "jan@voorbeeld.nl")).toThrow(AppError);
    expect(() => omschrijvingVoor("BANK", "NL91ABNA0417164300")).toThrow(AppError);
    expect(() => omschrijvingVoor("BON", "Jan Jansen")).toThrow(AppError);
    expect(() => omschrijvingVoor("BON", "")).toThrow(AppError);
  });
  it("herkent een e-mailadres en een echt IBAN, ook met spaties", () => {
    expect(bevatPersoonsgegevens("Factuur van jan@voorbeeld.nl")).toBe(true);
    expect(bevatPersoonsgegevens("Betaling NL91ABNA0417164300")).toBe(true);
    expect(bevatPersoonsgegevens("Betaling NL91 ABNA 0417 1643 00")).toBe(true);
    expect(bevatPersoonsgegevens("naar GB82WEST12345698765432 gestuurd")).toBe(true);
    expect(bevatPersoonsgegevens("DE89370400440532013000")).toBe(true);
  });
  it("laat gewone nummers en id's met letters en cijfers door (geen valse treffers)", () => {
    for (const t of [
      "Factuur F-2026-0012",
      "Banktransactie 41",
      "Betaling factuur ZF-PF-2026-000012",
      "Openingsbalans 2026",
      "Bon cm3x9k2l40000abcd1234efgh",
      "Memoriaal NL91ABNA0417164301", // controlegetal klopt niet: geen IBAN
    ]) {
      expect(bevatPersoonsgegevens(t)).toBe(false);
    }
  });
});

describe("valideerBoeking", () => {
  it("accepteert een boeking die op 0 sluit en geeft de totalen", () => {
    expect(valideerBoeking(basis(), "EUR")).toEqual({ debetTotaalCents: 12100, creditTotaalCents: 12100 });
  });
  it("weigert een boeking die niet sluit, met de bedragen in de tekst", () => {
    const f = fout(() => valideerBoeking(basis({ regels: [{ rekeningId: "a", debetCents: 12100 }, { rekeningId: "b", creditCents: 10000 }] }), "EUR"));
    expect(f.status).toBe(422);
    expect(f.message).toContain("sluit niet");
    expect(f.message).toContain("EUR 121,00");
    expect(f.message).toContain("EUR 100,00");
  });
  it("weigert minder dan twee regels", () => {
    expect(fout(() => valideerBoeking(basis({ regels: [{ rekeningId: "a", debetCents: 0 }] }), "EUR")).message).toContain("minstens twee");
  });
  it("weigert een regel met beide kanten, geen kant, of een negatief bedrag", () => {
    const regels = (r: Record<string, number>) => [{ rekeningId: "a", ...r }, { rekeningId: "b", creditCents: 5 }];
    expect(fout(() => valideerBoeking(basis({ regels: regels({ debetCents: 5, creditCents: 5 }) }), "EUR")).message).toContain("Regel 1");
    expect(fout(() => valideerBoeking(basis({ regels: regels({}) }), "EUR")).message).toContain("precies een kant");
    expect(fout(() => valideerBoeking(basis({ regels: regels({ debetCents: -5 }) }), "EUR")).message).toContain("negatief");
  });
  it("weigert bedragen met kommagetal", () => {
    expect(fout(() => valideerBoeking(basis({ regels: [{ rekeningId: "a", debetCents: 10.5 }, { rekeningId: "b", creditCents: 10.5 }] }), "EUR")).message).toContain("geheel aantal centen");
    expect(fout(() => valideerBoeking(basis({ regels: [{ rekeningId: "a", debetCents: Number.NaN }, { rekeningId: "b", creditCents: 1 }] }), "EUR")).message).toContain("geheel aantal centen");
  });
  it("weigert een regel boven 2.000.000.000 cent met een duidelijke fout, en accepteert precies de grens", () => {
    const f = fout(() =>
      valideerBoeking(basis({ regels: [{ rekeningId: "a", debetCents: MAX_REGEL_CENTS + 1 }, { rekeningId: "b", creditCents: MAX_REGEL_CENTS + 1 }] }), "EUR"),
    );
    expect(f.status).toBe(422);
    expect(f.message).toContain("Regel 1");
    expect(f.message).toContain("te groot");
    expect(f.message).toContain("EUR 20.000.000,00");
    expect(() =>
      valideerBoeking(basis({ regels: [{ rekeningId: "a", debetCents: MAX_REGEL_CENTS }, { rekeningId: "b", creditCents: MAX_REGEL_CENTS }] }), "EUR"),
    ).not.toThrow();
  });
  it("weigert een andere valuta dan de administratie en een ongeldige valutacode", () => {
    expect(fout(() => valideerBoeking(basis({ valuta: "USD" }), "EUR")).message).toContain("USD");
    expect(fout(() => valideerBoeking(basis({ valuta: "eur" }), "eur")).message).toContain("drie hoofdletters");
  });
  it("weigert persoonsgegevens in omschrijving, reden en regelomschrijving", () => {
    expect(fout(() => valideerBoeking(basis({ omschrijving: "Factuur van jan@voorbeeld.nl" }), "EUR")).message).toContain("persoonsgegevens");
    expect(fout(() => valideerBoeking(basis({ bron: "MEMORIAAL", dagboek: "MEMORIAAL", reden: "terugbetaling NL91ABNA0417164300" }), "EUR")).message).toContain("persoonsgegevens");
    const r = basis().regels.map((x, i) => (i === 0 ? { ...x, omschrijving: "Jan Jansen, jan@x.nl" } : x));
    expect(fout(() => valideerBoeking(basis({ regels: r }), "EUR")).message).toContain("Regel 1");
  });
  it("eist een reden bij memoriaal en tegenboeking", () => {
    expect(fout(() => valideerBoeking(basis({ bron: "MEMORIAAL", dagboek: "MEMORIAAL" }), "EUR")).message).toContain("reden");
    expect(() => valideerBoeking(basis({ bron: "MEMORIAAL", dagboek: "MEMORIAAL", reden: "Correctie afronding" }), "EUR")).not.toThrow();
  });
  it("weigert een lege bronId, een ongeldige datum en een onbekend dagboek of bron", () => {
    expect(fout(() => valideerBoeking(basis({ bronId: "  " }), "EUR")).message).toContain("bronnummer");
    expect(fout(() => valideerBoeking(basis({ datum: "2026-02-30" }), "EUR")).message).toContain("geldige dag");
    expect(fout(() => valideerBoeking(basis({ datum: "10-04-2026" }), "EUR")).message).toContain("geldige dag");
    expect(fout(() => valideerBoeking(basis({ dagboek: "constructor" as never }), "EUR")).message).toContain("dagboek");
    expect(fout(() => valideerBoeking(basis({ bron: "toString" as never }), "EUR")).message).toContain("bron");
  });
  it("controleert de btw-grondslag en de vreemde valuta op een regel", () => {
    const met = (extra: Record<string, unknown>) => basis({ regels: [{ rekeningId: "a", debetCents: 5, ...extra }, { rekeningId: "b", creditCents: 5 }] });
    expect(fout(() => valideerBoeking(met({ btwBasisCents: -1 }), "EUR")).message).toContain("btw-grondslag");
    expect(fout(() => valideerBoeking(met({ origineleValuta: "dollar" }), "EUR")).message).toContain("oorspronkelijke valuta");
    expect(() => valideerBoeking(met({ origineleValuta: "USD", origineelCents: 6, koersMicro: 830000 }), "EUR")).not.toThrow();
  });
});

describe("boekdag, boekstuk en soort", () => {
  it("herkent een echte kalenderdag", () => {
    expect(isGeldigeBoekdag("2026-04-10")).toBe(true);
    expect(isGeldigeBoekdag("2028-02-29")).toBe(true);
    expect(isGeldigeBoekdag("2026-02-29")).toBe(false);
    expect(isGeldigeBoekdag("2026-13-01")).toBe(false);
  });
  it("maakt een gapvrij boekstuknummer met voorloopnullen", () => {
    expect(formatBoekstuk("VERKOOP", 2026, 12)).toBe("VK-2026-000012");
    expect(formatBoekstuk("INKOOP", 2026, 1)).toBe("IK-2026-000001");
    expect(formatBoekstuk("BANK", 2027, 123456)).toBe("BK-2027-123456");
    expect(formatBoekstuk("MEMORIAAL", 2026, 3)).toBe("MM-2026-000003");
  });
  it("zet een boekdag om naar middernacht UTC en leest jaar en maand terug", () => {
    expect(boekDatum("2026-04-10").toISOString()).toBe("2026-04-10T00:00:00.000Z");
    expect(periodeVan("2026-04-10")).toEqual({ jaar: 2026, maand: 4 });
  });
  it("isTestAdministratie is alleen waar voor soort TEST", () => {
    expect(isTestAdministratie({ soort: "TEST" })).toBe(true);
    expect(isTestAdministratie({ soort: "ECHT" })).toBe(false);
    expect(isTestAdministratie({})).toBe(false);
    expect(isTestAdministratie(null)).toBe(false);
  });
});

describe("basisrekeningschema", () => {
  it("is een geldig schema: unieke nummers, ouders zijn kopjes en komen eerst", () => {
    expect(() => controleerRekeningschema(BASIS_REKENINGSCHEMA)).not.toThrow();
  });
  it("verzint geen RGS-codes: de verwijzing blijft leeg tot de accountant hem invult", () => {
    expect(BASIS_REKENINGSCHEMA.every((r) => r.rgsCode === undefined)).toBe(true);
  });
  it("heeft de gangbare hoofdrekeningen", () => {
    const namen = BASIS_REKENINGSCHEMA.map((r) => r.naam.toLowerCase()).join("|");
    for (const w of ["bank", "debiteuren", "crediteuren", "te betalen btw", "te vorderen btw", "omzet", "eigen vermogen", "kosten"]) {
      expect(namen).toContain(w);
    }
    expect(BASIS_REKENINGSCHEMA.some((r) => r.soort === "OMZET" && r.boekbaar)).toBe(true);
    expect(BASIS_REKENINGSCHEMA.some((r) => r.soort === "KOSTEN" && r.boekbaar)).toBe(true);
  });
  it("weigert een dubbel nummer en een ouder die ontbreekt", () => {
    expect(() => controleerRekeningschema([{ nummer: "1", naam: "a", soort: "ACTIVA", boekbaar: true }, { nummer: "1", naam: "b", soort: "ACTIVA", boekbaar: true }])).toThrow(AppError);
    expect(() => controleerRekeningschema([{ nummer: "11", naam: "a", soort: "ACTIVA", boekbaar: true, ouder: "1" }])).toThrow(AppError);
    expect(() => controleerRekeningschema([{ nummer: "1", naam: "a", soort: "ACTIVA", boekbaar: true }, { nummer: "11", naam: "b", soort: "ACTIVA", boekbaar: true, ouder: "1" }])).toThrow(AppError);
  });
  it("heeft btw-codes in basispunten met unieke codes", () => {
    expect(new Set(BASIS_BTW_CODES.map((c) => c.code)).size).toBe(BASIS_BTW_CODES.length);
    expect(BASIS_BTW_CODES.every((c) => Number.isInteger(c.tariefBasispunten) && c.tariefBasispunten <= 10000)).toBe(true);
  });
});
