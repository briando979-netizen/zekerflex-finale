import { describe, expect, it } from "vitest";
import { exportControle, type ExportControleInvoer } from "@/lib/boekhouding/export/controle";
import {
  afdrukPagina,
  htmlTekst,
  kolommenbalansHtml,
  winstVerliesHtml,
} from "@/lib/boekhouding/export/afdruk";
import {
  bepaalPeriode,
  boekjaarGrenzen,
  boekjaarVan,
  centenKomma,
  csvTekst,
  kolommenbalans,
  kolommenbalansCsv,
  kwartalenIn,
  maandenIn,
  winstVerlies,
  winstVerliesCsv,
  type ExportRekening,
} from "@/lib/boekhouding/export/kern";
import { crc32, maakZip } from "@/lib/boekhouding/export/zip";

const REKENINGEN: ExportRekening[] = [
  { nummer: "1000", naam: "Bank", soort: "ACTIVA" },
  { nummer: "1200", naam: "Debiteuren", soort: "ACTIVA" },
  { nummer: "2000", naam: "Eigen vermogen", soort: "PASSIVA" },
  { nummer: "8000", naam: "Omzet", soort: "OMZET" },
  { nummer: "4100", naam: "Software & hosting", soort: "KOSTEN" },
];

const som = (rekeningNummer: string, debetCents: number, creditCents: number) => ({ rekeningNummer, debetCents, creditCents });

describe("boekjaar en periode", () => {
  it("een kalenderboekjaar loopt van 1 januari tot 31 december", () => {
    expect(boekjaarGrenzen(2026, 1)).toEqual({ van: "2026-01-01", tot: "2026-12-31" });
  });
  it("een gebroken boekjaar loopt over de jaargrens en kent schrikkeljaren", () => {
    expect(boekjaarGrenzen(2026, 7)).toEqual({ van: "2026-07-01", tot: "2027-06-30" });
    expect(boekjaarGrenzen(2027, 3)).toEqual({ van: "2027-03-01", tot: "2028-02-29" });
  });
  it("weigert een onmogelijk jaar of startmaand in het Nederlands", () => {
    expect(() => boekjaarGrenzen(1999, 1)).toThrow("geen geldig jaar");
    expect(() => boekjaarGrenzen(2026, 13)).toThrow("startmaand");
  });
  it("boekjaarVan geeft het jaar waarin het boekjaar begon", () => {
    expect(boekjaarVan("2027-02-10", 7)).toBe(2026);
    expect(boekjaarVan("2026-08-10", 7)).toBe(2026);
  });
  it("een jaar geeft het hele boekjaar, een eigen periode blijft binnen één boekjaar", () => {
    const p = bepaalPeriode({ jaar: 2026 }, 1);
    expect(p).toMatchObject({ van: "2026-01-01", tot: "2026-12-31", boekjaarStart: "2026-01-01", heelBoekjaar: true });
    const q = bepaalPeriode({ van: "2026-04-01", tot: "2026-06-30" }, 1);
    expect(q).toMatchObject({ jaar: 2026, boekjaarStart: "2026-01-01", heelBoekjaar: false });
    expect(() => bepaalPeriode({ van: "2026-11-01", tot: "2027-02-01" }, 1)).toThrow("over twee boekjaren");
  });
  it("weigert allebei, geen van beide, ongeldige dagen en een omgekeerde periode", () => {
    expect(() => bepaalPeriode({ jaar: 2026, van: "2026-01-01", tot: "2026-02-01" }, 1)).toThrow("óf een boekjaar");
    expect(() => bepaalPeriode({}, 1)).toThrow("Kies een boekjaar");
    expect(() => bepaalPeriode({ van: "2026-02-30", tot: "2026-03-01" }, 1)).toThrow("begindatum is geen geldige dag");
    expect(() => bepaalPeriode({ van: "2026-03-01", tot: "2026-02-01" }, 1)).toThrow("begindatum ligt na");
  });
  it("maanden en kwartalen in een periode", () => {
    expect(maandenIn("2026-11-15", "2027-01-02")).toEqual([
      { jaar: 2026, maand: 11 },
      { jaar: 2026, maand: 12 },
      { jaar: 2027, maand: 1 },
    ]);
    expect(kwartalenIn("2026-02-01", "2026-08-01")).toEqual([
      { jaar: 2026, kwartaal: 1 },
      { jaar: 2026, kwartaal: 2 },
      { jaar: 2026, kwartaal: 3 },
    ]);
  });
});

