import type { LogoInvoer, LogoNr } from "@/lib/logo/regels";

// De voorbeeldlogo's op /logo-maker en /starters: VERZONNEN merken, alleen om te laten zien wat de logo maker maakt. Op
// de pagina staat erbij dat het voorbeelden zijn. Negen stuks, voor het raster van drie bij drie. Puur bestand.

export interface LogoVoorbeeld {
  sleutel: string;
  logo: LogoNr;
  invoer: LogoInvoer;
}

export const LOGO_VOORBEELDEN: LogoVoorbeeld[] = [
  { sleutel: "zuvra", logo: 1, invoer: { naam: "ZUVRA", branche: "kleding", kleur: "paars", sfeer: "streetwear" } },
  { sleutel: "norrik", logo: 1, invoer: { naam: "Norrik", slogan: "Outdoor gear", branche: "kleding", kleur: "groen", sfeer: "outdoor" } },
  { sleutel: "velqo", logo: 1, invoer: { naam: "Velqo Sport", branche: "anders", kleur: "rood", sfeer: "sport" } },
  { sleutel: "kroonhart", logo: 1, invoer: { naam: "Kroonhart", branche: "kleding", kleur: "antraciet", sfeer: "gothic" } },
  { sleutel: "orvex", logo: 1, invoer: { naam: "Orvex", slogan: "Space wear", branche: "kleding", kleur: "blauw", sfeer: "techno" } },
  { sleutel: "maison", logo: 1, invoer: { naam: "Maison Elvaro", branche: "kleding", kleur: "antraciet", sfeer: "luxe" } },
  { sleutel: "bakkerij", logo: 8, invoer: { naam: "Zonnekorst", slogan: "Bakkerij", branche: "bakker", kleur: "oranje", sfeer: "klassiek" } },
  { sleutel: "fiets", logo: 9, invoer: { naam: "Trapwerk", slogan: "Fietsenmaker", branche: "techniek", kleur: "groen", sfeer: "stoer" } },
  { sleutel: "stadswolf", logo: 8, invoer: { naam: "Stadswolf", branche: "kleding", kleur: "rood", sfeer: "streetwear" } },
];

export const logoVoorbeeldVan = (sleutel: string): LogoVoorbeeld | undefined => LOGO_VOORBEELDEN.find((v) => v.sleutel === sleutel);
