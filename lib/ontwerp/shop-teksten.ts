import type { Dict } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// De teksten van de webshop, aan te passen in de Site-ontwerper (tabblad Teksten, groepen "Webshop — …").
// De standaard is de Nederlandse tekst uit het woordenboek (lib/i18n/dictionaries.ts, delen `shop` en `shopThuis`): er staat
// dus niets dubbel, en een tekst die er in het woordenboek bij komt, staat vanzelf ook in de lijst.
// Een eigen tekst geldt alleen voor de Nederlandse shop; wie de shop in een andere taal bekijkt, houdt de vertaling.
// Puur bestand: het register (lib/content/store.ts) neemt de velden over; de pagina (app/shop/page.tsx) en de omlijsting
// (app/shop/layout.tsx, voor de onderdelen die in de browser draaien) passen ze toe.
// ---------------------------------------------------------------------------

type Deel = "shopThuis" | "shop";

export interface ShopTekstVeld {
  key: string;
  group: string;
  label: string;
  multiline?: boolean;
  /** waar de tekst in het woordenboek staat */
  plek: { deel: Deel; sleutel: string };
}

const KOP = "Webshop — kop";
const ONDERDELEN = "Webshop — onderdelen";
const OVERIG = "Webshop — alle overige teksten";

/** De teksten die je het vaakst wilt aanpassen, met een eigen naam; de rest volgt vanzelf uit het woordenboek (overigeVelden). */
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
  { key: "shop.newsletterBody", group: ONDERDELEN, label: "Nieuwsbrief: tekst (laat {code} staan: daar komt de kortingscode)", multiline: true, plek: { deel: "shop", sleutel: "newsletterBody" } },
];

const deel = (d: Dict, naam: Deel): Record<string, unknown> => d[naam] as unknown as Record<string, unknown>;
const tekstOp = (d: Dict, plek: ShopTekstVeld["plek"]): string => {
  const waarde = Object.hasOwn(deel(d, plek.deel), plek.sleutel) ? deel(d, plek.deel)[plek.sleutel] : "";
  return typeof waarde === "string" ? waarde : "";
};

/** De stukjes tussen accolades ({code}, {n}): die vult de shop zelf in en moeten in een eigen tekst blijven staan. */
export const plaatshouders = (tekst: string): string[] => [...new Set([...tekst.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]))];

/** Alle andere teksten van de shop: één veld per tekst in het woordenboek die geen eigen naam hierboven heeft. */
function overigeVelden(nl: Dict): ShopTekstVeld[] {
  const benoemd = new Set(SHOP_TEKST_VELDEN.map((v) => `${v.plek.deel}.${v.plek.sleutel}`));
  const uit: ShopTekstVeld[] = [];
  for (const naam of ["shopThuis", "shop"] as const) {
    for (const [sleutel, waarde] of Object.entries(deel(nl, naam))) {
      if (typeof waarde !== "string" || !waarde.trim() || benoemd.has(`${naam}.${sleutel}`)) continue;
      const vast = plaatshouders(waarde);
      uit.push({
        // "shop.x." voor het deel shop, "shop.t." voor shopThuis: zo botst een sleutel nooit met een benoemd veld
        key: `shop.${naam === "shop" ? "x" : "t"}.${sleutel}`,
        group: OVERIG,
        label: `“${waarde.length > 60 ? `${waarde.slice(0, 57)}…` : waarde}”${vast.length ? ` (laat ${vast.join(" en ")} staan)` : ""}`,
        ...(waarde.length > 70 ? { multiline: true } : {}),
        plek: { deel: naam, sleutel },
      });
    }
  }
  return uit;
}

/** Alle velden van de shop: eerst de benoemde, dan de rest. */
export const alleShopVelden = (nl: Dict): ShopTekstVeld[] => [...SHOP_TEKST_VELDEN, ...overigeVelden(nl)];

/** De velden voor het tekstenregister, met de Nederlandse woordenboektekst als standaard. */
export function shopTekstItems(nl: Dict): { key: string; group: string; label: string; default: string; multiline?: boolean }[] {
  return alleShopVelden(nl).map((v) => ({ key: v.key, group: v.group, label: v.label, default: tekstOp(nl, v.plek), ...(v.multiline ? { multiline: true } : {}) }));
}

/**
 * Het woordenboek met de eigen teksten erin. Alleen voor Nederlands: een andere taal krijgt het woordenboek ongewijzigd terug.
 * Een lege waarde, of een tekst waarin een plaatshouder van de standaard ontbreekt, laat de standaard staan. Zonder eigen tekst
 * komt hetzelfde woordenboek terug (hetzelfde object); het oorspronkelijke woordenboek wordt nooit aangepast.
 */
export function metShopTeksten(dict: Dict, waarden: Record<string, string>, locale: string): Dict {
  if (locale !== "nl") return dict;
  const nieuw: Record<Deel, Record<string, unknown>> = { shopThuis: { ...deel(dict, "shopThuis") }, shop: { ...deel(dict, "shop") } };
  let gewijzigd = false;
  for (const v of alleShopVelden(dict)) {
    const waarde = Object.hasOwn(waarden, v.key) ? waarden[v.key]?.trim() : "";
    const standaard = tekstOp(dict, v.plek);
    if (!waarde || waarde === standaard) continue;
    if (plaatshouders(standaard).some((p) => !waarde.includes(p))) continue;
    nieuw[v.plek.deel][v.plek.sleutel] = waarde;
    gewijzigd = true;
  }
  return gewijzigd ? ({ ...dict, shopThuis: nieuw.shopThuis, shop: nieuw.shop } as Dict) : dict;
}
