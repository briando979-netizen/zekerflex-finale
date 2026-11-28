// ---------------------------------------------------------------------------
// Lonen bij een klus op een Belgische werklocatie (28 nov 2026, spec-belgie.md hoofdstuk 1). Puur bestand: het klusformulier
// (components/werkgever/BelgieKlusKeuze.tsx), de server (lib/shifts/create.ts, het wijzigen en kiezen in
// app/werkgever/diensten/[shiftId]/actions.ts) en de tests delen het, zonder prisma of netwerk.
//
// Elk bedrag staat met zijn datum en zijn bron, want ze veranderen per index. Laat de tabel elk halfjaar nakijken door een
// sociaal secretariaat (spec 7.2, punt 4). Het bedrijf is de werkgever en betaalt het loon; ZekerFlex waarschuwt alleen, en
// houdt alleen tegen wat zeker te laag is.
// ---------------------------------------------------------------------------

/** De twee soorten contract die een bedrijf nu kiest (lib/belgie/klus-kern.ts). Hier herhaald, zodat dit bestand los staat. */
export type BelgischLoonContract = "student" | "flexi";

export interface BelgischMaandbedrag {
  /** eerste dag waarop het bedrag geldt (yyyy-mm-dd) */
  vanaf: string;
  /** bruto per maand, in centen */
  cents: number;
}

/**
 * Het gewaarborgd gemiddeld minimummaandinkomen (GGMMI, cao nr. 43 van de Nationale Arbeidsraad), 18 jaar en ouder, bruto per
 * maand [S, Securex-tabel]. Securex noemt voor 1 april een stijging van € 35, maar 2.154,11 + 35 is 2.189,11: het verschil van
 * € 0,70 is niet verklaard (spec 1). De volgende indexering is niet gevonden.
 */
export const GGMMI_PER_MAAND: readonly BelgischMaandbedrag[] = [
  { vanaf: "2026-01-01", cents: 215_411 },
  { vanaf: "2026-04-01", cents: 218_981 },
  { vanaf: "2026-07-01", cents: 223_361 },
];

export const GGMMI_BRON = "https://www.securex.be/nl/lex4you/werkgever/actuele-bedragen/sociaalrechtelijke-bedragen/nationaal-gmmi";

/**
 * Studentenloon voor 18 jaar (79 % van het GGMMI, cao nr. 50), bruto per maand vanaf juli 2026 [S, Securex]. ZekerFlex laat
 * werkers pas vanaf 18 jaar toe, dus lager mag een uurloon in België nooit zijn: dat is de harde ondergrens hieronder.
 */
export const STUDENT_18_PER_MAAND: BelgischMaandbedrag = { vanaf: "2026-07-01", cents: 176_455 };

/** Percentage van het GGMMI voor een student, naar leeftijd (cao nr. 50) [S, Securex]. Het sectorbarema kan hoger zijn. */
export const STUDENT_PERCENTAGE: readonly { vanafLeeftijd: number; procent: number }[] = [
  { vanafLeeftijd: 21, procent: 100 },
  { vanafLeeftijd: 20, procent: 90 },
  { vanafLeeftijd: 19, procent: 85 },
  { vanafLeeftijd: 18, procent: 79 },
  { vanafLeeftijd: 17, procent: 73 },
  { vanafLeeftijd: 0, procent: 67 },
];

/**
 * Flexi-job in de horeca (paritair comité 302): de ondergrens van het flexiloon, inclusief flexivakantiegeld. De RSZ toont
 * € 13,04 [O]; CLB Sociaal Secretariaat en Securex noemen € 12,78 per 1 maart 2026 [S]. De bronnen spreken elkaar tegen
 * (spec 1.2 en open vraag 11); we nemen de hoogste, dan houden we eerder een te laag loon tegen dan een te hoog.
 */
export const FLEXI_HORECA_MINIMUM = {
  cents: 1304,
  /** gelezen op de RSZ-pagina; de ingangsdatum van € 13,04 is niet gevonden */
  gecontroleerd: "2026-11-28",
  bron: "https://www.socialsecurity.be/site_nl/employer/infos/flexi-jobs.htm",
  /** het lagere bedrag van de andere bron, ter vergelijking */
  anderBedragCents: 1278,
  anderBedragVanaf: "2026-03-01",
} as const;

/** Het uurloon uit een maandbedrag: maand × 3 / 13 / 38 (eigen berekening, geen officieel cijfer; spec 1). */
export function uurloonUitMaand(maandCents: number): number {
  return Math.round((maandCents * 3) / 13 / 38);
}

/** Het GGMMI dat geldt op een dag (yyyy-mm-dd); vóór de eerste regel de eerste. */
export function ggmmiOp(dag: string): BelgischMaandbedrag {
  let gevonden = GGMMI_PER_MAAND[0] ?? { vanaf: "2026-01-01", cents: 215_411 };
  for (const regel of GGMMI_PER_MAAND) if (regel.vanaf <= dag) gevonden = regel;
  return gevonden;
}

/** Het uurloon uit het GGMMI op een dag: vanaf juli 2026 € 13,56. */
export function ggmmiUurloonOp(dag: string): number {
  return uurloonUitMaand(ggmmiOp(dag).cents);
}

/** Onder dit uurloon gaat in België geen klus uit: het studentenloon voor 18 jaar, naar boven afgerond (€ 10,72). */
export const BELGIE_ONDERGRENS_CENTS = Math.ceil((STUDENT_18_PER_MAAND.cents * 3) / 13 / 38);

/** De harde ondergrens voor deze soort klus: bij een flexi-job in de horeca € 13,04, anders het studentenloon voor 18 jaar. */
export function belgischMinimumCents(soort: BelgischLoonContract | null, horeca: boolean): number {
  return soort === "flexi" && horeca ? Math.max(FLEXI_HORECA_MINIMUM.cents, BELGIE_ONDERGRENS_CENTS) : BELGIE_ONDERGRENS_CENTS;
}

export type BelgischeLoonBlokkade = "onderOndergrens" | "onderFlexiHoreca";

export interface BelgischLoonOordeel {
  /** het uurloon mag niet: de klus gaat niet uit (de server weigert hem ook) */
  blokkade: BelgischeLoonBlokkade | null;
  /** de harde ondergrens die geldt, in centen */
  minimumCents: number;
  /** onder het uurloon uit het GGMMI: een waarschuwing, geen blokkade (het bedrijf kent zijn sectorbarema) */
  onderGgmmi: boolean;
  /** het uurloon uit het GGMMI op de dag van de klus, in centen */
  ggmmiCents: number;
}

/** Wat ZekerFlex zegt over een uurloon bij een Belgische klus. `dag` is de dag van de klus (yyyy-mm-dd, Nederlandse tijd). */
export function belgischLoonOordeel(args: { soort: BelgischLoonContract | null; horeca: boolean; uurloonCents: number; dag: string }): BelgischLoonOordeel {
  const minimumCents = belgischMinimumCents(args.soort, args.horeca);
  const ggmmiCents = ggmmiUurloonOp(args.dag);
  const blokkade: BelgischeLoonBlokkade | null =
    args.uurloonCents >= minimumCents ? null : args.soort === "flexi" && args.horeca ? "onderFlexiHoreca" : "onderOndergrens";
  return { blokkade, minimumCents, onderGgmmi: args.uurloonCents < ggmmiCents, ggmmiCents };
}
