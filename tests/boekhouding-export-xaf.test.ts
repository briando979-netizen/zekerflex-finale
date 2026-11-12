import { describe, expect, it } from "vitest";
import { type ExportRekening } from "@/lib/boekhouding/export/kern";
import { XAF_CONFIG, maakXaf, periodeNummer, schoonXmlTekst, xafBedrag, xmlTekst, type XafInvoer } from "@/lib/boekhouding/export/xaf";

// Let op: deze tests controleren de vorm en de sommen, niet het officiële XSD (dat is niet beschikbaar).

const REKENINGEN: ExportRekening[] = [
  { nummer: "1000", naam: "Bank", soort: "ACTIVA" },
  { nummer: "1200", naam: "Debiteuren", soort: "ACTIVA" },
  { nummer: "2000", naam: "Eigen vermogen", soort: "PASSIVA" },
  { nummer: "8000", naam: "Omzet & overig", soort: "OMZET" },
  { nummer: "4100", naam: "Kosten <hosting>", soort: "KOSTEN" },
];

const invoer = (extra: Partial<XafInvoer> = {}): XafInvoer => ({
  bedrijf: { id: "adm1abcdef", naam: 'Zekerflex, Inc. "Test" & Co', land: "US", btwNummer: null },
  valuta: "EUR",
  jaar: 2026,
  van: "2026-01-01",
  tot: "2026-12-31",
  startMaand: 1,
  rekeningen: REKENINGEN,
  opening: [],
  boekingen: [
    {
      boekstuk: "VK-2026-000001",
      dagboek: "VERKOOP",
      datum: "2026-03-05",
      omschrijving: "Factuur 2026-0001",
      valuta: "EUR",
      docRef: "VK-2026-000001",
      regels: [
        { rekeningNummer: "1200", debetCents: 12_100, creditCents: 0 },
        { rekeningNummer: "8000", debetCents: 0, creditCents: 12_100, omschrijving: "Omzet <test>" },
      ],
    },
    {
      boekstuk: "IK-2026-000001",
      dagboek: "INKOOP",
      datum: "2026-04-02",
      omschrijving: "Bon bonid",
      valuta: "EUR",
      docRef: "cm0bonabcdef12345",
      regels: [
        { rekeningNummer: "4100", debetCents: 5, creditCents: 0 },
        { rekeningNummer: "1000", debetCents: 0, creditCents: 5 },
      ],
    },
  ],
  aangemaakt: "2026-11-12",
  ...extra,
});

