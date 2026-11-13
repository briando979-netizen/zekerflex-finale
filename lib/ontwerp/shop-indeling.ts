// ---------------------------------------------------------------------------
// De indeling van de webshop (/shop), in te stellen in de Site-ontwerper, tabblad Webshop (13 nov 2026, eigenaar: "de webshop
// moet ik volledig kunnen inrichten"). De onderdelen onder de kop kun je verslepen en verbergen. Puur bestand: de regels hier,
// de opslag in lib/ontwerp/shop-indeling-store.ts, de pagina in app/shop/page.tsx.
// Zonder eigen indeling is de webshop precies zoals hij was: dezelfde onderdelen, in dezelfde volgorde.
// ---------------------------------------------------------------------------

export interface ShopSectie {
  id: string;
  naam: string;
  uitleg: string;
  /** alleen op de voorpagina van de shop; wie zoekt of een categorie kiest, ziet dit onderdeel niet */
  alleenThuis: boolean;
  /** kan niet verborgen worden: zonder dit onderdeel is er geen winkel */
  vast?: boolean;
}

/** De onderdelen onder de kop, in de oorspronkelijke volgorde. De kop met vier producten staat altijd bovenaan. */
export const SHOP_SECTIES = [
  { id: "categorieen", naam: "Grote categorietegels", uitleg: "Vier tegels met een foto: kleding, werk en PBM, werkdag en cadeaus.", alleenThuis: true },
  { id: "looks", naam: "Shop de look", uitleg: "Kant-en-klare combinaties van stukken die leverbaar zijn.", alleenThuis: true },
  { id: "populair", naam: "Populair", uitleg: "Vijf uitgelichte producten. Staat er alleen als er vijf met foto op voorraad zijn.", alleenThuis: true },
  { id: "onlangs", naam: "Onlangs bekeken", uitleg: "Wat deze bezoeker eerder bekeek. Leeg voor wie nog niets bekeek.", alleenThuis: true },
  { id: "paskamer", naam: "Paskamer", uitleg: "De oproep om kleding eerst te passen op je eigen paspop.", alleenThuis: true },
  { id: "assortiment", naam: "Assortiment", uitleg: "Alle producten, met zoeken en filters. Altijd zichtbaar.", alleenThuis: false, vast: true },
  { id: "meer", naam: "Meer categorieën", uitleg: "De pakketten en snelkoppelingen naar de andere categorieën.", alleenThuis: false },
  { id: "service", naam: "Service", uitleg: "Verzending, retourneren en betalen in het kort.", alleenThuis: false },
  { id: "nieuwsbrief", naam: "Nieuwsbrief", uitleg: "Aanmelden voor de nieuwsbrief.", alleenThuis: false },
] as const satisfies readonly ShopSectie[];

export type ShopSectieId = (typeof SHOP_SECTIES)[number]["id"];

export interface ShopIndeling {
  /** alle onderdelen, van boven naar beneden */
  volgorde: ShopSectieId[];
  /** de onderdelen die niet getoond worden */
  verborgen: ShopSectieId[];
}

const IDS: ShopSectieId[] = SHOP_SECTIES.map((s) => s.id);
const VAST = new Set<string>(SHOP_SECTIES.filter((s) => "vast" in s && s.vast).map((s) => s.id));
const isId = (v: unknown): v is ShopSectieId => typeof v === "string" && (IDS as string[]).includes(v);

export const standaardShopIndeling = (): ShopIndeling => ({ volgorde: [...IDS], verborgen: [] });

/**
 * Maakt van ongecontroleerde invoer een nette indeling: onbekende en dubbele onderdelen vallen weg, een onderdeel dat ontbreekt
 * (bijvoorbeeld een nieuw onderdeel dat er bij het bewaren nog niet was) komt achteraan, en een vast onderdeel is nooit verborgen.
 */
export function normalizeShopIndeling(raw: unknown): ShopIndeling {
  const o = raw && typeof raw === "object" ? (raw as { volgorde?: unknown; verborgen?: unknown }) : {};
  const volgorde: ShopSectieId[] = [];
  for (const v of Array.isArray(o.volgorde) ? o.volgorde : []) if (isId(v) && !volgorde.includes(v)) volgorde.push(v);
  for (const id of IDS) if (!volgorde.includes(id)) volgorde.push(id);
  const verborgen: ShopSectieId[] = [];
  for (const v of Array.isArray(o.verborgen) ? o.verborgen : []) if (isId(v) && !VAST.has(v) && !verborgen.includes(v)) verborgen.push(v);
  // in de volgorde van de lijst, zodat twee gelijke indelingen ook gelijk worden bewaard
  return { volgorde, verborgen: IDS.filter((id) => verborgen.includes(id)) };
}

export function isStandaardShopIndeling(i: ShopIndeling): boolean {
  const n = normalizeShopIndeling(i);
  return n.verborgen.length === 0 && n.volgorde.every((id, k) => id === IDS[k]);
}

/**
 * Welke onderdelen de pagina toont, in volgorde. `zoekt` = de bezoeker zoekt of koos een categorie: dan alleen wat ook dan zin
 * heeft (het assortiment en wat niet "alleen thuis" is). null = de standaard.
 */
export function zichtbareShopSecties(indeling: ShopIndeling | null, zoekt: boolean): ShopSectieId[] {
  const n = indeling ? normalizeShopIndeling(indeling) : standaardShopIndeling();
  const verborgen = new Set<string>(n.verborgen);
  const thuis = new Set<string>(SHOP_SECTIES.filter((s) => s.alleenThuis).map((s) => s.id));
  return n.volgorde.filter((id) => !verborgen.has(id) && !(zoekt && thuis.has(id)));
}
