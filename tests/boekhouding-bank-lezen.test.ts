import { describe, expect, it } from "vitest";
import { leesCamt053 } from "@/lib/boekhouding/bank/camt053";
import { leesCsvAfschrift, splitsCsv } from "@/lib/boekhouding/bank/csv";
import { dedupeSleutels, leesBankBestand } from "@/lib/boekhouding/bank/lees";
import { bedragNaarCenten, bytesNaarTekst, datumNaarDag, eisGeldigIban, isGeldigIban, maskeerIban } from "@/lib/boekhouding/bank/tekst";
import { leesXml } from "@/lib/boekhouding/bank/xml";

// Alle voorbeeldbestanden zijn zelf geschreven; de IBAN's zijn de bekende voorbeeld-IBAN's met een geldig controlegetal.
const EIGEN = "NL91ABNA0417164300";
const KLANT = "NL02ABNA0123456789";
const HETZNER = "DE89370400440532013000";

const bytes = (s: string) => Buffer.from(s, "utf8");

const camt = (opties: { ns?: string; sluit?: string; extra?: string } = {}) => {
  const p = opties.ns ? `${opties.ns}:` : "";
  const t = (naam: string, inhoud: string, attrs = "") => `<${p}${naam}${attrs}>${inhoud}</${p}${naam}>`;
  const bal = (code: string, bedrag: string, ind: string) =>
    t("Bal", t("Tp", t("CdOrPrtry", t("Cd", code))) + t("Amt", bedrag, ' Ccy="EUR"') + t("CdtDbtInd", ind));
  const ntry1 = t(
    "Ntry",
    t("NtryRef", "1") +
      t("Amt", "121.00", ' Ccy="EUR"') +
      t("CdtDbtInd", "CRDT") +
      t("Sts", "BOOK") +
      t("BookgDt", t("Dt", "2026-11-02")) +
      t("ValDt", t("Dt", "2026-11-02")) +
      t("AcctSvcrRef", "REF001") +
      t(
        "NtryDtls",
        t(
          "TxDtls",
          t("Refs", t("EndToEndId", "E2E-1")) +
            t("RltdPties", t("Dbtr", t("Nm", "Klant &amp; Zonen BV")) + t("DbtrAcct", t("Id", t("IBAN", KLANT)))) +
            t("RmtInf", t("Ustrd", "Factuur ZF-2026-000123") + t("Strd", t("CdtrRefInf", t("Ref", "RF1234")))),
        ),
      ),
  );
  const ntry2 = t(
    "Ntry",
    t("Amt", "21.00", ' Ccy="EUR"') +
      t("CdtDbtInd", "DBIT") +
      t("Sts", "BOOK") +
      t("BookgDt", t("DtTm", "2026-11-02T23:30:00+00:00")) +
      t("AcctSvcrRef", "REF002") +
      t(
        "NtryDtls",
        t("TxDtls", t("Refs", t("EndToEndId", "NOTPROVIDED")) + t("RltdPties", t("Cdtr", t("Nm", "Hetzner Online")) + t("CdtrAcct", t("Id", t("IBAN", HETZNER)))) + t("RmtInf", t("Ustrd", "Rechnung R123"))),
      ),
  );
  const stmt = t(
    "Stmt",
    t("Id", "S1") +
      t("ElctrncSeqNb", "41") +
      t("Acct", t("Id", t("IBAN", EIGEN)) + t("Ccy", "EUR")) +
      bal("OPBD", "1000.00", "CRDT") +
      bal("CLBD", opties.sluit ?? "1100.00", "CRDT") +
      ntry1 +
      ntry2 +
      (opties.extra ?? ""),
  );
  const nsAttr = opties.ns ? ` xmlns:${opties.ns}="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"` : ' xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${p}Document${nsAttr}>${t("BkToCstmrStmt", stmt)}</${p}Document>`;
};

