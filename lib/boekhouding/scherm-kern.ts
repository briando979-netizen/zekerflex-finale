// ---------------------------------------------------------------------------
// Beheer → Boekhouding: de puur-tekstkant van het scherm (geen prisma, kv of zod: ook de browser leest dit). Vormen van de
// gegevens die de API teruggeeft, en de Nederlandse teksten en omzettingen die scherm en tests delen.
// ---------------------------------------------------------------------------

/** Een bon die een mens moet nakijken, zoals het scherm hem toont. */
export interface BonRij {
  id: string;
  administratieId: string;
  status: "NIEUW" | "GELEZEN" | "EVEN_KIJKEN" | "GEBOEKT" | "AFGEWEZEN";
  /** van wie de mail kwam (alleen bij een bon uit de mail) */
  afzender: string | null;
  leverancier: string | null;
  /** "2026-04-10" */
  bonDatum: string | null;
  totaalCents: number | null;
  btwCents: number | null;
  valuta: string | null;
  btwPercentage: number | null;
  /** nummer van de voorgestelde kostenrekening, bv. "4100" */
  rekeningNummer: string | null;
  /** 0-1000 */
  zekerheidPromille: number | null;
  evenKijkenReden: string | null;
  /** het id van een andere bon met dezelfde leverancier, datum en bedrag */
  dubbelVan: string | null;
  /** "image/jpeg", "application/pdf", ... */
  mimeType: string;
  /** "10 november 2026", Amsterdamse tijd */
  ontvangen: string;
}

export interface CategorieKeuze {
  nummer: string;
  naam: string;
}

export interface DeadlineRij {
  sleutel: string;
  titel: string;
  /** "30 april 2026" */
  datumTekst: string;
  dagenTot: number;
  wat: string;
  waarschuwing: string | null;
  bevestigDoor: string;
}

export interface AdministratieRij {
  id: string;
  soort: "ECHT" | "TEST";
  naam: string;
  valuta: string;
  actief: boolean;
  boekingen: number;
  vergrendeldeMaanden: string[];
  /** bonnen die nagekeken moeten worden */
  bonnenEvenKijken: number;
  /** wat klanten ons nog schuldig zijn, in centen van de eigen valuta */
  openstaandCents: number;
  openstaandPosten: number;
}

export interface OverzichtGegevens {
  administraties: AdministratieRij[];
  deadlines: DeadlineRij[];
}

/** De velden die een mens bij het goedkeuren invult. */
export interface GoedkeurVelden {
  leverancier: string;
  /** "10-04-2026" of "2026-04-10" */
  datum: string;
  /** "12,50" */
  totaal: string;
  btwPercentage: number;
  categorie: string;
}

const AMSTERDAM = "Europe/Amsterdam";

/** Gehele centen als "€ 1.234,56" (andere valuta: met de code erbij). */
export function bedragTekst(cents: number | null | undefined, valuta: string | null | undefined = "EUR"): string {
  if (cents === null || cents === undefined) return "onbekend";
  const tekst = (cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return !valuta || valuta === "EUR" ? `€ ${tekst}` : `${tekst} ${valuta}`;
}

/** "2026-04-10" als "10 april 2026"; alles wat geen dagsleutel is komt onveranderd terug. */
export function dagTekst(dag: string | null | undefined): string {
  if (!dag) return "onbekend";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dag);
  if (!m) return dag;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: AMSTERDAM });
}

/** Een tijdstip als dag in Amsterdam, "10 november 2026". */
export function tijdstipDagTekst(d: Date): string {
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: AMSTERDAM });
}

/** Het aantal hele dagen van `nu` tot `tot` (negatief als het voorbij is), gerekend in Amsterdamse dagen. */
export function dagenTot(tot: Date, nu: Date): number {
  const dagVan = (x: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: AMSTERDAM, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
    const [j, m, d] = p.split("-").map(Number) as [number, number, number];
    return Date.UTC(j, m - 1, d);
  };
  return Math.round((dagVan(tot) - dagVan(nu)) / 86_400_000);
}

/** Hoe zeker is het uitlezen, in gewone woorden. */
export function zekerheidTekst(promille: number | null | undefined): string {
  if (promille === null || promille === undefined) return "Zekerheid onbekend";
  if (promille >= 850) return `Vrij zeker (${Math.round(promille / 10)}%)`;
  if (promille >= 600) return `Matig zeker (${Math.round(promille / 10)}%)`;
  return `Onzeker (${Math.round(promille / 10)}%)`;
}

/** Een bedrag zoals een mens het intikt ("12,50", "1.234,56", "12.5") in gehele centen; null als het geen bedrag is. */
export function centenUitInvoer(tekst: string): number | null {
  const s = tekst.replace(/[€\s]/g, "").replace(/EUR/gi, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const komma = s.lastIndexOf(",");
  const punt = s.lastIndexOf(".");
  const scheiding = Math.max(komma, punt);
  const decimalen = scheiding >= 0 ? s.length - scheiding - 1 : 0;
  if (scheiding >= 0 && decimalen >= 1 && decimalen <= 2) {
    const hele = s.slice(0, scheiding).replace(/[.,]/g, "");
    const n = Number(`${hele || "0"}.${s.slice(scheiding + 1).padEnd(2, "0")}`);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  const n = Number(s.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n * 100 : null;
}

/** Cents terug naar iets wat in een invulveld past: "12,50". */
export function centenInvoer(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Het btw-bedrag in een totaal dat al btw bevat: totaal min grondslag, de grondslag op de cent afgerond. */
export function btwUitTotaal(totaalCents: number, percentage: number): number {
  const grondslag = Math.round((totaalCents * 100) / (100 + percentage));
  return totaalCents - grondslag;
}

/** Dubbelen en lege regels weg, kleine letters; voor het invoerveld bij de afzenders. */
export function schoonAfzender(tekst: string): string {
  return tekst.trim().toLowerCase();
}

const AFZENDER_ADRES = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const AFZENDER_DOMEIN = /^@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Een Nederlandse foutmelding als dit geen adres of domein is, anders null. (De server controleert zelf nog eens.) */
export function afzenderFout(tekst: string): string | null {
  const s = schoonAfzender(tekst);
  if (!s) return "Vul een e-mailadres in (factuur@bedrijf.nl) of een heel domein (@bedrijf.nl).";
  if (s.length > 120 || !(AFZENDER_ADRES.test(s) || AFZENDER_DOMEIN.test(s))) {
    return "Dit is geen e-mailadres (factuur@bedrijf.nl) en ook geen domein (@bedrijf.nl).";
  }
  return null;
}

export const BEVESTIG_ECHT_TEKST = "ECHT AANMAKEN";
