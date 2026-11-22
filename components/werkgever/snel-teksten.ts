// De teksten van "Snel een klus plaatsen" (components/werkgever/SnelPlaatsen.tsx), Nederlands en Engels zoals de rest van
// de werkgeversapp. Puur bestand: de pagina (server) geeft ze mee en de tests lezen ze zonder JSX.

import { amsterdamDagLabel } from "@/lib/time/amsterdam";

export interface SnelTeksten {
  kop: string;
  stap1: string;
  stap2: string;
  stap3: string;
  titel: string;
  titelHint: string;
  sjabloon: string;
  datum: string;
  van: string;
  tot: string;
  personen: string;
  /** de pauze telt niet als gewerkte tijd, net als op /klus-plaatsen */
  pauze: string;
  geenPauze: string;
  /** "{m} minuten" */
  minuten: string;
  tarief: string;
  tariefHint: string;
  annuleer: string;
  vestiging: string;
  terug: string;
  volgende: string;
  plaats: string;
  bezig: string;
  /** "{titel} op {datum} van {van} tot {tot}{pauze}, {personen}, € {tarief} per uur." (snelSamenvatting) */
  samenvatting: string;
  persoonEen: string;
  /** "{n} personen": enkel- en meervoud apart, niet "persoon/personen" */
  persoonMeer: string;
  /** achter de eindtijd als er een pauze is; "{m}" = minuten */
  metPauze: string;
  fout: string;
  /** de kostenregel naast "Plaats de klus", dezelfde som als /klus-plaatsen (lib/klusconcept/concept.ts conceptCost) */
  kostenLoon: string;
  kostenLoonMeer: string;
  /** "{u}" = de gewerkte uren van alle mensen samen */
  kostenPlatform: string;
  kostenTotaal: string;
  kostenUitleg: string;
}

export const SNEL_NL: SnelTeksten = {
  kop: "Snel een klus plaatsen",
  stap1: "Wat",
  stap2: "Wanneer",
  stap3: "Tarief",
  titel: "Wat moet er gebeuren?",
  titelHint: "Bijvoorbeeld: Bediening terras, Orderpicker, Verkeersregelaar",
  sjabloon: "Of kies een voorbeeld",
  datum: "Datum",
  van: "Van",
  tot: "Tot",
  personen: "Aantal mensen",
  pauze: "Pauze",
  geenPauze: "Geen pauze",
  minuten: "{m} minuten",
  tarief: "Uurtarief voor de werker (€)",
  tariefHint: "Minimaal € {min}. Daarbovenop komt de platformvergoeding per gewerkt uur.",
  annuleer: "Kosteloos afzeggen tot",
  vestiging: "Locatie",
  terug: "Terug",
  volgende: "Volgende",
  plaats: "Plaats de klus",
  bezig: "Even geduld…",
  samenvatting: "{titel} op {datum} van {van} tot {tot}{pauze}, {personen}, € {tarief} per uur.",
  persoonEen: "1 persoon",
  persoonMeer: "{n} personen",
  metPauze: " ({m} minuten pauze)",
  fout: "Vul de eindtijd ná de begintijd in.",
  kostenLoon: "Loon kracht",
  kostenLoonMeer: "Loon krachten",
  kostenPlatform: "Platformkosten ({u} uur)",
  kostenTotaal: "Totaal excl. btw",
  kostenUitleg: "Je betaalt alleen voor gewerkte uren; de pauze telt niet mee.",
};

export const SNEL_EN: SnelTeksten = {
  kop: "Place a job in three steps",
  stap1: "What",
  stap2: "When",
  stap3: "Rate",
  titel: "What needs to be done?",
  titelHint: "For example: Terrace service, Order picker, Traffic controller",
  sjabloon: "Or pick an example",
  datum: "Date",
  van: "From",
  tot: "Until",
  personen: "Number of people",
  pauze: "Break",
  geenPauze: "No break",
  minuten: "{m} minutes",
  tarief: "Hourly rate for the worker (€)",
  tariefHint: "At least € {min}. The platform fee per worked hour comes on top.",
  annuleer: "Free cancellation until",
  vestiging: "Location",
  terug: "Back",
  volgende: "Next",
  plaats: "Place the job",
  bezig: "One moment…",
  samenvatting: "{titel} on {datum} from {van} until {tot}{pauze}, {personen}, € {tarief} per hour.",
  persoonEen: "1 person",
  persoonMeer: "{n} people",
  metPauze: " ({m} minute break)",
  fout: "The end time must be after the start time.",
  kostenLoon: "Worker's pay",
  kostenLoonMeer: "Workers' pay",
  kostenPlatform: "Platform fee ({u} hours)",
  kostenTotaal: "Total excl. VAT",
  kostenUitleg: "You only pay for hours worked; the break does not count.",
};

const vul = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/**
 * De samenvatting vlak boven "Plaats de klus": "Bediening / horeca op dinsdag 24 november van 10:00 tot 16:00, 1 persoon,
 * € 17 per uur." 22 nov 2026 (gebruikersonderzoek B25): er stond "op 2026-11-24" en "1 persoon/personen".
 */
export function snelSamenvatting(
  t: Pick<SnelTeksten, "samenvatting" | "persoonEen" | "persoonMeer" | "metPauze">,
  v: { titel: string; datum: string; van: string; tot: string; personen: number; pauze: number; tarief: string },
  locale: "nl" | "en" = "nl",
): string {
  return vul(t.samenvatting, {
    titel: v.titel,
    datum: amsterdamDagLabel(v.datum, locale === "en" ? "en-GB" : "nl-NL") || v.datum,
    van: v.van,
    tot: v.tot,
    pauze: v.pauze > 0 ? vul(t.metPauze, { m: v.pauze }) : "",
    personen: v.personen === 1 ? t.persoonEen : vul(t.persoonMeer, { n: v.personen }),
    tarief: locale === "en" ? v.tarief : v.tarief.replace(".", ","),
  });
}

/** De pauzes om uit te kiezen, zoals op /klus-plaatsen; een afwijkende pauze uit een concept komt erbij. */
export function pauzeKeuzes(huidig: number): number[] {
  const basis = [0, 15, 30, 45, 60];
  return basis.includes(huidig) ? basis : [...basis, huidig].sort((a, b) => a - b);
}
