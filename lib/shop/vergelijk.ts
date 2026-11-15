// ---------------------------------------------------------------------------
// Producten vergelijken, zoals bol.com (stap 3, 15 nov 2026): op een kaartje "Vergelijk" aanvinken, hooguit vier, en op
// /shop/vergelijk?ids=… naast elkaar zien. De keuze staat in de browser (components/marketing/useShopVergelijk.ts); het
// adres met ?ids= is te delen. Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export const MAX_VERGELIJK = 4;

/** Zet een product erbij of haalt het weg; vol = er stonden er al vier (dan verandert er niets). */
export function wisselVergelijk(ids: readonly string[], id: string): { ids: string[]; vol: boolean } {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), vol: false };
  if (ids.length >= MAX_VERGELIJK) return { ids: [...ids], vol: true };
  return { ids: [...ids, id], vol: false };
}

/** De ids uit het adres (?ids=a,b,c): alleen nette ids, zonder dubbele, hooguit vier. */
export function idsUitAdres(waarde: unknown): string[] {
  if (typeof waarde !== "string") return [];
  const uit: string[] = [];
  for (const deel of waarde.split(",")) {
    const id = deel.trim();
    if (/^[a-z0-9_-]{6,40}$/i.test(id) && !uit.includes(id)) uit.push(id);
    if (uit.length >= MAX_VERGELIJK) break;
  }
  return uit;
}

export function vergelijkPad(ids: readonly string[]): string {
  return ids.length ? `/shop/vergelijk?ids=${ids.map(encodeURIComponent).join(",")}` : "/shop/vergelijk";
}

export interface VergelijkRij {
  sleutel: string;
  label: string;
  /** per product, in dezelfde volgorde als de kolommen */
  waarden: string[];
  /** verschillen de producten hierin? (voor "Alleen verschillen tonen") */
  verschilt: boolean;
}

/** Een rij voor de tabel; "verschilt" kijkt of niet alle waarden gelijk zijn. */
export function vergelijkRij(sleutel: string, label: string, waarden: string[]): VergelijkRij {
  return { sleutel, label, waarden, verschilt: new Set(waarden).size > 1 };
}
