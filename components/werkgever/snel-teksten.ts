// De teksten van "Snel een klus plaatsen" (components/werkgever/SnelPlaatsen.tsx), Nederlands en Engels zoals de rest van
// de werkgeversapp. Puur bestand: de pagina (server) geeft ze mee en de tests lezen ze zonder JSX.

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
  samenvatting: string;
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
  samenvatting: "{titel} op {datum} van {van} tot {tot}, {n} persoon/personen, € {tarief} per uur.",
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
  samenvatting: "{titel} on {datum} from {van} until {tot}, {n} person(s), € {tarief} per hour.",
  fout: "The end time must be after the start time.",
  kostenLoon: "Worker's pay",
  kostenLoonMeer: "Workers' pay",
  kostenPlatform: "Platform fee ({u} hours)",
  kostenTotaal: "Total excl. VAT",
  kostenUitleg: "You only pay for hours worked; the break does not count.",
};

/** De pauzes om uit te kiezen, zoals op /klus-plaatsen; een afwijkende pauze uit een concept komt erbij. */
export function pauzeKeuzes(huidig: number): number[] {
  const basis = [0, 15, 30, 45, 60];
  return basis.includes(huidig) ? basis : [...basis, huidig].sort((a, b) => a - b);
}
