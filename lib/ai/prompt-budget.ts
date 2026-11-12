// ---------------------------------------------------------------------------
// Een tokenbudget voor de vraag aan het eigen model (13 nov 2026, besluit 86). Gemeten op prod: Ollama geeft elke
// aanvraag 2048 tokens (context 4096 over 2 plekken) en kapt alles daarboven stil af, vooraan; de breinprompt was ±5.400
// tokens, dus het kennispakket viel grotendeels weg. Bij "alles gratis" kiezen we daarom zelf wat erin komt: eerst wat
// het best past, tot het budget op is, en ±450 tokens blijven over voor het antwoord. Stukken die niet passen gaan er
// heel uit, ze worden niet afgekapt. Bij Gemini verandert er niets. Puur bestand.
// ---------------------------------------------------------------------------

/** Nederlandse tekst, ruwe schatter (gemeten ±3,7 tekens per token bij gemma3; 3,4 houdt marge). */
export const TEKENS_PER_TOKEN = 3.4;
export const GRATIS_CONTEXT_TOKENS = 2048;
export const ANTWOORD_RUIMTE_TOKENS = 450;
export const GRATIS_PROMPT_BUDGET = GRATIS_CONTEXT_TOKENS - ANTWOORD_RUIMTE_TOKENS;
/** de opmaak rond elk bericht (rol, scheidingstekens) */
export const PER_BERICHT_TOKENS = 8;

export function schatTokens(tekst: string): number {
  return Math.ceil(tekst.length / TEKENS_PER_TOKEN);
}

export function berichtenTokens(berichten: readonly { content: string }[]): number {
  return berichten.reduce((s, b) => s + schatTokens(b.content) + PER_BERICHT_TOKENS, 0);
}

/**
 * Neemt de stukken in de gegeven volgorde (beste eerst) zolang ze passen; een stuk dat niet past wordt overgeslagen
 * (niet afgekapt), een kleiner stuk erna mag nog.
 */
export function kiesBinnenBudget<T>(stukken: readonly T[], tokensVan: (s: T) => number, budget: number): T[] {
  const uit: T[] = [];
  let over = budget;
  for (const s of stukken) {
    const t = tokensVan(s);
    if (t <= over) {
      uit.push(s);
      over -= t;
    }
  }
  return uit;
}

/** De nieuwste berichten die nog passen, in hun oorspronkelijke volgorde. */
export function laatsteBinnenBudget<T>(berichten: readonly T[], tokensVan: (s: T) => number, budget: number): T[] {
  const uit: T[] = [];
  let over = budget;
  for (let i = berichten.length - 1; i >= 0; i--) {
    const b = berichten[i] as T;
    const t = tokensVan(b);
    if (t > over) break;
    uit.unshift(b);
    over -= t;
  }
  return uit;
}

const WOORD = /[a-z0-9à-ÿ]{3,}/g;
const woorden = (t: string) => new Set(t.toLowerCase().match(WOORD) ?? []);

/** Hoeveel woorden van de vraag in de tekst staan (0–1): om vaste kennis op de vraag te sorteren. */
export function woordOverlap(vraag: string, tekst: string): number {
  const v = woorden(vraag);
  if (v.size === 0) return 0;
  const t = woorden(tekst);
  let n = 0;
  for (const w of v) if (t.has(w)) n++;
  return n / v.size;
}