describe("hulpjes", () => {
  it("bedragen uit centen met een punt en twee decimalen, zonder floatafronding", () => {
    expect(xafBedrag(0)).toBe("0.00");
    expect(xafBedrag(5)).toBe("0.05");
    expect(xafBedrag(12_100)).toBe("121.00");
    expect(xafBedrag(1_999_999_999)).toBe("19999999.99");
    expect(() => xafBedrag(-1)).toThrow("positief");
    expect(() => xafBedrag(0.1 + 0.2)).toThrow();
  });
  it("ontsnapt de vijf speciale tekens", () => {
    expect(xmlTekst(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });
  it("haalt ongeldige XML-tekens weg maar laat emoji en tabs staan", () => {
    expect(schoonXmlTekst("a\u0000b\u0008c\u000bd￾e\ud800f")).toBe("abcdef");
    expect(schoonXmlTekst("tab\tregel\n😀")).toBe("tab\tregel\n😀");
  });
  it("het periodenummer telt vanaf de startmaand van het boekjaar", () => {
    expect(periodeNummer("2026-03-05", 1)).toBe(3);
    expect(periodeNummer("2026-07-01", 7)).toBe(1);
    expect(periodeNummer("2027-06-30", 7)).toBe(12);
  });
});

describe("maakXaf", () => {
  it("bouwt de gangbare onderdelen in de verwachte volgorde", () => {
    const { xml } = maakXaf(invoer());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2">')).toBe(true);
    const volgorde = ["<header>", "<company>", "<companyIdent>", "<companyName>", "<taxRegistrationCountry>", "<customersSuppliers/>", "<generalLedger>", "<periods>", "<transactions>", "<journal>", "<transaction>", "<trLine>"];
    let vorige = -1;
    for (const tag of volgorde) {
      const i = xml.indexOf(tag);
      expect(i, tag).toBeGreaterThan(vorige);
      vorige = i;
    }
    expect(xml).toContain("<fiscalYear>2026</fiscalYear>");
    expect(xml).toContain("<startDate>2026-01-01</startDate>");
    expect(xml).toContain("<curCode>EUR</curCode>");
    expect(xml).toContain("<dateCreated>2026-11-12</dateCreated>");
    expect(xml).toContain("<accID>1000</accID>");
    expect(xml).toContain("<accTp>B</accTp>");
    expect(xml).toContain("<accTp>P</accTp>");
    expect(xml).toContain("<periodNumber>12</periodNumber>");
    expect(xml).toContain("<periodDesc>maart 2026</periodDesc>");
    expect(xml).toContain("<endDatePeriod>2026-02-28</endDatePeriod>");
    expect(xml).not.toContain("<taxRegIdent>");
  });

  it("totalen: regelaantal, totalDebit gelijk aan totalCredit en consistent met de regels", () => {
    const u = maakXaf(invoer());
    expect(u.linesCount).toBe(4);
    expect(u.transactieAantal).toBe(2);
    expect(u.totalDebitCents).toBe(12_105);
    expect(u.totalCreditCents).toBe(12_105);
    expect(u.xml).toContain("<linesCount>4</linesCount>");
    expect(u.xml).toContain("<totalDebit>121.05</totalDebit>");
    expect(u.xml).toContain("<totalCredit>121.05</totalCredit>");
    expect((u.xml.match(/<trLine>/g) ?? []).length).toBe(4);
    const bedragen = [...u.xml.matchAll(/<amnt>(\d+\.\d{2})<\/amnt>\n\s*<amntTp>([DC])<\/amntTp>\n\s*<\/trLine>/g)];
    expect(bedragen.length).toBe(4);
    const d = bedragen.filter((m) => m[2] === "D").reduce((s, m) => s + Math.round(Number(m[1]) * 100), 0);
    const c = bedragen.filter((m) => m[2] === "C").reduce((s, m) => s + Math.round(Number(m[1]) * 100), 0);
    expect(d).toBe(c);
  });

  it("ontsnapt de namen en laat de XML well-formed (alle tags gesloten, geen losse &)", () => {
    const { xml } = maakXaf(invoer());
    expect(xml).toContain("<companyName>Zekerflex, Inc. &quot;Test&quot; &amp; Co</companyName>");
    expect(xml).toContain("<accDesc>Omzet &amp; overig</accDesc>");
    expect(xml).toContain("<accDesc>Kosten &lt;hosting&gt;</accDesc>");
    expect(xml).toContain("<desc>Omzet &lt;test&gt;</desc>");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    // tags zijn in evenwicht: elke open-tag heeft een sluit-tag (zelfsluitende tellen niet mee)
    const stapel: string[] = [];
    for (const m of xml.matchAll(/<(\/?)([A-Za-z][A-Za-z0-9]*)([^>]*?)(\/?)>/g)) {
      if (m[4] === "/") continue;
      if (m[1] === "/") expect(stapel.pop()).toBe(m[2]);
      else stapel.push(m[2] as string);
    }
    expect(stapel).toEqual([]);
  });

  it("alle datums zijn jjjj-mm-dd en een tag met een datum bevat niets anders", () => {
    const { xml } = maakXaf(invoer());
    const datums = [...xml.matchAll(/<(startDate|endDate|dateCreated|trDt|effDate|startDatePeriod|endDatePeriod)>([^<]*)<\//g)];
    expect(datums.length).toBeGreaterThan(20);
    for (const m of datums) expect(m[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("docRef verwijst naar het bonnummer als er een bon is, anders naar het boekstuk; er staan geen tegenpartijen in", () => {
    const { xml } = maakXaf(invoer());
    expect(xml).toContain("<docRef>cm0bonabcdef12345</docRef>");
    expect(xml).toContain("<docRef>VK-2026-000001</docRef>");
    expect(xml).toContain("<customersSuppliers/>");
  });

  it("btw-nummer en adres komen mee als ze er zijn", () => {
    const { xml } = maakXaf(invoer({ bedrijf: { id: "adm1abcdef", naam: "X", land: "NL", btwNummer: "NL001234567B01", adres: "Straat 1" } }));
    expect(xml).toContain("<taxRegIdent>NL001234567B01</taxRegIdent>");
    expect(xml).toContain("<streetAddress>Straat 1</streetAddress>");
    expect(xml).toContain("<taxRegistrationCountry>NL</taxRegistrationCountry>");
  });

  it("de openingsbalans komt mee, met het resultaat van voorgaande jaren als eigen rekening", () => {
    const u = maakXaf(
      invoer({
        opening: [
          { rekeningNummer: "1000", debetCents: 10_000, creditCents: 0 },
          { rekeningNummer: "RESVORIG", debetCents: 0, creditCents: 10_000 },
        ],
      }),
    );
    expect(u.xml).toContain("<openingBalance>");
    expect(u.xml).toContain("<accID>RESVORIG</accID>");
    expect(u.xml.indexOf("<openingBalance>")).toBeGreaterThan(u.xml.indexOf("<periods>"));
    expect(u.xml.indexOf("<openingBalance>")).toBeLessThan(u.xml.indexOf("<transactions>"));
    expect(u.xml).toContain("<totalDebit>100.00</totalDebit>");
  });

  it("een lege administratie geeft een geldig bestand met nullen", () => {
    const u = maakXaf(invoer({ boekingen: [] }));
    expect(u.linesCount).toBe(0);
    expect(u.xml).toContain("<totalDebit>0.00</totalDebit>");
    expect(u.xml).not.toContain("<journal>");
    expect(u.xml).not.toContain("<openingBalance>");
  });

  it("een gebroken boekjaar telt de periodes vanaf de startmaand", () => {
    const u = maakXaf(invoer({ jaar: 2026, van: "2026-07-01", tot: "2027-06-30", startMaand: 7, boekingen: [] }));
    expect(u.xml).toContain("<periodDesc>juli 2026</periodDesc>");
    expect(u.xml).toContain("<periodDesc>juni 2027</periodDesc>");
  });

  it("de elementnamen komen uit de configuratie op één plek", () => {
    expect(XAF_CONFIG.el.trLine).toBe("trLine");
    expect(maakXaf(invoer()).xml).toContain(`<${XAF_CONFIG.el.generalLedger}>`);
  });

  describe("weigert wat niet klopt, in het Nederlands", () => {
    it("een boeking die niet sluit", () => {
      const b = invoer().boekingen.map((x, i) => (i === 0 ? { ...x, regels: [{ rekeningNummer: "1200", debetCents: 100, creditCents: 0 }, { rekeningNummer: "8000", debetCents: 0, creditCents: 99 }] } : x));
      expect(() => maakXaf(invoer({ boekingen: b }))).toThrow("sluit niet");
    });
    it("een regel naar een onbekende rekening", () => {
      const b = invoer().boekingen.map((x, i) => (i === 0 ? { ...x, regels: [{ rekeningNummer: "1200", debetCents: 100, creditCents: 0 }, { rekeningNummer: "9999", debetCents: 0, creditCents: 100 }] } : x));
      expect(() => maakXaf(invoer({ boekingen: b }))).toThrow("rekening 9999, die niet in het rekeningschema staat");
    });
    it("een andere valuta dan de administratie", () => {
      const b = invoer().boekingen.map((x, i) => (i === 0 ? { ...x, valuta: "USD" } : x));
      expect(() => maakXaf(invoer({ boekingen: b }))).toThrow("Valuta's worden niet gemengd");
      expect(() => maakXaf(invoer({ valuta: "USD" }))).toThrow("Valuta's worden niet gemengd");
    });
    it("een ongeldige datum, een datum buiten het boekjaar en een dubbel boekstuk", () => {
      const [eerste, tweede] = invoer().boekingen as [XafInvoer["boekingen"][number], XafInvoer["boekingen"][number]];
      expect(() => maakXaf(invoer({ boekingen: [{ ...eerste, datum: "2026-02-30" }] }))).toThrow("geen geldige datum");
      expect(() => maakXaf(invoer({ boekingen: [{ ...eerste, datum: "2025-12-31" }] }))).toThrow("buiten het boekjaar");
      expect(() => maakXaf(invoer({ boekingen: [eerste, { ...tweede, boekstuk: eerste.boekstuk }] }))).toThrow("twee keer");
    });
    it("een regel met twee kanten, een kommabedrag of een negatief bedrag", () => {
      const [eerste] = invoer().boekingen as [XafInvoer["boekingen"][number]];
      const met = (r: { debetCents: number; creditCents: number }) => ({ ...eerste, regels: [{ rekeningNummer: "1200", ...r }, { rekeningNummer: "8000", debetCents: 0, creditCents: 100 }] });
      expect(() => maakXaf(invoer({ boekingen: [met({ debetCents: 100, creditCents: 100 })] }))).toThrow("precies één kant");
      expect(() => maakXaf(invoer({ boekingen: [met({ debetCents: 100.5, creditCents: 0 })] }))).toThrow("precies één kant");
      expect(() => maakXaf(invoer({ boekingen: [met({ debetCents: -100, creditCents: 0 })] }))).toThrow("precies één kant");
    });
    it("een openingsbalans die niet sluit of op een resultaatrekening staat", () => {
      expect(() => maakXaf(invoer({ opening: [{ rekeningNummer: "1000", debetCents: 100, creditCents: 0 }] }))).toThrow("openingsbalans sluit niet");
      expect(() => maakXaf(invoer({ opening: [{ rekeningNummer: "8000", debetCents: 100, creditCents: 0 }, { rekeningNummer: "2000", debetCents: 0, creditCents: 100 }] }))).toThrow("geen balansrekening");
    });
    it("een ongeldige valutacode, datum of land", () => {
      expect(() => maakXaf(invoer({ valuta: "eur" }))).toThrow("drie hoofdletters");
      expect(() => maakXaf(invoer({ aangemaakt: "12-11-2026" }))).toThrow("aanmaakdatum");
      expect(() => maakXaf(invoer({ bedrijf: { id: "a", naam: "b", land: "Nederland" } }))).toThrow("twee hoofdletters");
    });
    it("een rekeningnummer dat twee keer in het schema staat", () => {
      expect(() => maakXaf(invoer({ rekeningen: [...REKENINGEN, { nummer: "1000", naam: "Dubbel", soort: "ACTIVA" }] }))).toThrow("twee keer");
    });
  });
});
