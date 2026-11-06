import { describe, expect, it } from "vitest";
import { bedrag, bouwUbl, btwCategorieVoor, escapeXml, peppolAdres, ublBestandsnaam, valideerUbl, type UblFactuur } from "@/lib/efactuur/ubl";
import { peppolIdGeldig, splitsPeppolId } from "@/lib/efactuur/instellingen";

// De e-factuur (UBL 2.1, Peppol BIS 3 / NLCIUS) die boekhoudpakketten inlezen.
// Een fout hier betekent dat een pakket de factuur afkeurt, dus de regels die
// het vaakst misgaan (totalen, btw-categorie, Peppol-adres) liggen hier vast.

const basis: UblFactuur = {
  nummer: "ZF-PF-2026-000123",
  soort: "factuur",
  datum: "2026-11-05",
  vervaldatum: "2026-11-19",
  verkoper: { naam: "ZekerFlex B.V.", kvk: "12345678", btw: "NL123456789B01", adres: { straat: "Keizersgracht 1", postcode: "1015 AA", plaats: "Amsterdam", land: "NL" }, email: "info@zekerflex.com" },
  koper: { naam: "Brasserie Het Plein <Test> & Co", kvk: "87654321", btw: "NL987654321B01", adres: { straat: "Plein 2", postcode: "3011 AB", plaats: "Rotterdam", land: "NL" } },
  regels: [{ omschrijving: "Platformkosten 8 uur", aantal: 8, eenheid: "HUR", prijsCents: 350, bedragCents: 2800 }],
  subtotaalCents: 2800,
  btwCents: 588,
  totaalCents: 3388,
  btwCategorie: "S",
  btwPercentage: 21,
  betaalreferentie: "ZF-PF-2026-000123",
  iban: "NL91 ABNA 0417 1643 00",
  koperReferentie: "Kostenplaats keuken",
};

describe("bedragen en tekst", () => {
  it("schrijft centen als bedrag met punt en twee decimalen", () => {
    expect(bedrag(2800)).toBe("28.00");
    expect(bedrag(5)).toBe("0.05");
    expect(bedrag(-1250)).toBe("-12.50");
  });

  it("maakt tekst veilig voor XML", () => {
    expect(escapeXml(`a < b & "c" 'd'`)).toBe("a &lt; b &amp; &quot;c&quot; &apos;d&apos;");
  });

  it("bestandsnaam zonder rare tekens", () => {
    expect(ublBestandsnaam({ nummer: "ZF/PF 2026 #1" })).toBe("ZF-PF-2026-1-ubl.xml");
  });
});

describe("Peppol-adres", () => {
  it("eigen id gaat voor, dan KVK (0106), dan btw (9944)", () => {
    expect(peppolAdres({ naam: "x", peppolId: { schema: "0190", id: "00000001234567890000" }, kvk: "12345678", adres: { land: "NL" } })).toEqual({ schema: "0190", id: "00000001234567890000" });
    expect(peppolAdres({ naam: "x", kvk: "1234 5678", adres: { land: "NL" } })).toEqual({ schema: "0106", id: "12345678" });
    expect(peppolAdres({ naam: "x", btw: "nl123456789b01", adres: { land: "NL" } })).toEqual({ schema: "9944", id: "NL123456789B01" });
    expect(peppolAdres({ naam: "x", adres: { land: "NL" } })).toBeNull();
  });

  it("herkent en splitst een ingevuld Peppol-adres", () => {
    expect(peppolIdGeldig("0106:12345678")).toBe(true);
    expect(peppolIdGeldig("9944:NL123456789B01")).toBe(true);
    expect(peppolIdGeldig("12345678")).toBe(false);
    expect(peppolIdGeldig("0106:")).toBe(false);
    expect(splitsPeppolId("0106:12345678")).toEqual({ schema: "0106", id: "12345678" });
    expect(splitsPeppolId("kapot")).toBeUndefined();
    expect(splitsPeppolId(undefined)).toBeUndefined();
  });
});

describe("btw-categorie", () => {
  it("volgt de btw-behandeling van de factuur", () => {
    expect(btwCategorieVoor("STANDARD_RATE", 21)).toBe("S");
    expect(btwCategorieVoor("STANDARD_RATE", 0)).toBe("Z");
    expect(btwCategorieVoor("REVERSE_CHARGE", 0)).toBe("AE");
    expect(btwCategorieVoor("OUT_OF_SCOPE", 0)).toBe("O");
  });
});

