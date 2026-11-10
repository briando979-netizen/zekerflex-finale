// ---------------------------------------------------------------------------
// Plekken op ZekerFlex Kaart: de bedrijven van ZekerFlex zelf (horeca met een openbare website) en de
// plekken uit de OpenStreetMap-gegevens die al in onze kaart zitten. Alleen wat openbaar is en waar het
// bedrijf zelf voor koos: een naam, de soort, het adres en de link naar de eigen site. Geen telefoon,
// geen e-mail, geen foto's van anderen. Puur bestand (ook voor het scherm), met tests.
// ---------------------------------------------------------------------------

export interface Plaats {
  id: string;
  naam: string;
  /** gewone Nederlandse soort, bijvoorbeeld "Restaurant" */
  soort: string;
  adres: string;
  plaats: string;
  lat: number;
  lon: number;
  /** de eigen openbare site van het bedrijf, op ZekerFlex */
  link: string;
  /** bedrijven die zichzelf aanmeldden (en door de beheerder zijn goedgekeurd): eigen website, omschrijving en een openbaar nummer */
  website?: string | undefined;
  omschrijving?: string | undefined;
  telefoon?: string | undefined;
}

const HORECA_SOORT: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  lunchroom: "Lunchroom",
  bar: "Bar",
  hotel: "Hotel",
};

/** De Nederlandse soort van een horecazaak; een onbekende soort wordt "Horeca". */
export function horecaSoortNl(soort: string): string {
  return Object.hasOwn(HORECA_SOORT, soort) ? (HORECA_SOORT[soort] as string) : "Horeca";
}

const OSM_SOORT: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  pub: "Kroeg",
  fast_food: "Snackbar",
  bakery: "Bakkerij",
  butcher: "Slager",
  supermarket: "Supermarkt",
  convenience: "Buurtwinkel",
  clothes: "Kledingwinkel",
  shoes: "Schoenenwinkel",
  hairdresser: "Kapper",
  beauty: "Schoonheidssalon",
  pharmacy: "Apotheek",
  doctors: "Huisarts",
  dentist: "Tandarts",
  hospital: "Ziekenhuis",
  clinic: "Kliniek",
  school: "School",
  kindergarten: "Kinderopvang",
  library: "Bibliotheek",
  bank: "Bank",
  atm: "Geldautomaat",
  post_office: "Postkantoor",
  fuel: "Tankstation",
  charging_station: "Laadpunt",
  parking: "Parkeren",
  hotel: "Hotel",
  hostel: "Hostel",
  guest_house: "Pension",
  museum: "Museum",
  cinema: "Bioscoop",
  theatre: "Theater",
  place_of_worship: "Gebedshuis",
  police: "Politie",
  fire_station: "Brandweer",
  townhall: "Gemeentehuis",
  station: "Station",
  bus_stop: "Bushalte",
  supermarket_chain: "Supermarkt",
  park: "Park",
  playground: "Speeltuin",
  gym: "Sportschool",
  fitness_centre: "Sportschool",
  swimming_pool: "Zwembad",
  veterinary: "Dierenarts",
  car_repair: "Autogarage",
  car_wash: "Wasstraat",
  bicycle: "Fietsenwinkel",
  florist: "Bloemist",
  jewelry: "Juwelier",
  books: "Boekwinkel",
  department_store: "Warenhuis",
  mall: "Winkelcentrum",
  toilets: "Toilet",
  drinking_water: "Drinkwater",
};

/** De Nederlandse soort van een plek uit de kaartgegevens; onbekend wordt de naam met spaties ("fast_food" → "fast food"). */
export function osmSoortNl(kind: unknown): string {
  if (typeof kind !== "string" || !kind) return "Plek";
  if (Object.hasOwn(OSM_SOORT, kind)) return OSM_SOORT[kind] as string;
  const tekst = kind.replace(/_/g, " ");
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

export interface PlaatsGeoJson {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { id: string; naam: string; soort: string; adres: string; plaats: string; link: string; website: string; omschrijving: string; telefoon: string }; geometry: { type: "Point"; coordinates: [number, number] } }[];
}

/** De plekken als GeoJSON voor de kaart. Plekken zonder geldige plek vallen weg. */
export function plaatsenGeoJson(plaatsen: Plaats[]): PlaatsGeoJson {
  return {
    type: "FeatureCollection",
    features: plaatsen
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
      .map((p) => ({
        type: "Feature" as const,
        properties: { id: p.id, naam: p.naam, soort: p.soort, adres: p.adres, plaats: p.plaats, link: p.link, website: p.website ?? "", omschrijving: p.omschrijving ?? "", telefoon: p.telefoon ?? "" },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] as [number, number] },
      })),
  };
}

/** Alleen een link naar onze eigen horecasites; alles anders wordt weggelaten (nooit een link van een gebruiker blind overnemen). */
export function veiligeLink(href: unknown): string {
  return typeof href === "string" && /^\/horeca\/[a-z0-9][a-z0-9-]{0,60}$/i.test(href) ? href : "";
}