describe("kolommenbalans", () => {
  const basis = { valuta: "EUR", van: "2026-04-01", tot: "2026-06-30", rekeningen: REKENINGEN };

  it("rekent opening, mutaties en eindsaldo per rekening en debet is gelijk aan credit", () => {
    const k = kolommenbalans({
      ...basis,
      openingSommen: [som("1000", 100_000, 0), som("2000", 0, 100_000)],
      mutatieSommen: [som("1000", 12_100, 0), som("8000", 0, 10_000), som("2000", 0, 2_100), som("4100", 5_000, 0), som("1000", 0, 5_000)],
    });
    const bank = k.rijen.find((r) => r.rekeningNummer === "1000");
    expect(bank).toMatchObject({ openingDebetCents: 100_000, mutatieDebetCents: 12_100, mutatieCreditCents: 5_000, eindDebetCents: 107_100, eindCreditCents: 0, kant: "BALANS" });
    expect(k.rijen.find((r) => r.rekeningNummer === "8000")).toMatchObject({ kant: "WV", eindCreditCents: 10_000 });
    expect(k.totalen.mutatieDebetCents).toBe(k.totalen.mutatieCreditCents);
    expect(k.totalen.openingDebetCents).toBe(k.totalen.openingCreditCents);
    expect(k.totalen.eindDebetCents).toBe(k.totalen.eindCreditCents);
    expect(k.inBalans).toBe(true);
    expect(k.valuta).toBe("EUR");
  });

  it("rijen staan op rekeningnummer en rekeningen zonder beweging ontbreken", () => {
    const k = kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [som("8000", 0, 100), som("1000", 100, 0)] });
    expect(k.rijen.map((r) => r.rekeningNummer)).toEqual(["1000", "8000"]);
  });

  it("een tegenboeking haalt de eerdere boeking weg: saldo nul, de rij blijft met beide mutaties", () => {
    const k = kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [som("1200", 12_100, 0), som("1200", 0, 12_100), som("8000", 0, 10_000), som("8000", 10_000, 0)] });
    const debiteuren = k.rijen.find((r) => r.rekeningNummer === "1200");
    expect(debiteuren).toMatchObject({ mutatieDebetCents: 12_100, mutatieCreditCents: 12_100, eindDebetCents: 0, eindCreditCents: 0 });
    expect(k.inBalans).toBe(true);
  });

  it("een lege periode geeft een lege, kloppende balans", () => {
    const k = kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [] });
    expect(k.rijen).toEqual([]);
    expect(k.inBalans).toBe(true);
    expect(k.totalen.eindDebetCents).toBe(0);
  });

  it("neemt het resultaat van voorgaande jaren op in het opening, zodat de balans sluit", () => {
    // vorig jaar: 10.000 winst; bank 10.000 debet staat in de opening, de winst is credit op "resultaat voorgaande jaren"
    const k = kolommenbalans({ ...basis, openingSommen: [som("1000", 10_000, 0)], mutatieSommen: [], resultaatVorigeJarenCents: 10_000 });
    const rij = k.rijen.find((r) => r.rekeningNummer === "RESVORIG");
    expect(rij).toMatchObject({ openingCreditCents: 10_000, eindCreditCents: 10_000, kant: "BALANS" });
    expect(k.inBalans).toBe(true);
  });

  it("een verlies uit vorige jaren staat aan de debetkant", () => {
    const k = kolommenbalans({ ...basis, openingSommen: [som("2000", 0, 5_000)], mutatieSommen: [], resultaatVorigeJarenCents: -5_000 });
    expect(k.rijen.find((r) => r.rekeningNummer === "RESVORIG")).toMatchObject({ openingDebetCents: 5_000 });
    expect(k.inBalans).toBe(true);
  });

  it("meldt dat de balans niet sluit als de bron niet sluit", () => {
    const k = kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [som("1000", 100, 0)] });
    expect(k.inBalans).toBe(false);
  });

  it("weigert een onbekende rekening, een negatieve som en kommabedragen", () => {
    expect(() => kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [som("9999", 1, 0)] })).toThrow("niet in het rekeningschema");
    expect(() => kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [som("1000", -1, 0)] })).toThrow("niet negatief");
    expect(() => kolommenbalans({ ...basis, openingSommen: [], mutatieSommen: [som("1000", 1.5, 0)] })).toThrow("geheel aantal centen");
  });

  it("mengt valuta's niet: de valuta van de administratie staat in uitkomst en CSV", () => {
    const k = kolommenbalans({ ...basis, valuta: "USD", openingSommen: [], mutatieSommen: [som("1000", 100, 0), som("8000", 0, 100)] });
    expect(k.valuta).toBe("USD");
    const csv = kolommenbalansCsv(k);
    expect(csv).toContain("Opening debet (USD)");
    expect(csv).not.toContain("EUR");
  });
});

