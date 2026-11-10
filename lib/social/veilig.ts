// ---------------------------------------------------------------------------
// Vangnet voor tekst die zonder mens naar buiten gaat (autopilot met "mag zelf plaatsen" en
// automatische antwoorden). Het model krijgt al vaste FEITEN mee, maar een model kan toch iets
// verzinnen; dit is de tweede, harde controle. Puur. Een tekst die hier niet doorheen komt gaat
// niet vanzelf weg: de autopilot pakt dan een vaste, gecontroleerde tekst (lib/social/schrijf.ts) en
// een antwoord blijft staan voor een mens.
// ---------------------------------------------------------------------------

export interface Oordeel {
  veilig: boolean;
  /** korte reden in gewoon Nederlands, voor het beheer; null als alles in orde is */
  reden: string | null;
}

/** Bedragen die in de vaste feiten staan (platformkosten per gewerkt uur: € 3,50 tot € 2,50). */
const TOEGESTANE_BEDRAGEN = new Set(["3,50", "2,50", "3.50", "2.50"]);
/** Percentages uit de vaste feiten (4% direct uitbetalen, 2% binnen 3 werkdagen). */
const TOEGESTANE_PERCENTAGES = new Set(["4", "2"]);

/** Woorden die een belofte of claim inhouden die we niet kunnen waarmaken (of niet meer bestaan). */
const VERBODEN: readonly { re: RegExp; reden: string }[] = [
  { re: /\b(betaalpas|bankpas|creditcard|eigen rekening|spaarrekening|sparen|spaarpot|potje|potjes|voorschot|bonus|doorverwijs\w*|verwijs\w* je door)\b/i, reden: "noemt iets van de gestopte ZekerFlex Bank" },
  { re: /\b(gegarandeerd|garantie|zeker weten|100\s?%|altijd binnen|nummer\s?1|beste van nederland|marktleider|goedkoopste)\b/i, reden: "bevat een garantie of superlatief die we niet kunnen onderbouwen" },
  { re: /\b(korting van|% korting|actie:|winactie|win een|cadeau)\b/i, reden: "belooft een korting of actie die niet bestaat" },
  { re: /\b(verzekerd|verzekering|pensioen van \d)/i, reden: "noemt een verzekering of pensioenbedrag dat niet in de feiten staat" },
  { re: /(https?:\/\/|www\.)(?!zekerflex\.com)/i, reden: "bevat een link naar een andere site" },
];

export function beoordeelTekst(tekst: string): Oordeel {
  for (const v of VERBODEN) {
    if (v.re.test(tekst)) return { veilig: false, reden: v.reden };
  }
  for (const m of tekst.matchAll(/€\s?(\d+(?:[.,]\d{1,2})?)/g)) {
    const bedrag = m[1] ?? "";
    if (!TOEGESTANE_BEDRAGEN.has(bedrag)) return { veilig: false, reden: `noemt het bedrag € ${bedrag}, dat niet in de vaste feiten staat` };
  }
  for (const m of tekst.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
    const p = m[1] ?? "";
    if (!TOEGESTANE_PERCENTAGES.has(p)) return { veilig: false, reden: `noemt ${p}%, dat niet in de vaste feiten staat` };
  }
  return { veilig: true, reden: null };
}

/**
 * Een reactie van iemand anders waarop we niet automatisch antwoorden: een klacht, een juridisch of
 * privacyonderwerp, of iemand die boos is. Die leest een mens.
 */
export function vraagtMens(reactie: string): boolean {
  return /\b(klacht|boos|slecht|oplicht\w*|fraude|scam|nep|advocaat|rechtbank|aangifte|politie|geld terug|terugbetal\w*|schadevergoeding|avg|privacy|verwijder\w*|stop\w*|abonnement opzeg\w*|ongevraagd|spam|discriminati\w*|claim)\b/i.test(reactie);
}
