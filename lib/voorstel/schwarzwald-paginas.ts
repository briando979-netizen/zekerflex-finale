import data from "./schwarzwald-paginas.json";

// ---------------------------------------------------------------------------
// De pagina's van hetschwarzwald.nl, letterlijk overgenomen als blokken
// (opgehaald 2 nov 2026). Sleutel = hun oorspronkelijke pad, bv. "/bedrijfsfeest".
// Links wijzen al naar onze routes onder /voorstel/schwarzwald, foto's naar
// lokale WebP-bestanden. Alleen server-side gebruiken: het JSON-bestand is groot.
// ---------------------------------------------------------------------------

export interface Run {
  t: string;
  b?: boolean;
  href?: string;
}

export interface Pakket {
  label: string;
  naam: string;
  prijs: string;
  foto: string;
  onderdelen: { titel: string; tekst: string; keuzes: string[] }[];
}

export type Blok =
  | { type: "kop"; niveau: 2 | 3 | 4; tekst: string }
  | { type: "alinea"; runs: Run[] }
  | { type: "lijst"; items: Run[][] }
  | { type: "foto"; src: string; w: number; h: number; alt: string }
  | { type: "video"; youtube: string }
  | { type: "tabel"; rijen: string[][] }
  | { type: "knop"; tekst: string; href: string }
  | { type: "usps"; items: string[] }
  | { type: "pakketten"; pakketten: Pakket[] };

export interface Pagina {
  titel: string;
  heroKop: string;
  hero: string;
  beschrijving: string;
  blokken: Blok[];
}

const PAGINAS = data as unknown as Record<string, Pagina>;

export function pagina(pad: string): Pagina | undefined {
  return Object.prototype.hasOwnProperty.call(PAGINAS, pad) ? PAGINAS[pad] : undefined;
}

export function paginaPaden(): string[] {
  return Object.keys(PAGINAS);
}
