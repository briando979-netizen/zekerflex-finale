import { VOORSTELLEN } from "@/lib/voorstel/subdomein";

// Bedrijven waarvoor al een handgemaakt voorstel loopt op een eigen subdomein
// (lib/voorstel/subdomein.ts VOORSTELLEN, bv. smileyapp.zekerflex.com voor
// Smileyapp = partner Martijn). De automatische websitepijplijn slaat hun domein
// over, zodat er nooit een tweede, automatisch voorstel naast het handgemaakte
// komt. Puur bestand (geen prisma/node), zodat het makkelijk te testen is.

/**
 * Elk handgemaakt subdomein-voorstel gekoppeld aan het echte bedrijfsdomein.
 * De sleutels zijn precies die van VOORSTELLEN; een test bewaakt dat elke
 * VOORSTELLEN-sleutel hier een domein heeft (voeg je een nieuw subdomein-voorstel
 * toe, dan dwingt de test je het domein hier te zetten).
 */
export const VOORSTEL_DOMEIN: Record<string, string> = {
  schwarzwald: "hetschwarzwald.nl",
  smileyapp: "smileyapp.nl",
};

/** De bedrijfsdomeinen waarvoor al een handgemaakt voorstel loopt. */
export const HANDGEMAAKTE_VOORSTEL_DOMEINEN: readonly string[] = Object.keys(VOORSTELLEN)
  .map((naam) => VOORSTEL_DOMEIN[naam])
  .filter((d): d is string => Boolean(d));

const kaalDomein = (host: string) => host.trim().toLowerCase().replace(/^www\./, "");

/** Heeft dit webadres al een handgemaakt voorstel (op het bedrijfsdomein of een subdomein daarvan)? */
export function heeftHandgemaaktVoorstel(host: string): boolean {
  const h = kaalDomein(host);
  return HANDGEMAAKTE_VOORSTEL_DOMEINEN.some((d) => h === d || h.endsWith(`.${d}`));
}
