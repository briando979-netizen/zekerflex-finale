// ---------------------------------------------------------------------------
// De categorieën van de webshop: één lijst voor de etalage, de filters, de API, het
// beheer en de Winkel-AI. Tot 18 nov 2026 stond dezelfde lijst van vier op tien plekken;
// met de leverancierskoppeling (lib/shop/cj) kwamen elektronica, speelgoed, wonen, sport,
// verzorging, tassen en sieraden erbij; later die dag (op vraag van de eigenaar) ook telefoon,
// gaming en hobby, baby en kind, tuin en klussen, huisdieren, auto en fiets, gezondheid en
// feest en seizoen. Puur bestand, ook voor de browser. De volgorde is de volgorde in het menu.
// ---------------------------------------------------------------------------

export const SHOP_CATEGORIEEN = [
  "Werk & PBM",
  "Kleding",
  "Werkdag",
  "Cadeaus",
  "Elektronica",
  "Telefoon & accessoires",
  "Gaming & hobby",
  "Speelgoed",
  "Baby & kind",
  "Wonen & keuken",
  "Tuin & klussen",
  "Huisdieren",
  "Sport & buiten",
  "Auto & fiets",
  "Beauty & verzorging",
  "Gezondheid",
  "Tassen & schoenen",
  "Sieraden & horloges",
  "Feest & seizoen",
] as const;
export type ShopCategorie = (typeof SHOP_CATEGORIEEN)[number];

/** De Engelse naam (de shop is Nederlands en Engels). */
export const CATEGORIE_EN: Record<ShopCategorie, string> = {
  "Werk & PBM": "Work & PPE",
  Kleding: "Clothing",
  Werkdag: "Workday",
  Cadeaus: "Gifts",
  Elektronica: "Electronics",
  "Telefoon & accessoires": "Phone & accessories",
  "Gaming & hobby": "Gaming & hobby",
  Speelgoed: "Toys",
  "Baby & kind": "Baby & kids",
  "Wonen & keuken": "Home & kitchen",
  "Tuin & klussen": "Garden & DIY",
  Huisdieren: "Pets",
  "Sport & buiten": "Sports & outdoors",
  "Auto & fiets": "Car & bike",
  "Beauty & verzorging": "Beauty & care",
  Gezondheid: "Health",
  "Tassen & schoenen": "Bags & shoes",
  "Sieraden & horloges": "Jewellery & watches",
  "Feest & seizoen": "Party & seasonal",
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
