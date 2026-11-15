import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Mijn AI (15 nov 2026): een eigen chatomgeving voor de eigenaar in Beheer → ZekerFlex AI, ingericht zoals Claude:
// links je gesprekken, in het midden het gesprek, onderin het invoerveld. Puur: de vorm van een gesprek, de titel, wat er
// naar het model gaat en de indeling per dag. Opslag: lib/mijn-ai/opslag.ts.
//
// Snel op het eigen model (lees lib/jarvis/berichten.ts): een korte, vaste instructie bovenaan (woord voor woord gelijk,
// dus herbruikbaar), geen live status met tijdstip, en het gesprek ingekort tot wat in het geheugen van het model past.
// ---------------------------------------------------------------------------

export interface MijnAiBericht {
  rol: "jij" | "ai";
  tekst: string;
  at: string;
  /** alleen bij de AI: welk model antwoordde */
  model?: string;
  /** alleen bij de AI: het antwoord werd afgebroken (gestopt of een storing) */
  onaf?: boolean;
}

export interface MijnAiGesprek {
  id: string;
  titel: string;
  aangemaakt: string;
  bijgewerkt: string;
  berichten: MijnAiBericht[];
}

export type GesprekKop = Pick<MijnAiGesprek, "id" | "titel" | "bijgewerkt">;

export const MAX_BERICHTEN = 200;
export const MAX_GESPREKKEN = 300;
export const VRAAG_MAX = 8000;
export const TITEL_MAX = 80;

/** De vaste instructie: kort, en elke keer gelijk (het model hergebruikt dan het begin). */
export const MIJN_AI_INSTRUCTIE = [
  "Je bent ZekerFlex AI, de persoonlijke assistent van de eigenaar van ZekerFlex, een Nederlands platform voor flexwerk, uitzendwerk en zzp.",
  "Antwoord in helder Nederlands, tenzij de eigenaar in een andere taal schrijft. Wees direct en concreet; geen loze beleefdheden.",
  "Gebruik Markdown waar het helpt: korte koppen, lijstjes, **vet** voor het belangrijkste, en codeblokken met ``` voor code.",
  "Weet je iets niet zeker, zeg dat dan eerlijk in plaats van te gokken. Verzin geen cijfers over het platform: je ziet de database niet.",
].join("\n");

/** Een titel uit de eerste vraag: de eerste regel, ingekort. */
export function titelVan(vraag: string): string {
  const regel = vraag.replace(/\s+/g, " ").trim();
  if (!regel) return "Nieuw gesprek";
  return regel.length > TITEL_MAX ? `${regel.slice(0, TITEL_MAX - 1).trimEnd()}…` : regel;
}

export type ModelBericht = { role: "system" | "user" | "assistant"; content: string };

/**
 * Wat er naar het model gaat: de vaste instructie, dan zoveel mogelijk van het gesprek (vanaf het eind) binnen een
 * tekstbudget, dan de vraag. Het eigen model heeft 4.096 stukjes geheugen (±12.000 tekens) en leest op de CPU ±55 stukjes
 * per seconde; met "alles gratis" daarom een kleiner budget. Afgebroken antwoorden gaan niet mee.
 */
export function berichtenVoorModel(gesprek: MijnAiBericht[], vraag: string, gratis: boolean): ModelBericht[] {
  const budget = gratis ? 4000 : 24000;
  const per = gratis ? 1500 : 6000;
  const mee: ModelBericht[] = [];
  let tekens = 0;
  for (let i = gesprek.length - 1; i >= 0; i--) {
    const b = gesprek[i]!;
    if (b.rol === "ai" && b.onaf) continue;
    const inhoud = b.tekst.length > per ? `${b.tekst.slice(0, per)}…` : b.tekst;
    if (tekens + inhoud.length > budget) break;
    tekens += inhoud.length;
    mee.unshift({ role: b.rol === "jij" ? "user" : "assistant", content: inhoud });
  }
  // een gesprek begint bij het model altijd met een vraag
  while (mee[0]?.role === "assistant") mee.shift();
  return [{ role: "system", content: MIJN_AI_INSTRUCTIE }, ...mee, { role: "user", content: vraag }];
}

/** Na dit teken volgt in de stroom één regel JSON met de afloop ({ fout? }); het komt in gewone tekst niet voor. */
export const STROOM_EINDE = "\u001e";

/** Een technische fout van het model als gewone zin (de techniek staat in het log). */
export function foutZin(melding: string): string {
  if (/eerste woord|afgebroken|onbereikbaar|timeout|aborted|ECONNREFUSED|fetch failed/i.test(melding)) {
    return "Het AI-model reageert nu niet snel genoeg. De server is waarschijnlijk druk (bijvoorbeeld tijdens een uitrol). Probeer het over een minuut opnieuw.";
  }
  return "Het AI-model gaf nu geen antwoord. Probeer het opnieuw; blijft het misgaan, kijk dan in Systeem → Foutmeldingen.";
}

export type DagGroep = "vandaag" | "gisteren" | "week" | "ouder";

/** De gesprekken in groepen zoals in de zijbalk (Nederlandse dagen), nieuwste eerst. */
export function groepeerOpDag(koppen: GesprekKop[], nu = new Date()): { groep: DagGroep; gesprekken: GesprekKop[] }[] {
  const vandaag = amsterdamDayKey(nu);
  const gisteren = amsterdamDayKey(nu.getTime() - 86_400_000);
  const weekGrens = amsterdamDayKey(nu.getTime() - 7 * 86_400_000);
  const volgorde: DagGroep[] = ["vandaag", "gisteren", "week", "ouder"];
  const groepen = new Map<DagGroep, GesprekKop[]>(volgorde.map((g) => [g, []]));
  for (const k of [...koppen].sort((a, b) => (a.bijgewerkt < b.bijgewerkt ? 1 : -1))) {
    const dag = amsterdamDayKey(k.bijgewerkt);
    const g: DagGroep = dag === vandaag ? "vandaag" : dag === gisteren ? "gisteren" : dag > weekGrens ? "week" : "ouder";
    groepen.get(g)!.push(k);
  }
  return volgorde.map((groep) => ({ groep, gesprekken: groepen.get(groep)! })).filter((g) => g.gesprekken.length > 0);
}
