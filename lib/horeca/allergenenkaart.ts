import { ALLERGENEN, schoneAllergenen, type Allergeen } from "@/lib/horeca/allergenen";

// De allergenenkaart: alle gerechten per categorie met de 14 wettelijke
// allergenen (EU 1169/2011), om te printen voor gasten, personeel en een
// controle. Puur, zodat het met vaste gegevens te testen is.

export interface KaartItem {
  naam: string;
  allergenen: Allergeen[];
  vegetarisch: boolean;
  veganistisch: boolean;
  beschikbaar: boolean;
}
export interface KaartGroep {
  naam: string;
  items: KaartItem[];
}

export const ALLERGEEN_VOLGORDE = Object.keys(ALLERGENEN) as Allergeen[];

/**
 * Groepeert de gerechten per categorie (in de volgorde van de menukaart);
 * gerechten zonder (bestaande) categorie komen onder "Overig".
 */
export function allergenenKaart(
  categorieen: { id: string; naam: string }[],
  items: { naam: string; categorieId: string | null; allergenen: string[]; vegetarisch: boolean; veganistisch: boolean; beschikbaar: boolean }[],
): KaartGroep[] {
  const bekend = new Set(categorieen.map((c) => c.id));
  const naarItem = (i: (typeof items)[number]): KaartItem => ({
    naam: i.naam,
    allergenen: schoneAllergenen(i.allergenen),
    vegetarisch: i.vegetarisch,
    veganistisch: i.veganistisch,
    beschikbaar: i.beschikbaar,
  });
  const groepen: KaartGroep[] = categorieen.map((c) => ({ naam: c.naam, items: items.filter((i) => i.categorieId === c.id).map(naarItem) }));
  const overig = items.filter((i) => !i.categorieId || !bekend.has(i.categorieId)).map(naarItem);
  if (overig.length) groepen.push({ naam: "Overig", items: overig });
  return groepen.filter((g) => g.items.length > 0);
}

/** Hoeveel gerechten elk allergeen bevatten (voor de voetregel). */
export function tellingPerAllergeen(groepen: KaartGroep[]): Record<Allergeen, number> {
  const uit = Object.fromEntries(ALLERGEEN_VOLGORDE.map((a) => [a, 0])) as Record<Allergeen, number>;
  for (const g of groepen) for (const i of g.items) for (const a of i.allergenen) uit[a] += 1;
  return uit;
}
