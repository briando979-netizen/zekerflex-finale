// De tabbladen van Beheer -> Webshop -> Producten (components/admin/ShopAdmin.tsx) in het adres: /admin/shop?tab=orders.
// Puur bestand, zodat de Webshop-console (lib/shop/console.ts), het scherm en de test dezelfde namen gebruiken.

export const SHOP_TABS = ["products", "orders", "stats", "tools"] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

const TABEL: Record<ShopTab, true> = { products: true, orders: true, stats: true, tools: true };

/** Is dit een bekende tabnaam? Object.hasOwn, niet `in`: anders telt "constructor" uit het adres als geldig. */
export function isShopTab(waarde: unknown): waarde is ShopTab {
  return typeof waarde === "string" && Object.hasOwn(TABEL, waarde);
}

/** Het tabblad uit het adres; een onbekende of ontbrekende naam geeft het standaardtabblad (Producten). */
export function kiesShopTab(waarde: unknown): ShopTab {
  return isShopTab(waarde) ? waarde : "products";
}

/** De querystring (zonder "?") met het gekozen tabblad erin; andere onderdelen blijven staan, Producten laat ?tab= weg. */
export function zoekMetShopTab(zoek: string, tab: ShopTab): string {
  const p = new URLSearchParams(zoek.startsWith("?") ? zoek.slice(1) : zoek);
  if (tab === "products") p.delete("tab");
  else p.set("tab", tab);
  return p.toString();
}