describe("winst- en verliesrekening", () => {
  const basis = { valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen: REKENINGEN };

  it("resultaat is opbrengsten min kosten", () => {
    const w = winstVerlies({ ...basis, mutatieSommen: [som("8000", 0, 100_000), som("4100", 30_000, 0), som("1000", 100_000, 0), som("1000", 0, 30_000)] });
    expect(w.totaalOpbrengstenCents).toBe(100_000);
    expect(w.totaalKostenCents).toBe(30_000);
    expect(w.resultaatCents).toBe(70_000);
    expect(w.opbrengsten).toEqual([{ rekeningNummer: "8000", naam: "Omzet", bedragCents: 100_000 }]);
  });

  it("een verlies is negatief", () => {
    const w = winstVerlies({ ...basis, mutatieSommen: [som("8000", 0, 1_000), som("4100", 5_000, 0)] });
    expect(w.resultaatCents).toBe(-4_000);
  });

  it("een tegenboeking telt mee: teruggeboekte omzet vermindert de opbrengsten", () => {
    const w = winstVerlies({ ...basis, mutatieSommen: [som("8000", 0, 10_000), som("8000", 10_000, 0)] });
    expect(w.opbrengsten).toEqual([]);
    expect(w.resultaatCents).toBe(0);
  });

  it("een deels teruggeboekte omzet staat netto", () => {
    const w = winstVerlies({ ...basis, mutatieSommen: [som("8000", 0, 10_000), som("8000", 2_500, 0)] });
    expect(w.totaalOpbrengstenCents).toBe(7_500);
  });

  it("een lege periode geeft nul", () => {
    const w = winstVerlies({ ...basis, mutatieSommen: [] });
    expect(w).toMatchObject({ opbrengsten: [], kosten: [], resultaatCents: 0 });
  });

  it("balansrekeningen horen er niet in; de valuta blijft behouden", () => {
    const w = winstVerlies({ ...basis, valuta: "USD", mutatieSommen: [som("1000", 100, 0)] });
    expect(w.opbrengsten).toEqual([]);
    expect(w.valuta).toBe("USD");
    expect(() => winstVerlies({ ...basis, mutatieSommen: [som("0000", 1, 0)] })).toThrow("niet in het rekeningschema");
  });
});

