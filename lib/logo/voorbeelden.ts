import type { LogoInvoer, LogoNr } from "@/lib/logo/regels";

// De voorbeeldlogo's op /logo-maker: VERZONNEN bedrijven, alleen om te laten zien wat de logo maker maakt. Op de pagina
// staat bij elk het label "voorbeeld". Puur bestand.

export interface LogoVoorbeeld {
  sleutel: string;
  logo: LogoNr;
  invoer: LogoInvoer;
}

export const LOGO_VOORBEELDEN: LogoVoorbeeld[] = [
  { sleutel: "bakkerij", logo: 3, invoer: { naam: "Bakkerij De Korenbloem", slogan: "Vers uit eigen oven", branche: "bakker", kleur: "oranje", sfeer: "strak" } },
  { sleutel: "kapsalon", logo: 2, invoer: { naam: "Noor's Kapsalon", branche: "beauty", kleur: "paars", sfeer: "speels" } },
  { sleutel: "cafe", logo: 6, invoer: { naam: "Café Zoë", slogan: "Koffie en taart", branche: "horeca", kleur: "rood", sfeer: "klassiek" } },
  { sleutel: "transport", logo: 4, invoer: { naam: "Van Dijk Transport", slogan: "Altijd onderweg", branche: "transport", kleur: "blauw", sfeer: "stoer" } },
  { sleutel: "schoonmaak", logo: 5, invoer: { naam: "Fris Schoonmaak", branche: "schoonmaak", kleur: "groen", sfeer: "strak" } },
  { sleutel: "advies", logo: 1, invoer: { naam: "Meijer Advies", slogan: "Helder en eerlijk", branche: "advies", kleur: "antraciet", sfeer: "klassiek" } },
];

export const logoVoorbeeldVan = (sleutel: string): LogoVoorbeeld | undefined => LOGO_VOORBEELDEN.find((v) => v.sleutel === sleutel);
