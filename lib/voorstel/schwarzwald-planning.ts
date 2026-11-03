// ---------------------------------------------------------------------------
// Rekenwerk voor de weekplanning in het beheer: welke week, welke dagen, en
// hoe reserveringen die tegelijk lopen naast elkaar komen (banen). Puur, dus
// ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const plusDagen = (datum: string, n: number) => {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** De maandag van de week waarin de datum valt. */
export function maandagVan(datum: string): string {
  const dag = new Date(`${datum}T00:00:00Z`).getUTCDay(); // 0 = zondag
  return plusDagen(datum, dag === 0 ? -6 : 1 - dag);
}

export const weekDagen = (maandag: string) => Array.from({ length: 7 }, (_, i) => plusDagen(maandag, i));

export const minuten = (tijd: string) => Number(tijd.slice(0, 2)) * 60 + Number(tijd.slice(3, 5));

export interface PlanItem {
  id: string;
  tijd: string;
  duurMin: number;
}

export interface Geplaatst<T extends PlanItem> {
  item: T;
  start: number;
  eind: number;
  /** baan binnen de overlappende groep (0 = links) */
  baan: number;
  /** aantal banen in die groep */
  banen: number;
}

/**
 * Verdeelt de reserveringen van één dag over banen: wat tegelijk loopt, komt
 * naast elkaar. Per groep overlappende items krijgen ze dezelfde breedte.
 */
export function indelen<T extends PlanItem>(items: T[]): Geplaatst<T>[] {
  const lijst = items
    .map((item) => ({ item, start: minuten(item.tijd), eind: minuten(item.tijd) + Math.max(15, item.duurMin), baan: 0, banen: 1 }))
    .sort((a, b) => a.start - b.start || b.eind - a.eind);
  const uit: Geplaatst<T>[] = [];
  let groep: Geplaatst<T>[] = [];
  let groepEind = -1;
  const sluit = () => {
    const banen = Math.max(1, ...groep.map((g) => g.baan + 1));
    for (const g of groep) g.banen = banen;
    uit.push(...groep);
    groep = [];
  };
  for (const g of lijst) {
    if (groep.length && g.start >= groepEind) sluit();
    const bezet = new Set(groep.filter((x) => x.eind > g.start).map((x) => x.baan));
    let baan = 0;
    while (bezet.has(baan)) baan++;
    g.baan = baan;
    groep.push(g);
    groepEind = Math.max(groepEind, g.eind);
  }
  if (groep.length) sluit();
  return uit;
}
