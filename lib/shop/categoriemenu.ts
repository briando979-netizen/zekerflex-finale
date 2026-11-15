// ---------------------------------------------------------------------------
// Het menu "Alle categorieën" (stap 3 richting bol.com, 15 nov 2026): per categorie hoeveel producten er zijn en, als die
// er zijn, de snelle keuzes Heren, Dames en Kinderen (/shop?cat=…&voor=…). Uit de echte catalogus, dus nooit een lege
// keuze. Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export const VOOR_WAARDEN = ["heren", "vrouwen", "kinderen"] as const;
export type VoorWaarde = (typeof VOOR_WAARDEN)[number];

const VOOR_TABEL: Record<VoorWaarde, true> = { heren: true, vrouwen: true, kinderen: true };

/** ?voor=… uit het adres; Object.hasOwn, niet `in` ("constructor" telt niet). */
export function voorUitAdres(v: unknown): VoorWaarde | null {
  return typeof v === "string" && Object.hasOwn(VOOR_TABEL, v) ? (v as VoorWaarde) : null;
}

export interface MenuGroep {
  aantal: number;
  voor: { waarde: VoorWaarde; aantal: number }[];
}

/** Hoeveel producten een categorie heeft en voor wie (alleen keuzes met minstens één product). */
export function menuGroep(catalogus: readonly { category?: string | null; gender?: string | null }[], categorie: string): MenuGroep {
  const hier = catalogus.filter((p) => p.category === categorie);
  return {
    aantal: hier.length,
    voor: VOOR_WAARDEN.map((w) => ({ waarde: w, aantal: hier.filter((p) => p.gender === w).length })).filter((v) => v.aantal > 0),
  };
}

export function categoriePad(categorie: string, voor?: VoorWaarde): string {
  return `/shop?cat=${encodeURIComponent(categorie)}${voor ? `&voor=${voor}` : ""}#collectie`;
}
