// ---------------------------------------------------------------------------
// De voordeur voor bedrijven (masterplan Fase 1, 11 nov): "Wat wil je doen?" bovenaan /bedrijven,
// vijf tegels met foto, één per product/dashboard. Teksten en links komen uit het aanbod
// (lib/marketing/aanbod.ts) zodat er niets dubbel staat; de foto's uit de fotobibliotheek
// (lib/marketing/fotos.ts). Puur: tests/voordeur.test.ts controleert dat alles bestaat.
// ---------------------------------------------------------------------------
import { aanbodHref, AANBOD } from "@/lib/marketing/aanbod";
import { FOTOS, fotoPad } from "@/lib/marketing/fotos";
import type { Werkruimte } from "@/lib/werkgever/werkruimte";

export interface VoordeurTegel {
  soort: Werkruimte;
  titel: string;
  /** één regel uit het aanbod */
  regel: string;
  foto: { pad: string; alt: string };
  /** aanmelden voor dit product (maakt het dashboard aan) */
  startHref: string;
  /** de aanbodpagina van dit product */
  meerHref: string;
}

/** Welk aanbod-onderdeel bij welk dashboard hoort, en welke foto. */
const TEGELS: { soort: Werkruimte; titel: string; slug: string; foto: string }[] = [
  { soort: "personeel", titel: "Personeel", slug: "flexwerkers-inhuren", foto: "team-highfive-raam" },
  { soort: "website", titel: "Website", slug: "website", foto: "horeca-barista-laptop" },
  { soort: "webshop", titel: "Webshop", slug: "webshop", foto: "retail-toonbank" },
  { soort: "horeca", titel: "Horeca", slug: "horeca", foto: "horeca-keuken-plezier" },
  { soort: "rijschool", titel: "Rijschool", slug: "rijschool", foto: "rijschool-achter-het-stuur" },
];

export const startHrefVoor = (soort: Werkruimte): string => `/register?type=bedrijf&dashboard=${soort}`;

export function voordeurTegels(): VoordeurTegel[] {
  const uit: VoordeurTegel[] = [];
  for (const t of TEGELS) {
    const item = AANBOD.find((a) => a.slug === t.slug);
    const foto = FOTOS.find((f) => f.slug === t.foto);
    if (!item || !foto) continue;
    uit.push({ soort: t.soort, titel: t.titel, regel: item.kort, foto: { pad: fotoPad(foto), alt: foto.alt }, startHref: startHrefVoor(t.soort), meerHref: aanbodHref(item) });
  }
  return uit;
}
