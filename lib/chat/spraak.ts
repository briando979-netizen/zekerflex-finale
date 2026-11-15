// ---------------------------------------------------------------------------
// Spraakberichten zoals WhatsApp (15 nov 2026, eigenaar: "spraakbericht sturen moet hetzelfde als WhatsApp zijn"). Puur: de
// regels voor ingedrukt houden, schuiven en de geluidsgolf. Het opnemen zelf zit in components/chat/Composer.tsx, het afspelen
// in components/chat/MessageBubble.tsx. Ook voor de browser (geen server-imports).
// ---------------------------------------------------------------------------

/** Zoveel staafjes heeft de golf in een bericht. */
export const GOLF_STAAFJES = 48;
/** De hoogste waarde van een staafje (0..31): klein genoeg om bij het bericht te bewaren. */
export const GOLF_MAX = 31;

/** Korter ingedrukt dan dit is een tik, geen opname: dan de uitleg "houd ingedrukt" (zoals WhatsApp). */
export const KORTE_TIK_MS = 400;
/** Zoveel pixels naar links schuiven annuleert (of een derde van de breedte, als die kleiner is). */
export const ANNULEER_PX = 120;
/** Zoveel pixels omhoog schuiven zet de opname vast: handen vrij, met pauze en terugluisteren. */
export const VASTZET_PX = 70;

export type Schuif = "houden" | "annuleren" | "vastzetten";

/**
 * Wat schuiven met de vinger tijdens het ingedrukt houden betekent. dx < 0 is naar links, dy < 0 is omhoog. Omhoog gaat voor als
 * beide gebeuren en omhoog duidelijk groter is; zo zet een schuine beweging naar boven niet per ongeluk een annulering in gang.
 */
export function schuifStand(dx: number, dy: number, breedte: number): Schuif {
  const annuleer = Math.min(ANNULEER_PX, Math.max(60, breedte / 3));
  const omhoog = -dy;
  const links = -dx;
  if (omhoog >= VASTZET_PX && omhoog > links) return "vastzetten";
  if (links >= annuleer) return "annuleren";
  return "houden";
}

/** Hoe ver de "schuif om te annuleren"-tekst al is (0..1), voor het meeschuiven en vervagen. */
export function annuleerVoortgang(dx: number, breedte: number): number {
  const annuleer = Math.min(ANNULEER_PX, Math.max(60, breedte / 3));
  return Math.max(0, Math.min(1, -dx / annuleer));
}

/** Het geluidsniveau van één meting (bytes 0..255 rond 128, zoals AnalyserNode.getByteTimeDomainData), als 0..1. */
export function niveauUit(monsters: ArrayLike<number>): number {
  if (!monsters.length) return 0;
  let som = 0;
  for (let i = 0; i < monsters.length; i++) {
    const v = ((monsters[i] ?? 128) - 128) / 128;
    som += v * v;
  }
  // wortel van het gemiddelde kwadraat; spraak komt zelden boven 0,5, dus wat versterkt en afgekapt op 1
  return Math.min(1, Math.sqrt(som / monsters.length) * 2.5);
}

/** Onder dit niveau is een opname stilte: dan geen schaal, anders zou ruis de volle hoogte krijgen. */
export const STILTE = 0.02;

/**
 * De golf van een hele opname samengevat tot GOLF_STAAFJES staafjes van 0..GOLF_MAX (de hoogste per stuk, zodat pieken blijven),
 * op schaal: het hardste stuk haalt GOLF_MAX, zoals bij WhatsApp. Zonder schaal was een golf van een stille microfoon (of de
 * nepmicrofoon van de belproef, 15 nov) een platte lijn. Echte stilte blijft laag.
 */
export function golfSamenvatten(niveaus: readonly number[], aantal: number = GOLF_STAAFJES): number[] {
  if (!niveaus.length) return [];
  const pieken: number[] = [];
  for (let i = 0; i < aantal; i++) {
    const van = Math.floor((i * niveaus.length) / aantal);
    const tot = Math.max(van + 1, Math.floor(((i + 1) * niveaus.length) / aantal));
    let hoogste = 0;
    for (let j = van; j < tot && j < niveaus.length; j++) hoogste = Math.max(hoogste, niveaus[j] ?? 0);
    pieken.push(Math.max(0, Math.min(1, hoogste)));
  }
  const max = Math.max(...pieken);
  const schaal = max >= STILTE ? 1 / max : 1;
  return pieken.map((p) => Math.round(Math.min(1, p * schaal) * GOLF_MAX));
}

/** Hoe hoog elk staafje getekend wordt (0..1), op schaal van de eigen golf; ook voor berichten met een golf van vóór de schaal. */
export function golfHoogtes(golf: readonly number[], laagste = 0.14): number[] {
  const max = Math.max(0, ...golf);
  const schaal = max > 0 ? 1 / max : 0;
  return golf.map((n) => Math.max(laagste, Math.min(1, n * schaal)));
}

/** De bewegende golf tijdens het opnemen: op schaal van het hardste van wat er te zien is (minstens STILTE * 2,5). */
export function liveHoogtes(niveaus: readonly number[]): number[] {
  const piek = Math.max(STILTE * 2.5, ...niveaus);
  return niveaus.map((n) => Math.min(1, n / piek));
}

/** Een golf uit het bericht schoonmaken: alleen hele getallen 0..GOLF_MAX, hooguit 64 staafjes; anders geen golf. */
export function schoneGolf(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > 64) return undefined;
  const uit = v.map((x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(Math.max(0, Math.min(GOLF_MAX, x))) : 0));
  return uit;
}

/**
 * Een golf voor een oud spraakbericht (van vóór 15 nov, zonder bewaarde golf): vast per bericht, zodat hij niet verspringt.
 * Alleen voor de vorm; de echte golf hebben alleen nieuwe berichten.
 */
export function vasteGolf(sleutel: string, aantal: number = GOLF_STAAFJES): number[] {
  let h = 2166136261;
  for (let i = 0; i < sleutel.length; i++) {
    h ^= sleutel.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const uit: number[] = [];
  for (let i = 0; i < aantal; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
    // een zachte golf met wat toeval: hoger in het midden van een "zin"
    const basis = 0.35 + 0.35 * Math.abs(Math.sin((i / aantal) * Math.PI * 3));
    const ruis = (h % 1000) / 1000;
    uit.push(Math.round(Math.max(0.12, Math.min(1, basis * 0.7 + ruis * 0.45)) * GOLF_MAX));
  }
  return uit;
}

/** Waar op de golf (0..1) een tik of sleep valt. */
export function golfPositie(x: number, links: number, breedte: number): number {
  if (breedte <= 0) return 0;
  return Math.max(0, Math.min(1, (x - links) / breedte));
}
