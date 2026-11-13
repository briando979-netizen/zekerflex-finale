// ---------------------------------------------------------------------------
// Open vragen voor een menselijk accountant of belastingadviseur, op één plek (13 nov 2026). Alleen de vraag en wat er
// nu feitelijk staat; geen antwoord en geen advies: dat geeft de accountant. Puur bestand: het dossier
// (lib/accountant/dossier.ts, hoofdstuk 4) en Beheer → Accountant (tab "Open vragen") tonen dezelfde lijst, ook als er
// nog geen echte administratie is. De vragen die bij de jaarcijfers horen, maakt openVragen() (lib/accountant/jaar-kern.ts).
// Een vraag beantwoord? Haal hem hier weg en leg het antwoord vast waar het hoort (structuurcheck, kennisbank, code).
// ---------------------------------------------------------------------------

export type VraagOnderwerp = "vs" | "loon" | "btw" | "werkgever" | "facturen";

export const ONDERWERP_NAAM: Record<VraagOnderwerp, string> = {
  vs: "Verenigde Staten",
  loon: "Loon en loonheffingen",
  btw: "Btw",
  werkgever: "Werkgeverschap",
  facturen: "Facturen",
};

export interface AccountantVraag {
  id: string;
  onderwerp: VraagOnderwerp;
  vraag: string;
  /** wat er nu feitelijk staat of gebeurt, zonder oordeel */
  stand?: string;
  /** de dag waarop de vraag op de lijst kwam (jjjj-mm-dd) */
  sinds: string;
  /** het punt in de structuurcheck waar het bij hoort (lib/accountant/structuur.ts) */
  structuurId?: string;
}

export const ACCOUNTANT_VRAGEN: readonly AccountantVraag[] = [
  {
    id: "83b-nl-eigenaar",
    onderwerp: "vs",
    vraag: "Is de 83(b)-verklaring nodig voor een aandeelhouder die in Nederland woont? En heeft Stripe Atlas hem al ingediend?",
    stand: "De aandelen van Zekerflex, Inc. zijn op 9 november 2026 uitgegeven. De verklaring is getekend; of hij verstuurd is, staat in de structuurcheck.",
    sinds: "2026-11-13",
    structuurId: "83b",
  },
  {
    id: "vs-aangifte-2026",
    onderwerp: "vs",
    vraag: "Welke Amerikaanse aangifte moet over 2026 worden gedaan (Form 1120 met Form 5472, voor een vennootschap met een buitenlandse eigenaar), en wat is de termijn?",
    sinds: "2026-11-13",
  },
  {
    id: "loonheffingskorting-standaard",
    onderwerp: "loon",
    vraag: "Klopt het dat de loonheffingskorting standaard uit staat, tenzij de uitzendkracht zelf kiest om hem toe te passen?",
    stand: "Sinds 13 november 2026 staat hij standaard uit; de uitzendkracht zet hem zelf aan.",
    sinds: "2026-11-13",
  },
  {
    id: "opgaaf-volledig-adres",
    onderwerp: "loon",
    vraag: "Moeten we voor de opgaaf gegevens voor de loonheffingen van een uitzendkracht het volledige adres bewaren?",
    stand: "Nu bewaren we alleen naam, BSN, geboortedatum en postcode.",
    sinds: "2026-11-13",
  },
  {
    id: "btw-buitenlandse-diensten",
    onderwerp: "btw",
    vraag: "Is de btw op kosten van buitenlandse diensten (Claude, Twilio, Apple, de kosten in Delaware) verlegd? Wat mogen we daarvan als voorbelasting rekenen?",
    sinds: "2026-11-13",
    structuurId: "btw",
  },
  {
    id: "inc-werkgever-uitzend",
    onderwerp: "werkgever",
    vraag: "Wat is er nodig als Zekerflex, Inc. de werkgever is van Nederlandse uitzendkrachten: een loonheffingennummer, de toelating uitleenmarkt (Wtta), en de controle op het recht om te werken (Wav)?",
    stand: "De controle op het recht om te werken (vlag werkrecht-eis in Beheer) staat sinds 10 november 2026 uit: er wordt niets gevraagd of geblokkeerd.",
    sinds: "2026-11-13",
    structuurId: "wtta",
  },
  {
    id: "facturen-bv-afzender",
    onderwerp: "facturen",
    vraag: "Er zijn facturen uitgegaan met \"ZekerFlex B.V.\" als afzender, een vennootschap die niet bestaat. Moeten die worden hersteld, of volstaat een toelichting?",
    stand: "Het gaat om 11 facturen, samen € 1.176,13; ze zijn geannuleerd.",
    sinds: "2026-11-13",
  },
];

/** Eén regel per vraag, voor het dossier: "Onderwerp: vraag (stand)". */
export function vraagRegel(v: AccountantVraag): string {
  return `${ONDERWERP_NAAM[v.onderwerp]}: ${v.vraag}${v.stand ? ` (${v.stand})` : ""}`;
}

/**
 * Alle open vragen voor het dossier: eerst die bij de jaarcijfers (openVragen; null = nog geen echte administratie),
 * dan de vaste lijst hierboven.
 */
export function alleOpenVragen(jaarVragen: readonly string[] | null): string[] {
  const jaar = jaarVragen ?? ["Er is nog geen echte administratie: eerst de boekhouding inrichten."];
  return [...jaar, ...ACCOUNTANT_VRAGEN.map(vraagRegel)];
}
