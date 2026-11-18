// ---------------------------------------------------------------------------
// Aanbiedingen in de webshop (18 nov 2026, eigenaar: topdeals en Black Friday). Eerlijk en volgens de regels: wie een
// korting toont, moet de laagste prijs van de 30 dagen vóór de aanbieding als "van"-prijs noemen (Omnibus-richtlijn,
// art. 5a Besluit prijsaanduiding producten). Daarom:
// - de shop houdt elke prijswijziging bij (tabel ShopPriceLog, gevuld door de database zelf);
// - de "van"-prijs typt niemand in: hij wordt uitgerekend uit die historie;
// - een aanbieding moet echt lager zijn dan die prijs en heeft altijd een einddatum.
// Tijdens een aanbieding is `priceCents` de actieprijs, dus winkelwagen, afrekenen en de feeds kloppen vanzelf;
// `dealNormaalCents` is de prijs die terugkomt als hij stopt. Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export const DEAL_VENSTER_DAGEN = 30;
/** Een aanbieding duurt hooguit zo lang; daarna is de "van"-prijs geen eerlijke vergelijking meer. */
export const DEAL_MAX_DAGEN = 45;
const DAG = 86_400_000;

export interface PrijsMoment {
  priceCents: number;
  at: Date;
}

/**
 * De laagste prijs die in de 30 dagen vóór `nu` heeft gegolden: elke prijs die in dat venster inging, plus de prijs
 * die aan het begin van het venster al gold. Geen historie: null (dan weten we het niet en mag er geen aanbieding).
 */
export function laagsteIn30Dagen(log: readonly PrijsMoment[], nu: Date): number | null {
  const start = nu.getTime() - DEAL_VENSTER_DAGEN * DAG;
  const tot = log.filter((m) => m.at.getTime() <= nu.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!tot.length) return null;
  const binnen = tot.filter((m) => m.at.getTime() >= start);
  const ervoor = tot.filter((m) => m.at.getTime() < start);
  const geldend = ervoor[ervoor.length - 1];
  const prijzen = [...binnen.map((m) => m.priceCents), ...(geldend ? [geldend.priceCents] : [])];
  return prijzen.length ? Math.min(...prijzen) : null;
}

/**
 * Dekt de prijshistorie het hele venster? De historie begint bij de eerste regel in ShopPriceLog. Het venster is 30
 * dagen, of korter als het product nog geen 30 dagen bestaat (dan telt de laagste prijs sinds het in de winkel kwam).
 * Dekt hij het niet, dan is `vanaf` de dag waarop het wel kan. Zo staat er nooit een "van"-prijs die we niet zeker weten.
 */
export function historieDekt(eersteLog: Date | null, aangemaakt: Date, nu: Date): { dekt: boolean; vanaf: Date | null } {
  if (!eersteLog) return { dekt: false, vanaf: null };
  // een minuut speling: de regel van een nieuw product komt een fractie na het aanmaken
  const start = Math.max(nu.getTime() - DEAL_VENSTER_DAGEN * DAG, aangemaakt.getTime() + 60_000);
  if (eersteLog.getTime() <= start) return { dekt: true, vanaf: null };
  return { dekt: false, vanaf: new Date(eersteLog.getTime() + DEAL_VENSTER_DAGEN * DAG) };
}

export interface DealVelden {
  priceCents: number;
  dealVanCents?: number | null;
  dealEindigt?: Date | string | null;
}

/** Loopt er nu een aanbieding? Alleen met een "van"-prijs die hoger is dan de prijs, en vóór de einddatum. */
export function dealActief(p: DealVelden, nu: Date): boolean {
  if (typeof p.dealVanCents !== "number" || p.dealVanCents <= p.priceCents) return false;
  if (!p.dealEindigt) return false;
  const eind = p.dealEindigt instanceof Date ? p.dealEindigt.getTime() : Date.parse(p.dealEindigt);
  return Number.isFinite(eind) && nu.getTime() < eind;
}

/** De korting in hele procenten, naar beneden afgerond (nooit meer beloven dan het is). */
export function kortingProcent(vanCents: number, nuCents: number): number {
  if (vanCents <= 0 || nuCents >= vanCents) return 0;
  return Math.floor(((vanCents - nuCents) / vanCents) * 100);
}

export type DealFout = "geen-historie" | "historie-te-kort" | "niet-lager" | "te-klein" | "eind-voorbij" | "eind-te-ver" | "prijs-ongeldig";

/**
 * Mag deze aanbieding? `laagste` = laagsteIn30Dagen. De nieuwe prijs moet minstens 1 procent en minstens 5 cent
 * onder de laagste prijs liggen, en de einddatum ligt in de toekomst en hooguit DEAL_MAX_DAGEN vooruit.
 */
export function controleerDeal(a: { nieuwCents: number; laagste: number | null; eindigt: Date; nu: Date; historieVolledig?: boolean }): DealFout | null {
  if (!Number.isInteger(a.nieuwCents) || a.nieuwCents <= 0) return "prijs-ongeldig";
  if (a.laagste === null) return "geen-historie";
  if (a.historieVolledig === false) return "historie-te-kort";
  if (a.nieuwCents >= a.laagste) return "niet-lager";
  if (a.laagste - a.nieuwCents < 5 || kortingProcent(a.laagste, a.nieuwCents) < 1) return "te-klein";
  if (a.eindigt.getTime() <= a.nu.getTime()) return "eind-voorbij";
  if (a.eindigt.getTime() > a.nu.getTime() + DEAL_MAX_DAGEN * DAG) return "eind-te-ver";
  return null;
}

export const DEAL_FOUT_TEKST: Record<DealFout, string> = {
  "geen-historie": "Van dit product is nog geen prijs bekend. Bewaar het product eerst.",
  "historie-te-kort": "We houden de prijs van dit product nog geen 30 dagen bij. Daarom kan er nu nog geen aanbieding op.",
  "niet-lager": "De aanbiedingsprijs moet lager zijn dan de laagste prijs van de afgelopen 30 dagen.",
  "te-klein": "De korting is te klein: minstens 1 procent en 5 cent.",
  "eind-voorbij": "Kies een einddatum in de toekomst.",
  "eind-te-ver": `Een aanbieding duurt hooguit ${DEAL_MAX_DAGEN} dagen.`,
  "prijs-ongeldig": "Vul een geldige prijs in.",
};

/** De actieprijs van een variant met een eigen prijs: dezelfde korting als het product, op hele centen. */
export function variantActiePrijs(variantCents: number, productNormaalCents: number, productActieCents: number): number {
  if (productNormaalCents <= 0) return variantCents;
  return Math.max(1, Math.round((variantCents * productActieCents) / productNormaalCents));
}

/** Black Friday tot en met Cyber Monday: van de maandag vóór de vierde vrijdag van november tot en met de maandag erna. */
export function blackFridayWeek(dagSleutel: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dagSleutel);
  if (!m) return false;
  const jaar = Number(m[1]);
  // de vierde donderdag van november (Thanksgiving); Black Friday is de dag erna
  const eerste = new Date(Date.UTC(jaar, 10, 1)).getUTCDay();
  const vierdeDonderdag = 1 + ((4 - eerste + 7) % 7) + 21;
  const vrijdag = Date.UTC(jaar, 10, vierdeDonderdag + 1);
  const dag = Date.UTC(jaar, Number(m[2]) - 1, Number(m[3]));
  return dag >= vrijdag - 4 * DAG && dag <= vrijdag + 3 * DAG;
}
