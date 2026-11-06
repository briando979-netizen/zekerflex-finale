// ---------------------------------------------------------------------------
// E-factuur als UBL 2.1 Invoice volgens Peppol BIS Billing 3.0 (de Europese
// norm EN 16931; in Nederland ook bekend als NLCIUS). Puur bestand: geen
// prisma, kv of mail, dus overal bruikbaar en volledig te testen.
//
// Wat een boekhoudpakket (Exact, Twinfield, e-Boekhouden, Moneybird, …) of een
// Peppol-toegangspunt verwacht, staat vast: de volgorde van de elementen, de
// bedragen met twee decimalen en de identificatie van verkoper en koper via
// KVK (schema 0106) of btw-nummer (schema 9944). bouwUbl() maakt die XML,
// valideerUbl() controleert vooraf de bedrijfsregels die het vaakst misgaan.
// ---------------------------------------------------------------------------

/** EN 16931 btw-categorie: S standaard, AE verlegd, O buiten de btw, Z nultarief */
export type BtwCategorie = "S" | "AE" | "O" | "Z";

export interface UblAdres {
  straat?: string;
  postcode?: string;
  plaats?: string;
  /** ISO 3166-1 alpha-2, bijv. NL */
  land: string;
}

export interface UblPartij {
  naam: string;
  kvk?: string;
  /** btw-nummer, bijv. NL123456789B01 */
  btw?: string;
  adres: UblAdres;
  email?: string;
  /** eigen Peppol-adres van de partij; zonder dit kiezen we KVK (0106) of btw (9944) */
  peppolId?: { schema: string; id: string };
}

export interface UblRegel {
  omschrijving: string;
  /** aantal in de eenheid; uren zijn HUR, stuks C62 */
  aantal: number;
  eenheid: "HUR" | "C62" | "DAY";
  prijsCents: number;
  bedragCents: number;
}

export interface UblFactuur {
  nummer: string;
  /** 380 gewone factuur, 389 self-billing (de koper maakt hem namens de verkoper), 381 creditnota */
  soort: "factuur" | "selfbilling" | "creditnota";
  /** yyyy-mm-dd */
  datum: string;
  /** yyyy-mm-dd; verplicht zodra er iets te betalen is */
  vervaldatum?: string;
  valuta?: string;
  verkoper: UblPartij;
  koper: UblPartij;
  regels: UblRegel[];
  subtotaalCents: number;
  btwCents: number;
  totaalCents: number;
  btwCategorie: BtwCategorie;
  /** heel percentage, bijv. 21 */
  btwPercentage: number;
  /** komt in PaymentID: het kenmerk dat de koper bij de betaling vermeldt */
  betaalreferentie?: string;
  iban?: string;
  notitie?: string;
  /** NLCIUS vraagt een koperreferentie of een orderreferentie */
  koperReferentie?: string;
  orderReferentie?: string;
}

export const PEPPOL_CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
export const PEPPOL_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const SOORT_CODE: Record<UblFactuur["soort"], string> = { factuur: "380", selfbilling: "389", creditnota: "381" };

