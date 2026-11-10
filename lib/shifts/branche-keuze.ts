// De branches (sectoren) die een werker of werkgever bij de start kan kiezen: alle categorieën van
// lib/shifts/category.ts behalve "Overig", of in één keer alle branches. Puur, ook voor het scherm.

import { SHIFT_CATEGORIES, type ShiftCategoryKey } from "@/lib/shifts/category";

export interface BrancheOptie {
  key: ShiftCategoryKey;
  label: string;
}

/** Wat je kunt kiezen, in de volgorde van de rest van de app. "Overig" hoort er niet bij: dat is geen branche. */
export const BRANCHE_OPTIES: BrancheOptie[] = SHIFT_CATEGORIES.filter((c) => c.key !== "algemeen").map((c) => ({ key: c.key, label: c.label }));

const GELDIG = new Set<string>(BRANCHE_OPTIES.map((o) => o.key));

export interface BrancheKeuze {
  /** alle branches: geen filter, alles is welkom */
  alle: boolean;
  /** de gekozen branches; leeg als `alle` waar is */
  branches: ShiftCategoryKey[];
}

export const isBranche = (k: unknown): k is ShiftCategoryKey => typeof k === "string" && GELDIG.has(k);

/**
 * Maakt van ongecontroleerde invoer een nette keuze: onbekende en dubbele branches vallen weg, de
 * volgorde is die van de lijst. Alles gekozen of "alle" aangevinkt telt als alle branches. Niets gekozen
 * geeft null: een keuze zonder branche bestaat niet.
 */
export function maakBrancheKeuze(invoer: { alle?: unknown; branches?: unknown }): BrancheKeuze | null {
  const gekozen = new Set((Array.isArray(invoer.branches) ? invoer.branches : []).filter(isBranche));
  const lijst = BRANCHE_OPTIES.map((o) => o.key).filter((k) => gekozen.has(k));
  if (invoer.alle === true || lijst.length === BRANCHE_OPTIES.length) return { alle: true, branches: [] };
  return lijst.length === 0 ? null : { alle: false, branches: lijst };
}

/** De branches waarop de lijst met klussen standaard gefilterd wordt: leeg = niet filteren. */
export function standaardFilter(keuze: BrancheKeuze | null): ShiftCategoryKey[] {
  return keuze && !keuze.alle ? keuze.branches : [];
}

/** "Alle branches", "Horeca", "Horeca en Retail", "Horeca, Retail en 2 andere". */
export function brancheSamenvatting(keuze: BrancheKeuze | null, alleTekst: string, enTekst: string, andereTekst: string): string {
  if (!keuze) return "";
  if (keuze.alle) return alleTekst;
  const namen = keuze.branches.map((k) => BRANCHE_OPTIES.find((o) => o.key === k)?.label ?? k);
  if (namen.length <= 2) return namen.join(` ${enTekst} `);
  return `${namen.slice(0, 2).join(", ")} ${enTekst} ${andereTekst.replace("{n}", String(namen.length - 2))}`;
}