describe("CSV", () => {
  it("bedragen in centen worden tekst met een komma, zonder floats", () => {
    expect(centenKomma(0)).toBe("0,00");
    expect(centenKomma(5)).toBe("0,05");
    expect(centenKomma(123_456)).toBe("1234,56");
    expect(centenKomma(-250)).toBe("-2,50");
    expect(() => centenKomma(1.5)).toThrow();
  });
  it("tekstvelden met puntkomma of aanhalingstekens worden omsloten; formules worden onschadelijk", () => {
    expect(csvTekst("a;b")).toBe('"a;b"');
    expect(csvTekst('zeg "hoi"')).toBe('"zeg ""hoi"""');
    expect(csvTekst("=SOM(A1)")).toBe("'=SOM(A1)");
    expect(csvTekst("Software & hosting")).toBe("Software & hosting");
  });
  it("de kolommenbalans-CSV heeft een BOM, een kop en een totaalregel", () => {
    const k = kolommenbalans({ valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen: REKENINGEN, openingSommen: [], mutatieSommen: [som("1000", 12_100, 0), som("8000", 0, 12_100)] });
    const csv = kolommenbalansCsv(k);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Rekening;Naam;Soort;Opening debet (EUR)");
    expect(csv).toContain("1000;Bank;Activa;0,00;0,00;121,00;0,00;121,00;0,00");
    expect(csv).toContain(";Totaal;;0,00;0,00;121,00;121,00;121,00;121,00");
    expect(csv).toContain("Debet en credit zijn gelijk");
  });
  it("de W&V-CSV noemt winst of verlies", () => {
    const w = winstVerlies({ valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen: REKENINGEN, mutatieSommen: [som("8000", 0, 10_000), som("4100", 2_500, 0)] });
    const csv = winstVerliesCsv(w);
    expect(csv).toContain("Opbrengsten;8000;Omzet;100,00");
    expect(csv).toContain("Kosten;4100;Software & hosting;25,00");
    expect(csv).toContain("Resultaat;;Winst;75,00");
  });
});

describe("printbare weergave", () => {
  it("ontsnapt tekst en bevat geen scripts", () => {
    expect(htmlTekst('<script>"x"&\'</script>')).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;&lt;/script&gt;");
    const rekeningen: ExportRekening[] = [{ nummer: "1000", naam: "<img src=x onerror=alert(1)>", soort: "ACTIVA" }, { nummer: "8000", naam: "Omzet", soort: "OMZET" }];
    const k = kolommenbalans({ valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen, openingSommen: [], mutatieSommen: [som("1000", 100, 0), som("8000", 0, 100)] });
    const w = winstVerlies({ valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen, mutatieSommen: [som("8000", 0, 100)] });
    const pagina = afdrukPagina("Test", [kolommenbalansHtml(k, "Ik & Co <b>"), winstVerliesHtml(w, "Ik & Co")]);
    expect(pagina).not.toContain("<img");
    expect(pagina).not.toContain("<script");
    expect(pagina).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(pagina).toContain("Ik &amp; Co &lt;b&gt;");
    expect(pagina).toContain("@media print");
    expect(pagina).toContain("Debet en credit zijn gelijk.");
    expect(pagina).toContain("EUR 1,00");
  });
  it("waarschuwt als de balans niet sluit en meldt een lege periode", () => {
    const k = kolommenbalans({ valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen: REKENINGEN, openingSommen: [], mutatieSommen: [som("1000", 100, 0)] });
    expect(kolommenbalansHtml(k, "X")).toContain("niet gelijk");
    const leeg = kolommenbalans({ valuta: "EUR", van: "2026-01-01", tot: "2026-12-31", rekeningen: REKENINGEN, openingSommen: [], mutatieSommen: [] });
    expect(kolommenbalansHtml(leeg, "X")).toContain("geen boekingen");
  });
});

describe("zip", () => {
  it("schrijft een geldige zip met de juiste bestanden en CRC", () => {
    const enc = new TextEncoder();
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    const zip = maakZip([
      { naam: "a.csv", inhoud: enc.encode("hallo") },
      { naam: "b.xaf", inhoud: enc.encode("<x/>") },
    ]);
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 22 + 10, true)).toBe(2);
    const naamLengte = v.getUint16(26, true);
    expect(new TextDecoder().decode(zip.subarray(30, 30 + naamLengte))).toBe("a.csv");
    expect(v.getUint32(14, true)).toBe(crc32(enc.encode("hallo")));
    const centraalStart = v.getUint32(zip.length - 22 + 16, true);
    expect(v.getUint32(centraalStart, true)).toBe(0x02014b50);
  });
  it("weigert paden en dubbele namen", () => {
    expect(() => maakZip([{ naam: "../x.csv", inhoud: new Uint8Array() }])).toThrow();
    expect(() => maakZip([{ naam: "a.csv", inhoud: new Uint8Array() }, { naam: "a.csv", inhoud: new Uint8Array() }])).toThrow();
  });
});

