import type { LogoInvoer, LogoNr } from "@/lib/logo/regels";

// De voorbeeldlogo's op /logo-maker en /starters: VERZONNEN merken, alleen om te laten zien wat de logo maker maakt. Op
// de pagina staat erbij dat het voorbeelden zijn. Negen stuks, voor het raster van drie bij drie. Puur bestand.

export interface LogoVoorbeeld {
  sleutel: string;
  logo: LogoNr;
  invoer: LogoInvoer;
}

export const LOGO_VOORBEELDEN: LogoVoorbeeld[] = [
  { sleutel: "nova", logo: 1, invoer: { naam: "NOVA", branche: "kleding", kleur: "paars", sfeer: "streetwear" } },
  { sleutel: "noordkaap", logo: 1, invoer: { naam: "Noordkaap", slogan: "Outdoor gear", branche: "kleding", kleur: "groen", sfeer: "outdoor" } },
  { sleutel: "vitesse", logo: 1, invoer: { naam: "Velo Zuid", branche: "anders", kleur: "rood", sfeer: "sport" } },
  { sleutel: "kings", logo: 1, invoer: { naam: "Koningsbrug", branche: "kleding", kleur: "antraciet", sfeer: "gothic" } },
  { sleutel: "orbit", logo: 1, invoer: { naam: "Atlas", slogan: "Space wear", branche: "kleding", kleur: "blauw", sfeer: "techno" } },
  { sleutel: "maison", logo: 1, invoer: { naam: "Maison Noor", branche: "kleding", kleur: "antraciet", sfeer: "luxe" } },
  { sleutel: "bakkerij", logo: 8, invoer: { naam: "De Korenbloem", slogan: "Bakkerij", branche: "bakker", kleur: "oranje", sfeer: "klassiek" } },
  { sleutel: "fiets", logo: 9, invoer: { naam: "Van Dijk", slogan: "Fietsenmaker", branche: "techniek", kleur: "groen", sfeer: "stoer" } },
  { sleutel: "wolf", logo: 8, invoer: { naam: "Urban Wolf", branche: "kleding", kleur: "rood", sfeer: "streetwear" } },
];

export const logoVoorbeeldVan = (sleutel: string): LogoVoorbeeld | undefined => LOGO_VOORBEELDEN.find((v) => v.sleutel === sleutel);
