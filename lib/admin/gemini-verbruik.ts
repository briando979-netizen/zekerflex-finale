import { amsterdamStartOfMonth } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Beheer -> Kosten: het Gemini-verbruik van deze kalendermaand, uit het bestaande AiUsageLog (lib/ai/governor.ts recordUsage;
// geen nieuwe teller). Per aanroep legt dat log vast: taak (purpose), model, endpointHost, tokens in/uit/totaal, duur, ok, tijd,
// nooit inhoud. Hier alleen de pure kern (geen prisma): de maandgrens op Amsterdamse tijd, wat Gemini is, de optelling en de
// regel voor het scherm. De query staat in lib/admin/gemini-verbruik-lezen.ts. Er wordt GEEN prijs berekend of verzonnen:
// het bedrag staat in Google Cloud.
// ---------------------------------------------------------------------------

/** Eén groep uit de database: per model en host de aantallen en tokens (som). */
export interface VerbruikGroep {
  model: string;
  endpointHost: string;
  aanroepen: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface VerbruikPerModel {
  model: string;
  aanroepen: number;
  tokens: number;
}

export interface GeminiVerbruik {
  aanroepen: number;
  tokens: number;
  perModel: VerbruikPerModel[];
}

/**
 * Wat het scherm krijgt: de regel en het overzicht per model (met een notitie als de telling later dan het begin van de
 * maand begint, zie TELT_VANAF), of een melding dat het verbruik nu niet te lezen is.
 */
export type GeminiStand =
  | { ok: true; maand: string; regel: string; notitie: string | null; verbruik: GeminiVerbruik }
  | { ok: false; melding: string };

export const NIET_TE_LEZEN = "Gemini-verbruik is nu niet te lezen.";

/**
 * Vanaf wanneer AiUsageLog de echte host bewaart (lib/ai/governor.ts GovernorDoel, 13 nov 2026). Daarvoor stond bij élke
 * rij de host uit de omgeving (Google), ook bij ons eigen model (gemma, granite), en bij een mislukte aanroep ook het
 * Gemini-model uit de omgeving: die rijen zijn niet van een echte Gemini-aanroep te onderscheiden, dus ze tellen niet mee.
 * Gekozen ná de uitrol van die reparatie (begin 14 nov, Amsterdamse tijd): liever een paar uur te weinig dan verzonnen.
 */
export const TELT_VANAF = new Date("2026-11-14T00:00:00+01:00");

/** "14 november 2026" */
const VANAF_LABEL = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(TELT_VANAF);

/** De notitie bij het paneel als de telling deze maand niet vanaf het begin loopt. */
export const VANAF_NOTITIE = `Telt vanaf ${VANAF_LABEL}; eerdere regels in het logboek noemden een verkeerde server.`;

/**
 * Is dit een echte Gemini-aanroep? Alleen op de host van Google: sinds TELT_VANAF is dat de server waar de vraag echt heen
 * ging. Niet meer op de modelnaam: een mislukte aanroep heette vóór de reparatie "gemini-..." terwijl hij naar ons eigen
 * model ging. Andere aanbieders en ons eigen model doen niet mee.
 */
export function isGemini(g: Pick<VerbruikGroep, "model" | "endpointHost">): boolean {
  return /(^|\.)googleapis\.com$/i.test(g.endpointHost);
}

/** Het stuk van de maand dat telt: vanaf het begin van de maand, maar nooit vóór TELT_VANAF. */
export function telGrenzen(nu: Date): { van: Date; tot: Date; notitie: string | null } {
  const { van, tot } = maandGrenzen(nu);
  return van < TELT_VANAF ? { van: TELT_VANAF, tot, notitie: VANAF_NOTITIE } : { van, tot, notitie: null };
}

/** Begin (inclusief) en einde (exclusief) van de kalendermaand van `nu`, op Amsterdamse tijd, als tijdstippen. */
export function maandGrenzen(nu: Date): { van: Date; tot: Date; label: string } {
  const van = amsterdamStartOfMonth(nu);
  const tot = amsterdamStartOfMonth(nu, 1);
  const label = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(van);
  return { van, tot, label };
}

/** Het aantal tokens van een groep: het totaal als dat er is, anders invoer plus uitvoer (sommige aanbieders melden alleen die). */
function tokensVan(g: VerbruikGroep): number {
  return Math.max(g.totalTokens, g.promptTokens + g.completionTokens);
}

/** Telt de Gemini-groepen op; andere aanbieders worden weggelaten. Geen groepen (of geen Gemini) = nul aanroepen. */
export function samenvatGemini(groepen: VerbruikGroep[]): GeminiVerbruik {
  const perModel = new Map<string, VerbruikPerModel>();
  for (const g of groepen) {
    if (!isGemini(g)) continue;
    const m = perModel.get(g.model) ?? { model: g.model, aanroepen: 0, tokens: 0 };
    m.aanroepen += g.aanroepen;
    m.tokens += tokensVan(g);
    perModel.set(g.model, m);
  }
  const lijst = [...perModel.values()].sort((a, b) => b.aanroepen - a.aanroepen || (a.model < b.model ? -1 : 1));
  return { aanroepen: lijst.reduce((s, m) => s + m.aanroepen, 0), tokens: lijst.reduce((s, m) => s + m.tokens, 0), perModel: lijst };
}

const getal = new Intl.NumberFormat("nl-NL");

/** "Gemini-verbruik deze maand: 1.234 aanroepen, 5.678.901 tokens; bedrag: zie Google Cloud." of "nog geen verbruik". */
export function verbruikRegel(v: GeminiVerbruik): string {
  if (v.aanroepen === 0) return "Gemini-verbruik deze maand: nog geen verbruik; bedrag: zie Google Cloud.";
  return `Gemini-verbruik deze maand: ${getal.format(v.aanroepen)} aanroepen, ${getal.format(v.tokens)} tokens; bedrag: zie Google Cloud.`;
}

export function geminiStand(groepen: VerbruikGroep[], nu: Date): GeminiStand {
  const verbruik = samenvatGemini(groepen);
  return { ok: true, maand: maandGrenzen(nu).label, regel: verbruikRegel(verbruik), notitie: telGrenzen(nu).notitie, verbruik };
}