describe("bouwUbl", () => {
  const xml = bouwUbl(basis);

  it("is een Peppol BIS 3-factuur met de vaste kop", () => {
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(xml).toContain("urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0");
    expect(xml).toContain("<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>");
    expect(xml).toContain("<cbc:ID>ZF-PF-2026-000123</cbc:ID>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cbc:DueDate>2026-11-19</cbc:DueDate>");
  });

  it("zet beide partijen met Peppol-adres, btw en KVK", () => {
    expect(xml).toContain(`<cbc:EndpointID schemeID="0106">12345678</cbc:EndpointID>`);
    expect(xml).toContain(`<cbc:EndpointID schemeID="0106">87654321</cbc:EndpointID>`);
    expect(xml).toContain("<cbc:CompanyID>NL987654321B01</cbc:CompanyID>");
    expect(xml).toContain(`<cbc:CompanyID schemeID="0106">87654321</cbc:CompanyID>`);
    expect(xml).toContain("<cbc:Name>Brasserie Het Plein &lt;Test&gt; &amp; Co</cbc:Name>");
    expect(xml).not.toContain("<Test>");
  });

  it("totalen, btw en regels kloppen met elkaar", () => {
    expect(xml).toContain(`<cbc:TaxAmount currencyID="EUR">5.88</cbc:TaxAmount>`);
    expect(xml).toContain(`<cbc:TaxableAmount currencyID="EUR">28.00</cbc:TaxableAmount>`);
    expect(xml).toContain(`<cbc:PayableAmount currencyID="EUR">33.88</cbc:PayableAmount>`);
    expect(xml).toContain(`<cbc:InvoicedQuantity unitCode="HUR">8.00</cbc:InvoicedQuantity>`);
    expect(xml).toContain(`<cbc:PriceAmount currencyID="EUR">3.50</cbc:PriceAmount>`);
    expect(xml).toContain("<cbc:Percent>21</cbc:Percent>");
    expect(xml).toContain("<cbc:ID>NL91ABNA0417164300</cbc:ID>");
    expect(xml).toContain("<cbc:BuyerReference>Kostenplaats keuken</cbc:BuyerReference>");
  });

  it("btw verlegd krijgt categorie AE met vrijstellingscode, self-billing code 389", () => {
    const ae = bouwUbl({ ...basis, soort: "selfbilling", btwCategorie: "AE", btwPercentage: 0, btwCents: 0, totaalCents: 2800 });
    expect(ae).toContain("<cbc:InvoiceTypeCode>389</cbc:InvoiceTypeCode>");
    expect(ae).toContain("<cbc:ID>AE</cbc:ID>");
    expect(ae).toContain("<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>");
    expect(ae).toContain("<cbc:Percent>0</cbc:Percent>");
  });

  it("elementen staan in de volgorde van het schema", () => {
    const volgorde = ["cbc:CustomizationID", "cbc:ProfileID", "<cbc:ID>", "cbc:IssueDate", "cbc:DueDate", "cbc:InvoiceTypeCode", "cbc:DocumentCurrencyCode", "cbc:BuyerReference", "cac:AccountingSupplierParty", "cac:AccountingCustomerParty", "cac:PaymentMeans", "cac:PaymentTerms", "cac:TaxTotal", "cac:LegalMonetaryTotal", "cac:InvoiceLine"];
    const posities = volgorde.map((v) => xml.indexOf(v));
    expect(posities.every((p) => p >= 0)).toBe(true);
    expect([...posities].sort((a, b) => a - b)).toEqual(posities);
  });
});

describe("valideerUbl", () => {
  it("keurt een nette factuur goed, ook voor Peppol", () => {
    expect(valideerUbl(basis)).toEqual([]);
    expect(valideerUbl(basis, { peppol: true })).toEqual([]);
  });

  it("ziet verkeerde totalen", () => {
    expect(valideerUbl({ ...basis, subtotaalCents: 2700 }).join(" ")).toMatch(/BR-CO-10/);
    expect(valideerUbl({ ...basis, totaalCents: 3300 }).join(" ")).toMatch(/BR-CO-15/);
  });

  it("eist btw-nummers bij verlegde btw en een vervaldatum als er iets te betalen is", () => {
    const { btw: _weg, ...koperZonderBtw } = basis.koper;
    const f = valideerUbl({ ...basis, btwCategorie: "AE", btwCents: 0, totaalCents: 2800, koper: koperZonderBtw });
    expect(f.join(" ")).toMatch(/BR-AE-03/);
    const { vervaldatum: _v, ...zonder } = basis;
    expect(valideerUbl(zonder).join(" ")).toMatch(/BR-CO-25/);
    expect(valideerUbl({ ...zonder, totaalCents: 0, subtotaalCents: 0, btwCents: 0, regels: [{ ...basis.regels[0]!, bedragCents: 0 }] })).toEqual([]);
  });

  it("Peppol vraagt van beide partijen een adres op het netwerk", () => {
    const koper = { naam: "Particulier", adres: { land: "NL" } };
    expect(valideerUbl({ ...basis, koper })).toEqual([]);
    expect(valideerUbl({ ...basis, koper }, { peppol: true }).join(" ")).toMatch(/R010/);
  });

  it("een koper- of orderreferentie is verplicht (NLCIUS)", () => {
    const { koperReferentie: _k, ...zonder } = basis;
    expect(valideerUbl(zonder).join(" ")).toMatch(/BR-NL-10/);
    expect(valideerUbl({ ...zonder, orderReferentie: "PO-1" })).toEqual([]);
  });
});
