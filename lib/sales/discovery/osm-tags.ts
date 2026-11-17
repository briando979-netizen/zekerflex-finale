import { CITIES } from "@/lib/seo-cities";

// ---------------------------------------------------------------------------
// Welke OpenStreetMap-kenmerken (tags) horen bij een sector van de salesmotor?
// Nominatim zoekt op vrije tekst en vindt bij "schoonmaak Veendam" bijna niets
// (17 nov 2026: de ronde van 08:00 gaf 0 ontdekt, 1 gezien). Overpass zoekt op
// kenmerken rond een punt en ziet wél elk restaurant, elke winkel en elk
// schoonmaakbedrijf dat in OSM staat. Puur bestand (geen netwerk): de ronde
// (lib/sales/discovery/osm.ts) en de test gebruiken dezelfde koppeling.
// ---------------------------------------------------------------------------

/** Eén kenmerk: een tag met de soorten die meetellen; zonder soorten telt elke waarde (shop=*). */
export interface OsmTag {
  sleutel: string;
  soorten?: readonly string[];
}

/** De sectoren die we kennen, met hun kenmerken. Namen zoals OSM ze schrijft (kleine letters, underscore). */
export const OSM_TAGS_PER_SECTOR: Readonly<Record<string, readonly OsmTag[]>> = {
  horeca: [
    { sleutel: "amenity", soorten: ["restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "biergarten", "ice_cream"] },
    { sleutel: "tourism", soorten: ["hotel", "hostel", "guest_house"] },
  ],
  retail: [{ sleutel: "shop" }],
  schoonmaak: [
    { sleutel: "craft", soorten: ["cleaning", "window_cleaning"] },
    { sleutel: "shop", soorten: ["laundry", "dry_cleaning"] },
  ],
  evenementen: [
    { sleutel: "amenity", soorten: ["events_venue", "conference_centre", "exhibition_centre", "nightclub", "theatre"] },
    { sleutel: "leisure", soorten: ["stadium"] },
  ],
  zorg: [
    { sleutel: "amenity", soorten: ["hospital", "clinic", "nursing_home", "social_facility", "doctors", "dentist", "pharmacy"] },
    { sleutel: "healthcare" },
  ],
  logistiek: [
    { sleutel: "office", soorten: ["logistics", "moving_company"] },
    { sleutel: "industrial", soorten: ["warehouse", "logistics"] },
    { sleutel: "building", soorten: ["warehouse"] },
  ],
  bouw: [
    { sleutel: "craft", soorten: ["builder", "carpenter", "electrician", "plumber", "painter", "roofer", "tiler", "scaffolder", "hvac"] },
  ],
  productie: [
    { sleutel: "craft", soorten: ["metal_construction", "welder"] },
    { sleutel: "industrial" },
  ],
};

/** Woorden in een sectornaam van een campagne ("haven en logistiek", "productie en techniek") → onze sector. */
const SECTOR_WOORDEN: readonly (readonly [RegExp, string])[] = [
  [/horeca|hotel|restaurant|caf[eé]/, "horeca"],
  [/retail|winkel|detailhandel/, "retail"],
  [/schoonmaak|cleaning/, "schoonmaak"],
  [/evenement|event/, "evenementen"],
  [/zorg|care/, "zorg"],
  [/logistiek|haven|distributie|transport|magazijn/, "logistiek"],
  [/bouw|installatie/, "bouw"],
  [/productie|techniek|industrie|fabriek/, "productie"],
];

/** Onze sector bij een sectornaam uit een campagne; null als we hem niet kennen. */
export function sectorVan(naam: string): string | null {
  const s = naam.trim().toLowerCase();
  if (!s) return null;
  if (Object.hasOwn(OSM_TAGS_PER_SECTOR, s)) return s;
  return SECTOR_WOORDEN.find(([re]) => re.test(s))?.[1] ?? null;
}

/** De kenmerken om op te zoeken voor een sector; leeg als we de sector niet kennen (dan blijft alleen Nominatim over). */
export function tagsVoorSector(naam: string): readonly OsmTag[] {
  const sector = sectorVan(naam);
  return sector ? (OSM_TAGS_PER_SECTOR[sector] ?? []) : [];
}

/** Straal rond het middelpunt van een plaats waarin we zoeken. */
export const STRAAL_M = 5_000;

/** Het middelpunt van een stad met een eigen pagina (naam of slug, hoofdletters maken niet uit); null als we de plaats niet kennen. */
export function middelpuntVanStad(stad: string): { lat: number; lng: number } | null {
  const s = stad.trim().toLowerCase();
  if (!s) return null;
  const c = CITIES.find((x) => x.name.toLowerCase() === s || x.slug === s);
  return c ? { lat: c.lat, lng: c.lng } : null;
}