describe("bedragen", () => {
  it.each([
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["-12,50", -1250],
    ["+12,50", 1250],
    ["12,50-", -1250],
    ["(12,50)", -1250],
    ["12", 1200],
    ["12,5", 1250],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["€ 1.000,00", 100000],
    ["0,05", 5],
    ["-0,05", -5],
  ])("%s wordt %i cent", (ruw, verwacht) => {
    expect(bedragNaarCenten(ruw)).toBe(verwacht);
  });

  it.each(["", "abc", "1,2,3x", "12,3456", "1.2.3", "12,"])("%j is geen bedrag", (ruw) => {
    expect(bedragNaarCenten(ruw)).toBeNull();
  });
});

describe("datums en tekens", () => {
  it("kent de gangbare datumvormen en weigert onzin", () => {
    expect(datumNaarDag("20261102")).toBe("2026-11-02");
    expect(datumNaarDag("2026-11-02")).toBe("2026-11-02");
    expect(datumNaarDag("02-11-2026")).toBe("2026-11-02");
    expect(datumNaarDag("2/11/2026")).toBe("2026-11-02");
    expect(datumNaarDag("02.11.2026")).toBe("2026-11-02");
    expect(datumNaarDag("2026-02-30")).toBeNull();
    expect(datumNaarDag("02-11-26")).toBeNull();
    expect(datumNaarDag("")).toBeNull();
  });

  it("een tijdstip met zone wordt de Amsterdamse dag (23:30 UTC op 2 nov is al 3 nov in Amsterdam)", () => {
    expect(datumNaarDag("2026-11-02T23:30:00+00:00")).toBe("2026-11-03");
    expect(datumNaarDag("2026-07-01T22:30:00Z")).toBe("2026-07-02");
    expect(datumNaarDag("2026-11-02T09:00:00")).toBe("2026-11-02");
  });

  it("leest UTF-8 met BOM, UTF-16 en terugvallend Windows-1252", () => {
    expect(bytesNaarTekst(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Café", "utf8")]))).toBe("Café");
    expect(bytesNaarTekst(Buffer.from("Café", "latin1"))).toBe("Café");
    expect(bytesNaarTekst(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Café", "utf16le")]))).toBe("Café");
    // € staat in Windows-1252 op 0x80
    expect(bytesNaarTekst(Buffer.from([0x80, 0x20, 0x35]))).toBe("€ 5");
  });

  it("controleert een IBAN met modulo 97 en maskeert hem", () => {
    expect(isGeldigIban(EIGEN)).toBe(true);
    expect(isGeldigIban("NL91 ABNA 0417 1643 00")).toBe(true);
    expect(isGeldigIban("NL91ABNA0417164301")).toBe(false);
    expect(() => eisGeldigIban("NL91ABNA0417164301")).toThrow(/controlegetal/);
    expect(maskeerIban(EIGEN)).toBe("NL•• •••• •••• 4300");
    expect(maskeerIban(EIGEN)).not.toContain("0417");
    expect(maskeerIban(null)).toBe("");
  });
});

describe("xml", () => {
  it("weigert een DOCTYPE en ENTITY", () => {
    expect(() => leesXml('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>')).toThrow(/DOCTYPE/);
    expect(() => leesCamt053(`<!DOCTYPE foo SYSTEM "http://evil.example/x.dtd">${camt()}`)).toThrow(/DOCTYPE/);
  });

  it("vertaalt alleen de vijf vaste entiteiten en tekencodes", () => {
    const el = leesXml("<a>Tom &amp; Jerry &lt;b&gt; &#65;&#x42; &onbekend;</a>");
    expect(el.tekst).toBe("Tom & Jerry <b> AB &onbekend;");
  });

  it("geeft een Nederlandse fout bij kapotte of onvolledige xml", () => {
    expect(() => leesXml("<a><b></a>")).toThrow(/niet goed gesloten/);
    expect(() => leesXml("<a><b>")).toThrow(/niet compleet/);
    expect(() => leesXml("")).toThrow(/leeg/);
    expect(() => leesXml("<a><!-- open")).toThrow(/niet compleet/);
  });
});

describe("CAMT.053", () => {
  it("leest saldi, transacties, tegenpartij, kenmerk en referenties", () => {
    const a = leesCamt053(camt());
    expect(a.formaat).toBe("CAMT053");
    expect(a.rekeningIban).toBe(EIGEN);
    expect(a.afschriftNummer).toBe("41");
    expect(a.beginSaldoCents).toBe(100000);
    expect(a.eindSaldoCents).toBe(110000);
    expect(a.valuta).toBe("EUR");
    expect(a.waarschuwingen).toEqual([]);
    expect(a.transacties).toHaveLength(2);
    const [bij, af] = a.transacties;
    expect(bij).toMatchObject({
      boekdag: "2026-11-02",
      valutadag: "2026-11-02",
      bedragCents: 12100,
      tegenIban: KLANT,
      tegenNaam: "Klant & Zonen BV",
      endToEndId: "E2E-1",
      bankReferentie: "REF001",
    });
    expect(bij?.omschrijving).toBe("Factuur ZF-2026-000123 Kenmerk RF1234");
    expect(af).toMatchObject({ boekdag: "2026-11-03", bedragCents: -2100, tegenIban: HETZNER, tegenNaam: "Hetzner Online", endToEndId: null });
    expect(a.vanaf).toBe("2026-11-02");
    expect(a.totEnMet).toBe("2026-11-03");
  });

  it("leest ook xml met een namespace-voorvoegsel", () => {
    const a = leesCamt053(camt({ ns: "ns2" }));
    expect(a.transacties).toHaveLength(2);
    expect(a.rekeningIban).toBe(EIGEN);
  });

  it("waarschuwt (en blokkeert niet) als openingssaldo + mutaties niet het eindsaldo is", () => {
    const a = leesCamt053(camt({ sluit: "1234.56" }));
    expect(a.transacties).toHaveLength(2);
    expect(a.waarschuwingen).toHaveLength(1);
    expect(a.waarschuwingen[0]).toMatch(/openingssaldo .* is niet gelijk aan het eindsaldo/);
  });

  it("slaat boekingen zonder status BOOK over en draait een stornering om", () => {
    const pending = `<Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-11-04</Dt></BookgDt></Ntry>`;
    const storno = `<Ntry><Amt Ccy="EUR">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-04</Dt></BookgDt></Ntry>`;
    const a = leesCamt053(camt({ extra: pending + storno, sluit: "1100.00" }));
    expect(a.transacties).toHaveLength(3);
    expect(a.waarschuwingen.join(" ")).toMatch(/niet definitief/);
    const omgekeerd = leesCamt053(camt({ extra: `<Ntry><Amt Ccy="EUR">7.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><RvslInd>true</RvslInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-04</Dt></BookgDt></Ntry>`, sluit: "1093.00" }));
    expect(omgekeerd.transacties.at(-1)?.bedragCents).toBe(-700);
    expect(omgekeerd.waarschuwingen).toEqual([]);
  });

  it("splitst een verzamelboeking alleen als de bedragen optellen", () => {
    const tx = (bedrag: string, naam: string) =>
      `<TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">${bedrag}</Amt></TxAmt></AmtDtls><RltdPties><Dbtr><Nm>${naam}</Nm></Dbtr></RltdPties></TxDtls>`;
    const batch = (totaal: string, delen: string) =>
      `<Ntry><Amt Ccy="EUR">${totaal}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-04</Dt></BookgDt><NtryDtls>${delen}</NtryDtls></Ntry>`;
    const goed = leesCamt053(camt({ extra: batch("30.00", tx("10.00", "A") + tx("20.00", "B")), sluit: "1130.00" }));
    expect(goed.transacties.slice(2).map((t) => [t.tegenNaam, t.bedragCents])).toEqual([["A", 1000], ["B", 2000]]);
    const fout = leesCamt053(camt({ extra: batch("30.00", tx("10.00", "A") + tx("10.00", "B")), sluit: "1130.00" }));
    expect(fout.transacties).toHaveLength(3);
    expect(fout.transacties[2]?.tegenNaam).toBeNull();
  });

  it("weigert andere CAMT-soorten, meerdere rekeningen en bestanden zonder boekdatum", () => {
    expect(() => leesCamt053('<Document><BkToCstmrAcctRpt/></Document>')).toThrow(/ander type/);
    expect(() => leesCamt053("<Bericht/>")).toThrow(/geen CAMT/);
    const anders = camt().replace(EIGEN, KLANT);
    const twee = camt().replace("</BkToCstmrStmt>", anders.slice(anders.indexOf("<Stmt>"), anders.indexOf("</BkToCstmrStmt>")) + "</BkToCstmrStmt>");
    expect(() => leesCamt053(twee)).toThrow(/meerdere bankrekeningen/);
    expect(() => leesCamt053(camt({ extra: "<Ntry><Amt Ccy=\"EUR\">1.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts></Ntry>" }))).toThrow(/boekdatum/);
  });
});

const ING = [
  '"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"',
  `"20261102","Klant BV","${EIGEN}","${KLANT}","OV","Bij","1.210,00","Overschrijving","Factuur ZF-2026-000123"`,
  `"20261103","Café Hetzner ""Online""","${EIGEN}","${HETZNER}","IC","Af","12,10","Incasso","Rechnung R123"`,
].join("\r\n");

const RABO_KOP =
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"';
const raboRij = (volgnr: string, datum: string, bedrag: string, saldo: string, tegen: string, naam: string, omschr: string) =>
  `"${EIGEN}","EUR","ABNANL2A","${volgnr}","${datum}","${datum}","${bedrag}","${saldo}","${tegen}","${naam}","","","","ov","","","","","","${omschr}","","","","","",""`;

describe("CSV", () => {
  it("splitst aanhalingstekens, dubbele aanhalingstekens, puntkomma, komma en tab", () => {
    expect(splitsCsv('a;"b;c";"d""e"\n1;2;3\n', ";")).toEqual([["a", "b;c", 'd"e'], ["1", "2", "3"]]);
    expect(splitsCsv("a\tb\r\nc\td", "\t")).toEqual([["a", "b"], ["c", "d"]]);
    expect(() => splitsCsv('a;"b', ";")).toThrow(/aanhalingsteken/);
  });

  it("leest ING: Af/Bij, duizendtallen, aanhalingstekens in een naam, eigen IBAN", () => {
    const a = leesCsvAfschrift(ING);
    expect(a.herkend).toBe("ING (csv)");
    expect(a.rekeningIban).toBe(EIGEN);
    expect(a.transacties).toHaveLength(2);
    expect(a.transacties[0]).toMatchObject({ boekdag: "2026-11-02", bedragCents: 121000, tegenIban: KLANT, tegenNaam: "Klant BV", omschrijving: "Factuur ZF-2026-000123" });
    expect(a.transacties[1]).toMatchObject({ boekdag: "2026-11-03", bedragCents: -1210, tegenIban: HETZNER, tegenNaam: 'Café Hetzner "Online"' });
  });

  it("leest ING in Windows-1252 en met BOM", () => {
    const latin = leesBankBestand(Buffer.from(ING, "latin1"));
    expect(latin.transacties[1]?.tegenNaam).toBe('Café Hetzner "Online"');
    const bom = leesBankBestand(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(ING)]));
    expect(bom.transacties).toHaveLength(2);
  });

  it("leest Rabobank en controleert de saldokolom (begin- en eindsaldo komen daaruit)", () => {
    const tekst = [
      RABO_KOP,
      raboRij("1", "2026-11-02", "+1210,00", "2210,00", KLANT, "Klant BV", "Factuur ZF-2026-000123"),
      raboRij("2", "2026-11-03", "-12,10", "2197,90", HETZNER, "Hetzner", "Rechnung R123"),
    ].join("\n");
    const a = leesCsvAfschrift(tekst);
    expect(a.herkend).toBe("Rabobank (csv)");
    expect(a.rekeningIban).toBe(EIGEN);
    expect(a.beginSaldoCents).toBe(100000);
    expect(a.eindSaldoCents).toBe(219790);
    expect(a.waarschuwingen).toEqual([]);
    expect(a.transacties.map((t) => t.bedragCents)).toEqual([121000, -1210]);
    expect(a.transacties[0]?.bankReferentie).toBe("2026-11-02#1");
  });

  it("waarschuwt als de saldokolom van Rabobank niet sluit", () => {
    const tekst = [RABO_KOP, raboRij("1", "2026-11-02", "+10,00", "1000,00", KLANT, "A", "x"), raboRij("2", "2026-11-03", "+10,00", "5000,00", KLANT, "A", "y")].join("\n");
    expect(leesCsvAfschrift(tekst).waarschuwingen[0]).toMatch(/saldokolom/);
  });

  it("leest de tab-gescheiden ABN AMRO-txt zonder kopregel", () => {
    const rij = (datum: string, begin: string, eind: string, bedrag: string, tekst: string) => [EIGEN, "EUR", datum, begin, eind, datum, bedrag, tekst].join("\t");
    const tekst = [
      rij("20261102", "1000,00", "1121,00", "121,00", `SEPA Overboeking                 IBAN: ${KLANT}        BIC: ABNANL2A                    Naam: Klant BV                   Omschrijving: Factuur ZF-2026-000123`),
      rij("20261103", "1121,00", "1100,00", "-21,00", "BEA   NR:XXX 03.11.26/10.00 Winkel Amsterdam"),
    ].join("\n");
    const a = leesCsvAfschrift(tekst);
    expect(a.herkend).toMatch(/ABN AMRO/);
    expect(a.transacties[0]).toMatchObject({ bedragCents: 12100, tegenIban: KLANT, tegenNaam: "Klant BV" });
    expect(a.transacties[0]?.omschrijving).toContain("Factuur ZF-2026-000123");
    expect(a.transacties[1]?.bedragCents).toBe(-2100);
    expect(a.beginSaldoCents).toBe(100000);
    expect(a.eindSaldoCents).toBe(110000);
  });

  it("herkent een algemene csv aan de kopregel (puntkomma, Af/Bij-kolom of een teken in het bedrag)", () => {
    const metTeken = leesCsvAfschrift("Boekdatum;Bedrag;Omschrijving;Tegenpartij\n02-11-2026;1.210,00;Factuur 1;Klant BV\n03-11-2026;-12,10;Hosting;Hetzner\n");
    expect(metTeken.formaat).toBe("CSV");
    expect(metTeken.transacties.map((t) => t.bedragCents)).toEqual([121000, -1210]);
    expect(metTeken.rekeningIban).toBeNull();
    const afBij = leesCsvAfschrift("date,amount,debit/credit,description\n2026-11-02,10.00,credit,Ontvangen\n2026-11-03,4.00,debit,Betaald\n");
    expect(afBij.transacties.map((t) => t.bedragCents)).toEqual([1000, -400]);
  });

  it("zegt 'formaat niet herkend' in plaats van te gokken", () => {
    expect(() => leesCsvAfschrift("kolom een;kolom twee\n1;2\n")).toThrow(/Formaat niet herkend/);
    expect(() => leesCsvAfschrift("kolom een;kolom twee\n1;2\n")).toThrow(/kolom een/);
  });

  it("noemt de regel van een onleesbaar bedrag of datum en leest dan niets half in", () => {
    const kapot = ING + '\r\n"20261104","X","' + EIGEN + '","","OV","Bij","geen bedrag","Overschrijving",""';
    expect(() => leesCsvAfschrift(kapot)).toThrow(/Regel 4: het bedrag is niet te lezen/);
    expect(() => leesCsvAfschrift(ING.replace('"20261102"', '"morgen"'))).toThrow(/Regel 2: de datum is niet te lezen/);
  });

  it("weigert een bestand met meerdere eigen rekeningen", () => {
    expect(() => leesCsvAfschrift(ING.replace(`"${EIGEN}","${HETZNER}"`, `"${KLANT}","${HETZNER}"`))).toThrow(/meerdere bankrekeningen/);
  });
});

describe("leesBankBestand", () => {
  it("kiest de lezer op de inhoud, niet op de naam", () => {
    expect(leesBankBestand(bytes(camt())).formaat).toBe("CAMT053");
    expect(leesBankBestand(bytes(ING)).formaat).toBe("CSV");
  });

  it("geeft nette meldingen bij leeg, te groot, MT940, ander xml en binair", () => {
    expect(() => leesBankBestand(Buffer.alloc(0))).toThrow(/leeg/);
    expect(() => leesBankBestand(Buffer.alloc(5 * 1024 * 1024 + 1, 65))).toThrow(/groter dan 5 MB/);
    expect(() => leesBankBestand(bytes(":20:STMT\n:25:NL91ABNA0417164300\n:60F:C261031EUR1000,00\n:61:2611020102C121,00NTRFNONREF\n"))).toThrow(/MT940/);
    expect(() => leesBankBestand(bytes("<html><body>hoi</body></html>"))).toThrow(/geen CAMT/);
    expect(() => leesBankBestand(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toThrow(/geen tekstbestand/);
  });

  it("weigert meer dan 20.000 transacties", () => {
    const regels = ["Datum;Bedrag;Omschrijving"];
    for (let i = 0; i < 20_001; i += 1) regels.push(`02-11-2026;1,00;r${i}`);
    expect(() => leesBankBestand(bytes(regels.join("\n")))).toThrow(/meer dan 20\.000 transacties/);
    regels.pop();
    expect(leesBankBestand(bytes(regels.join("\n"))).transacties).toHaveLength(20_000);
  });
});

describe("dedupeSleutels", () => {
  const regel = (o: Partial<{ boekdag: string; bedragCents: number; omschrijving: string | null; bankReferentie: string | null }> = {}) => ({
    boekdag: "2026-11-02",
    valutadag: null,
    bedragCents: -1000,
    valuta: "EUR",
    tegenIban: null,
    tegenNaam: null,
    omschrijving: "Koffie",
    endToEndId: null,
    bankReferentie: null,
    ...o,
  });

  it("is stabiel en onafhankelijk van de plaats in het bestand (overlappende periodes)", () => {
    const a = regel({ omschrijving: "A" });
    const b = regel({ omschrijving: "B" });
    const c = regel({ omschrijving: "C" });
    const eerste = dedupeSleutels(EIGEN, [a, b]);
    const tweede = dedupeSleutels(EIGEN, [b, c]);
    expect(eerste[1]).toBe(tweede[0]);
    expect(eerste[0]).not.toBe(eerste[1]);
  });

  it("houdt twee gelijke betalingen op één dag uit elkaar maar herkent ze in een tweede bestand", () => {
    const k = regel();
    const [s0, s1] = dedupeSleutels(EIGEN, [k, k]);
    expect(s0).not.toBe(s1);
    expect(dedupeSleutels(EIGEN, [k, k])).toEqual([s0, s1]);
    expect(dedupeSleutels(EIGEN, [k])[0]).toBe(s0);
  });

  it("gebruikt de referentie van de bank en telt een herhaalde referentie op", () => {
    const sleutels = dedupeSleutels(EIGEN, [regel({ bankReferentie: "R1" }), regel({ bankReferentie: "R1" }), regel({ bankReferentie: "R2" })]);
    expect(sleutels).toEqual(["ref:R1", "ref:R1#1", "ref:R2"]);
  });

  it("verschilt per rekening en per bedrag", () => {
    expect(dedupeSleutels(EIGEN, [regel()])[0]).not.toBe(dedupeSleutels(KLANT, [regel()])[0]);
    expect(dedupeSleutels(EIGEN, [regel()])[0]).not.toBe(dedupeSleutels(EIGEN, [regel({ bedragCents: -1001 })])[0]);
  });
});
