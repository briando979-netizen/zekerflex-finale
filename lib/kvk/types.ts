// ---------------------------------------------------------------------------
// De vormen van de eigen bedrijvenindex. Puur: ook een client-component mag dit
// inlezen. Alleen bedrijfsgegevens uit het openbare Handelsregister; nooit een
// contactpersoon, e-mailadres of telefoonnummer.
// ---------------------------------------------------------------------------

/** Waar een bedrijf vandaan komt. */
export type KvkBron = "kvkbase" | "bestaand";

/** Eén bedrijf zoals de index het onthoudt (record `kvk-bedrijf:<nummer>`). */
export interface KvkBedrijf {
  /** 8 cijfers */
  kvk: string;
  naam: string;
  handelsnaam: string | null;
  rechtsvorm: string | null;
  straat: string | null;
  huisnummer: string | null;
  postcode: string | null;
  plaats: string | null;
  btw: string | null;
  /** null = onbekend */
  actief: boolean | null;
  bron: KvkBron;
  /** ISO-tijd van het laatste keer zien */
  bijgewerkt: string;
}

/** Een compact item in een zoekemmer: genoeg om te rangschikken zonder het hele record te lezen. */
export interface EmmerItem {
  k: string;
  n: string;
  p: string;
}

/** Wat de zoekroute aan het formulier teruggeeft. Sleutels zijn dezelfde als de oude lijst (kvkNumber, name, city). */
export interface KvkTreffer {
  /** null bij een treffer uit OpenStreetMap: die kent geen KVK-nummer */
  kvkNumber: string | null;
  name: string;
  city: string | null;
  legalForm: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  vatNumber: string | null;
  /** register = uit het Handelsregister (eigen index of KVKBase); osm = alleen naam en adres van OpenStreetMap */
  source: "register" | "osm";
  /** false = uitgeschreven of failliet; null = onbekend */
  active: boolean | null;
}
