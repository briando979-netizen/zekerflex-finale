import { SHIFT_CATEGORIES, shiftCategory, type ShiftCategory, type ShiftCategoryKey } from "@/lib/shifts/category";
import { SECTOR_TEMPLATE } from "@/lib/klusconcept/concept";

// ---------------------------------------------------------------------------
// De functiekiezer van de klus-wizard (components/app/SjabloonGalerij.tsx): zoeken, filteren op branche en de korte
// lijst "Veelgekozen". Puur, zodat de browser en de tests er zonder JSX bij kunnen. De sjablonen zelf staan in
// lib/shifts/catalogus.ts; hier wordt niets aan de data veranderd.
// ---------------------------------------------------------------------------

export interface KiezerSjabloon {
  key: string;
  label: string;
  rateCents: number;
  branche?: ShiftCategoryKey | undefined;
}

/** Zoveel functies in de korte lijst, de rest achter "Toon alle functies". */
export const VEELGEKOZEN_AANTAL = 8;

const BY_KEY = new Map<ShiftCategoryKey, ShiftCategory>(SHIFT_CATEGORIES.map((c) => [c.key, c]));

/** De branche van een sjabloon: de eigen `branche`, anders afgeleid uit de titel (zoals de klus-kaart). */
export function categorieVan(t: Pick<KiezerSjabloon, "label" | "branche">): ShiftCategory {
  return (t.branche ? BY_KEY.get(t.branche) : undefined) ?? shiftCategory(t.label, null);
}

/** De branches die minstens één sjabloon hebben, in de volgorde van SHIFT_CATEGORIES. */
export function brancheOpties(sjablonen: readonly KiezerSjabloon[]): ShiftCategory[] {
  const met = new Set(sjablonen.map((t) => categorieVan(t).key));
  return SHIFT_CATEGORIES.filter((c) => met.has(c.key));
}

/** Kleine letters, zonder accenten ("café" vindt "cafe"). */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Wat we kunnen zeggen over "veelgekozen": er is nog geen meting van wat bedrijven kiezen (bijna geen echte klussen),
 * dus geen verzonnen top 8. We nemen de functies waar de sectorpagina's naar verwijzen (SECTOR_TEMPLATE: horeca,
 * logistiek, schoonmaak, retail, promotie, bezorging) en vullen aan in de vaste volgorde van de catalogus. Is er later
 * een echte meting (templateKey op de geplaatste klussen), dan vervangt die lijst deze functie, de rest blijft.
 * Een gekozen functie die er niet bij valt staat vooraan, zodat je altijd ziet wat je koos.
 */
export function veelgekozen<T extends KiezerSjabloon>(sjablonen: readonly T[], aantal = VEELGEKOZEN_AANTAL, gekozen = ""): T[] {
  const perKey = new Map(sjablonen.map((t) => [t.key, t] as const));
  const lijst: T[] = [];
  const erbij = (t: T | undefined) => {
    if (t && lijst.length < aantal && !lijst.includes(t)) lijst.push(t);
  };
  for (const key of new Set(Object.values(SECTOR_TEMPLATE))) erbij(perKey.get(key));
  for (const t of sjablonen) erbij(t);
  const gekozenT = gekozen ? perKey.get(gekozen) : undefined;
  if (gekozenT && !lijst.includes(gekozenT)) return [gekozenT, ...lijst.slice(0, Math.max(0, aantal - 1))];
  return lijst;
}

/**
 * Zoeken in de functienaam en de branche, alle woorden moeten passen. Een woordbegin in de functienaam gaat voor een
 * treffer midden in de naam, en die voor een treffer alleen op de branche; daarbinnen blijft de vaste volgorde.
 */
export function zoekSjablonen<T extends KiezerSjabloon>(sjablonen: readonly T[], o: { zoek?: string; branche?: ShiftCategoryKey | "alle" } = {}): T[] {
  const termen = norm(o.zoek ?? "").split(/\s+/).filter(Boolean);
  const brancheKey = o.branche && o.branche !== "alle" ? o.branche : null;
  const rang = (t: T): number => {
    const cat = categorieVan(t);
    if (brancheKey && cat.key !== brancheKey) return -1;
    if (termen.length === 0) return 0;
    const naam = norm(t.label);
    const woorden = naam.split(/[^a-z0-9]+/).filter(Boolean);
    const branche = norm(cat.label);
    let r = 0;
    for (const term of termen) {
      if (woorden.some((w) => w.startsWith(term))) continue;
      if (naam.includes(term)) r = Math.max(r, 1);
      else if (branche.includes(term)) r = Math.max(r, 2);
      else return -1;
    }
    return r;
  };
  return sjablonen
    .map((t, i) => ({ t, i, r: rang(t) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t);
}

export interface KiezerWeergave<T> {
  /** "veelgekozen" = de korte lijst, "resultaten" = zoekresultaat, een branche of alles */
  modus: "veelgekozen" | "resultaten";
  items: T[];
}

/** Wat de kiezer toont: zonder zoekwoord, branche of uitklap de korte lijst, anders alle passende functies. */
export function kiezerWeergave<T extends KiezerSjabloon>(
  sjablonen: readonly T[],
  o: { zoek: string; branche: ShiftCategoryKey | "alle"; alles: boolean; gekozen: string },
): KiezerWeergave<T> {
  const gefilterd = o.zoek.trim() !== "" || o.branche !== "alle";
  if (gefilterd || o.alles) return { modus: "resultaten", items: zoekSjablonen(sjablonen, { zoek: o.zoek, branche: o.branche }) };
  return { modus: "veelgekozen", items: veelgekozen(sjablonen, VEELGEKOZEN_AANTAL, o.gekozen) };
}

/** "€ 16,20" (Nederlands) of "€ 16.20" (Engels). */
export function euroTekst(cents: number, taal: "nl" | "en" = "nl"): string {
  const s = (cents / 100).toFixed(2);
  return `€ ${taal === "nl" ? s.replace(".", ",") : s}`;
}