const VRIJSTELLING: Partial<Record<BtwCategorie, { code: string; reden: string }>> = {
  AE: { code: "VATEX-EU-AE", reden: "Btw verlegd" },
  O: { code: "VATEX-EU-O", reden: "Niet onderworpen aan btw" },
};

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** 1234 → "12.34" (UBL rekent in de valuta, altijd met een punt en twee decimalen) */
export function bedrag(cents: number): string {
  const neg = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${neg}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const aantalTekst = (n: number): string => n.toFixed(2);

/** Het Peppol-adres van een partij: eigen id, anders KVK (0106), anders btw (9944). */
export function peppolAdres(p: UblPartij): { schema: string; id: string } | null {
  if (p.peppolId?.id) return { schema: p.peppolId.schema, id: p.peppolId.id };
  const kvk = p.kvk?.replace(/\D/g, "");
  if (kvk && kvk.length === 8) return { schema: "0106", id: kvk };
  const btw = p.btw?.replace(/[\s.-]/g, "").toUpperCase();
  if (btw && /^NL\d{9}B\d{2}$/.test(btw)) return { schema: "9944", id: btw };
  return null;
}

export function btwCategorieVoor(behandeling: "STANDARD_RATE" | "REVERSE_CHARGE" | "OUT_OF_SCOPE", percentage: number): BtwCategorie {
  if (behandeling === "REVERSE_CHARGE") return "AE";
  if (behandeling === "OUT_OF_SCOPE") return "O";
  return percentage > 0 ? "S" : "Z";
}

function partij(tag: "AccountingSupplierParty" | "AccountingCustomerParty", p: UblPartij): string[] {
  const ep = peppolAdres(p);
  const btw = p.btw?.replace(/[\s.-]/g, "").toUpperCase();
  const kvk = p.kvk?.replace(/\D/g, "");
  const a = p.adres;
  return [
    `  <cac:${tag}>`,
    `    <cac:Party>`,
    ...(ep ? [`      <cbc:EndpointID schemeID="${escapeXml(ep.schema)}">${escapeXml(ep.id)}</cbc:EndpointID>`] : []),
    `      <cac:PartyName><cbc:Name>${escapeXml(p.naam)}</cbc:Name></cac:PartyName>`,
    `      <cac:PostalAddress>`,
    ...(a.straat ? [`        <cbc:StreetName>${escapeXml(a.straat)}</cbc:StreetName>`] : []),
    ...(a.plaats ? [`        <cbc:CityName>${escapeXml(a.plaats)}</cbc:CityName>`] : []),
    ...(a.postcode ? [`        <cbc:PostalZone>${escapeXml(a.postcode)}</cbc:PostalZone>`] : []),
    `        <cac:Country><cbc:IdentificationCode>${escapeXml(a.land.toUpperCase())}</cbc:IdentificationCode></cac:Country>`,
    `      </cac:PostalAddress>`,
    ...(btw
      ? [`      <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(btw)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`]
      : []),
    `      <cac:PartyLegalEntity>`,
    `        <cbc:RegistrationName>${escapeXml(p.naam)}</cbc:RegistrationName>`,
    ...(kvk ? [`        <cbc:CompanyID schemeID="0106">${escapeXml(kvk)}</cbc:CompanyID>`] : []),
    `      </cac:PartyLegalEntity>`,
    ...(p.email ? [`      <cac:Contact><cbc:ElectronicMail>${escapeXml(p.email)}</cbc:ElectronicMail></cac:Contact>`] : []),
    `    </cac:Party>`,
    `  </cac:${tag}>`,
  ];
}

function btwCategorieXml(f: UblFactuur, indent: string): string[] {
  const vrij = VRIJSTELLING[f.btwCategorie];
  const pct = f.btwCategorie === "S" ? f.btwPercentage : 0;
  return [
    `${indent}<cbc:ID>${f.btwCategorie}</cbc:ID>`,
    `${indent}<cbc:Percent>${pct}</cbc:Percent>`,
    ...(vrij ? [`${indent}<cbc:TaxExemptionReasonCode>${vrij.code}</cbc:TaxExemptionReasonCode>`, `${indent}<cbc:TaxExemptionReason>${vrij.reden}</cbc:TaxExemptionReason>`] : []),
    `${indent}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`,
  ];
}

/** De complete UBL-XML van een factuur. Controleer eerst met valideerUbl(). */
export function bouwUbl(f: UblFactuur): string {
  const cur = f.valuta ?? "EUR";
  const geld = (cents: number) => `currencyID="${cur}">${bedrag(cents)}`;
  const regels = f.regels.flatMap((r, i) => [
    `  <cac:InvoiceLine>`,
    `    <cbc:ID>${i + 1}</cbc:ID>`,
    `    <cbc:InvoicedQuantity unitCode="${r.eenheid}">${aantalTekst(r.aantal)}</cbc:InvoicedQuantity>`,
    `    <cbc:LineExtensionAmount ${geld(r.bedragCents)}</cbc:LineExtensionAmount>`,
    `    <cac:Item>`,
    `      <cbc:Name>${escapeXml(r.omschrijving.slice(0, 200))}</cbc:Name>`,
    `      <cac:ClassifiedTaxCategory>`,
    ...btwCategorieXml(f, "        "),
    `      </cac:ClassifiedTaxCategory>`,
    `    </cac:Item>`,
    `    <cac:Price><cbc:PriceAmount ${geld(r.prijsCents)}</cbc:PriceAmount></cac:Price>`,
    `  </cac:InvoiceLine>`,
  ]);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `  <cbc:CustomizationID>${PEPPOL_CUSTOMIZATION_ID}</cbc:CustomizationID>`,
    `  <cbc:ProfileID>${PEPPOL_PROFILE_ID}</cbc:ProfileID>`,
    `  <cbc:ID>${escapeXml(f.nummer)}</cbc:ID>`,
    `  <cbc:IssueDate>${f.datum}</cbc:IssueDate>`,
    ...(f.vervaldatum ? [`  <cbc:DueDate>${f.vervaldatum}</cbc:DueDate>`] : []),
    `  <cbc:InvoiceTypeCode>${SOORT_CODE[f.soort]}</cbc:InvoiceTypeCode>`,
    ...(f.notitie ? [`  <cbc:Note>${escapeXml(f.notitie)}</cbc:Note>`] : []),
    `  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`,
    ...(f.koperReferentie ? [`  <cbc:BuyerReference>${escapeXml(f.koperReferentie)}</cbc:BuyerReference>`] : []),
    ...(f.orderReferentie ? [`  <cac:OrderReference><cbc:ID>${escapeXml(f.orderReferentie)}</cbc:ID></cac:OrderReference>`] : []),
    ...partij("AccountingSupplierParty", f.verkoper),
    ...partij("AccountingCustomerParty", f.koper),
    ...(f.iban || f.betaalreferentie
      ? [
          `  <cac:PaymentMeans>`,
          `    <cbc:PaymentMeansCode>${f.iban ? "30" : "1"}</cbc:PaymentMeansCode>`,
          ...(f.betaalreferentie ? [`    <cbc:PaymentID>${escapeXml(f.betaalreferentie)}</cbc:PaymentID>`] : []),
          ...(f.iban ? [`    <cac:PayeeFinancialAccount><cbc:ID>${escapeXml(f.iban.replace(/\s/g, ""))}</cbc:ID></cac:PayeeFinancialAccount>`] : []),
          `  </cac:PaymentMeans>`,
        ]
      : []),
    ...(f.vervaldatum ? [`  <cac:PaymentTerms><cbc:Note>Betalen vóór ${f.vervaldatum}</cbc:Note></cac:PaymentTerms>`] : []),
    `  <cac:TaxTotal>`,
    `    <cbc:TaxAmount ${geld(f.btwCents)}</cbc:TaxAmount>`,
    `    <cac:TaxSubtotal>`,
    `      <cbc:TaxableAmount ${geld(f.subtotaalCents)}</cbc:TaxableAmount>`,
    `      <cbc:TaxAmount ${geld(f.btwCents)}</cbc:TaxAmount>`,
    `      <cac:TaxCategory>`,
    ...btwCategorieXml(f, "        "),
    `      </cac:TaxCategory>`,
    `    </cac:TaxSubtotal>`,
    `  </cac:TaxTotal>`,
    `  <cac:LegalMonetaryTotal>`,
    `    <cbc:LineExtensionAmount ${geld(f.subtotaalCents)}</cbc:LineExtensionAmount>`,
    `    <cbc:TaxExclusiveAmount ${geld(f.subtotaalCents)}</cbc:TaxExclusiveAmount>`,
    `    <cbc:TaxInclusiveAmount ${geld(f.totaalCents)}</cbc:TaxInclusiveAmount>`,
    `    <cbc:PayableAmount ${geld(f.totaalCents)}</cbc:PayableAmount>`,
    `  </cac:LegalMonetaryTotal>`,
    ...regels,
    `</Invoice>`,
    ``,
  ].join("\n");
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * De bedrijfsregels (BR-…) uit EN 16931 die een toegangspunt of boekhoudpakket
 * het eerst afkeurt. Leeg = in orde. Met `peppol: true` ook de eisen van het
 * Peppol-netwerk zelf (beide partijen een Peppol-adres).
 */
export function valideerUbl(f: UblFactuur, opts: { peppol?: boolean } = {}): string[] {
  const fouten: string[] = [];
  if (!f.nummer.trim()) fouten.push("Factuurnummer ontbreekt (BR-02).");
  if (!DATUM.test(f.datum)) fouten.push("Factuurdatum moet jjjj-mm-dd zijn (BR-03).");
  if (f.vervaldatum && !DATUM.test(f.vervaldatum)) fouten.push("Vervaldatum moet jjjj-mm-dd zijn.");
  if (!f.verkoper.naam.trim()) fouten.push("Naam van de verkoper ontbreekt (BR-06).");
  if (!f.koper.naam.trim()) fouten.push("Naam van de koper ontbreekt (BR-07).");
  if (!/^[A-Z]{2}$/i.test(f.verkoper.adres.land)) fouten.push("Landcode van de verkoper ontbreekt (BR-09).");
  if (!/^[A-Z]{2}$/i.test(f.koper.adres.land)) fouten.push("Landcode van de koper ontbreekt (BR-11).");
  if (f.regels.length === 0) fouten.push("Een factuur heeft minstens één regel (BR-16).");
  f.regels.forEach((r, i) => {
    if (!r.omschrijving.trim()) fouten.push(`Regel ${i + 1}: omschrijving ontbreekt (BR-25).`);
    if (!Number.isFinite(r.aantal)) fouten.push(`Regel ${i + 1}: aantal ontbreekt (BR-22).`);
  });
  const som = f.regels.reduce((s, r) => s + Math.round(r.bedragCents), 0);
  if (som !== Math.round(f.subtotaalCents)) fouten.push(`De regels tellen op tot ${bedrag(som)}, het subtotaal zegt ${bedrag(f.subtotaalCents)} (BR-CO-10).`);
  if (Math.round(f.subtotaalCents + f.btwCents) !== Math.round(f.totaalCents)) fouten.push("Subtotaal plus btw is niet gelijk aan het totaal (BR-CO-15).");
  if (f.btwCategorie === "S" && f.btwPercentage <= 0) fouten.push("Standaardtarief zonder percentage (BR-S-05).");
  if (f.btwCategorie === "AE") {
    if (!f.verkoper.btw) fouten.push("Btw verlegd vraagt het btw-nummer van de verkoper (BR-AE-02).");
    if (!f.koper.btw) fouten.push("Btw verlegd vraagt het btw-nummer van de koper (BR-AE-03).");
    if (f.btwCents !== 0) fouten.push("Bij btw verlegd is het btw-bedrag nul (BR-AE-09).");
  }
  if ((f.btwCategorie === "O" || f.btwCategorie === "Z") && f.btwCents !== 0) fouten.push("Zonder btw hoort het btw-bedrag nul te zijn.");
  if (f.totaalCents > 0 && !f.vervaldatum) fouten.push("Vervaldatum ontbreekt terwijl er iets te betalen is (BR-CO-25).");
  if (!f.koperReferentie && !f.orderReferentie) fouten.push("Koperreferentie of orderreferentie ontbreekt (NLCIUS BR-NL-10).");
  if (opts.peppol) {
    if (!peppolAdres(f.verkoper)) fouten.push("De verkoper heeft geen Peppol-adres: vul een KVK- of btw-nummer in (PEPPOL-EN16931-R020).");
    if (!peppolAdres(f.koper)) fouten.push("De koper heeft geen Peppol-adres: KVK-, btw-nummer of eigen Peppol-ID nodig (PEPPOL-EN16931-R010).");
  }
  return fouten;
}

/** Bestandsnaam voor download of bijlage, zonder rare tekens. */
export function ublBestandsnaam(f: Pick<UblFactuur, "nummer">): string {
  return `${f.nummer.replace(/[^A-Za-z0-9_-]+/g, "-")}-ubl.xml`;
}
