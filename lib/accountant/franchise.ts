// ---------------------------------------------------------------------------
// Delaware franchise tax voor een corporation: de twee officiële methodes naast elkaar.
// Zuiver rekenwerk (geen database, geen model), zodat het scherm en de tests dezelfde sommen delen.
// Bron: https://corp.delaware.gov/frtaxcalc/ en https://corp.delaware.gov/paytaxes/
// (bedragen gelezen op 12 nov 2026). Delaware kan bedragen wijzigen: de leesdatum staat in het scherm.
// ---------------------------------------------------------------------------

export const FRANCHISE_BRON = {
  naam: "Delaware Division of Corporations: Methods of Calculating Franchise Tax",
  url: "https://corp.delaware.gov/frtaxcalc/",
  aanvullend: "https://corp.delaware.gov/paytaxes/",
  gelezen: "2026-11-12",
} as const;

export const FRANCHISE = {
  /** Authorized shares-methode: tot en met 5.000 aandelen. */
  tot5000: 175,
  /** 5.001 tot en met 10.000 aandelen. */
  tot10000: 250,
  /** Per extra 10.000 aandelen of een deel daarvan. */
  per10000: 85,
  /** Assumed par value capital-methode: per $1.000.000 (of een deel daarvan). */
  perMiljoen: 400,
  minimumApvc: 400,
  maximum: 200_000,
  /** Jaarlijks verslag (annual report) voor een gewone Delaware corporation. */
  annualReportFee: 50,
  /** Te laat: boete plus rente per maand over belasting en boete. */
  boeteTeLaat: 200,
  renteTeLaatPerMaand: 0.015,
} as const;

export interface FranchiseInvoer {
  /** Aantal geautoriseerde aandelen (volgens de oprichtingsakte). */
  geautoriseerd: number;
  /** Aantal uitgegeven aandelen, inclusief eigen aandelen, per 31 december. */
  uitgegeven: number;
  /** Totale bezittingen (gross assets) per 31 december: "total assets" uit Schedule L van Form 1120. */
  grossAssets: number;
  /** Nominale waarde (par value) per aandeel in dollars; 0 = geen par value (dan geldt alleen de eerste methode). */
  nominaal: number;
}

/** Letterlijk uit de bron (frtaxcalc, onder "Authorized Shares Method"), nagelezen 12 nov 2026. */
export const ZONDER_PAR_REGEL = "For corporations having no par value stock the authorized shares method will always result in the lesser tax.";

export interface FranchiseUitslag {
  autorisatieMethode: { belasting: number; uitleg: string[] };
  /** null als de invoer niet volstaat (geen uitgegeven aandelen) of de aandelen geen par value hebben. */
  apvcMethode: { belasting: number; assumedPar: number; capital: number; uitleg: string[] } | null;
  /** Waarom de tweede methode niet is berekend, in gewone taal; null = wel berekend. */
  apvcNiet: string | null;
  /** Gunstigste methode; null als de tweede methode niet te berekenen is. */
  gunstigste: "autorisatie" | "apvc" | "gelijk" | null;
  /** Wat je met de gunstigste methode betaalt, exclusief annual report fee. */
  belasting: number;
  annualReportFee: number;
  totaal: number;
  /** Hoeveel de autorisatiemethode (wat Delaware vaak vooraf vraagt) meer kost dan de andere. */
  verschil: number | null;
}

const afr = (n: number) => Math.round(n * 100) / 100;
const getal = (n: number, max = 2) => n.toLocaleString("nl-NL", { maximumFractionDigits: max });
const usd = (n: number) => `$${getal(n)}`;

/** Authorized shares-methode. */
export function autorisatieBelasting(geautoriseerd: number): number {
  const n = Number.isFinite(geautoriseerd) ? Math.max(0, Math.floor(geautoriseerd)) : 0;
  let t: number;
  if (n <= 5000) t = FRANCHISE.tot5000;
  else if (n <= 10_000) t = FRANCHISE.tot10000;
  else t = FRANCHISE.tot10000 + FRANCHISE.per10000 * Math.ceil((n - 10_000) / 10_000);
  return Math.min(t, FRANCHISE.maximum);
}

/**
 * Assumed par value capital-methode (één soort aandelen). Assumed par = gross assets / uitgegeven aandelen
 * (zes decimalen). Aandelen met een lagere nominale waarde tellen met de assumed par, hogere met hun eigen.
 */
