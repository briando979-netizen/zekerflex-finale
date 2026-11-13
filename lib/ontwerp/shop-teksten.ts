import type { Dict } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// De teksten van de voorpagina van de webshop, aan te passen in de Site-ontwerper (tabblad Teksten, groep "Webshop").
// De standaard is de Nederlandse tekst uit het woordenboek (lib/i18n/dictionaries.ts): er staat dus niets dubbel.
// Een eigen tekst geldt alleen voor de Nederlandse shop; wie de shop in het Engels bekijkt, houdt de Engelse vertaling.
// Puur bestand: het register (lib/content/store.ts) neemt de velden over, de pagina (app/shop/page.tsx) past ze toe.
// ---------------------------------------------------------------------------

type ShopThuisSleutel = keyof Dict["shopThuis"];
type ShopSleutel = keyof Dict["shop"];

export interface ShopTekstVeld {
  key: string;
  group: string;
  label: string;
  multiline?: boolean;
  /** waar de tekst in het woordenboek staat */
  plek: { deel: "shopThuis"; sleutel: ShopThuisSleutel } | { deel: "shop"; sleutel: ShopSleutel };
  /** een stukje dat in de tekst moet blijven staan (een plaatshouder); zonder dat stukje geldt de standaard */
  moetBevatten?: string;
}

const KOP = "Webshop — kop";
const ONDERDELEN = "Webshop — onderdelen";

export const SHOP_TEKST_VELDEN: ShopTekstVeld[] = [
  { key: "shop.heroEyebrow", group: KOP, label: "Bovenregel", plek: { deel: "shopThuis", sleutel: "heroEyebrow" } },
  { key: "shop.heroTitel", group: KOP, label: "Titel", plek: { deel: "shopThuis", sleutel: "heroTitel" } },
  { key: "shop.heroSub", group: KOP, label: "Introtekst", multiline: true, plek: { deel: "shopThuis", sleutel: "heroSub" } },
  { key: "shop.heroKnop", group: KOP, label: "Knop 1 (naar de collectie)", plek: { deel: "shopThuis", sleutel: "heroKnop" } },
  { key: "shop.heroPaskamer", group: KOP, label: "Knop 2 (naar de paskamer)", plek: { deel: "shopThuis", sleutel: "heroPaskamer" } },
  { key: "shop.categorieTitel", group: ONDERDELEN, label: "Categorietegels: titel", plek: { deel: "shopThuis", sleutel: "categorieTitel" } },
  { key: "shop.kledingSub", group: ONDERDELEN, label: "Tegel Kleding: regel eronder", plek: { deel: "shopThuis", sleutel: "kledingSub" } },
  { key: "shop.pbmSub", group: ONDERDELEN, label: "Tegel Werk & PBM: regel eronder", plek: { deel: "shopThuis", sleutel: "pbmSub" } },
  { key: "shop.werkdagSub", group: ONDERDELEN, label: "Tegel Werkdag: regel eronder", plek: { deel: "shopThuis", sleutel: "werkdagSub" } },
  { key: "shop.cadeausSub", group: ONDERDELEN, label: "Tegel Cadeaus: regel eronder", plek: { deel: "shopThuis", sleutel: "cadeausSub" } },
  { key: "shop.looksTitel", group: ONDERDELEN, label: "Shop de look: titel", plek: { deel: "shopThuis", sleutel: "looksTitel" } },
  { key: "shop.looksSub", group: ONDERDELEN, label: "Shop de look: introtekst", multiline: true, plek: { deel: "shopThuis", sleutel: "looksSub" } },
  { key: "shop.popular", group: ONDERDELEN, label: "Populair: titel", plek: { deel: "shop", sleutel: "popular" } },
  { key: "shop.kitsTitle", group: ONDERDELEN, label: "Pakketten: titel", plek: { deel: "shop", sleutel: "kitsTitle" } },
  { key: "shop.moreCategories", group: ONDERDELEN, label: "Meer categorieën: titel", plek: { deel: "shop", sleutel: "moreCategories" } },
  { key: "shop.serviceTitle", group: ONDERDELEN, label: "Service: titel", plek: { deel: "shop", sleutel: "serviceTitle" } },
  { key: "shop.newsletterTitle", group: ONDERDELEN, label: "Nieuwsbrief: titel", plek: { deel: "shop", sleutel: "newsletterTitle" } },
  {
    key: "shop.newsletterBody",
    group: ONDERDELEN,
    label: "Nieuwsbrief: tekst (laat {code} staan: daar komt de kortingscode)",
    multiline: true,
    plek: { deel: "shop", sleutel: "newsletterBody" },
    moetBevatten: "{code}",
  },
];

const standaard = (nl: Dict, v: ShopTekstVeld): string => {
  const waarde = v.plek.deel === "shopThuis" ? nl.shopThuis[v.plek.sleutel] : nl.shop[v.plek.sleutel];
  return typeof waarde === "string" ? waarde : "";
};

/** De velden voor het tekstenregister, met de Nederlandse woordenboektekst als standaard. */
export function shopTekstItems(nl: Dict): { key: string; group: string; label: string; default: string; multiline?: boolean }[] {
  return SHOP_TEKST_VELDEN.map((v) => ({ key: v.key, group: v.group, label: v.label, default: standaard(nl, v), ...(v.multiline ? { multiline: true } : {}) }));
}

/**
 * Het woordenboek met de eigen teksten erin. Alleen voor Nederlands: een andere taal krijgt het woordenboek ongewijzigd terug.
 * Een lege waarde, of een tekst waarin een verplicht stukje ontbreekt, laat de standaard staan. Het oorspronkelijke woordenboek
 * wordt niet aangepast.
 */
export function metShopTeksten(dict: Dict, waarden: Record<string, string>, locale: string): Dict {
  if (locale !== "nl") return dict;
  const shopThuis = { ...dict.shopThuis };
  const shop = { ...dict.shop };
  let gewijzigd = false;
  for (const v of SHOP_TEKST_VELDEN) {
    const waarde = waarden[v.key]?.trim();
    if (!waarde || (v.moetBevatten && !waarde.includes(v.moetBevatten))) continue;
    if (v.plek.deel === "shopThuis") {
      if (shopThuis[v.plek.sleutel] === waarde) continue;
      (shopThuis as Record<string, unknown>)[v.plek.sleutel] = waarde;
    } else {
      if (shop[v.plek.sleutel] === waarde) continue;
      (shop as Record<string, unknown>)[v.plek.sleutel] = waarde;
    }
    gewijzigd = true;
  }
  return gewijzigd ? { ...dict, shopThuis, shop } : dict;
}