describe("controle voor de accountant", () => {
  const basis: ExportControleInvoer = {
    vandaag: "2027-02-01",
    van: "2026-01-01",
    tot: "2026-12-31",
    soort: "ECHT",
    boekingAantal: 10,
    inBalans: true,
    bonnen: [],
    maanden: maandenIn("2026-01-01", "2026-12-31").map((m) => ({ ...m, vergrendeld: true })),
    btwPlichtig: true,
    kwartalen: kwartalenIn("2026-01-01", "2026-12-31").map((k) => ({ ...k, status: "INGEDIEND" as const, blokkades: 0 })),
  };
  const codes = (i: ExportControleInvoer) => exportControle(i).map((m) => m.code);

  it("een nette administratie houdt alleen de XAF-opmerking over", () => {
    expect(codes(basis)).toEqual(["XAF_NIET_GEVALIDEERD"]);
  });
  it("een balans die niet sluit en bonnen om na te kijken blokkeren, en komen vooraan", () => {
    const m = exportControle({ ...basis, inBalans: false, bonnen: [{ status: "EVEN_KIJKEN" }, { status: "EVEN_KIJKEN" }, { status: "GELEZEN" }] });
    expect(m.slice(0, 2).map((x) => x.code).sort()).toEqual(["BALANS_SLUIT_NIET", "BONNEN_EVEN_KIJKEN"]);
    expect(m.find((x) => x.code === "BONNEN_EVEN_KIJKEN")?.tekst).toContain("2 bonnen wachten");
    expect(m.find((x) => x.code === "BONNEN_NIET_GEBOEKT")?.tekst).toContain("1 bon is");
  });
  it("noemt de afgelopen maanden die niet vergrendeld zijn", () => {
    const maanden = basis.maanden.map((m) => (m.maand === 3 ? { ...m, vergrendeld: false } : m));
    const t = exportControle({ ...basis, maanden }).find((x) => x.code === "MAANDEN_NIET_VERGRENDELD")?.tekst;
    expect(t).toContain("maart 2026");
    expect(t).not.toContain("april 2026");
  });
  it("een maand die nog loopt telt niet als niet-vergrendeld, maar de periode loopt nog", () => {
    const i = { ...basis, vandaag: "2026-03-10", maanden: basis.maanden.map((m) => ({ ...m, vergrendeld: false })) };
    const t = exportControle(i).find((x) => x.code === "MAANDEN_NIET_VERGRENDELD")?.tekst ?? "";
    expect(t).toContain("februari 2026");
    expect(t).not.toContain("maart 2026");
    expect(codes(i)).toContain("PERIODE_LOOPT_NOG");
  });
  it("btw: ontbrekend, niet ingediend en met blokkades", () => {
    const kwartalen = [
      { jaar: 2026, kwartaal: 1, status: "GEEN" as const, blokkades: 0 },
      { jaar: 2026, kwartaal: 2, status: "GOEDGEKEURD" as const, blokkades: 0 },
      { jaar: 2026, kwartaal: 3, status: "BEREKEND" as const, blokkades: 2 },
      { jaar: 2026, kwartaal: 4, status: "INGEDIEND" as const, blokkades: 0 },
    ];
    const c = codes({ ...basis, kwartalen });
    expect(c).toEqual(expect.arrayContaining(["BTW_GEEN_CONCEPT", "BTW_NIET_INGEDIEND", "BTW_BLOKKADES"]));
    expect(codes({ ...basis, btwPlichtig: false, kwartalen })).not.toContain("BTW_GEEN_CONCEPT");
  });
  it("testadministratie en lege periode krijgen een melding", () => {
    const c = codes({ ...basis, soort: "TEST", boekingAantal: 0 });
    expect(c).toEqual(expect.arrayContaining(["TESTADMINISTRATIE", "LEGE_PERIODE"]));
  });
});