export function apvcBelasting(i: FranchiseInvoer): { belasting: number; assumedPar: number; capital: number } | null {
  if (!(i.uitgegeven > 0)) return null;
  // Zonder par value rekent Delaware met de authorized shares-methode (ZONDER_PAR_REGEL); met 0 als
  // nominaal zou de som hieronder ten onrechte op het minimum van $400 uitkomen.
  if (!(i.nominaal > 0)) return null;
  const assumedPar = Math.round((Math.max(0, i.grossAssets) / i.uitgegeven) * 1e6) / 1e6;
  const capital = afr(Math.max(0, i.geautoriseerd) * Math.max(assumedPar, Math.max(0, i.nominaal)));
  const rauw = capital <= 1_000_000 ? (capital / 1_000_000) * FRANCHISE.perMiljoen : Math.ceil(capital / 1_000_000) * FRANCHISE.perMiljoen;
  const belasting = Math.min(Math.max(afr(rauw), FRANCHISE.minimumApvc), FRANCHISE.maximum);
  return { belasting, assumedPar, capital };
}

export function berekenFranchise(i: FranchiseInvoer): FranchiseUitslag {
  const auto = autorisatieBelasting(i.geautoriseerd);
  const n = Number.isFinite(i.geautoriseerd) ? Math.max(0, Math.floor(i.geautoriseerd)) : 0;
  const autoUitleg =
    n <= 5000
      ? [`${getal(n)} aandelen: het vaste bedrag tot en met 5.000 aandelen is ${usd(FRANCHISE.tot5000)}.`]
      : n <= 10_000
        ? [`${getal(n)} aandelen: het vaste bedrag voor 5.001 tot en met 10.000 aandelen is ${usd(FRANCHISE.tot10000)}.`]
        : [
            `Eerste 10.000 aandelen: ${usd(FRANCHISE.tot10000)}.`,
            `De overige ${getal(n - 10_000)} aandelen in blokken van 10.000 (een deel telt als een heel blok): ${getal(Math.ceil((n - 10_000) / 10_000))} × ${usd(FRANCHISE.per10000)}.`,
            auto === FRANCHISE.maximum ? `Delaware stopt bij ${usd(FRANCHISE.maximum)}.` : `Samen ${usd(auto)}.`,
          ];

  const a = apvcBelasting(i);
  const apvc = a
    ? {
        ...a,
        uitleg: [
          `Assumed par = bezittingen ${usd(i.grossAssets)} gedeeld door ${getal(i.uitgegeven)} uitgegeven aandelen = ${getal(a.assumedPar, 6)} per aandeel.`,
          `Assumed par value capital = ${getal(n)} geautoriseerde aandelen × ${getal(Math.max(a.assumedPar, i.nominaal), 6)} = ${usd(a.capital)}.`,
          `Tarief ${usd(FRANCHISE.perMiljoen)} per $1.000.000 (of een deel daarvan), minimaal ${usd(FRANCHISE.minimumApvc)}: ${usd(a.belasting)}.`,
        ],
      }
    : null;

  let gunstigste: FranchiseUitslag["gunstigste"] = null;
  let belasting = auto;
  if (apvc) {
    gunstigste = apvc.belasting < auto ? "apvc" : apvc.belasting > auto ? "autorisatie" : "gelijk";
    belasting = Math.min(auto, apvc.belasting);
  }
  const apvcNiet = apvc
    ? null
    : !(i.uitgegeven > 0)
      ? "Vul het aantal uitgegeven aandelen per 31 december in."
      : `Zonder par value (nominale waarde) rekent Delaware met de authorized shares-methode: "${ZONDER_PAR_REGEL}" Staat er in de oprichtingsakte wel een par value, vul die dan in.`;
  return {
    autorisatieMethode: { belasting: auto, uitleg: autoUitleg },
    apvcMethode: apvc,
    apvcNiet,
    gunstigste,
    belasting,
    annualReportFee: FRANCHISE.annualReportFee,
    totaal: afr(belasting + FRANCHISE.annualReportFee),
    verschil: apvc ? afr(auto - apvc.belasting) : null,
  };
}

/** Wat te laat betalen kost: $200 boete plus 1,5% rente per begonnen maand over belasting plus boete. */
export function teLaatKosten(belasting: number, maanden: number): number {
  const m = Math.max(0, Math.ceil(maanden));
  if (m === 0) return 0;
  return afr(FRANCHISE.boeteTeLaat + (belasting + FRANCHISE.boeteTeLaat) * FRANCHISE.renteTeLaatPerMaand * m);
}
