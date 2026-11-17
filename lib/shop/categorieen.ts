// ---------------------------------------------------------------------------
// De categorieën van de webshop: één lijst voor de etalage, de filters, de API, het
// beheer en de Winkel-AI. Tot 18 nov 2026 stond dezelfde lijst van vier op tien plekken;
// met de leverancierskoppeling (lib/shop/cj) kwamen elektronica, speelgoed, wonen, sport,
// verzorging, tassen en sieraden erbij. Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export const SHOP_CATEGORIEEN = [
  "Werk & PBM",
  "Kleding",
  "Werkdag",
  "Cadeaus",
  "Elektronica",
  "Speelgoed",
  "Wonen & keuken",
  "Sport & buiten",
  "Beauty & verzorging",
  "Tassen & schoenen",
  "Sieraden & horloges",
] as const;
export type ShopCategorie = (typeof SHOP_CATEGORIEEN)[number];

/** De Engelse naam (de shop is Nederlands en Engels). */
export const CATEGORIE_EN: Record<ShopCategorie, string> = {
  "Werk & PBM": "Work & PPE",
  Kleding: "Clothing",
  Werkdag: "Workday",
  Cadeaus: "Gifts",
  Elektronica: "Electronics",
  Speelgoed: "Toys",
  "Wonen & keuken": "Home & kitchen",
  "Sport & buiten": "Sports & outdoors",
  "Beauty & verzorging": "Beauty & care",
  "Tassen & schoenen": "Bags & shoes",
  "Sieraden & horloges": "Jewellery & watches",
};

export const isShopCategorie = (v: unknown): v is ShopCategorie => typeof v === "string" && (SHOP_CATEGORIEEN as readonly string[]).includes(v);

/**
 * De naam in de taal van de shop. De vier oorspronkelijke categorieën hebben eigen teksten in het
 * woordenboek (shop.navPbm, navKleding, navWerkdag, shopZakelijk.navCadeaus); de rest komt hieruit.
 * `engels`: of de shop in het Engels staat (bijv. `t.shop.navKleding !== "Kleding"`).
 */
export function categorieNaam(c: string, engels: boolean): string {
  return engels && isShopCategorie(c) ? CATEGORIE_EN[c] : c;
}
