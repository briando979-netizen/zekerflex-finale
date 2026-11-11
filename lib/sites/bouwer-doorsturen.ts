// ---------------------------------------------------------------------------
// Eén site-bouwer (masterplan Fase 0, 11 nov): de bouwer voor website en webshop zit in de studio
// (/studio/website/bouwer, /studio/webshop/paginas). De oude pagina /werkgever/website/bouwer was
// hetzelfde onderdeel met een eigen ingang; die stuurt nu door. Alles wat een oude link of een
// betaalpagina nog meegeeft (?ontwerp=, ?bestelling=gelukt&domein=…) gaat mee, zodat niets verloren
// gaat. Puur (geen next, geen prisma): tests/site-bouwer-doorsturen.test.ts.
// ---------------------------------------------------------------------------

export const STUDIO_BOUWER = "/studio/website/bouwer";

/** Het adres in de studio, met de zoekopdracht van de oude pagina erbij (alleen tekstwaarden, hooguit één per naam). */
export function bouwerDoorstuurPad(params: Record<string, string | string[] | undefined> | undefined): string {
  const qs = new URLSearchParams();
  for (const [naam, waarde] of Object.entries(params ?? {})) {
    const eerste = Array.isArray(waarde) ? waarde[0] : waarde;
    if (typeof eerste === "string" && eerste !== "") qs.set(naam, eerste);
  }
  const rest = qs.toString();
  return rest ? `${STUDIO_BOUWER}?${rest}` : STUDIO_BOUWER;
}
